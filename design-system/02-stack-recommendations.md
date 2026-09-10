# 02 — Stack et bibliothèques retenues

Mise à jour après les choix de François du 8 septembre 2026. Cible commune au portfolio public et au CFO/GoMining privé. Depuis le 9 septembre, le socle React Router/TypeScript/Node est porté sur `refacto` ; les bibliothèques financières ci-dessous seront ajoutées avec leurs modules. Voir [le suivi](../dossier_conception_cfo/18_MIGRATION_SOCLE.md).

Référence : [décisions design](00-decisions.md) et [registre CFO](../dossier_conception_cfo/16_ARBITRAGES_STACK_PROJET.md).

## Application, build et langage

| Élément | Choix | Rôle |
|---|---|---|
| Framework | React Router en mode framework | Routes, données serveur, mutations, rendu serveur et pages publiques prérendues selon besoin |
| Interface | React | Portfolio, formulaires, dashboard et simulateurs |
| Langage | TypeScript strict | Types du domaine, unités financières et interfaces |
| Build | Vite via React Router | Remplacer CRA dans le futur socle |
| Serveur | Node.js | Héberger l'application et ses services métier |
| Hébergement | Serveur avec stockage persistant ; Fly.io à évaluer | Conserver SQLite durablement et l'accès financier privé |

La finance est réservée à François, unique utilisateur autorisé. Aucun secret ni jeu de données financières réelles ne doit être incorporé aux assets publics. Le cadre Astro initial est remplacé ; aucune seconde application n'est prévue.

Les versions stables compatibles seront choisies lors de l'implémentation. Les numéros présents dans les anciennes recettes ne constituent pas un verrou.

## Données et domaine financier

| Élément | Choix | Rôle |
|---|---|---|
| Base | SQLite | Données financières et sessions côté serveur |
| Pilote | better-sqlite3 | Accès SQLite depuis Node |
| Requêtes et migrations | Drizzle + Drizzle Kit | Schéma typé et migrations, derrière les repositories |
| Précision | decimal.js | Conversions, TH, BTC et taux avec arrondis explicites |
| Validation | Zod | Validation des entrées côté serveur et dans les formulaires |
| Authentification | Better Auth | Session du compte unique, inscriptions désactivées |

La compatibilité Drizzle/better-sqlite3/SQLite est documentée officiellement. [Drizzle et SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite).

Le moteur CFO et les calculs de simulation restent indépendants des composants React. L'argent EUR est conservé en centimes, avec des conventions distinctes pour BTC et TH.

## Styles et composants

- Tailwind et shadcn/ui, avec les tokens graphite existants.
- Primitives shadcn cohérentes entre composants ; les recettes Radix existantes restent la référence de départ, à vérifier avec la version retenue.
- Lucide React pour les icônes prévues par la refonte.
- clsx, tailwind-merge et utilitaires nécessaires aux composants effectivement retenus.
- Layout public pour le portfolio et layout privé pour la finance.
- Tableau HTML pour les petites listes fixes ; TanStack Table lorsque tri, filtres ou pagination sont utiles.
- Recharts pour les graphiques financiers, avec les composants graphiques shadcn.

L'identité graphique est partagée ; les données privées ne transitent jamais par les contenus publics. La lecture des séries financières peut être aidée par des motifs ou une palette de données à cadrer, en conservant l'accent graphite.

## Formulaires

React Hook Form + Zod pour les formulaires complexes, avec le resolver adapté. Les formulaires simples peuvent utiliser les mécanismes du framework.

EmailJS reste prévu pour le contact du portfolio conformément à la décision initiale ; son formulaire historique n'est pas actuellement monté sur la nouvelle page d'accueil. Il ne traite aucune donnée financière.

## Animation

- CSS pour les interactions de la finance.
- GSAP, ScrollTrigger et le hook React associé pour les besoins narratifs du portfolio.
- Lenis et Motion facultatifs, seulement si les interactions retenues les justifient ; ne pas reprendre automatiquement le nom de paquet des anciennes recettes.
- Respect de prefers-reduced-motion.
- Aucun fournisseur global d'animation imposé à l'espace financier.

Les recettes de [motion](04-motion-principles.md) concernent le portfolio et doivent être adaptées au socle retenu.

## CV et contenu public

Le CV de référence reste public/CVVittecoq.pdf. Le code actuel utilise une iframe et un lien de téléchargement : une bibliothèque de lecture PDF ne sera ajoutée que si une fonctionnalité retenue l'exige.

Le blog demeure prévu dans les décisions design ; Markdown/MDX ou CMS sera décidé lorsque ce chantier sera engagé. Les métadonnées seront gérées avec les capacités du framework. Optimisation des images à définir dans la future chaîne de build.

## Qualité

- ESLint, règles TypeScript/React/accessibilité et Prettier.
- Vitest + Testing Library pour le domaine et les composants pertinents.
- Playwright pour la connexion, le refus d'accès privé, les transactions et les simulations.
- Vérifications de persistance, migrations et restauration SQLite.
- Les fixtures synthétiques de tests sont isolées des données réelles et ne créent pas de démonstration publique.

## Déploiement futur

Node + volume persistant confirmé. Fly.io constitue la piste à évaluer : vérifier le coût de l'organisation, son éventuelle exonération sous 5 $, le dimensionnement et les sauvegardes avant mise en service. Vercel et GitHub Pages ne sont plus les cibles de l'application financière.

Voir [le cadrage Fly.io](../dossier_conception_cfo/16_ARBITRAGES_STACK_PROJET.md). Aucune migration, installation ou publication pendant l'étape actuelle de conception.
