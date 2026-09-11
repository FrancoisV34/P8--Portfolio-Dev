# 17 — Journal des décisions de réalisation

Créé le 9 septembre 2026. La [roadmap détaillée](13_ROADMAP.md) décrit tous les lots ; ce journal consigne les choix de réalisation de François. Il complète les [décisions de stack déjà validées](16_ARBITRAGES_STACK_PROJET.md).

## Règles de fonctionnement

- Un arbitrage interactif à la fois, avec deux ou trois options compréhensibles.
- Une recommandation est une proposition ; elle ne devient une décision qu'après réponse de François.
- Une absence de réponse ne valide aucune option.
- Une décision modifie les lots concernés sans rouvrir la stack, la confidentialité ou le compte unique.
- Le 9 septembre 2026, François autorise le démarrage de la migration directe par « va y commence la ! ». Les prochains choix produit restent interactifs.
- Pendant la réalisation future, les choix produit sont discutés ; les opérations techniques nécessaires et leurs vérifications font partie du lot autorisé.

## Décisions déjà acquises — ne pas redemander

React Router en mode framework, React, TypeScript, Node.js, SQLite avec Drizzle/better-sqlite3 ; bibliothèques listées dans le registre de stack. Portfolio public, finance entièrement privée, François seul utilisateur, inscriptions désactivées. CFO complet et GoMining simple inclus. Données réelles privées, démonstration publique reportée. Fly.io constitue la piste à évaluer, sans coût nul garanti.

## D01 — Premier résultat utile après le socle commun

**État : validé le 9 septembre 2026 — option A, budget d'abord.**

François donne la priorité à la partie privée. Le premier résultat utile sera donc comptes + transactions + dashboard budgétaire (L07–L08), après le socle commun. GoMining (L09) et patrimoine (L10) suivent ; la finition publique (L17) est différée après les premiers livrables privés.

Options comparées, conservées pour historique :

| Option | Résultat prioritaire | Conséquence sur la roadmap |
|---|---|---|
| A — Budget d'abord | Comptes, journal et dashboard mensuel | L07–L08, puis L09 et L10 |
| B — GoMining d'abord | État du mineur et simulateur privés | L09, puis L07–L08 et raccordement au budget |
| C — Portfolio d'abord | Refonte publique visuelle aboutie | L17, puis premiers modules financiers |

Option retenue : **A**, pour disposer tôt d'un outil quotidien privé et relier ensuite GoMining à des apports réellement suivis. Les options B et C ne sont pas retenues.

Le port fonctionnel du portfolio actuel, la connexion privée et SQLite font partie du socle de toutes les options. Tous les modules CFO restent dans la destination finale.

Réponse de François : **« la partie privé en premier donc on va dire budget d'abord »**. Date : **9 septembre 2026**.

## File des arbitrages suivants

Les options de cette file sont préparées pour les échanges futurs ; elles ne sont pas toutes demandées aujourd'hui. D01 est clos : la partie privée et le budget sont prioritaires.

