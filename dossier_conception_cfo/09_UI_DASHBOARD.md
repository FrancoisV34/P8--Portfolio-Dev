# 09 — UI / Dashboard

## Routes
Toutes les vues ci-dessous sont privées et accessibles à François uniquement après authentification. Le portfolio conserve son layout public ; la finance possède sa navigation privée. La page de connexion ne propose pas d'inscription. Aucune démonstration publique du CFO n'est prévue dans cette version.

`/finance`, `/finance/transactions`, `/finance/budget`, `/finance/wealth`, `/finance/investments`, `/finance/business`, `/finance/projects`, `/finance/goals`, `/finance/simulations`, `/finance/rules`, `/finance/regulatory`.

## Dashboard principal
Cards : revenus, dépenses, surplus, patrimoine net, sécurité, taux liberté, CA business, MRR, progression vers 500k.

Graphiques : patrimoine, revenus vs dépenses, CA par app, allocation, dette restante.

## Widget CFO
Afficher cash allouable, priorité, proposition, justification, impact. Actions : appliquer, modifier, ignorer, simuler alternative.

## Portfolio projets
Drag & drop avec priorité, statut, coût, potentiel, score, condition, prochaine action.

## Simulation
Panneau hypothèses + résultats ; duplication de scénario ; comparaison côte à côte.

## Vue GoMining
Vue dédiée envisagée : `/finance/investments/gomining`, accessible également depuis les simulations, dans le routage privé React Router.

- Frise des apports : 30 €/mois → 50 €/mois → 100 €/mois, avec les périodes associées.
- Schéma pédagogique : apports → TH → BTC → TH réinvestis → nouvelle production BTC.
- Puissance actuelle et projections à 1, 3, 5 et 10 ans ; apports cumulés ; BTC générés, réinvestis et conservés ; contre-valeur EUR des récompenses réinvesties au moment de leur utilisation.
- Graphique empilé : 2 TH initiaux, TH issus des apports, TH issus du réinvestissement. Les parts de croissance excluent les 2 TH initiaux.
- Repère au franchissement des 10 TH ; expliquer l'accumulation des récompenses avant ce seuil.
- Hypothèses visibles et tableau de résultats accessible, avec distinction entre observations et projections.

Voir [la spécification GoMining](15_GOMINING_STRATEGIE_SIMULATION.md) pour les règles, limites de périmètre et décisions restantes.

## Mobile
Consultation, transaction rapide, KPI, validation. Simulateur complexe desktop-first.
