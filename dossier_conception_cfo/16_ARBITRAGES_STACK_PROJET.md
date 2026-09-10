# 16 — Stack validée, accès privé et hébergement envisagé

Date des arbitrages : 8 septembre 2026. Mise à jour du 9 septembre : démarrage de la migration directe autorisé par François. [État de réalisation](18_MIGRATION_SOCLE.md). Aucun déploiement effectué.

## Décisions confirmées

| Sujet | Décision |
|---|---|
| Application | React Router en mode framework + React + TypeScript strict |
| Serveur | Node.js, services métier et routes serveur dans la même application |
| Base | SQLite sur stockage persistant |
| Requêtes et migrations | Drizzle, avec le pilote SQLite better-sqlite3 |
| Visibilité | Portfolio public ; CFO et GoMining entièrement privés |
| Utilisateur | François uniquement ; aucun autre compte autorisé |
| Données | Données réelles privées ; scénarios et résultats également privés |
| Authentification | Better Auth, inscriptions désactivées, identité autorisée fixe côté serveur |
| Interface | Tailwind + shadcn/ui ; identité graphique partagée, layouts public/privé distincts |
| Formulaires | Zod et React Hook Form pour les formulaires complexes |
| Graphiques et tableaux | Recharts et TanStack Table selon le besoin |
| Calculs | decimal.js ; conventions d'unités et d'arrondis explicites |
| Tests | Vitest et Playwright |
| Animation | CSS pour la finance ; GSAP selon les besoins du portfolio |
| Hébergement | Serveur Node avec volume persistant confirmé ; Fly.io à évaluer en priorité |
| Démonstration publique | Reportée, aucune priorité actuelle |
| Étape actuelle | Conception ; aucune installation, migration ou publication |

Les bibliothèques proposées ont été acceptées par François. Son accord pour Drizzle était conditionné à sa compatibilité SQLite : celle-ci est confirmée ci-dessous. Lenis et Motion restent facultatifs selon les interactions du portfolio ; aucun chargement global n'est requis pour le CFO.

## Une application, deux niveaux d'accès

Le site public présente le portfolio, le CV et, selon le périmètre déjà prévu, le blog. L'espace financier se trouve sous /finance et possède son propre layout. Toutes ses données, ses API, ses exports et ses simulations sont réservés à François.

La présence d'entités foyer, conjoint ou business dans le modèle économique ne signifie pas que ces personnes disposent d'un compte. Il n'y a ni partage familial, ni inscription publique, ni produit destiné à d'autres utilisateurs dans le périmètre actuel.

React Router en mode framework permet d'organiser les chargements et mutations serveur ainsi que le rendu des pages. Les données privées ne sont jamais intégrées au prérendu des pages publiques. [Modes React Router](https://reactrouter.com/start/modes), [stratégies de rendu](https://reactrouter.com/start/framework/rendering).

## Drizzle et SQLite : compatibilité confirmée

Drizzle prend officiellement en charge SQLite, notamment via le pilote better-sqlite3. Le choix retenu est :

**Services métier → repositories → Drizzle → better-sqlite3 → fichier SQLite.**

