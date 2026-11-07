# 21 — État d'implémentation mesuré

Relevé du **18 septembre 2026**, sur la branche `refacto`, à `d528575`.
Mis à jour le **23 septembre 2026** : voir les deux encarts datés ci-dessous
(sections 1 et 2). Mis à jour le **3 octobre 2026** : encart de la section 1,
section 4 réécrite ; le **10 octobre 2026** : section 4, point 1.

Ce document ne remplace ni la [roadmap](13_ROADMAP.md), qui dit ce qu'il faut
faire, ni le [journal des décisions](17_DECISIONS_REALISATION.md), qui dit ce
qui a été tranché. Il dit **ce qui est réellement dans le code**, et comment ça
a été constaté — pas de souvenir, pas d'impression.

**Méthode.** Présence des dépôts dans `app/.server/repositories/`, comptage des
motifs dans `app/routes/finance.tsx`, comparaison avec `git show 022c3d7^`,
`npm run check` et `npm run test:auth`.

---

## 1. Les lots produit — L00 à L16 sont codés

| Lots | Objet | État |
|---|---|---|
| `L00`–`L06` | Socle React Router, auth compte unique, SQLite, sauvegarde | codés — `scripts/db/{backup,restore,migrate,check}.ts` présents |
| `L07`, `L08` | Comptes, journal de transactions, budget | codés |
| `L09`, `L10`, `L11` | GoMining, patrimoine et dettes, business SaaS | codés |
| `L12`, `L13` | Objectifs et projets, registre réglementaire daté | codés |
| `L14`, `L15`, `L16` | Moteur CFO, simulations, comparateur Micro/SASU | codés |
| `L17` | Portfolio finalisé et **blog** | blog codé le 4 octobre 2026 (D09 : Markdown dans `content/blog/`) ; premier article publié et déployé le 5 octobre 2026. Visuel public conservé (D08) |
| `L18` | Mise en service | en ligne — François déploie par `fly deploy`. Restauration d'une sauvegarde de production testée le 3 octobre 2026. Domaine perso décidé, en pause : [22](22_DOMAINE_ET_SEO.md) |
| `L19` | Intelligence avancée (Monte Carlo, assistant) | non commencé — **reporté par décision**, pas en retard |

13 dépôts métier existent et servent de vraies données. Les 14 sections de
l'espace privé sont fonctionnelles.

**Suite de tests** : 136 tests unitaires et d'intégration sur 20 fichiers,
plus 3 tests Playwright authentifiés (`npm run test:auth`, hors `npm run check`).

**23 septembre 2026** : 172 tests sur 25 fichiers, plus 6 tests Playwright. Les
ajouts portent sur la file de validation des relevés importés et sur le tri des
tableaux denses.

**3 octobre 2026** : 207 tests sur 26 fichiers, plus 7 tests Playwright.

### 3 octobre 2026 — import des relevés, rapprochement, revue de sécurité

- **Import de relevés PDF Caisse d'Épargne** (`app/.server/imports/`) : texte
  natif lu par pdfjs-dist dans un processus séparé et sans droits, import
  refusé si solde de départ + opérations ≠ solde de fin. Vérifié sur un relevé
  réel : 15 opérations, solde −172,52 € retrouvé au centime après validation.
- **File de validation enrichie** (`app/.server/repositories/imports.ts`) :
  rattachement à un mouvement déjà saisi, reconnaissance de la décision passée
  par libellé, validation d'une ligne connue depuis la liste, validation groupée
  en un clic des lignes identiques, création d'une catégorie ou d'un compte à la
  volée, virements entre comptes reliés au centime près.
- **Historique des relevés importés** avec retrait des lignes en attente ; un
  même relevé téléchargé deux fois est refusé sur son contenu.
- **Revue de sécurité** consignée dans `SECURITY.md` (section du 3 octobre).
- **Restauration testée** sur la sauvegarde de production du 3 octobre :
  `npm run db:restore` vers une base séparée, `npm run db:check` (intégrité,
  clés étrangères, 28 migrations sur 28), migration à vide, relecture par le
  code de l'app. La revue a révélé que la sauvegarde téléchargée contenait le
  jeton de session actif ; il en est désormais retiré.

---

## 2. Le design — deux choses à ne pas confondre

C'est la nuance qui fausse toute estimation si on l'oublie.

### Le système visuel est appliqué partout

`app/routes/finance.scss` est une **feuille unique pour toute la route**. Les 14
sections héritent donc déjà des jetons, de l'échelle typographique dense, des
cartes, des boutons, des formulaires et du mode sombre composé — y compris
celles dont le balisage n'a jamais été touché.

### Les motifs d'interaction, eux, sont sur une seule section

