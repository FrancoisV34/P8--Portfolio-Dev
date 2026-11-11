-- Vigie (suivi d'erreurs embarqué) : schéma copié de app/.server/vigie/0001_vigie.sql,
-- découpé en ordres séparés pour le migrateur Drizzle. Aucune donnée financière n'y est écrite :
-- seulement des erreurs nettoyées (secrets, e-mails, cartes, IBAN masqués ; corps de requête
-- supprimés) avant écriture.
CREATE TABLE vigie_issue (
  id INTEGER PRIMARY KEY,
  empreinte TEXT NOT NULL UNIQUE,
  regle TEXT NOT NULL,
  titre TEXT NOT NULL,
  lieu TEXT,
  niveau TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'a_traiter' CHECK (statut IN ('a_traiter', 'resolue', 'ignoree')),
  premiere_apparition TEXT NOT NULL,
  derniere_apparition TEXT NOT NULL,
  premiere_release TEXT,
  derniere_release TEXT,
  resolue_dans_release TEXT,
  nb_occurrences INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE INDEX vigie_issue_statut ON vigie_issue (statut, derniere_apparition);
--> statement-breakpoint
CREATE TABLE vigie_event (
  id INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  issue_id INTEGER NOT NULL REFERENCES vigie_issue (id) ON DELETE CASCADE,
  recu_le TEXT NOT NULL,
  release_vue TEXT,
  environnement TEXT,
  provenance TEXT NOT NULL CHECK (provenance IN ('serveur', 'navigateur')),
  utilisateur TEXT,
  contenu TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX vigie_event_issue ON vigie_event (issue_id, recu_le);
--> statement-breakpoint
CREATE INDEX vigie_event_recu_le ON vigie_event (recu_le);
