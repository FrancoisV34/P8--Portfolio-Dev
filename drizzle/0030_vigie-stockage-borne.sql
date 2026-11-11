-- Vigie 0.2 (stockage borné, ADR-0011 de Vigie) : copiée de app/.server/vigie/0002_vigie.sql,
-- découpée en un ordre par bloc pour le migrateur Drizzle (jamais dans un BEGIN … END).
-- Vérifiée par `npm run vigie:verifier` : mêmes instructions que la copie de Vigie.
-- Vigie 0.2 : stockage borné (ADR-0011), pour SQLite (better-sqlite3, Cloudflare D1).
-- À appliquer après 0001, avec l'outil de migration de l'application hôte. Les triggers contiennent
-- des « ; » : si l'outil découpe le fichier, le faire entre deux ordres, jamais dans un BEGIN … END.

-- Provenance de l'erreur qui a créé l'issue : sert au plafond de nouvelles issues du navigateur.
ALTER TABLE vigie_issue ADD COLUMN provenance TEXT;
--> statement-breakpoint
CREATE INDEX vigie_issue_creation ON vigie_issue (provenance, premiere_apparition);
--> statement-breakpoint
-- Taille du contenu stocké (octets UTF-8) et rôle : échantillon gardé, ou dernière occurrence.
ALTER TABLE vigie_event ADD COLUMN taille INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE vigie_event ADD COLUMN role TEXT NOT NULL DEFAULT 'echantillon' CHECK (role IN ('echantillon', 'derniere'));
--> statement-breakpoint
UPDATE vigie_event SET taille = length(CAST(contenu AS BLOB));
--> statement-breakpoint
-- Éviction : les plus anciens d'abord, la « dernière » de chaque issue en dernier.
CREATE INDEX vigie_event_eviction ON vigie_event ((role = 'derniere'), id);
--> statement-breakpoint
CREATE INDEX vigie_event_role ON vigie_event (issue_id, role);
--> statement-breakpoint
-- État de Vigie : total des octets stockés (tenu par les triggers), sel des IP, budget affiché.
CREATE TABLE vigie_etat (
  cle TEXT PRIMARY KEY,
  nombre INTEGER NOT NULL DEFAULT 0,
  texte TEXT
);
--> statement-breakpoint
INSERT INTO vigie_etat (cle, nombre) SELECT 'octets', COALESCE(sum(taille), 0) FROM vigie_event;
--> statement-breakpoint
CREATE TRIGGER vigie_event_ajout AFTER INSERT ON vigie_event
BEGIN
  UPDATE vigie_etat SET nombre = nombre + NEW.taille WHERE cle = 'octets';
END;
--> statement-breakpoint
CREATE TRIGGER vigie_event_retrait AFTER DELETE ON vigie_event
BEGIN
  UPDATE vigie_etat SET nombre = nombre - OLD.taille WHERE cle = 'octets';
END;
--> statement-breakpoint
-- Compteurs par jour et par motif (refus, débordements, évictions…), pour voir une attaque.
CREATE TABLE vigie_compteur (
  jour TEXT NOT NULL,
  motif TEXT NOT NULL,
  compte INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (jour, motif)
);
--> statement-breakpoint
-- Fenêtres de quota d'une minute, partagées par toutes les instances ; clé « * » ou IP hachée.
CREATE TABLE vigie_fenetre (
  portee TEXT NOT NULL,
  cle TEXT NOT NULL,
  debut INTEGER NOT NULL,
  compte INTEGER NOT NULL,
  PRIMARY KEY (portee, cle, debut)
);
