# 03 — Architecture technique

Cible validée par François le 8 septembre 2026 : React Router en mode framework, React, TypeScript, serveur Node.js et SQLite. Cette décision remplace la cible Astro initiale. Voir [les décisions de stack](16_ARBITRAGES_STACK_PROJET.md).

## Vue générale
```text
Navigateur → React Router / React → Serveur Node.js
              ├→ Portfolio public      ├→ Pages et contenus publics
              └→ Espace finance privé  └→ Session + identité de François
                                           ↓
                                    Services applicatifs
                                      ├→ CFO Engine
                                      ├→ Simulation / GoMining
                                      ├→ Regulatory Service
                                      └→ Repositories → Drizzle → better-sqlite3 → SQLite
```

## React Router en mode framework
Routage, lectures serveur (`loaders`), mutations (`actions`), endpoints et rendu serveur. Vite intervient dans l'outillage du framework. Les pages publiques peuvent être prérendues ; les données financières sont chargées uniquement après contrôle d'accès serveur, jamais au build public.

## React
Composants du portfolio et de l'application financière : dashboard, graphiques, tableaux, simulateurs et formulaires. Layout public et layout privé distincts dans la même application.

## Backend Node
- Un serveur Node.js pour l'application React Router et ses services métier.
- Pas d'API Express/Fastify déployée séparément au démarrage ; l'adaptateur HTTP du framework sera choisi lors de l'implémentation.
- Better Auth gère les sessions du compte unique ; chaque accès financier vérifie l'identité autorisée côté serveur.

## Arborescence recommandée
```text
app/
├── root.tsx / routes.ts
├── routes/                   # pages publiques, connexion, finance et API
├── components/               # UI commune, layouts public/privé
├── features/finance/
│   ├── accounts/ transactions/ budget/ wealth/ investments/
│   ├── business/ projects/ goals/ cfo/ simulation/ regulatory/ gomining/
├── .server/
│   ├── auth/ db/ repositories/ services/
└── lib/                      # money, dates, validation, calculs purs
```

## SQLite
Activer foreign keys et WAL. Stocker l'argent en centimes INTEGER, jamais en REAL.

Drizzle gère les requêtes typées et les migrations avec le pilote `better-sqlite3`, officiellement pris en charge. La base reste un fichier SQLite local au serveur. [Documentation Drizzle](https://orm.drizzle.team/docs/sqlite/get-started-sqlite).

Le schéma initial fourni n'inclut pas encore les tables de Better Auth ni les extensions GoMining. Les ajouter lors de l'implémentation, sans créer de comptes de démonstration ni de mécanisme multi-utilisateur.

## Hébergement envisagé
Évaluer Fly.io avec une Machine Node.js et un volume persistant contenant SQLite, par exemple sous `/data`. Une seule instance d'écriture constitue le point de départ envisagé. Prévoir sauvegardes privées hors du volume et restauration ; la disponibilité et le dimensionnement seront arrêtés avant déploiement.

Le tarif réellement applicable et l'éligibilité éventuelle à l'exonération sous 5 $ dépendent de l'organisation Fly.io. Voir [le cadrage hébergement](16_ARBITRAGES_STACK_PROJET.md).

## Couche domaine
Aucune logique fiscale ou d'allocation dans les composants React.
