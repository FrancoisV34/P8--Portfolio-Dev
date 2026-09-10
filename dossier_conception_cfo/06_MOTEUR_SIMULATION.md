# 06 — Moteur de simulation

## Pas mensuel
1. revenus salariaux
2. CA business
3. charges/provisions
4. dépenses foyer
5. événements ponctuels
6. moteur CFO
7. rendement mensuel
8. dette
9. snapshot

## Rendement composé
`monthlyRate = (1 + annualRate)^(1/12) - 1`

## Scénarios
Prudent, central, ambitieux, personnalisé. Chaque app possède sa courbe de revenu.

## Déclenchement App2
App1 >= 1 000 €/mois stable + capacité projet + cash de lancement.

## Dette
Simuler mensualité, taux, durée, capital restant, renégociation et remboursement anticipé.

## Comparateur de décisions
Comparer investissement financier, réinvestissement business, serveur IA, remboursement du prêt. Sorties : patrimoine final, cash minimum, risque, délai objectif, ROI estimé.

## V2 probabiliste
Monte Carlo : rendements, volatilité, CA, churn, dépenses exceptionnelles ; sortir P10, médiane, P90 et probabilité d'atteindre 500k.

## Simulation GoMining — ajout au périmètre
Ajouter un moteur dédié à la boucle apports EUR → puissance TH → récompenses BTC → réinvestissement TH, avec départ à 2 TH, efficacité de 12 W/TH et seuil de réinvestissement de 10 TH selon le scénario demandé.

Apports : 30 €/mois du mois 1 au mois 12, 50 €/mois du mois 13 au mois 36, puis 100 €/mois à partir du mois 37 sans date de fin fixée. Restituer l'état initial et les jalons 1/3/5/10 ans.

Ce modèle utilise des hypothèses explicites de prix du TH et de récompenses nettes ; la formule de rendement annuel composé des placements ne suffit pas à représenter cette activité. Ne pas appliquer en plus le rendement générique des placements à la même position.

Conserver des résultats agrégeables par mois ; le pas interne et la convention de franchissement du seuil restent à arbitrer. Voir [la spécification GoMining](15_GOMINING_STRATEGIE_SIMULATION.md).
