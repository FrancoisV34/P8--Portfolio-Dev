# Dossier de conception — Module CFO Personnel / Business

Stack cible validée : React Router en mode framework + React + TypeScript + Node.js + SQLite, avec Drizzle et le pilote better-sqlite3. Fly.io est la piste d'hébergement retenue pour évaluation. Le socle React Router/TypeScript/Node est migré et validé localement sur `refacto`. [Les fondations SQLite](19_FONDATIONS_SQLITE.md) et le [compte privé unique](20_AUTHENTIFICATION_COMPTE_UNIQUE.md) sont installés ; les écrans budgétaires constituent la suite.

Objectif : intégrer dans une application existante un module de pilotage financier personnel et entrepreneurial capable de suivre budget, patrimoine, investissements, business SaaS, objectifs, allocations, simulations et données réglementaires.

## Cadrage du 8 septembre 2026
- Le module financier fait obligatoirement partie du projet final.
- Le simulateur GoMining s'ajoute au périmètre CFO existant ; il ne remplace aucun des modules déjà prévus.
- Le cadrage initial a été suivi d’une autorisation de démarrage le 9 septembre 2026 ; voir le suivi de réalisation ci-dessous.
- Portfolio public ; espace financier entièrement privé, réservé à François, unique utilisateur autorisé.
- Données réelles privées et projections personnelles uniquement. La démonstration publique avec données fictives est reportée.
- Les choix de stack et de bibliothèques sont validés ; le coût et les paramètres du futur hébergement Fly.io restent à vérifier avant déploiement.

## Roadmap interactive — 9 septembre 2026
- [Roadmap détaillée](13_ROADMAP.md) : 20 lots, dépendances, jalons et critères de fin.
- [Journal des arbitrages](17_DECISIONS_REALISATION.md) : choix de réalisation à prendre un par un ; D01 est validé, **partie privée et budget d'abord**, puis GoMining et patrimoine.
- [État d'implémentation mesuré](21_ETAT_IMPLEMENTATION.md) — relevé du 18 septembre 2026 : `L00`–`L16` codés, `L17` (blog) vide, `L19` reporté ; le système visuel est appliqué partout mais **huit sections sur quatorze n'ont pas encore leur tableau dense**.
- Branche de travail : `refacto`, migration directe validée. [Suivi du premier lot](18_MIGRATION_SOCLE.md). La connexion locale du compte unique est opérationnelle ; le prochain choix produit concerne le périmètre du premier budget (D05).

## Hypothèses de départ
- Revenus salariaux foyer : 4 700 €/mois
- Dépenses foyer : 4 500 €/mois
- Crédit immobilier : 1 514 €/mois, ~22 ans restants, 4,25 %
- Réserve de sécurité cible : 20 000 €
- Serveur IA cible : ~3 000 €
- Objectif patrimoine : 500 000 €
- App2 : déclenchable quand App1 atteint ~1 000 €/mois stable
- Maximum : 2 projets actifs au départ, 3 maximum

## Fichiers
- 01_VISION_PRODUIT.md
- 02_ARCHITECTURE_FONCTIONNELLE.md
- 03_ARCHITECTURE_TECHNIQUE.md
- 04_MODELE_DONNEES_SQLITE.md
- 05_MOTEUR_CFO_REGLES.md
- 06_MOTEUR_SIMULATION.md
- 07_BUSINESS_PORTFOLIO.md
- 08_FISCALITE_REGLEMENTAIRE_APIS.md
- 09_UI_DASHBOARD.md
- 10_API_INTERNE_CONTRATS.md
- 11_SECURITE_TESTS_OBSERVABILITE.md
- 12_INTEGRATION_APP_EXISTANTE.md
- 13_ROADMAP.md
- 14_DECISIONS_ARCHITECTURE.md
- [15_GOMINING_STRATEGIE_SIMULATION.md](15_GOMINING_STRATEGIE_SIMULATION.md)
- [16_ARBITRAGES_STACK_PROJET.md](16_ARBITRAGES_STACK_PROJET.md) — décisions validées, compatibilité SQLite et piste Fly.io
- [17_DECISIONS_REALISATION.md](17_DECISIONS_REALISATION.md) — journal des choix interactifs de réalisation
- [20_AUTHENTIFICATION_COMPTE_UNIQUE.md](20_AUTHENTIFICATION_COMPTE_UNIQUE.md) — accès propriétaire local, activation et tests
- [21_ETAT_IMPLEMENTATION.md](21_ETAT_IMPLEMENTATION.md) — **ce qui est réellement codé**, mesuré et daté ; à lire avant d'estimer un reste à faire
- [../SECURITY.md](../SECURITY.md) — règles de sécurité et checklist OWASP applicables à chaque lot
- schema.sql
- types.ts
- rules.example.json
