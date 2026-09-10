# 15 — GoMining : stratégie simple et simulation de capitalisation

Date : 8 septembre 2026. Statut : besoin ajouté au périmètre à la demande de François ; conception uniquement, aucune implémentation.

## Objectif et rattachement

Mesurer la croissance d'un parc de minage grâce aux apports personnels réguliers puis au réinvestissement des récompenses. Rendre visible la part de croissance financée par le BTC produit par le parc lui-même.

Ce sous-module complète les investissements et le moteur de simulation du CFO. Le budget, le patrimoine, le business, les objectifs et les autres fonctionnalités du dossier restent au programme.

Accès confirmé : François uniquement, dans l'espace financier privé. Les données observées réelles, hypothèses et résultats projetés restent privés ; aucune version de démonstration publique n'est prévue dans cette étape.

## Stratégie demandée

- Mineur existant : **2 TH**.
- Efficacité initiale : **12 W/TH**. Aucun programme d'amélioration de l'efficacité n'est demandé ; la maintenir dans le scénario de base.
- Avant **10 TH** : accumuler les récompenses BTC, sans réinvestissement automatique.
- Dès l'éligibilité à **10 TH** : réinvestir **100 % des nouvelles récompenses nettes disponibles** en puissance TH ; la convention exacte de bascule au sein d'une période reste à préciser.
- Le traitement du stock de BTC accumulé avant le seuil est une décision ouverte, distincte du réinvestissement des nouvelles récompenses.

Le seuil de 10 TH est une règle fournie par François pour le scénario. Les conditions GoMining réelles, prix, frais et modalités d'exécution devront être vérifiés auprès de sources officielles lors de l'implémentation ; cette note ne les certifie pas.

| Période depuis le début de la simulation | Apport personnel |
|---|---:|
| Mois 1 à 12 inclus | 30 €/mois |
| Mois 13 à 36 inclus | 50 €/mois |
| À partir du mois 37 inclus | 100 €/mois, sans date de fin fixée |

Horizon de maintien souhaité : au moins cinq ans. Une hausse ultérieure des apports pourra être décidée, mais ne doit pas être introduite automatiquement à cinq ans. Distinguer la durée d'affichage de la simulation et la durée de la stratégie.

## Boucle à expliquer

```text
30 €/mois → 50 €/mois → 100 €/mois
                  ↓
          TH achetés par apports
                  ↓
              Minage BTC
                  ↓
    Avant 10 TH : BTC accumulés
    Dès 10 TH : récompenses réinvesties
                  ↓
           TH supplémentaires
                  ↓
           Nouvelle production BTC
                  └──────────→ Réinvestissement TH ↻
```

Le moteur conserve l'origine de chaque gain de puissance. Les récompenses produites par l'ensemble du parc alimentent la catégorie « TH issus du réinvestissement », sans exiger une attribution à chaque TH individuel.

## Grandeurs à distinguer

| Grandeur | Définition |
|---|---|
| Puissance initiale | 2 TH déjà détenus à la date de départ |
| Apports personnels cumulés | Euros réellement apportés depuis le début du scénario |
| TH issus des apports | Puissance acquise exclusivement avec ces apports |
| BTC générés | Récompenses nettes cumulées du minage, y compris celles ensuite réinvesties |
| BTC réinvestis | Quantité cumulée de BTC utilisée pour acquérir des TH |
| Solde BTC accumulé | Récompenses générées et encore détenues en BTC |
| Récompenses réinvesties en EUR | Somme des contre-valeurs EUR aux dates de réinvestissement ; distincte d'une valorisation au cours final |
| TH issus du réinvestissement | Puissance acquise avec les récompenses BTC |
| Puissance totale | Puissance initiale + TH issus des apports + TH issus du réinvestissement |
| Part de croissance par origine | TH de chaque origine divisés par les TH ajoutés depuis le départ |

Le coût historique des 2 TH existants est inconnu. Ne pas l'inventer ni l'inclure implicitement dans les apports futurs. Si renseigné plus tard, l'afficher séparément avant de proposer un total historique.

Le solde BTC déjà détenu au début n'est pas précisé. Le rendre explicite dans les hypothèses et le distinguer des BTC produits pendant la simulation.

## Sorties attendues

- Puissance actuelle, puis après **1, 3, 5 et 10 ans**.
- Pour chaque jalon : apports cumulés, BTC générés, BTC réinvestis, BTC conservés, récompenses réinvesties en EUR, TH par origine et puissance totale.
- Pourcentages de croissance dus aux apports et au réinvestissement.
- Première période d'atteinte des 10 TH, ou indication que le seuil n'est pas atteint sur l'horizon choisi.
- Historique par période permettant un graphique et un tableau de contrôle.

Les apports futurs se calculent indépendamment des hypothèses de minage :

| Horizon | Apports personnels cumulés, hors coût historique du mineur |
|---|---:|
| 1 an | 360 € |
| 3 ans | 1 560 € |
| 5 ans | 3 960 € |
| 10 ans | 9 960 € |

Pour un horizon entier de `m >= 0` mois :

`apportsEUR(m) = 30 × min(m, 12) + 50 × min(max(m − 12, 0), 24) + 100 × max(m − 36, 0)`

## Hypothèses nécessaires au calcul

Ne pas produire de chiffres de TH ou BTC futurs sans hypothèses visibles, enregistrées avec le scénario :

