# 19 — Premières fondations SQLite et unités financières

Réalisation du 9 septembre 2026 sur `refacto`, après « top ! on enchaine » puis reprise du chantier. Ce lot avance L05 et fournit la persistance du compte local unique de L04.

## Ce qui fonctionne

- Drizzle ORM 0.45.2 et Drizzle Kit 0.31.10, versions stables ; pilote better-sqlite3 12.11.1 compatible avec la cible Better Auth. La branche Drizzle 1.0 RC n’est pas utilisée.
- Base privée `data/development.sqlite`, créée vide par `npm run db:migrate`. Aucun compte financier, utilisateur ou exemple n’est inséré dans cette base ; `npm run auth:bootstrap` ajoute ensuite le seul compte autorisé après configuration locale.
- Migration SQL et snapshot versionnés dans `drizzle/`. Le schéma applicatif se trouve dans `app/.server/db/schema.ts` ; le SQL du dossier de conception reste une référence de périmètre.
- Tables Better Auth `user`, `session`, `account` et `verification`, puis tables financières `finance_economic_entities`, `finance_accounts`, `finance_categories`, `finance_transactions` et `finance_monthly_budgets`. Elles couvrent les soldes d’ouverture datés, les catégories revenu/dépense, les mouvements signés et les budgets mensuels.
- Repositories serveur pour les entités, comptes, catégories, transactions, transferts atomiques et budgets. Le propriétaire filtre chaque lecture et chaque écriture ; son identifiant provient exclusivement du contrôle de session de L04. Les transferts portent un identifiant de groupe et sont créés ou supprimés ensemble.
- Clés étrangères, WAL, délai d’attente de verrou et `synchronous=FULL` activés. Le fichier est créé avec des permissions privées ; la base, ses fichiers WAL/SHM et le dossier `data/` sont ignorés par Git.
- Chemin de base explicitement requis en production et en tests. Extensions `.sqlite` ou `.db` ; destination dans `public/` ou `build/client/` refusée, y compris via un lien symbolique.
- `npm run db:check` vérifie l’intégrité SQLite, les références et le nombre de migrations sans afficher de données métier.

Drizzle utilise ses migrations versionnées avec le pilote SQLite retenu : [documentation des migrations](https://orm.drizzle.team/docs/migrations), [prise en charge SQLite](https://orm.drizzle.team/docs/get-started/sqlite-new). La connexion et les transactions s’appuient sur [better-sqlite3](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).

## Conventions de calcul retenues pour ce socle

- EUR : centimes entiers signés, dans la plage des entiers sûrs JavaScript. La négativité permet notamment un découvert à l’ouverture ; la direction des transactions sera traitée avec leur modèle.
- BTC : satoshis entiers distincts des centimes, restitution sur huit décimales.
- Saisie : virgule ou point décimal, groupement français par espaces accepté s’il est complet ; refus des exposants, ambiguïtés et fractions plus précises que l’unité stockée. Aucun arrondi silencieux de saisie.
- Calcul : contexte `decimal.js` isolé, précision de 40 chiffres ; une contre-valeur BTC/EUR utilise un cours fourni explicitement. Son arrondi au centime utilise `ROUND_HALF_UP` et restitue le reliquat en fraction de centime. Le module GoMining devra conserver la date et le cours associés.
- Valeur manquante : à représenter explicitement, jamais comme un zéro déduit. Les champs de solde et date d’ouverture sont requis pour créer un compte.
- Dates comptables : `AAAA-MM-JJ`, sans conversion de fuseau ; périodes `AAAA-MM`. Les horodatages techniques sont des instants ISO UTC et les identifiants métier des UUID.
- TH, calcul de capitalisation et sort des BTC accumulés : reportés à GoMining et aux arbitrages associés. Aucun choix de pas de calcul n’est pris ici.

## Confidentialité du serveur local

Un contrôle HTTP a montré que le serveur Vite pouvait initialement servir des fichiers du répertoire de travail par URL, notamment la base vide et les documents de conception. `vite.config.ts` exclut maintenant les bases, WAL/SHM, le dossier CFO, les caches et les fichiers de configuration privés, en conservant les exclusions Vite des secrets et de Git. Le serveur de développement reste lié à `127.0.0.1`.

Un test dédié utilise des fichiers synthétiques et vérifie les URLs directes, `?raw`, `?url` et `/@fs/`. Les pages et fichiers publics sont vérifiés séparément. [Configuration officielle `server.fs.deny`](https://vite.dev/config/server-options#server-fs-deny).

## Dépendances et vérifications

- Vitest est aligné sur 4.1.11, plage compatible avec Better Auth 1.7.3 ; la bibliothèque retenue ne change pas.
- Override ciblé d’esbuild 0.25.12 pour `@esbuild-kit/core-utils`, dépendance transitive de Drizzle Kit. Il corrige l’alerte [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). La génération des migrations fonctionne après cet ajustement ; l’audit npm ne signale plus de vulnérabilité.
- Types, lint, build et **54 tests unitaires/intégration** passent. Les migrations et le contrôle d’intégrité sont exercés sur des bases de test vides ou synthétiques.
- Tests d’intégration : réouverture de la base, réapplication des migrations sans perte, absence de fixtures réelles, filtrage par propriétaire, contraintes SQL, annulation atomique, destination privée, journal catégorisé, transferts atomiques, dashboard et refus CSRF par origine.
- Les **2 tests HTTP du serveur de développement passent** : refus des fichiers privés en accès direct et via les variantes Vite, et maintien de l’accès aux pages/fichiers publics.

## Ce qui reste avant un budget utilisable

L05 est **partiellement réalisé**. Restent les migrations des transactions/catégories, les conventions TH et les autres modèles à ajouter au fil des lots. L01/L03 doivent définir et construire les écrans privés. La sauvegarde/restauration de L06 reste à vérifier avant l’utilisation financière réelle en ligne.

L07 est réalisé localement : les formulaires privés de comptes, catégories et transactions sont ouverts, les transferts restent atomiques et le journal explique les totaux. L08 est commencé : dashboard mensuel et comparaison prévu/réel sont disponibles, sans tendance inventée. La réserve de sécurité et les engagements récurrents restent à construire avant de déclarer L08 terminé. Les routes `/finance/*` et `/api/finance/*` exigent le contrôle du propriétaire ; sans configuration locale, elles conservent un refus temporaire en `503`.