| ID | Quand | Sujet | Options à présenter au moment utile | Impact |
|---|---|---|---|---|
| D02 | Validé : migration directe sur `refacto` | Stratégie de migration | Migrer le socle directement sur `refacto` avec port minimal du portfolio ; construire temporairement le nouveau socle dans un sous-dossier puis le réintégrer | Une seule application finale ; coût de maintien temporaire de deux environnements selon le choix |
| D03 | Réalisé pour le démarrage local | Connexion et récupération du compte | Compte local avec récupération serveur ; connexion par une identité externe explicitement autorisée | Parcours de connexion et dépendance à un fournisseur ; toujours un seul utilisateur |
| D04 | Avant première mise en ligne | Moment d'essayer Fly.io | Après le premier module utile ; après budget + GoMining + patrimoine ; conserver d'abord un usage local plus long | Temps avant usage en ligne ; L06 reste obligatoire avant données réelles en ligne |
| D05 | Avant L07 | Historique initial à saisir | Soldes d'ouverture et mois courant ; reprise de quelques mois ; reprise annuelle | Charge de saisie et disponibilité des moyennes historiques |
| D11 | Validé : L08 | Réserve et engagements mensuels | Réserve calculée depuis des comptes sélectionnés ; réserve saisie séparément ; cible en mois de dépenses | Évite la duplication de solde et précise le rapprochement prévu/réel |
| D06 | Validé : L09 | BTC accumulés avant 10 TH | Conserver le stock ; le réinvestir aussi au franchissement du seuil, selon un choix enregistré par scénario | Solde BTC et TH acquis à la bascule |
| D07 | Validé : L09 | Pas de calcul GoMining | Mensuel simplifié ; journalier avec restitution mensuelle | Fidélité de la capitalisation et définition du moment de bascule |
| D12 | Validé : L09 | Moment des apports et réinvestissements | Début de mois ; fin de mois | Effet sur les récompenses et le franchissement du seuil |
| D13 | Validé : L09 | Raccordement de l’apport GoMining au budget | Catégorie de dépense facultative par scénario ; intégration automatique au budget et au journal | Visibilité sans confondre hypothèse, budget et mouvement réel |
| D14 | Validé : L09 | Conservation des hypothèses GoMining | Historique immuable complet ; version courante seule ; duplication manuelle | Traçabilité des décisions et conservation des scénarios |
| D15 | Validé : L09 | Utilisation d’une ancienne hypothèse | Dupliquer un scénario ; appliquer au scénario courant comme nouvelle révision ; consultation seule | Revenir à une hypothèse sans réécrire l’historique |
| D16 | Validé : L10 | Périmètre initial du patrimoine | Bilan vérifiable ; snapshots seulement ; suivi exhaustif | Niveau de détail des actifs, dettes et échéanciers du premier incrément |
| D17 | Validé : L10 | BTC GoMining dans le patrimoine réel | BTC observés uniquement ; exclusion complète ; valeur manuelle complète du contrat | Évite de confondre BTC réellement détenus, puissance TH et projections |
| D18 | Validé : L10 | Allocation patrimoine | Allocation observée ; allocation observée + cible ; différer | Restitution de la répartition sans amorcer de recommandation CFO |
| D19 | Validé : L11 | Premier suivi du business | Cash business observé ; KPI SaaS d'abord ; approfondir L10 | Distinguer strictement activité économique, cash d'entité et foyer |
| D08 | Avant finition L17 | Profondeur de la refonte publique | Améliorations ciblées de l'existant ; refonte visuelle complète avec animations narratives | Taille du lot public ; le port fonctionnel est déjà dans L02 |
| D09 | Avant le blog de L17 | Contenu du blog | Fichiers Markdown/MDX ; CMS ; réalisation du blog différée après la première version financière | Rédaction, maintenance et calendrier du blog |
| D10 | Avant déploiement | Paramètres d'exploitation | Organisation Fly.io, domaine, budget avant remise, sauvegardes, dimensionnement et interruptions tolérées | Configuration concrète, coût et procédure de reprise |

D10 sera découpé en petites questions lorsque les mesures techniques seront disponibles. Aucune donnée secrète n'est demandée dans ce journal.

## D16 — Premier bilan patrimoine

**État : validé le 10 septembre 2026 — option A, bilan patrimonial vérifiable.**

Le premier incrément de L10 enregistre manuellement des actifs hors liquidités,
leur quantité descriptive, capital versé et valorisations datées, ainsi que les
dettes avec un capital restant dû daté, mensualité, taux annuel et durée
restante. Il calcule le patrimoine brut/net et un échéancier indicatif qui
sépare intérêts et remboursement du capital.

Les liquidités sont exclusivement recalculées depuis les comptes existants :
elles ne sont jamais ressaisies dans le patrimoine. GoMining reste une
projection privée distincte et n'est pas présenté comme une valeur de revente
certaine. Aucun cours automatique, ordre, transaction, suivi exhaustif des
mouvements de positions ou simulation de remboursement anticipé n'est ajouté à
ce stade.

## D17 — BTC GoMining observés dans le patrimoine

**État : validé le 11 septembre 2026 — option A, BTC observés uniquement.**

Le patrimoine peut contenir une position manuelle unique de BTC réellement
détenus chez GoMining, exprimée en satoshis et valorisée à une date choisie.
Cette position ne contient ni puissance TH, ni prix de revente du contrat, ni
récompense future. Elle est indépendante du simulateur GoMining : aucune
valeur, hypothèse ou projection n'est recopiée automatiquement entre les deux
modules.

## D18 — Allocation patrimoine observée

**État : validé le 11 septembre 2026 — option A, allocation observée.**

