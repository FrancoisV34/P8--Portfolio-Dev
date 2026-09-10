# 11 — Sécurité, tests, observabilité

La référence opérationnelle du dépôt est [SECURITY.md](../SECURITY.md). Elle transpose l’OWASP Top 10 général actuellement publié, vérifié le 9 septembre 2026, en checklist obligatoire de conception, code et tests. Les futurs lots IA appliqueront en plus les références OWASP GenAI et Agentic 2026.

## Sécurité
Créer l'authentification avec Better Auth ; aucune auth n'existe dans le code actuel. François est le seul compte autorisé.

- Créer le compte initial par une procédure serveur contrôlée ; désactiver les inscriptions publiques et tout mécanisme de création automatique d'un autre utilisateur.
- Fixer l'identité autorisée côté serveur, éventuellement en configuration constante comme demandé. Chaque accès vérifie la session et l'identifiant de ce propriétaire.
- Le caractère fixe du propriétaire ne dispense pas d'authentification : mot de passe haché par le mécanisme d'auth choisi, secrets de session dans l'environnement serveur. Aucun mot de passe ou secret dans le code livré au navigateur ou dans Git.
- Contrôler chaque loader, action, endpoint et export financier côté serveur, y compris les appels directs sans navigation par l'interface.
- Cookies de session sécurisés, protection CSRF adaptée, validation serveur et limitation des tentatives de connexion.
- Données, fichiers SQLite, sauvegardes, résultats de simulations et exports privés ; ne pas les incorporer aux assets, au prérendu public, aux caches partagés ou aux journaux.
- Un éventuel `noindex` des pages privées complète l'authentification sans constituer un contrôle d'accès.

Le choix précis de connexion et de récupération du compte sera cadré avant implémentation de l'authentification, sans demander de secret dans la conversation.

## Backups SQLite
Sauvegarde quotidienne cohérente avec SQLite/WAL, rotation, copie privée hors du volume principal et test de restauration. Sur Fly.io, les volumes persistent après redéploiement mais ne se répliquent pas automatiquement ; leurs snapshots ne doivent pas être la seule méthode de sauvegarde. [Documentation Fly Volumes](https://fly.io/docs/volumes/overview/).

## Tests unitaires
Vitest : Money, règles CFO, re-normalisation, simulation, dette, résolution réglementaire par date et invariants GoMining.

## Intégration
Repositories SQLite, API, persistance simulation, refresh réglementaire.

## E2E
Playwright : connexion de François, accès public au portfolio, refus d'accès financier sans session ou pour une autre identité, refus d'inscription, créer transaction, dashboard, reorder projet, simulation, appliquer recommandation, déconnexion.

Les jeux synthétiques nécessaires aux tests restent isolés de la base réelle et ne constituent pas une démonstration publique.

## Observabilité
Logger durée simulation, échecs API, valeur réglementaire manquante, erreurs de règle. Ne pas logger notes/identifiants sensibles.

## Feature flags
`finance.cfoEngine`, `finance.simulation`, `finance.regulatoryAutoRefresh`, `finance.businessPortfolio`.
