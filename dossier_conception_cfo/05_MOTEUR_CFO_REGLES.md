# 05 — Moteur CFO / règles

## Entrées
Cash disponible, réserve de sécurité, dépenses foyer, cash business, investissements, part spéculative, objectifs, projets, mode stratégique.

## Priorités V1
1. Obligations et provisions dues.
2. Sécurité jusqu'à la cible.
3. Blocage du spéculatif si plafond dépassé.
4. Opportunités prioritaires (ex. serveur IA) si sécurité préservée.
5. Croissance business si ROI attendu pertinent.
6. Placements selon allocation cible.

## Allocation hybride de départ
- 35 % placements
- 25 % business
- 15 % matériel
- 10 % projets
- 15 % cash/opportunités

Ces poids sont configurables et re-normalisés si un bucket est fermé.

## Exemple de règle
```json
{
  "type": "MAX_BUCKET_PERCENT",
  "params": {"bucket":"SPECULATIVE", "maxPercent":5}
}
```

## Explicabilité
Toute décision contient règle, priorité, calcul, données source et avertissements.