Le premier affichage d'allocation montre uniquement la répartition constatée
des actifs bruts : liquidités recalculées depuis les comptes, puis actifs
valorisés par classe. Les dettes ne réduisent pas artificiellement une classe,
et aucune cible, dérive, recommandation ou rééquilibrage n'est introduit avant
le moteur CFO de L14.

## D19 — Premier suivi de trésorerie business

**État : validé le 11 septembre 2026 — option A, cash business observé.**

Chaque activité est rattachée à une entité économique de type business. Pour
une période donnée, le suivi saisit le CA encaissé et les charges
opérationnelles ; il restitue leur résultat opérationnel sans le présenter
comme un revenu personnel net. Le cash conservé est un solde mensuel par entité
business et le distribué est un flux du mois explicitement renseigné.

Ces observations ne créent aucune transaction du budget du foyer et aucun
montant « distribuable » n'est inféré. MRR, ARR, temps de maintenance,
provisions et fiscalité sont volontairement différés : leur sémantique sera
arbitrée dans un incrément dédié de L11, puis L13 pour tout calcul réglementaire.

## D11 — Réserve de sécurité et engagements mensuels

**État : validé le 10 septembre 2026 — option recommandée.**

La réserve de sécurité est une cible en euros comparée au total des soldes des comptes sélectionnés ; elle ne duplique ni ne saisit un solde séparé. Les engagements mensuels définissent seulement un prévu (catégorie de dépense, montant, jour et période de validité). Ils ne génèrent aucune transaction. Un paiement réel est pris en compte uniquement lorsqu’une transaction de dépense de même catégorie est explicitement reliée à l’engagement.

Cette décision rend chaque montant explicable, conserve les mouvements réels dans le journal et évite un rapprochement automatique ambigu par catégorie.

## D06 — Sort des BTC accumulés au seuil de 10 TH

**État : validé le 10 septembre 2026 — choix par scénario.**

Chaque scénario GoMining permettra de sélectionner l’une des deux politiques suivantes :

- conserver le stock de BTC accumulé avant 10 TH ;
- réinvestir également ce stock au franchissement de 10 TH.

Dans les deux cas, les récompenses générées après le seuil suivent le réinvestissement automatique. Le réglage est une hypothèse de simulation modifiable ; il ne crée ni ne modifie une transaction réelle. Les résultats doivent montrer distinctement BTC conservés, BTC réinvestis et TH acquis à la bascule.

## D07 — Pas de calcul GoMining

**État : validé le 10 septembre 2026 — mensuel simplifié.**

Les apports, récompenses, coûts et réinvestissements seront calculés une fois par mois et restitués dans la même granularité. Le moteur ne prétendra donc pas produire une capitalisation journalière ; le moment des opérations à l’intérieur du mois est fixé par D12.

## D12 — Moment des apports et réinvestissements

**État : validé le 10 septembre 2026 — fin de mois.**

Chaque période calcule d’abord la récompense nette avec la puissance disponible au début du mois. Les apports personnels, puis les BTC réinvestissables, achètent la puissance à la fin de cette période et produisent donc leurs premiers effets le mois suivant. Cette convention prudente s’applique également au mois de franchissement de 10 TH.

## D13 — Raccordement GoMining au budget

**État : validé le 10 septembre 2026 — option A, catégorie facultative.**

Un scénario peut être lié à une catégorie de dépense existante, par exemple « GoMining ». Pour la période affichée, son apport mensuel est alors montré séparément comme un prévu. Il ne modifie ni le montant du budget mensuel, ni le réalisé, et ne génère jamais une transaction. Le lien est facultatif, modifiable, et limité côté serveur comme dans SQLite à une catégorie de dépense appartenant au propriétaire.

## D14 — Conservation des hypothèses GoMining

**État : validé le 10 septembre 2026 — option A, historique immuable.**

Chaque création ou modification enregistre une révision complète des hypothèses et de ses paliers. Les révisions sont consultables en lecture seule ; elles ne peuvent être ni modifiées ni supprimées. En conséquence, la suppression d’un scénario n’est plus proposée, afin de préserver son historique. Une modification crée toujours une nouvelle révision.

## D15 — Utilisation d’une ancienne hypothèse GoMining

**État : validé le 10 septembre 2026 — option B, restauration versionnée.**

