# 19 — Premières fondations SQLite et unités financières

Réalisation du 9 septembre 2026 sur `refacto`, après « top ! on enchaine » puis reprise du chantier. Ce lot avance L05 et fournit la persistance du compte local unique de L04.

## Ce qui fonctionne

- Drizzle ORM 0.45.2 et Drizzle Kit 0.31.10, versions stables ; pilote better-sqlite3 12.11.1 compatible avec la cible Better Auth. La branche Drizzle 1.0 RC n’est pas utilisée.
- Base privée `data/development.sqlite`, créée vide par `npm run db:migrate`. Aucun compte financier, utilisateur ou exemple n’est inséré dans cette base ; `npm run auth:bootstrap` ajoute ensuite le seul compte autorisé après configuration locale.
- Migration SQL et snapshot versionnés dans `drizzle/`. Le schéma applicatif se trouve dans `app/.server/db/schema.ts` ; le SQL du dossier de conception reste une référence de périmètre.
- Tables Better Auth `user`, `session`, `account` et `verification`, puis tables financières `finance_economic_entities`, `finance_accounts`, `finance_categories`, `finance_transactions`, `finance_monthly_budgets`, `finance_safety_reserves`, `finance_safety_reserve_accounts`, `finance_recurring_commitments`, `finance_gomining_scenarios`, `finance_gomining_contribution_phases`, `finance_gomining_scenario_versions`, `finance_wealth_assets`, `finance_wealth_asset_valuations`, `finance_wealth_debts`, `finance_wealth_debt_balances`, `finance_business_activities`, `finance_business_monthly_metrics`, `finance_business_entity_monthly_cash`, `finance_goals`, `finance_projects` et `finance_project_capacity`. Elles couvrent les soldes d’ouverture datés, les catégories revenu/dépense, les mouvements signés, les budgets mensuels, une réserve issue de comptes sélectionnés, les engagements mensuels, les hypothèses GoMining versionnées, le premier bilan patrimoine daté, les observations business mensuelles isolées du foyer, dont MRR, clients actifs et temps de maintenance facultatifs, et les intentions manuelles d'objectifs/projets.
- Repositories serveur pour les entités, comptes, catégories, transactions, transferts atomiques, budget, planification, GoMining, patrimoine et business. Le propriétaire filtre chaque lecture et chaque écriture ; son identifiant provient exclusivement du contrôle de session de L04. Les transferts portent un identifiant de groupe et sont créés ou supprimés ensemble. Un scénario GoMining peut référencer une catégorie de dépense du même propriétaire afin d’afficher l’apport mensuel comme prévu, sans écrire de transaction. Chaque révision conserve un instantané JSON validé des hypothèses et paliers ; les déclencheurs SQLite le rendent immuable. Les métriques et états de cash business ne créent jamais de transaction et exigent une entité business du même propriétaire.
- Lecture défensive des révisions GoMining : un instantané historique incomplet ou illisible est masqué, jamais corrigé par des valeurs déduites, et ne peut pas empêcher le chargement du dashboard. Les hypothèses courantes et les révisions valides restent disponibles ; l’interface indique que l’ancienne version est incomplète.
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
- Types, lint, build et **72 tests unitaires/intégration** passent. Les migrations et le contrôle d’intégrité sont exercés sur des bases de test vides ou synthétiques.
- Tests d’intégration : réouverture de la base, réapplication des migrations sans perte, absence de fixtures réelles, filtrage par propriétaire, contraintes SQL, annulation atomique, destination privée, journal catégorisé, transferts atomiques, dashboard, GoMining, refus du lien de budget inter-propriétaire, historique immuable et refus CSRF par origine.
- Les **2 tests HTTP du serveur de développement passent** : refus des fichiers privés en accès direct et via les variantes Vite, et maintien de l’accès aux pages/fichiers publics.

## Ce qui reste avant un budget utilisable

L05 est **partiellement réalisé**. Restent les migrations des transactions/catégories, les conventions TH et les autres modèles à ajouter au fil des lots. L01/L03 doivent définir et construire les écrans privés. La sauvegarde/restauration de L06 reste à vérifier avant l’utilisation financière réelle en ligne.

L07 et L08 sont réalisés localement : les formulaires privés de comptes, catégories et transactions sont ouverts, les transferts restent atomiques et le journal explique les totaux. Le dashboard mensuel compare prévu/réel sans tendance inventée ; il calcule la réserve depuis les comptes sélectionnés et distingue les engagements prévus des paiements explicitement rattachés. Les migrations `0003_safety-reserve-and-commitments` à `0013_project-capacity` conservent les données existantes et ajoutent les hypothèses GoMining, leur lien facultatif à une catégorie de budget, leurs révisions immuables, puis les actifs, valorisations et états de dette datés et enfin les observations business. La migration `0009` convertit les actifs existants en positions manuelles et ajoute une position BTC GoMining observée, unique par propriétaire, qui exige une classe crypto et une quantité entière de satoshis. La migration `0010` ajoute uniquement les activités business, leurs métriques mensuelles et les états de cash par entité ; elle ne crée aucune donnée. La migration `0011` ajoute sans réécriture les champs facultatifs MRR, clients actifs et temps de maintenance ; l'ARR est calculé dans le domaine, jamais stocké ni déduit du CA. La migration `0012` ajoute les objectifs et projets manuels ; un déclencheur refuse le lien d'un projet à un objectif d'un autre propriétaire. La migration `0013` ajoute une capacité mensuelle unique par propriétaire pour le suivi informatif des projets actifs. Des contraintes et déclencheurs SQLite empêchent les liens d’un autre propriétaire, de catégorie incompatible, hors période, la réécriture d’une révision, le rattachement d'un actif, d'une valorisation ou d'un état de dette à une ressource d'un autre propriétaire, ainsi que le rattachement d'une activité ou d'un état business à une entité personnelle ou étrangère. Les routes `/finance/*` et `/api/finance/*` exigent le contrôle du propriétaire ; sans configuration locale, elles conservent un refus temporaire en `503`.

## Incident de lecture privée — 10 septembre 2026

Symptôme observé : après une connexion valide, `GET /finance.data` pouvait répondre `500` et faire afficher la page générique d’indisponibilité. La cause était un instantané historique GoMining contenant une liste de paliers vide ; la validation Zod était alors propagée par React Router jusqu’au navigateur.

Garde-fous durables :

- `app/.server/repositories/gomining.ts` utilise une validation non bloquante pour les instantanés historiques ; une version invalide est exclue de la restitution, sans modification de la donnée immuable et sans phase inventée.
- `app/routes/finance.tsx` transforme toute erreur inattendue de lecture privée en réponse HTTP générique, privée et `no-store`. Ni schéma Zod, ni stack trace, ni chemin local ne sont transmis au client.
- Le test d’intégration injecte un instantané historique synthétique avec des paliers vides et vérifie que les paliers courants, les versions valides et le dashboard restent lisibles.

Avant d’attribuer un écran privé indisponible à l’authentification, vérifier la réponse de données de React Router (`/finance.data`) : un `500` doit être traité comme une erreur de chargement métier, distincte d’un refus de session (`401`/`403`). Ne jamais afficher sa cause détaillée dans le navigateur.
