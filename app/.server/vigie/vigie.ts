/**
 * Le chemin d'une erreur : quota → nettoyage → symbolisation (navigateur) → empreinte → stockage.
 *
 * `capturer` ne lève jamais : un suivi d'erreurs qui fait tomber l'application qu'il surveille
 * serait pire que rien. Tout échec est signalé par une ligne de journal, sans donnée de l'événement
 * (seulement l'empreinte) — c'est le repli si la base est indisponible (ADR-0002).
 */

import type { Base } from "./base.ts";
import { calculerEmpreinte } from "./empreinte.ts";
import type { Objet } from "./json.ts";
import { nettoyer } from "./nettoyage.ts";
import { LIMITES_PAR_DEFAUT, Quota, type LimitesQuota } from "./quota.ts";
import { enregistrer, purger, type Ecriture, type Provenance } from "./stockage.ts";

const PURGE_TOUTES_LES_MS = 3600_000;

export interface OptionsVigie {
  base: Base;
  limites?: LimitesQuota;
  maintenant?: () => number;
  journal?: (ligne: string) => void;
  /** Symbolisation des erreurs du navigateur (`creerSymboliseur`), appliquée après le nettoyage. */
  symboliser?: (evenement: Objet) => Promise<Objet>;
}

export interface OptionsCapture {
  provenance: Provenance;
  /** Clé du quota par client : l'IP côté navigateur ; absente côté serveur. */
  cleQuota?: string;
}

export type Resultat =
  | { statut: Ecriture; empreinte: string }
  | { statut: "quota"; reessayerDansSecondes: number }
  | { statut: "erreur" };

export interface Vigie {
  capturer(evenement: Objet, options: OptionsCapture): Promise<Resultat>;
}

export function creerVigie(options: OptionsVigie): Vigie {
  const maintenant = options.maintenant ?? Date.now;
  const journal = options.journal ?? ((ligne: string) => console.error(ligne));
  const quota = new Quota(options.limites ?? LIMITES_PAR_DEFAUT, maintenant);
  let dernierePurge = 0;

  return {
    async capturer(evenement, { provenance, cleQuota }) {
      const decision = quota.verifier(cleQuota);
      if (!decision.accepte) {
        journal("vigie: quota dépassé, erreur non stockée");
        return { statut: "quota", reessayerDansSecondes: decision.reessayerDansSecondes };
      }

      let empreinte = "?";
      try {
        const nettoye = nettoyer(evenement);
        const propre = options.symboliser === undefined ? nettoye : await options.symboliser(nettoye);
        const calcul = await calculerEmpreinte(propre);
        empreinte = calcul.empreinte;
        const instant = maintenant();
        const statut = await enregistrer(options.base, propre, calcul, provenance, instant);

        if (instant - dernierePurge >= PURGE_TOUTES_LES_MS) {
          dernierePurge = instant;
          await purger(options.base, instant).catch(() => journal("vigie: purge impossible"));
        }
        return { statut, empreinte };
      } catch {
        // Le message de l'exception pourrait contenir des données de l'événement : on ne le
        // journalise pas.
        journal(`vigie: erreur non stockée (empreinte ${empreinte})`);
        return { statut: "erreur" };
      }
    },
  };
}
