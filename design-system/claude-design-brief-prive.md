# Brief Claude Design — espace privé (CFO)

> Créé le 2026-09-18. Complète [`claude-design-brief.md`](claude-design-brief.md), qui
> ne couvre **que le public** et le dit explicitement. Celui-ci couvre l'espace
> financier privé, qui partage l'identité mais pas le langage.

## Pourquoi ce brief existe

Trois constats, vérifiés dans le dépôt le 2026-09-18 :

1. **L'espace privé contredit une décision verrouillée.** `app/routes/finance.scss`
   utilise `#303b97` et `#5664db` comme accents, alors que
   [`00-decisions.md`](00-decisions.md) verrouille un **accent graphite** et écrit
   « Pas de bleu/orange ». Le privé n'a jamais été aligné.
2. **Il est quasi non stylé** : 14 lignes de SCSS compressé pour **14 sections**.
3. **La direction publique ne s'y transpose pas telle quelle.** *Apple Marketing*
   — typographie XXL, surfaces généreuses, scroll storytelling — est l'opposé de ce
   qu'un poste de travail financier réclame. Apple a deux langages : celui
   d'`apple.com` et celui de ses **applications** (Numbers, Wallet, Santé). C'est le
   second qu'on transpose.

## Décisions prises avec François avant d'écrire le prompt

| Sujet | Décision |
|---|---|
| Densité | **Outil dense, identité partagée** — mêmes jetons, langage applicatif |
| Thème | **Parité clair/sombre**, comme le design system l'exige déjà |
| Couleur | Graphite = interface **seule** ; vert/rouge **réservés aux montants**, jamais seuls |
| Périmètre | Système + **4 écrans** couvrant tous les motifs + **un patron de courbe** |

## À joindre à Claude Design

- Ce dossier `design-system/` complet (docs + `tokens/*.json`).
- Des captures de l'**interface publique actuelle** (c'est la parenté recherchée).
- Des captures de l'**espace privé actuel** (`/finance`) — le « avant ».
- Éventuellement : Numbers, Wallet, Santé comme références de langage applicatif.

---

## Prompt à coller

