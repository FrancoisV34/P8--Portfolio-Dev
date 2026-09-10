# 04 — Modèle de données SQLite

## Entités
- economic_entities
- accounts
- categories
- transactions
- assets
- liabilities
- businesses
- products
- product_metrics
- projects
- goals
- cfo_rules
- cfo_runs
- cfo_decisions
- regulatory_values
- external_api_cache
- scenarios
- scenario_results
- monthly_snapshots

## Accès aux données et propriétaire unique
SQLite est confirmé, avec Drizzle et `better-sqlite3` derrière les repositories. Les `user_id` désignent le seul propriétaire autorisé, François. Plusieurs entités économiques ou comptes financiers restent possibles pour ce propriétaire, sans créer d'autres utilisateurs applicatifs.

Les tables d'authentification Better Auth et leurs migrations seront ajoutées au schéma lors de l'implémentation. Le fichier `schema.sql` actuel reste une base de conception métier, pas le schéma complet de l'application finale.

## Historisation réglementaire
Ne jamais écraser une valeur. Conserver `valid_from`, `valid_to`, `source_url`, `verified_at`.

## Audit CFO
Chaque run et chaque décision sont persistés afin de savoir pourquoi le moteur recommandait une allocation à une date donnée.

## Extension GoMining à concevoir
Conserver les paramètres du mineur, les paliers d'apport, les hypothèses de calcul et les résultats par période. Distinguer puissance initiale, TH issus des apports, TH issus du réinvestissement, BTC générés, BTC réinvestis et solde BTC.

Les euros, BTC et TH ont des unités et précisions distinctes. Les conversions BTC/EUR doivent conserver leur cours et leur date ; une contre-valeur de récompense n'est pas un nouvel apport personnel.

Le schéma SQL fourni reste le socle initial : les structures GoMining seront définies lors de l'implémentation après arbitrage de la précision et du pas de calcul. Détails et invariants dans [la spécification GoMining](15_GOMINING_STRATEGIE_SIMULATION.md).
