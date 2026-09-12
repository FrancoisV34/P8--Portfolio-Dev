# Portfolio François Vittecoq et CFO privé

Une application avec un portfolio public et, à terme, un espace financier entièrement privé réservé à François. Priorité de réalisation : budget, puis GoMining et patrimoine.

## État sur `refacto`

Le premier lot porte l’accueil et le CV sur **React Router 8 en mode framework, React 19, TypeScript strict et Node 24**. Les styles SCSS actuels sont conservés. SQLite/Drizzle, les conventions monétaires et le compte privé unique sont installés. L’accès à `/finance` exige une session propriétaire ; le budget local couvre comptes, journal, prévus/réalisés, réserve issue de comptes sélectionnés et engagements mensuels explicitement rapprochés des paiements. GoMining ajoute des scénarios mensuels privés, une révision immuable à chaque changement et, à titre indicatif, peut afficher l’apport d’un scénario dans une catégorie de budget sans modifier ce budget ni créer de transaction.

La production actuelle reste sur son déploiement existant. Aucun push ou déploiement n’a été effectué. Cette nouvelle application nécessite un serveur Node ; les anciens scripts GitHub Pages ont été retirés.

## Lancer le projet

Avec Node 24 et npm 11 :

```sh
npm ci
npm run dev
```

Ouvrir http://localhost:5173. `npm run dev` et `npm start` chargent `.env` s’il existe. `.env.example` fournit `SITE_URL`, l’origine utilisée dans les métadonnées et le sitemap. Sa valeur par défaut est `http://localhost:5173` ; la remplacer par le domaine HTTPS choisi avant un déploiement.

Pour vérifier le serveur de production local :

```sh
npm run build
HOST=127.0.0.1 PORT=3000 SITE_URL=http://localhost:3000 npm start
```

Routes publiques : `/`, `/cv`, `/robots.txt`, `/sitemap.xml` et `/healthz`. `/co` est la seule entrée du compte privé. `/finance/*` et `/api/finance/*` refusent toute requête sans session propriétaire.

## Vérifier une modification

```sh
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:dev
```

`check` lance les types, ESLint et les tests unitaires/intégration Vitest. Playwright démarre et arrête son propre serveur de production sur le port 4173 ; il faut avoir construit l’application auparavant. Les profils ordinateur et mobile utilisent Chromium. `test:dev` vérifie le blocage des fichiers privés et l’accès public sur un serveur Vite séparé, port 4174. Les tests ne contiennent aucune donnée financière personnelle.

## Activer le compte privé en local

Copier `.env.example` vers `.env`, puis renseigner un secret d’au moins 32 caractères, l’adresse e-mail propriétaire et le nom affiché. Le fichier `.env` reste ignoré par Git.

```sh
npm run db:migrate
npm run auth:bootstrap
npm run dev
```

`auth:bootstrap` demande le mot de passe dans le terminal sans l’afficher et crée le seul compte autorisé. Il refuse de créer un second compte. Pour choisir un nouveau mot de passe, utiliser `npm run auth:reset-password` : les sessions existantes sont alors révoquées. La connexion se fait ensuite sur `/co`.

En cas de connexion acceptée mais d’accès privé refusé, `npm run auth:status` indique uniquement si le compte correspondant au propriétaire configuré est présent ; il n’affiche ni e-mail, ni cookie, ni secret.

## Base financière locale

```sh
npm run db:migrate
npm run db:check
```

Ces commandes créent ou mettent à jour `data/development.sqlite`, sans ajouter de données de démonstration. Les migrations sont explicites ; elles ne sont pas exécutées pendant une requête HTTP. `DATABASE_PATH` permet de choisir un fichier `.sqlite` ou `.db` privé et est obligatoire en production. Les tests utilisent exclusivement des bases temporaires distinctes. Ne jamais placer la base dans `public/` ou `build/client/`.

### Sauvegarde et restauration locale

Une sauvegarde est une copie SQLite cohérente, y compris lorsque le journal WAL est actif. Elle est vérifiée avant confirmation et reste ignorée par Git. Choisir un nom de fichier inédit, hors des fichiers publics :

```sh
npm run db:backup -- data/backups/portfolio-2026-09-12.sqlite
npm run db:restore -- data/backups/portfolio-2026-09-12.sqlite data/restored/portfolio-2026-09-12.sqlite
DATABASE_PATH=data/restored/portfolio-2026-09-12.sqlite npm run db:check
```

La restauration refuse toujours une destination existante, la base active et un chemin public. Elle ne remplace donc jamais une base en place. Conserver la sauvegarde dans un emplacement privé hors Git ; le chiffrement, le stockage persistant, HTTPS et la procédure d’exploitation restent à définir avant toute mise en ligne.

Après modification du schéma TypeScript, `npm run db:generate -- --name=description` produit une migration à relire avant de l’appliquer. Les tables du compte privé et le journal de transactions seront ajoutés avec les prochains lots. [Conventions et suivi SQLite](dossier_conception_cfo/19_FONDATIONS_SQLITE.md).

## Organisation

- `app/routes/` : pages publiques, routes financières réservées et ressources HTTP.
- `app/Components/`, `app/Style/`, `app/Data/` : contenu public et styles portés.
- `app/.server/` et `app/lib/*.server.ts` : base, repositories et code serveur.
- `app/lib/finance/` : unités monétaires et dates, sans dépendance à React.
- `drizzle/` : migrations et snapshots du schéma.
- `tests/` : vérifications unitaires et navigateur.
- `src/` : anciens composants inactifs conservés comme référence pendant la refonte.

Tailwind/shadcn, les formulaires budgétaires, graphiques et moteurs financiers seront intégrés avec les prochains lots. Les secrets, bases locales et sauvegardes sont exclus de Git. Le dossier de conception contient des paramètres personnels ; il est exclu du serveur de développement et des fichiers servis en production.

Références : [roadmap](dossier_conception_cfo/13_ROADMAP.md), [sécurité](SECURITY.md), [authentification](dossier_conception_cfo/20_AUTHENTIFICATION_COMPTE_UNIQUE.md), [arbitrages](dossier_conception_cfo/17_DECISIONS_REALISATION.md), [suivi de migration](dossier_conception_cfo/18_MIGRATION_SOCLE.md), [stack validée](dossier_conception_cfo/16_ARBITRAGES_STACK_PROJET.md), [GoMining](dossier_conception_cfo/15_GOMINING_STRATEGIE_SIMULATION.md), [design system](design-system/README.md).

## Présentation initiale — octobre 2025

Le texte ci-dessous conserve l'intention d'origine du portfolio ; les choix techniques actuels sont ceux du cadrage ci-dessus.

Au 3 octobre 2025, ce n'est qu'un début, je sais qu'il me reste énormément de points à améliorer.

Mes objectifs sur ce projet seront d'améliorer la présence de composants (Components) et de pages afin d'éclaircir au mieux ce projet et de le rendre de plus en plus "propre" et professionnel.

Je souhaite aussi mettre en place dans un futur proche un système de base de données, pour remplacer les fichiers .json, que je pourrai enrichir grâce à MongoDB, Express et NodeJs.

Je mettrai également en place une authentification par la suite pour pouvoir ajouter des fonctionnalitées, pourquoi pas des témoignages, une façon de communiquer avec moi plus simple etc.

Ce projet, je le considère comme un projet sur le long terme qui j'espère me suivra toute ma vie et que j'étofferai par la suite.

Je vous souhaite une bonne navigation sur mon site web de développeur web junior.

François Vittecoq Dev Web Junior 💻