(Le prompt exact envoyé à Claude Design est reproduit ci-dessous, à l'identique.)

> **Contexte.** Je suis François Vittecoq. Mon portfolio public (React Router +
> React + TypeScript, Tailwind) a une identité que j'aime : direction **Apple
> Marketing**, neutres purs, **accent graphite monochrome**, typographie Inter.
> Derrière ce portfolio vit un **espace privé, pour moi seul** : une application de
> gestion budgétaire et patrimoniale avec de **vraies données financières**. Elle
> fonctionne, mais elle n'a jamais été habillée — et son style actuel contredit même
> le design system (accents bleus, alors que la décision verrouillée est le graphite).
>
> **Ce que je te demande : le design system de cet espace privé.**
>
> ---
>
> **LA CONTRAINTE CENTRALE, à lire avant tout le reste.**
> Je veux qu'on **reconnaisse le portfolio** dans l'espace privé — mêmes jetons,
> même typographie, même accent graphite, même sobriété. Mais je ne veux **pas** le
> langage marketing : pas de hero plein écran, pas de typographie XXL, pas de scroll
> storytelling. Apple a deux langages, celui d'`apple.com` et celui de **Numbers,
> Wallet et Santé** : c'est le second qu'il faut transposer ici. Rythme serré,
> tableaux lisibles, formulaires rapides, information dense à l'écran.
> Une belle page marketing où je ne peux pas saisir une transaction serait un échec.
>
> ---
>
> **Ce qui existe déjà et fait autorité.** Le dossier `design-system/` joint contient
> les jetons sémantiques (`tokens/colors.json`, `typography.json`, `spacing.json`,
> `motion.json`, `elevation.json`) : couleurs **OKLCH**, échelle 4pt/8pt, typographie
> Inter (400/600/700 uniquement). **Consomme-les, ne les réinvente pas.** Si un
> besoin du privé n'est pas couvert, **ajoute un jeton sémantique** et dis-le
> explicitement — ne code jamais une valeur en dur.
>
> - `--color-accent` : `oklch(0.30 0.02 260)` en clair, `oklch(0.85 0.02 260)` en sombre.
> - Neutres : fond `oklch(0.99 0 0)` / `oklch(0 0 0)`, texte `#1d1d1f` / `#f5f5f7`.
> - **Parité clair / sombre** : les deux thèmes traités à égalité. Le sombre est
>   *composé*, jamais une inversion automatique du clair.
>
> **La règle de couleur, non négociable.**
> - Le **graphite est la seule couleur d'interface** : liens, boutons, onglet actif,
>   anneaux de focus. Aucune autre teinte saturée dans le châssis.
> - Le **vert et le rouge sont réservés aux montants et aux écarts** — jamais aux
>   boutons, jamais aux onglets, jamais à un fond de carte.
> - **Jamais la couleur seule.** Un montant négatif porte toujours son signe, et un
>   état porte toujours un mot ou une icône. L'écran doit rester lisible en niveaux
>   de gris, et par quelqu'un qui ne distingue pas le rouge du vert.
>
> ---
>
> **CE QUE JE VEUX QUE TU PRODUISES**
>
> **1. Les jetons complémentaires du privé.** Ce que le système public ne couvre pas :
> montants positifs / négatifs / neutres, états (à venir, en retard, rapproché, archivé),
> surfaces de tableau (en-tête, ligne, ligne survolée, ligne totale), densités
> (confortable / compacte).
>
> **2. Les composants, avec TOUS leurs états.** C'est la partie la plus utile, et
> celle qu'on bâcle d'habitude :
> - **Tuile de métrique** (« Revenus », « Dépenses », « Reste du mois ») — une
>   variante *emphase* pour le chiffre qui compte.
> - **Tableau de données dense** : montants alignés à droite en chiffres tabulaires,
>   en-tête collant, ligne de total, tri, ligne survolée, ligne sélectionnée.
> - **Formulaire de saisie rapide** — c'est le geste le plus fréquent de
>   l'application : saisir une transaction sans quitter le clavier. Champs, champ
>   monétaire, sélecteur de catégorie, erreurs de validation, état d'envoi.
> - **Liste clé/valeur** (soldes, engagements), **cases à cocher groupées**,
>   **repli `details`**, **lien d'action discret**.
> - **Navigateur de période** (mois précédent / mois courant / mois suivant) — il est
>   présent sur presque tous les écrans.
> - **Barre d'onglets à 14 entrées**, défilable horizontalement, avec un état actif
>   lisible et une gestion honnête du débordement sur mobile.
> - **Alerte**, **état vide** (avec l'action qui en sort), **état de chargement**,
>   **état d'erreur**.
>
> **3. Quatre écrans, choisis parce qu'ils couvrent tous les motifs.** Les dix autres
> sections en découleront sans nouvelle maquette :
> - **Synthèse** — trois métriques, soldes de fin de période, suivi du budget,
>   clôture mensuelle, rapprochement, réserve de sécurité, engagements du mois.
> - **Transactions** — le tableau dense, plus le formulaire de saisie rapide.
> - **Budget** — prévu contre réalisé, par catégorie, avec les écarts.
> - **Patrimoine** — actifs, valorisations datées, et la courbe de croissance.
>
> **4. Un patron de graphique, réutilisable partout.** C'est important pour moi :
> je note un montant par mois, et je veux voir la **trajectoire**.
> - **Courbe fluide, légèrement arrondie** — mais avec une **interpolation
>   monotone**. ⚠️ Une courbe de Bézier ordinaire *dépasse* les points réels : elle
>   peut plonger sous une valeur qui n'a jamais baissé. Sur du patrimoine, c'est un
>   mensonge. L'arrondi ne doit jamais sortir de l'intervalle des valeurs voisines.
> - **Trois points minimum.** Avec un ou deux mois, ne dessine pas de courbe :
>   affiche le chiffre, et l'écart avec le mois précédent. Une ligne entre deux
>   points suggère une tendance qui n'existe pas.
> - **Un seul axe des ordonnées, jamais deux.** Deux grandeurs d'échelles
>   différentes → deux graphiques, ou une base 100 commune.
> - Traits **fins** (2 px), points ≥ 8 px, grille et axes **effacés**, aucune valeur
>   sur chaque point — seulement le premier, le dernier, et les extrêmes.
> - **Le texte porte les jetons de texte**, jamais la couleur de la série.
> - **Survol** : repère vertical + infobulle avec la date et la valeur exacte.
> - Le sombre est **composé**, pas inversé.
> - Décline le patron pour : **Patrimoine** (valeur totale dans le temps),
>   **GoMining** (empilement base / apports / réinvestissement — 2 px de fond entre
>   les segments), et **Budget** (prévu contre réalisé).
>
> ---
>
> **CONTRAINTES**
> - Typographie **Inter**, poids 400/600/700 uniquement. **Chiffres tabulaires
>   obligatoires** partout où des montants s'alignent.
> - Rayons 10 à 24 px selon la taille. Ombres **ultra subtiles**, aucun glassmorphism.
> - Mouvement : respecter `prefers-reduced-motion`, easings de `tokens/motion.json`.
>   Dans le privé, l'animation sert la **lecture** (transition d'état, apparition de
>   ligne), jamais le spectacle.
> - Accessibilité : contraste AA sur le corps, AAA sur les titres, anneaux de focus
>   visibles, cibles tactiles ≥ 44 px, tableaux navigables au clavier.
> - Responsive : 375 / 768 / 1280+. Sur mobile, un tableau de montants doit rester
>   **utilisable**, pas seulement « ne pas casser » — propose la solution que tu
>   juges honnête (cartes empilées, colonnes prioritaires, défilement horizontal
>   assumé) et explique-la.
>
> **ANTI-PATRONS**
> - Pas de hero, pas de typographie XXL, pas de scroll storytelling — c'est un outil.
> - Pas de néon, pas de dégradé violet/rose, pas de « tableau de bord SaaS 2021 »
>   avec six cartes colorées.
> - Pas d'axe double, pas de camembert pour comparer des grandeurs, pas de valeur
>   inscrite sur chaque point.
> - Pas plus de deux polices. Pas d'icône décorative sans fonction.
>
> **CONTENU RÉEL — n'invente pas de vocabulaire, celui-ci est le vrai**
> Les 14 sections : Synthèse · Comptes · Catégories · Transactions · Budget ·
> Calendrier · Patrimoine · Business · Objectifs · CFO · Simulations · Règles ·
> Micro / SASU · GoMining.
> Termes employés dans l'application : « Reste du mois », « Soldes à la fin de la
> période », « Suivi du budget », « Réserve de sécurité », « Engagements du mois »,
> « Clôture mensuelle », « Rapprochement », « Allocation observée », « Valorisation
> datée », « BTC observés », « Entité économique », « Provision », « Apport ».
> Montants en euros, format français (`1 234,56 €`).
>
> **LIVRABLE**
> Les jetons complémentaires en CSS variables consommables par Tailwind, les
> composants et les quatre écrans en maquettes haute fidélité, le patron de
> graphique décliné, **et un document de passation** qui dise pour chaque décision
> *pourquoi* — je l'implémenterai moi-même dans `app/routes/finance.tsx`.
>
> ---
>
> **AVANT DE COMMENCER : POSE-MOI DES QUESTIONS.**
> Ne produis rien tant que tu n'as pas éclairci ce qui te manque. Dis-moi ce que tu
> n'as pas compris, ce qui te paraît contradictoire dans ce brief, et ce que tu
> ferais autrement. Si une contrainte ci-dessus te semble nuire au résultat,
> **dis-le et argumente** plutôt que de l'appliquer en silence. Je préfère être
> challengé qu'être flatté.
