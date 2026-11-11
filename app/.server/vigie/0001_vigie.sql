-- Schéma de Vigie pour SQLite (better-sqlite3, Cloudflare D1) — ADR-0006.
-- À copier dans le dossier de migrations de l'application hôte, qui l'applique avec son outil.
-- Dates en texte ISO 8601 UTC ; le contenu des événements est du JSON nettoyé (ADR-0005).

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

CREATE INDEX vigie_issue_statut ON vigie_issue (statut, derniere_apparition);

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

CREATE INDEX vigie_event_issue ON vigie_event (issue_id, recu_le);
CREATE INDEX vigie_event_recu_le ON vigie_event (recu_le);
