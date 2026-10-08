/**
 * Transport pour les SDK Sentry côté serveur (`@sentry/node`, `@sentry/cloudflare`) : au lieu
 * d'envoyer l'enveloppe sur le réseau, il la remet à Vigie, dans le même processus.
 *
 * Forme attendue par le SDK (interface `Transport` de `@sentry/core`, vérifiée sur 11.6.0) :
 * `send(enveloppe) → { statusCode }` et `flush(délai) → booléen`. L'enveloppe arrive déjà
 * structurée : `[en-têtes, [[en-tête d'item, contenu], …]]`. Seuls les items `event` sont traités ;
 * les autres (transactions, sessions, rapports du client…) sont ignorés (cadrage, sujet 5).
 *
 * Aucun import de `@sentry/*` : l'application hôte fournit son SDK.
 */

import { estObjet, type Json, type Objet } from "./json.ts";
import type { Provenance } from "./stockage.ts";
import type { Vigie } from "./vigie.ts";

/** DSN à donner au SDK : il en exige un pour s'activer, mais rien ne part sur le réseau. Le
 * domaine `.invalid` est réservé (RFC 2606) : il ne peut appartenir à personne. */
export const DSN_LOCAL = "https://vigie@vigie.invalid/1";

export interface TransportSentry {
  send(enveloppe: unknown): PromiseLike<{ statusCode?: number }>;
  flush(delaiMs?: number): PromiseLike<boolean>;
}

/** Les événements d'une enveloppe structurée ; tout le reste est ignoré. */
export function evenementsDeLEnveloppe(enveloppe: unknown): Objet[] {
  if (!Array.isArray(enveloppe) || !Array.isArray(enveloppe[1])) {
    return [];
  }
  const evenements: Objet[] = [];
  for (const item of enveloppe[1] as unknown[]) {
    if (!Array.isArray(item) || item.length < 2) {
      continue;
    }
    const [entete, contenu] = item as [unknown, unknown];
    if (typeof entete !== "object" || entete === null || (entete as { type?: unknown }).type !== "event") {
      continue;
    }
    const json = enJson(contenu);
    if (estObjet(json)) {
      evenements.push(json);
    }
  }
  return evenements;
}

/** Le SDK normalise déjà ses événements ; on repasse quand même par JSON pour ne garder que du
 * JSON (pas de fonction, de date ou de valeur `undefined`). */
function enJson(valeur: unknown): Json | undefined {
  if (typeof valeur === "string") {
    try {
      return JSON.parse(valeur) as Json;
    } catch {
      return undefined;
    }
  }
  try {
    const texte = JSON.stringify(valeur);
    return texte === undefined ? undefined : (JSON.parse(texte) as Json);
  } catch {
    return undefined;
  }
}

/** À passer en option `transport` du SDK, avec `dsn: DSN_LOCAL`. */
export function transportVigie(vigie: Vigie, provenance: Provenance = "serveur"): () => TransportSentry {
  return () => {
    const enCours = new Set<Promise<unknown>>();
    return {
      send(enveloppe) {
        const traitement = Promise.all(
          evenementsDeLEnveloppe(enveloppe).map((evenement) => vigie.capturer(evenement, { provenance })),
        );
        enCours.add(traitement);
        void traitement.finally(() => enCours.delete(traitement));
        // Toujours 200 : le SDK ne doit ni réessayer ni se mettre en pause ; le quota et les
        // échecs sont gérés (et journalisés) par Vigie.
        return traitement.then(() => ({ statusCode: 200 }));
      },
      async flush(delaiMs) {
        const tout = Promise.all(enCours).then(() => true);
        if (delaiMs === undefined || delaiMs <= 0) {
          return tout;
        }
        let minuteur: ReturnType<typeof setTimeout> | undefined;
        const delai = new Promise<boolean>((resoudre) => {
          minuteur = setTimeout(() => resoudre(false), delaiMs);
        });
        const resultat = await Promise.race([tout, delai]);
        clearTimeout(minuteur);
        return resultat;
      },
    };
  };
}