SQLite reste le moteur de base de données. better-sqlite3 est la bibliothèque qui permet au serveur Node d'y accéder ; Drizzle fournit une couche de requêtes typées et l'outillage associé aux migrations. Cela ne nécessite ni PostgreSQL ni base distante. [Documentation officielle Drizzle/SQLite](https://orm.drizzle.team/docs/sqlite/get-started-sqlite).

Retenir des versions stables compatibles de Node, Drizzle, Drizzle Kit, better-sqlite3 et Better Auth au démarrage de l'implémentation. La documentation peut présenter une branche de préversion : ne pas recopier automatiquement une commande ciblant une RC.

Le schéma SQL fourni dans le dossier reste à compléter avec les tables d'authentification et GoMining. Les migrations et le compte initial seront créés lors de l'implémentation, avec contrôle du propriétaire unique.

## Authentification du compte unique

- Provisionner le compte de François par une procédure serveur contrôlée.
- Désactiver les inscriptions et les créations automatiques de comptes par les fournisseurs de connexion.
- Fixer l'identité autorisée côté serveur ; un identifiant constant est acceptable pour ce projet.
- Vérifier la session et cette identité sur chaque accès financier, y compris les requêtes directes aux actions, loaders et API.
- Conserver les secrets dans l'environnement serveur et le mot de passe sous forme hachée via le mécanisme d'authentification ; l'identifiant fixe n'est pas un secret de connexion.
- Choisir le mode exact de connexion et la récupération du compte au moment de concevoir l'authentification.

Better Auth documente l'intégration React Router et l'adaptateur Drizzle, dont SQLite. [React Router](https://better-auth.com/docs/integrations/react-router), [adaptateur Drizzle](https://better-auth.com/docs/adapters/drizzle).

La restriction à un utilisateur est une règle d'accès serveur, et non le simple masquage d'un lien ou d'un formulaire. Les jeux synthétiques de tests restent séparés de la base réelle ; ils ne constituent pas une démo publique.

## Fly.io — piste retenue pour évaluation

François propose Fly.io sur la base d'une expérience où une petite application ne génère aucune facture payée. L'architecture Node + SQLite est compatible avec une Machine et un volume persistant. Le fichier SQLite doit se trouver sur ce volume, et non uniquement dans le système de fichiers de l'image applicative.

Point de départ envisagé : une Machine Node, une région, un volume, une seule instance d'écriture et des sauvegardes privées hors du volume. Cette organisation vise la simplicité pour un seul utilisateur ; les interruptions au redéploiement ou en cas de panne et les modalités de restauration seront précisées avant mise en service.

Les volumes Fly ne se répliquent pas automatiquement. Leurs snapshots complètent une sauvegarde SQLite cohérente et une procédure de restauration ; ils ne constituent pas à eux seuls le plan de sauvegarde. [Documentation Fly Volumes](https://fly.io/docs/volumes/overview/).

### Exonération des factures inférieures à 5 $

Un échange publié sur le forum Fly.io le **8 mai 2026** précise que l'exonération sous 5 $ concerne l'organisation personnelle créée à l'ouverture du compte. Cela concorde avec l'expérience rapportée par François, sans établir que toute organisation ou toute application serait gratuite. [Précision sur le forum Fly.io](https://community.fly.io/t/convert-new-organization-to-personal-organization/27828).

La tarification générale reste fondée sur les ressources utilisées, facturées par organisation. Au tarif consulté le 8 septembre 2026, un volume est annoncé à **0,15 $/Go/mois provisionné**, y compris lorsque sa Machine est arrêtée. Le calcul doit aussi inclure Machine, trafic et éventuels autres postes. [Tarification officielle](https://fly.io/docs/about/pricing/), [facturation](https://fly.io/docs/about/billing/).

Avant un futur déploiement :
- vérifier l'organisation Fly.io utilisée et son éligibilité effective à l'exonération ;
- estimer le coût total avant remise, en tenant compte des autres applications de cette organisation et du trafic du portfolio public ;
- dimensionner mémoire et stockage après mesure de l'application ;
- choisir la stratégie de sauvegarde et tester la restauration ;
- arrêter le domaine et les paramètres d'exploitation.

Aucun compte, abonnement, Machine ou volume n'est créé pendant le cadrage. L'objectif d'un faible coût est conservé ; 0 $ n'est pas inscrit comme un coût garanti.

## Historique des arbitrages remplacés

- Astro était la cible du dossier CFO initial : remplacé par React Router en mode framework.
- Vercel était retenu dans les décisions design d'avril 2026 : remplacé comme cible par un serveur Node avec stockage persistant, avec Fly.io à évaluer.
- Le partage de l'espace financier avec le foyer ou d'autres utilisateurs était une question ouverte : fermé, François seul.
- La démonstration publique était une suggestion : reportée explicitement.
- Les bibliothèques proposées étaient en attente : acceptées, avec compatibilité SQLite de Drizzle vérifiée.

Les [ADR du CFO](14_DECISIONS_ARCHITECTURE.md) et les [décisions design](../design-system/00-decisions.md) portent maintenant cette même cible.

## Précisions à recueillir au moment utile

Aucune précision supplémentaire n'est nécessaire pour valider la stack et le caractère privé du CFO. Restent des paramètres de réalisation :
- GoMining : sort du stock BTC accumulé avant 10 TH, pas de calcul, date de départ et hypothèses économiques ;
- authentification : mode de connexion et récupération du compte unique ;
- hébergement : organisation Fly.io, domaine, dimensionnement et destination des sauvegardes ;
- blog : format des contenus si ce chantier est engagé.

Ces paramètres ne modifient pas la stack validée. Le démarrage du socle a ensuite été autorisé explicitement le 9 septembre ; les choix produit encore ouverts seront présentés avant les lots concernés.

## Planification interactive — 9 septembre 2026

La stack ci-dessus reste validée. L'organisation du chantier est maintenant détaillée dans [la roadmap commune](13_ROADMAP.md), avec les réponses de François consignées dans [le journal de réalisation](17_DECISIONS_REALISATION.md). Ces arbitrages portent sur l'ordre et les modalités de réalisation, sans rouvrir le caractère privé de la finance ni les bibliothèques retenues.
