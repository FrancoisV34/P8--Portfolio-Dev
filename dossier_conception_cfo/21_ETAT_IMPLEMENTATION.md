# 21 — État d'implémentation mesuré

Relevé du **18 septembre 2026**, sur la branche `refacto`, à `d528575`.

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
| `L17` | Portfolio finalisé et **blog** | 🔴 **aucune route blog n'existe** |
| `L18` | Mise en service | `fly.toml` configuré (`francoisv34-portfolio-cfo`, `cdg`), commits de déploiement présents — ⚠️ **mise en ligne effective non vérifiée** |
| `L19` | Intelligence avancée (Monte Carlo, assistant) | non commencé — **reporté par décision**, pas en retard |

13 dépôts métier existent et servent de vraies données. Les 14 sections de
l'espace privé sont fonctionnelles.

**Suite de tests** : 136 tests unitaires et d'intégration sur 20 fichiers,
plus 3 tests Playwright authentifiés (`npm run test:auth`, hors `npm run check`).

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
design system (`022c3d7^`), **13 fois** aujourd'hui. Les cinq ajoutées sont le
journal des transactions.

**Huit sections n'ont aucun tableau dense** alors que la passation Claude Design
en prescrit un (§8, « les dix sections restantes »). C'est le plus gros reste du
chantier, et c'est du travail **répétitif** : les motifs sont posés et aucune
maquette nouvelle n'est nécessaire.

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

1. **Les huit sections en listes** → tableau dense. Répétitif, sans arbitrage,
   referme le chantier design.
2. **`L17` — le blog.** Aucune route n'existe ; c'est le seul lot du périmètre
   d'origine qui n'a rien.
3. **Vérifier la mise en ligne** (`L18`) et la restauration d'une sauvegarde.
4. **Voir la courbe des 120 mois** de Simulations, qui demande de semer un jeu
   d'hypothèses complet.
5. `L19` seulement si le modèle déterministe est jugé fiable — c'est sa
   condition d'entrée, et elle n'a pas été évaluée.

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