Depuis une ancienne version, François peut appliquer ses hypothèses au scénario courant. Cette action ne modifie jamais l’ancienne version : elle crée une nouvelle révision complète, avec les paliers restaurés. Le serveur vérifie que le scénario et la version appartiennent au propriétaire, puis revalide la catégorie de budget éventuellement référencée.

## D02 — Support Git confirmé

François demande de préserver la production actuelle en travaillant sur une nouvelle branche avant de poursuivre les arbitrages.

- Branche locale créée et sélectionnée : **`refacto`**.
- Point de départ : **`main`, commit `c367a1b`**.
- Modifications locales existantes conservées dans le répertoire de travail ; elles ne sont pas encore enregistrées dans un commit.
- La référence `main` n'a pas été déplacée ; aucun push ni déploiement effectué.
- Au moment de la création de la branche, l’implémentation n’avait pas commencé. Elle démarre ensuite sur demande de François (voir le complément D02 ci-dessous).

La branche de travail est choisie ; ne pas redemander cet arbitrage. Cette décision ne fixe pas à elle seule le rythme du port des composants.

### D02 — Méthode de port, complément à la décision Git

**État : validé le 9 septembre 2026 — option A, migration directe sur `refacto`.** François demande « va y commence la ! » à la suite de la recommandation A ; le port est lancé avec cette organisation annoncée.

| Option | Organisation | Compromis |
|---|---|---|
| A — Migration directe sur `refacto`, recommandée | Remplacer le socle CRA par React Router dans l'application actuelle, porter le minimum du portfolio puis construire la finance | Un seul environnement à maintenir ; le travail de migration reste isolé sur la branche |
| B — Nouveau socle temporaire dans un sous-dossier | Garder l'ancien environnement disponible localement pendant la construction du nouveau, puis réintégrer | Comparaison locale simultanée possible ; deux environnements temporaires et une étape de bascule |

Les deux options conservent la production actuelle et aboutissent à une seule application React Router. Aucune refonte visuelle publique approfondie n'est ajoutée avant le budget. Option A retenue. Le socle est migré directement ; les composants historiques inactifs restent dans `src/` comme référence, sans second environnement applicatif.

## D03 — Connexion du compte unique

**État : réalisé le 9 septembre 2026 — option recommandée de compte local.** À la reprise du chantier, la connexion locale a été mise en œuvre pour pouvoir avancer sans dépendance à un fournisseur externe. Un compte unique est créé par une commande serveur, le mot de passe est demandé hors Git, et son remplacement révoque les sessions. La solution reste limitée à François ; elle peut être remplacée par GitHub OAuth plus tard si ce choix devient préférable.

Les inscriptions, invitations et réinitialisations publiques ne sont pas exposées. L’API d’authentification n’autorise que la connexion, la lecture de session et la déconnexion. Chaque route financière vérifie côté serveur que la session est celle de l’e-mail propriétaire configuré. Voir [le suivi SQLite](19_FONDATIONS_SQLITE.md) et [la procédure détaillée](20_AUTHENTIFICATION_COMPTE_UNIQUE.md).

La base réelle n’est pas initialisée tant que `.env` n’est pas rempli et que `npm run auth:bootstrap` n’a pas été exécuté localement. Aucun identifiant personnel n’est demandé dans ce document.

## D05 — Historique budgétaire initial

**État : validé le 9 septembre 2026 — option A, soldes d’ouverture + mois courant.**

Le premier usage budgétaire démarre avec un solde d’ouverture daté pour chaque
compte, puis les seules transactions du mois courant. Les tendances sur 3, 6
et 12 mois ne seront affichées que lorsqu’un historique réel suffisant aura
été saisi ; aucune donnée de démonstration ou reconstitution artificielle ne
complète les périodes absentes.

| Option | Portée | Compromis |
|---|---|---|
| A — Soldes d’ouverture + mois courant, retenue | Mise en service rapide avec une base exacte à la date de départ | Pas de tendance historique immédiate |
| B — Reprise des trois derniers mois | Premières comparaisons mensuelles dès le démarrage | Saisie et contrôle initiaux plus importants |
| C — Reprise d’une année complète | Moyennes et tendances annuelles disponibles immédiatement | Reprise longue qui retarde l’usage quotidien |

