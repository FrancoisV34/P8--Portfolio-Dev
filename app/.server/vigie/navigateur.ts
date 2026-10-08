/**
 * Point d'entrée des erreurs du navigateur (ADR-0005, non-négociable n°2) : la seule partie de
 * Vigie exposée sur internet. Il ne fait jamais confiance au client.
 *
 * Le SDK navigateur y envoie ses enveloppes via l'option `tunnel` (même origine que l'application :
 * pas de CORS à ouvrir). Contrôles, du moins coûteux au plus coûteux :
 * 1. méthode POST, sinon 405 ;
 * 2. en-tête `Origin` parmi les origines de l'application, sinon 403 ;
 * 3. taille annoncée puis taille réelle ≤ 200 Ko, sinon 413 (lecture interrompue au-delà) ;
 * 4. compression `gzip` / `deflate` seulement (sinon 415), décompressé ≤ 1 Mo, sinon 413 ;
 * 5. enveloppe lisible, sinon 400 ; clé du DSN égale à la clé de l'application, sinon 401 ;
 * 6. quota par IP et global (dans `capturer`), sinon 429 + `Retry-After`.
 *
 * La clé du DSN navigateur est publique par nature (lisible dans le JavaScript) : elle filtre le
 * bruit, elle ne protège rien. La protection, ce sont les limites.
 */

import { evenementDeLItem, lireEnveloppe } from "./enveloppe.ts";
import { egaliteConstante, lireAuPlus, TropGros } from "./http.ts";
import type { Vigie } from "./vigie.ts";

export const TAILLE_MAX = 200_000;
export const TAILLE_DECOMPRESSEE_MAX = 1_000_000;

export interface OptionsPointEntree {
  vigie: Vigie;
  /** Clé publique du DSN donné au SDK navigateur (`https://<clé>@…`) : 16 caractères
   * `[A-Za-z0-9_]` au moins (format imposé par le SDK). */
  cle: string;
  /** Origines de l'application, ex. `["https://exemple.fr"]`. */
  origines: string[];
  /** IP du client, selon l'hébergeur (`Fly-Client-IP`, `CF-Connecting-IP`…) : seule l'application
   * sait quel en-tête est fiable chez elle. */
  ipClient: (requete: Request) => string | undefined;
}

const ENTETES = { "Cache-Control": "no-store", "Content-Type": "application/json" };

function reponse(statut: number, entetes: Record<string, string> = {}): Response {
  return new Response(statut === 200 ? "{}" : null, { status: statut, headers: { ...ENTETES, ...entetes } });
}

function cleDuDsn(dsn: unknown): string | undefined {
  if (typeof dsn !== "string") {
    return undefined;
  }
  try {
    return new URL(dsn).username;
  } catch {
    return undefined;
  }
}

export function creerPointEntree(options: OptionsPointEntree): (requete: Request) => Promise<Response> {
  // Le SDK JS refuse un DSN dont la clé contient autre chose que [A-Za-z0-9_] (« Invalid Sentry
  // Dsn ») : mieux vaut l'apprendre au démarrage qu'en ne recevant jamais rien.
  if (!/^[A-Za-z0-9_]{16,}$/.test(options.cle)) {
    throw new Error("vigie: la clé du point d'entrée doit faire au moins 16 caractères [A-Za-z0-9_]");
  }
  if (options.origines.length === 0) {
    throw new Error("vigie: au moins une origine autorisée est requise");
  }
  const origines = new Set(options.origines);

  return async (requete) => {
    if (requete.method !== "POST") {
      return reponse(405, { Allow: "POST" });
    }
    const origine = requete.headers.get("Origin");
    if (origine === null || !origines.has(origine)) {
      return reponse(403);
    }
    const annoncee = Number(requete.headers.get("Content-Length") ?? "0");
    if (!Number.isFinite(annoncee) || annoncee > TAILLE_MAX) {
      return reponse(413);
    }
    const encodage = (requete.headers.get("Content-Encoding") ?? "identity").trim().toLowerCase();
    if (encodage !== "identity" && encodage !== "gzip" && encodage !== "deflate") {
      return reponse(415);
    }
    if (requete.body === null) {
      return reponse(400);
    }

    let octets: Uint8Array;
    try {
      const brut = await lireAuPlus(requete.body, TAILLE_MAX);
      if (encodage === "identity") {
        octets = brut;
      } else {
        // On écrit les octets reçus dans le flux de décompression et on lit la sortie en même
        // temps, bornée : une bombe gzip est coupée dès 1 Mo décompressé.
        const decompression = new DecompressionStream(encodage);
        const ecrivain = decompression.writable.getWriter();
        void ecrivain
          .write(brut)
          .then(() => ecrivain.close())
          .catch(() => {});
        octets = await lireAuPlus(decompression.readable, TAILLE_DECOMPRESSEE_MAX);
      }
    } catch (erreur) {
      return reponse(erreur instanceof TropGros ? 413 : 400);
    }

    const enveloppe = lireEnveloppe(octets);
    if (enveloppe === null) {
      return reponse(400);
    }
    const cle = cleDuDsn(enveloppe.entete["dsn"]);
    if (cle === undefined || !egaliteConstante(cle, options.cle)) {
      return reponse(401);
    }

    const ip = options.ipClient(requete);
    for (const item of enveloppe.items) {
      const evenement = evenementDeLItem(item);
      if (evenement === null) {
        continue;
      }
      // `{{auto}}` : le SDK demande que l'IP soit déduite de la requête ; elle sera tronquée au
      // nettoyage (ADR-0005).
      const utilisateur = evenement["user"];
      if (ip !== undefined && typeof utilisateur === "object" && utilisateur !== null && !Array.isArray(utilisateur)) {
        if (utilisateur["ip_address"] === "{{auto}}") {
          utilisateur["ip_address"] = ip;
        }
      }
      const resultat = await options.vigie.capturer(evenement, {
        provenance: "navigateur",
        cleQuota: ip ?? "inconnue",
      });
      if (resultat.statut === "quota") {
        const secondes = String(resultat.reessayerDansSecondes);
        return reponse(429, { "Retry-After": secondes, "X-Sentry-Rate-Limits": `${secondes}::organization` });
      }
    }
    return reponse(200);
  };
}