- Date de départ et durée simulée.
- Prix d'acquisition/amélioration d'un TH à l'efficacité retenue ; si le prix est exprimé en USD, taux de conversion vers l'EUR.
- Récompense **nette** en BTC par TH et par période à 12 W/TH, après maintenance et frais applicables. Une saisie nette simple peut suffire pour une V1 ; conserver sa définition, sa période et sa source.
- Cours BTC/EUR utilisé à chaque conversion de récompenses en pouvoir d'achat de TH.
- Hypothèse d'évolution, ou constance explicitement indiquée, de ces paramètres sur la durée. Une projection à hypothèses constantes reste un scénario.
- Pas interne de calcul, moment des apports et du réinvestissement, traitement de la période de franchissement des 10 TH.
- Précision, arrondis, éventuels minimums d'achat et soldes non dépensés.

Ne pas déduire une récompense du seul chiffre de 12 W/TH. Ne pas soustraire une deuxième fois les frais si la récompense saisie est déjà nette. Si les frais sont modélisés séparément, identifier leur source de financement et toute dépense personnelle supplémentaire.

Le modèle déterministe simple est prioritaire. Une modélisation détaillée du réseau Bitcoin ou des scénarios probabilistes n'est pas requise pour cette première version ; les hypothèses doivent néanmoins permettre de représenter une évolution des récompenses sans la confondre avec une garantie de rendement.

## Conventions et invariants à prévoir

- `TH_total = 2 + TH_apports + TH_reinvestissement`.
- Dans le modèle de récompenses nettes, sans retrait ni frais BTC additionnels : `BTC_initial + BTC_generes = BTC_reinvestis + BTC_solde`.
- S'il existe des frais BTC séparés, leur ajouter un poste dédié dans cette égalité.
- Avant éligibilité, aucun TH ne provient d'un réinvestissement automatique.
- Le réinvestissement ne consomme jamais davantage de BTC que le solde disponible.
- Les TH nouvellement acquis produisent à partir du moment défini par la convention temporelle ; pas de production rétroactive.
- La croissance correspond à `TH_total − 2`. Si elle est nulle, afficher les parts comme non applicables, sans division par zéro.
- Les récompenses réinvesties ne sont jamais ajoutées aux euros sortis de la poche.
- Conserver les euros en centimes entiers. Prévoir un calcul décimal maîtrisé pour les conversions BTC/TH, des BTC persistés en satoshis et une précision explicite pour les TH ; décider du traitement des fractions et des arrondis avant implémentation.
- Séparer valeurs internes et arrondis d'affichage. Conserver les reliquats EUR/BTC s'ils ne permettent pas un achat selon les règles retenues.

## Intégration au CFO

- Une simulation reste distincte des transactions et positions réellement observées.
- Les apports GoMining sont déduits une seule fois du cash personnel dans une projection globale.
- Les récompenses réinvesties sont un flux interne à l'investissement, sans revenu disponible supplémentaire pour le foyer.
- Ne pas appliquer simultanément un rendement financier générique à la position et le moteur de production BTC.
- Le nombre de TH n'est pas une valeur de revente garantie. Une éventuelle valorisation patrimoniale du mineur exige une hypothèse séparée, pour éviter de compter à la fois les BTC consommés et les TH achetés avec ces BTC.
- Le calendrier demandé reste explicite. Une incompatibilité avec le budget ou une règle CFO est signalée ; une stratégie modifiée apparaît comme un scénario alternatif.
- Aucune connexion de compte GoMining, aucun ordre d'achat ni opération réelle automatisée n'est demandé.

## Interface souhaitée

Prévoir une frise des apports, le schéma de boucle, des indicateurs aux jalons et un graphique de puissance empilé distinguant le socle initial et les deux sources de croissance. Ajouter un repère aux 10 TH et un tableau accessible reprenant les chiffres du graphique.

Montrer ensemble les contributions cumulées en euros et la progression des TH par origine, avec des unités distinctes. Les BTC générés, conservés et réinvestis doivent rester lisibles séparément. Une distinction visuelle doit aussi identifier observations et projections.

La présentation doit rester simple ; les paramètres avancés peuvent être regroupés dans un panneau d'hypothèses.

## Exclus de cette version

- Cashback de la carte GoMining.
- Platinum+.
- Simple Earn.
- Parrainage.
- Miner Wars.
- Autres revenus ou bonus.

La fiscalité générale reste un module du CFO. Le scénario GoMining ne doit pas être présenté comme un rendement net d'impôt si aucun calcul fiscal spécifique n'est défini.

## Décisions métier encore ouvertes

1. BTC accumulés avant 10 TH : les conserver, ou les réinvestir aussi une fois le seuil atteint ?
2. Pas de calcul : mensuel simplifié, ou journalier avec restitution mensuelle pour mieux représenter le réinvestissement ? Définir également le moment des apports et de la bascule.
3. Valeurs et sources des hypothèses économiques initiales : prix du TH, cours BTC/EUR, récompense nette et évolution retenue.
4. Date de départ, BTC déjà détenus et éventuel coût historique du mineur.

Ces points restent ouverts ; leur présence dans ce document ne vaut pas décision de François.

## Vérifications à réaliser lors de l'implémentation

Contrôler les transitions des mois 12/13 et 36/37, les totaux d'apports aux quatre jalons, l'absence de réinvestissement avant 10 TH, le franchissement exact du seuil, un seuil jamais atteint, des récompenses nulles, les arrondis/reliquats, le traitement choisi du stock BTC et les égalités de conservation. Vérifier aussi l'absence de double comptage dans une projection CFO.
