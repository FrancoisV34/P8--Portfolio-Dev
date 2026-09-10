# 12 — Intégration dans une app existante

## Bounded context
Ajouter un domaine `finance` indépendant.

Constat dans le dépôt au 8 septembre 2026 : portfolio React 18 / CRA / JavaScript / SCSS, sans backend, authentification ni base de données. La cible commune validée est React Router en mode framework + React + TypeScript + Node.js + SQLite. Le portfolio reste public et l'ensemble de la finance privé, réservé à François.

Routes `/finance/*`, code `app/features/finance/*`. Préfixer les tables `finance_` si nécessaire pour éviter collisions avec les tables d'authentification.

## Auth
Créer Better Auth et le compte unique. Une abstraction serveur `requireFinanceOwner()` valide la session et l'identité fixe du propriétaire avant d'accéder aux données. Désactiver l'inscription et toute création d'un autre utilisateur par une route publique.

## Design system
Réutiliser les tokens et l'identité graphique ; construire les composants communs avec Tailwind/shadcn. Distinguer layouts et navigation public/privé. Les composants partagés ne contiennent aucune donnée financière réelle en dur.

## Backend
Serveur Node.js de l'application React Router, services et repositories côté serveur. Drizzle avec `better-sqlite3` pour SQLite ; Fly.io avec volume persistant à évaluer avant déploiement.

## Migration progressive
1. tables
2. transactions/budget
3. patrimoine
4. business/projets
5. CFO
6. simulation
7. réglementaire

Avant ces modules, migrer le socle React Router/TypeScript et mettre en place la frontière d'accès privé avec le compte unique. La démo publique et l'ouverture à d'autres utilisateurs sont hors du périmètre actuel.

## Repository abstraction
Ne pas exposer SQLite au reste de l'application. Exemple : `TransactionRepository.listByPeriod()` / `create()`.

## Intégration GoMining
Prévoir un sous-domaine `finance/gomining` et un moteur indépendant de React, reliés aux investissements et aux simulations. Séparer données réelles et scénarios projetés ; une simulation ne crée pas de transaction réelle et ne déclenche pas d'achat sur GoMining.

Dans une projection CFO globale, comptabiliser une seule fois les apports personnels au budget. Les récompenses réinvesties sont un mouvement interne à l'investissement. Les règles CFO peuvent signaler un conflit avec le budget ou les plafonds de risque, sans modifier silencieusement le calendrier du scénario GoMining demandé.
