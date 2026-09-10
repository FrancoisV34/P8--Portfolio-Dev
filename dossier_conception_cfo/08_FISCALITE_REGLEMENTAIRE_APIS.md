# 08 — Fiscalité, réglementation et APIs externes

## Principe
Ne jamais coder les seuils comme constantes permanentes.

```text
source officielle → ingestion → validation → valeur versionnée → moteur
```

## Sources candidates
### data.gouv.fr
API catalogue couramment utilisée : `https://www.data.gouv.fr/api/1/`
À exploiter pour rechercher datasets, organisations et ressources. Tous les seuils fiscaux ne sont pas forcément disponibles comme datasets structurés.

### economie.gouv.fr / Bercy
Source pratique pour régime micro, seuils, cotisations, TVA, PEA et informations entrepreneuriales. Souvent éditoriale, donc prévoir saisie/versioning si aucune API métier stable.

### service-public.fr
Démarches, statuts, obligations. Ne pas scraper agressivement.

### URSSAF
Source à privilégier pour cotisations sociales. API si documentation publique stable, sinon valeur manuellement vérifiée et versionnée.

### impots.gouv.fr
Pour fiscalité. Même stratégie : API officielle si disponible, sinon registre vérifié.

## Valeurs de référence à paramétrer et vérifier avant production
- micro services 2026 : autour de 83 600 € de CA/an
- micro vente 2026 : autour de 203 100 €
- PEA : 150 000 € de versements
- PEA + PEA-PME : 225 000 € combinés

Ces valeurs ne doivent être actives que si une entrée réglementaire valide les confirme pour la période.

## Modèle
`regulatory_values(key, jurisdiction, activity_type, value_json, valid_from, valid_to, source_name, source_url, retrieved_at, verified_at, confidence)`

## Providers
- DataGouvProvider
- ManualVerifiedProvider
- CachedProvider

## Refresh
Créer une tâche `regulatory:refresh`. Détecter les changements mais exiger validation humaine si parsing non fiable.

## Comparateur de statuts
Le moteur peut comparer Micro, EI, EURL, SASU et holding sur : simplicité, charges, déduction des dépenses, protection sociale, TVA, capacité de réinvestissement, complexité, besoin d'expert-comptable.

## Holding
À envisager seulement avec logique économique : plusieurs sociétés, remontée de dividendes, réinvestissement inter-sociétés, acquisitions, organisation d'un groupe. Pas comme étape automatique.

## Alerte de changement de structure
Déclencher une revue quand CA approche seuil, charges réelles augmentent, besoin d'embauche/investisseurs, multi-sociétés, cash important. Sortie : « étude expert-comptable recommandée », jamais « passe automatiquement en SASU ».

## Limite de recherche
La recherche web live n'était pas disponible lors de la rédaction de ce dossier. Les endpoints et valeurs réglementaires doivent donc être vérifiés contre la documentation officielle au moment de l'implémentation.