| Section | Motif dense | Courbe / barre |
|---|---|---|
| **Transactions** | ✅ tableau trié, sélection clavier, cartes 375 px, modale `N` | — |
| Patrimoine | partiel (tableaux préexistants) | ✅ une courbe par actif |
| Business | partiel | ✅ MRR, mois complets seulement |
| Simulations | partiel | ✅ 120 mois — ⚠️ **jamais vue à l'écran** |
| CFO, GoMining | partiel (tableaux préexistants) | — |
| Objectifs | 🔴 listes | ✅ barre de progression |
| Synthèse, Comptes, Catégories, Budget, Calendrier, Règles, Micro/SASU | 🔴 listes | — |

**Mesure** : `finance-table` apparaissait **8 fois** avant l'application du
design system (`022c3d7^`), **13 fois** au 18 septembre. Les cinq ajoutées
étaient le journal des transactions.

### 23 septembre 2026 — les huit sections restantes sont converties

Synthèse, Comptes, Catégories, Budget, Calendrier, Règles, Micro/SASU et
Objectifs ont désormais leur tableau dense. Le tableau du journal restant
spécifique (sélection au clavier, modale `N`), les autres passent par un
composant commun, `app/Components/finance/TableauDense.tsx` : en-tête collant,
tri par `<button>` dans le `<th>`, ligne de total, correction dépliée sous la
ligne, et cartes sous 680 px. Son tri vit hors React dans
`app/lib/finance/table.ts`, avec ses tests.

⚠️ **Une valeur inconnue n'est pas un zéro, et le tri le montre.** Un coût non
renseigné ou une catégorie sans budget se range en dernier dans les DEUX sens :
inverser un tri ne doit pas remonter une liste de trous à la place des plus
gros montants.

Restent partiels, hors des huit : Patrimoine, Business, CFO et GoMining, dont
les tableaux préexistants n'ont pas été repris.

---

## 3. Deux régressions survenues pendant le chantier design

Consignées parce qu'elles disent quelque chose de réutilisable, pas pour
l'historique.

**`022c3d7` a cassé le graphique GoMining.** La réécriture du SCSS a renommé
`.gomining-chart__*` en `.finance-chart__*` sans toucher au composant : neuf
classes se sont retrouvées **sans aucun style**, et l'histogramme empilé a perdu
couleurs et cadre. Corrigé dans `d528575`.

⚠️ **La leçon : renommer une classe dans une feuille de style est un changement
à deux fichiers.** Un audit des classes du TSX confrontées aux feuilles prend
quelques secondes et attrape exactement ce défaut :

```
python3 - <<'PY'
import io, re
tsx  = io.open('app/routes/finance.tsx', encoding='utf-8').read()
feuilles = ''.join(io.open(f, encoding='utf-8').read() for f in
    ['app/routes/finance.scss', 'app/styles.css', 'app/Style/_tokens-prive.scss'])
classes = {c for m in re.finditer(r'className="([^"]*)"', tsx) for c in m.group(1).split()}
print(sorted(c for c in classes if f'.{c}' not in feuilles))
PY
```

**Une vérification qui ne vérifiait rien.** Trois mutations lancées contre les
tests Playwright sont restées **vertes** : `npm run start` sert `build/`, pas
les sources. Muter le code sans reconstruire ne teste que l'ancien build.

⚠️ **Toute mutation visant un test end-to-end impose un `npm run build` entre la
mutation et le test.**

---

## 4. Ce qui reste, par ordre de rendement

Réécrit le 3 octobre 2026.

1. ~~Écrire et publier le premier article~~ : publié et déployé le 5 octobre 2026.
2. ~~Serveur en utilisateur non-root~~ : écarté le 10 octobre 2026, voir les
   risques résiduels de `SECURITY.md` (le root permet d'isoler le lecteur PDF).
3. **Les quatre sections partielles** : Patrimoine, Business, CFO et GoMining.
4. **Voir la courbe des 120 mois** de Simulations.
5. **Lecteur CSV et relevés multi-comptes**, si l'usage le demande : le PDF
   mono-compte couvre l'usage actuel.
6. `L19` seulement si le modèle déterministe est jugé fiable.

---

## 5. Arbitrage ouvert — jetons de couleur

🔴 **Non tranché depuis le 18 septembre 2026.**

`03-design-tokens.md` prescrit un fond clair à `oklch(0.99 0 0)` et une surface
à `0.97`. Le code public (`app/Style/_tokens.scss`) utilise `--bg-light: 0.97`
et `--surface-light: 0.93`. `_tokens-prive.scss` a retenu **les valeurs de la
doc**, parce que la passation a calibré ses contrastes dessus : son vert de
montant est mesuré à 4,6:1 sur `0.99`.

Reprendre les primitives du code ferait passer les montants **sous 4,5:1 sans
que rien ne le signale**. L'arbitrage appartient à François.
