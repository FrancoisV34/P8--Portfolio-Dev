# 02 — Architecture fonctionnelle

## Modules
1. Accounts : comptes perso, conjoint, épargne, PEA, AV, PER, business, crypto.
2. Transactions : journal manuel, catégories, nature économique, entité foyer/business, projet associé.
3. Budget : cible, réel, variance, moyenne glissante.
4. Patrimoine : actifs, dettes, liquidités, placements, immobilier.
5. Investissements : positions par enveloppe et classe d'actif.
6. Business : plusieurs produits SaaS, métriques et cash.
7. Projects : backlog priorisé, coût, temps, potentiel, dépendances.
8. Goals : sécurité, serveur, App1, App2, patrimoine, renégociation prêt.
9. CFO Engine : allocation et recommandations explicables.
10. Simulation Engine : projection 5/10/20 ans.
11. Regulatory Data : valeurs fiscales/sociales versionnées.
12. GoMining : sous-module des investissements et de la simulation, consacré aux apports réguliers, à la puissance TH, aux BTC produits et au réinvestissement des récompenses. Voir [la spécification GoMining](15_GOMINING_STRATEGIE_SIMULATION.md).

## Flux économique
```text
SALAIRES → FOYER → DEPENSES → SURPLUS PERSONNEL
BUSINESS → CA → CHARGES/PROVISIONS → CASH BUSINESS → DISTRIBUTION / REINVEST.
```

## Portfolio business
```text
Business
 ├── App1
 ├── App2
 └── App3
```
