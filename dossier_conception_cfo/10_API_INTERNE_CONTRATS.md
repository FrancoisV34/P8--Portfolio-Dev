# 10 — API interne / contrats

## Exposition et accès
Contrats mis en œuvre dans le serveur React Router par loaders, actions ou routes de ressources selon l'écran. Les chemins `/api/finance/*` restent des contrats envisagés ; aucune API séparée n'est nécessaire au démarrage.

Chaque lecture, écriture, export ou lancement de simulation exige une session valide et l'identité de François, seul propriétaire autorisé. Le contrôle se fait au point d'entrée serveur concerné ; le layout React et les contrôles d'un loader parent ne suffisent pas à protéger toutes les requêtes. Les réponses financières ne doivent pas être stockées dans un cache public partagé.

## Transactions
GET/POST `/api/finance/transactions`; PATCH/DELETE `/api/finance/transactions/:id`.

## Dashboard
GET `/api/finance/dashboard?period=2026-09`. Tous les montants en centimes.

## CFO
POST `/api/finance/cfo/evaluate` avec `availableCashCents` et `strategyMode`.

## Simulations
POST `/api/finance/simulations`; GET `/api/finance/simulations/:id`; POST `/api/finance/simulations/:id/run`.

## Regulatory
GET `/api/finance/regulatory/:key?at=...`; POST `/api/finance/regulatory/refresh`; POST `/api/finance/regulatory/:id/verify`.

## Projects
GET/POST `/api/finance/projects`; PATCH `/api/finance/projects/:id`; POST `/api/finance/projects/reorder`.

## Validation
Zod retenu. Montants entiers non négatifs en centimes ; unités et précisions BTC/TH explicites pour GoMining.