Option retenue : **A**. Les soldes d’ouverture ne remplacent pas des
transactions antérieures et ne sont pas traités comme des revenus ou dépenses
du mois. Les écrans budget doivent expliciter l’absence d’historique plutôt
que d’en déduire un zéro.

Réponse de François : **« A »**. Date : **9 septembre 2026**.

Mise en œuvre locale le 10 septembre 2026 : l’écran privé commence sans donnée préremplie, guide la création des comptes avec leurs soldes d’ouverture datés, puis le journal du mois courant. Le dashboard indique explicitement que les tendances ne sont pas encore disponibles. Les tests utilisent uniquement des valeurs synthétiques et des bases temporaires.

## Informations factuelles à recueillir pour les modules

Ces informations alimentent les écrans ou les hypothèses ; ce ne sont pas de nouveaux arbitrages de stack :

- GoMining : date de départ, état actuel, BTC déjà détenus, éventuel coût historique, prix du TH, récompense nette et cours de conversion datés.
- Comptes : soldes d'ouverture et dates, comptes/catégories utiles, mouvements de la période retenue.
- Patrimoine : valorisations datées, quantités détenues, capital restant dû et caractéristiques des dettes.
- Business : activités/produits suivis, historique disponible, charges et provisions connues.
- Hébergement : organisation réellement utilisée et tarifs applicables au moment de l'essai.

Les valeurs financières réelles seront conservées dans un support privé ou saisies dans l'application protégée, pas ajoutées comme fixtures de démonstration publiques.

## Historique des réponses

| Date | Décision | Réponse de François | Lots mis à jour |
|---|---|---|---|
| 2026-09-09 | Création de la roadmap | Demande d'une grande roadmap et d'un arbitrage interactif progressif | L00 à L19 proposés ; D01 posé |
| 2026-09-09 | D02 — Branche de travail | Créer une branche de refonte et s'y placer pour préserver la production actuelle | `refacto` créée depuis `main` ; support Git de L00 défini, D01 reste ouvert |
| 2026-09-09 | D01 — Premier résultat utile | « la partie privé en premier donc on va dire budget d'abord » | L07–L08 premiers après le socle, puis L09/L10 ; finition L17 différée |

| 2026-09-09 | D02 — Méthode et démarrage | « va y commence la ! » | Migration directe du socle sur `refacto` lancée ; D03 présenté pour la suite |
| 2026-09-09 | D03 — Connexion locale | Reprise du chantier ; mise en œuvre de l’option locale recommandée | Better Auth, compte unique provisionné par commande serveur, session et déconnexion testées |
| 2026-09-09 | D05 — Historique budgétaire initial | « A » | Soldes d’ouverture datés + transactions du mois courant ; L07–L08 peuvent démarrer sans reprise artificielle |
| 2026-09-10 | D11 — Réserve et engagements | « oui je valide go faire comme ca » | Réserve issue des comptes sélectionnés ; engagements mensuels prévus et paiements explicitement rattachés ; L08 terminé localement |
| 2026-09-10 | D06 — BTC accumulés à 10 TH | « c'est exactement ça ! parfait » | Politique enregistrable par scénario : conserver le stock ou le réinvestir aussi au seuil ; récompenses après seuil réinvesties automatiquement |
| 2026-09-10 | D07 — Pas de calcul GoMining | « A » | Calcul mensuel simplifié retenu pour les projections et leur restitution |
| 2026-09-10 | D12 — Moment des apports | « A » | Apports et réinvestissements pris en compte à la fin de chaque mois |
| 2026-09-10 | D16 — Premier bilan patrimoine | « A » | Actifs et valorisations datés, dettes et échéancier indicatif ; liquidités et GoMining exclus des doubles comptes |
| 2026-09-11 | D17 — BTC GoMining dans le patrimoine | « A » | Une position manuelle unique de BTC observés, sans TH ni valeur de contrat |
| 2026-09-11 | D18 — Allocation patrimoine | « A » | Répartition observée des actifs bruts, sans cible ni recommandation |
| 2026-09-11 | D19 — Premier suivi du business | « A » | Activités, CA et charges mensuels, cash conservé et flux distribué par entité business ; aucune écriture foyer ou fiscalité automatique |

Les réponses ultérieures seront consignées ici et répercutées dans la roadmap. Ne pas marquer un lot terminé sur la seule base d'un choix de planification.
