# 05 — Plan de migration CRA → React Router en mode framework + TypeScript

Plan de conception mis à jour le 8 septembre 2026 après validation de François. Il remplace le plan de SPA Vite avec déploiement Vercel. **L'implémentation aura lieu plus tard.**

Références : [décisions](00-decisions.md), [stack](02-stack-recommendations.md) et [roadmap CFO](../dossier_conception_cfo/13_ROADMAP.md).

Depuis le 9 septembre 2026, la [roadmap détaillée commune](../dossier_conception_cfo/13_ROADMAP.md) fait référence pour les lots, les dépendances et l'ordre d'exécution. Le présent plan décrit les travaux techniques à inclure ; son ordre d'étapes sera adapté au [choix interactif de François](../dossier_conception_cfo/17_DECISIONS_REALISATION.md). Le port fonctionnel du portfolio est précoce, la finition visuelle et le blog peuvent être réalisés plus tard.

## Résultat attendu

Une application React Router servie par Node :
- portfolio, CV et futur blog publics ;
- CFO et GoMining entièrement privés ;
- François seul utilisateur autorisé, inscriptions désactivées ;
- données réelles dans SQLite sur stockage persistant ;
- aucune démonstration publique dans cette phase.

## Étape 0 — Préparer le chantier

- Faire l'inventaire du contenu et des composants à porter.
- Identifier les changements locaux de François et les préserver.
- Travailler sur une branche ou un checkout de migration dédié.
- Garder le portfolio opérationnel jusqu'à la validation du nouveau socle.
- Choisir les versions stables compatibles et compléter les décisions de domaine/hébergement au moment utile.

## Étape 1 — Créer le socle React Router

- React Router en mode framework, React, TypeScript strict et outillage Vite du framework.
- Un serveur Node pour les pages et services métier.
- Routes et layouts distincts pour le public, la connexion et la finance.
- Métadonnées et prérendu éventuel limités aux contenus publics.
- Modules de base, auth et accès aux données strictement côté serveur.

## Étape 2 — Porter le design system

- Tailwind, composants shadcn nécessaires, tokens graphite, typographie et espacement existants.
- Composants communs de boutons, champs, dialogues et tableaux.
- Navigation du portfolio séparée de la navigation financière.
- Lucide pour les icônes prévues.
- Accessibilité, focus et reduced motion dès les premiers composants.

## Étape 3 — Persistance et compte unique

- SQLite, Drizzle, better-sqlite3 et migrations.
- Compléter le schéma métier avec Better Auth et les extensions nécessaires.
- Créer le seul compte autorisé par une procédure serveur contrôlée.
- Désactiver les inscriptions et vérifier la session ainsi que l'identité du propriétaire sur chaque point d'accès financier.
- Établir les conventions EUR/BTC/TH et le calcul décimal.
- Prévoir sauvegarde, restauration et séparation entre bases de développement, tests et production.

## Étape 4 — Porter le portfolio public

- Accueil : hero, sections projets, compétences, parcours et contact.
- CV : conserver public/CVVittecoq.pdf, iframe et téléchargement selon les besoins retenus.
- EmailJS pour le formulaire de contact prévu.
- Blog : choisir le format de contenu avant sa réalisation.
- Préserver la structure de projets sur la home et l'identité graphique validée.

## Étape 5 — Construire le CFO par étapes

Suivre les lots L07 à L16 de la roadmap commune dans l'ordre arbitré : budget/transactions, GoMining, patrimoine, business, projets/objectifs, registre réglementaire, moteur CFO, simulations globales et actualisation réglementaire. GoMining peut être livré avant le CFO global ; le registre manuel vérifié précède les calculs fiscaux qui en dépendent.

Les modèles déterministes, hypothèses historisées et vérifications métier précèdent l'intelligence avancée. Les données et projections restent privées.

## Étape 6 — Visualisations et animations

- Recharts pour le patrimoine et les sources de croissance GoMining.
- TanStack Table pour les écrans nécessitant filtres/tri/pagination ; tableau HTML pour les jalons fixes.
- CSS pour la finance.
- GSAP/ScrollTrigger selon les interactions narratives retenues sur le portfolio.
- Lenis/Motion seulement si un besoin validé le justifie, sans intégration globale imposée.

## Étape 7 — Vérifier avant mise en service

- Vitest : règles, montants, unités, dette et invariants GoMining.
- Intégration : repositories, migrations, API et persistance.
- Playwright : portfolio public, connexion du propriétaire, refus d'accès privé et d'inscription, transactions et simulations.
- Vérifier l'absence de données financières dans les assets, réponses publiques et caches partagés.
- Contrôler liens, images, accessibilité et performance du portfolio.
- Tester la restauration d'une sauvegarde privée.

## Étape 8 — Préparer puis réaliser l'hébergement

- Évaluer Fly.io : organisation, coût avant remise, éventuelle exonération et trafic attendu du portfolio.
- Construire l'application Node et placer SQLite sur un volume persistant.
- Définir la taille de Machine, la région, les paramètres de démarrage/arrêt et la tolérance aux interruptions.
- Définir sauvegardes hors du volume, secrets serveur et domaine.
- Tester démarrage, redéploiement, persistance des données et restauration avant la bascule.

Cette étape est future ; le présent document ne déclenche aucun provisionnement ni achat.

## Étape 9 — Nettoyer après validation

- Retirer CRA et les dépendances devenues inutilisées.
- Supprimer les doublons de contenu seulement après vérification de leur remplacement.
- Mettre à jour README, scripts et documentation d'exploitation.
- Conserver la démonstration publique et le partage des finances hors du périmètre actuel.
