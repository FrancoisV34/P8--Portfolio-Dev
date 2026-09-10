# 18 — Migration du socle sur `refacto`

Suivi du 9 septembre 2026. François a demandé de commencer après la proposition de migration directe (D02). Le premier résultat métier reste le budget privé (D01).

## État initial et périmètre de ce lot

- Branche `refacto`, créée depuis `main` au commit `c367a1b`. Aucun commit, push ni déploiement réalisé pendant ce lot.
- Application initiale CRA/React 18 en JavaScript, avec deux routes actives : accueil et CV. Navigation par ancres, contact par liens email/GitHub/LinkedIn, CV PDF.
- Contenu actif : Hero, projets Kasa et Sophie Bluel, compétences, parcours, contact, monogramme et navigation. Styles SCSS conservés.
- Images WebP déjà supprimées et remplacées localement par PNG/JPEG avant la migration : ces changements sont préservés et les références actives mises à jour.
- Ancien test CRA sans rapport avec le portfolio retiré. Le contournement de routage GitHub Pages et `PUBLIC_URL` sont remplacés par le routage serveur et des chemins à la racine.
- Modifications locales existantes, dont `.claude/settings.local.json`, design system et dossier CFO, conservées. Le dossier de conception contient des paramètres personnels ; il ne fait pas partie des fichiers servis ou importés par l’application.

## Réalisation

- Application active dans `app/` : React Router 8.3.1 en mode framework SSR, React 19.2.8, TypeScript 5.9 strict, Vite 8 et Node 24.
- Accueil et CV portés ; métadonnées, canonical et données structurées rendus côté serveur. `SITE_URL` configure la future origine publique et doit être ajustée avant mise en ligne.
- Navigation entre CV et ancres de l’accueil, images PNG, PDF et liens de contact conservés. Contenu visible sans JavaScript, réduction des animations et lien d’évitement pris en charge. Ajustement du menu pour 320 px.
- Routes publiques `/`, `/cv`, `/robots.txt`, `/sitemap.xml`, `/healthz`.
- Routes réservées `/finance/*` et `/api/finance/*` : réponse **503**, `Cache-Control: private, no-store` et exclusion de l’indexation, en lecture comme en écriture. Il s’agit d’un verrou temporaire ; **l’authentification n’est pas encore implémentée**. Aucun écran financier ni donnée réelle n’est exposé.
- Modules serveur identifiés par `.server.ts`. Aucune base SQLite, transaction, donnée de démonstration ou simulation ajoutée dans ce lot.
- Scripts de développement, build, démarrage Node, types, lint, Vitest et Playwright ; dépendances verrouillées dans `package-lock.json`.
- Les composants historiques inactifs restent dans `src/`, exclus du build et du contrôle des types. Leur nettoyage relève de L18. L’ancien environnement de dépendances est conservé localement dans `.cache/cra-migration/` (ignoré par Git).

## Vérifications

- TypeScript, lint et 8 tests unitaires : passent.
- Build navigateur et serveur : passe.
- Playwright sur le serveur de production local : **10 tests passent**, en profils ordinateur et mobile, après correction du menu mobile et du nom accessible du lien Email.
- Tests couvrant le CV en accès direct, les ancres, les images, le PDF, les métadonnées sans JavaScript, le clavier, les animations réduites, la 404 et le refus des accès financiers, y compris les requêtes de données React Router.

Les résultats de tests sont locaux ; aucune exécution de CI distante ni validation Fly.io n’est revendiquée. Le profil mobile utilise Chromium avec émulation mobile ; Safari et Firefox restent à vérifier avant la mise en service consolidée.

## Suite

L00 : inventaire et méthode de migration établis. L02 : **port réalisé et validé localement**. L01/L03 : parcours et composants financiers restent à construire. L04/L05 : connexion et SQLite restent à implémenter. Aucun jalon J0/J1 complet n’est revendiqué à ce stade.

Prochain arbitrage : **D03**, compte local avec mot de passe et récupération serveur, ou compte GitHub unique via OAuth. Le choix reste à François. Après ce choix : compte unique + SQLite, puis comptes/transactions et dashboard budgétaire (L07–L08).
