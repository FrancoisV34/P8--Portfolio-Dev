# 05 — Plan de migration CRA → Vite + TS

Étapes ordonnées, chacune autonome et testable. On ne casse pas le site existant — on construit en parallèle.

## Stratégie globale

Deux options :
- **A) Refacto progressif** — créer un nouveau dossier `src-v2/`, migrer page par page, basculer à la fin. *Plus sûr.*
- **B) Clean-slate** — partir d'un nouveau projet Vite + TS, porter le contenu, remplacer entièrement. *Plus rapide, plus propre.*

**Reco** : option **B (clean-slate)** — le projet actuel a trop de CSS legacy et un `App.js` encore à l'état CRA template. Rebâtir est plus rapide que nettoyer. On garde le repo git, juste on remplace `src/`.

---

## Étape 0 — Prérequis

- [ ] Brancher sur `feat/refacto-vite` (ne pas toucher `main` tant que pas validé).
- [ ] Backup du `src/` actuel → `src-legacy/` (gardé pendant la migration pour copier le contenu).
- [ ] Décider du domaine final (GitHub Pages actuel vs Vercel). Si Vercel : créer le projet, pointer vers le repo.

## Étape 1 — Bootstrap Vite + TS

```bash
npm create vite@latest . -- --template react-ts
# écrase package.json — sauvegarder d'abord les scripts deploy existants
```

- [ ] Installer Tailwind v4 : `npm i -D tailwindcss @tailwindcss/vite`
- [ ] Ajouter `@tailwindcss/vite` au plugin Vite dans `vite.config.ts`
- [ ] Créer `src/styles/globals.css` avec `@import "tailwindcss";` + import des tokens
- [ ] Créer `src/styles/tokens.css` (copier les blocs `@theme inline` de `03-design-tokens.md`)

## Étape 2 — shadcn/ui

```bash
npx shadcn@latest init
# choisir : TypeScript, style "new-york" (plus proche Apple), base color "neutral"
```

- [ ] Installer les premiers composants : `npx shadcn add button card dialog input label textarea sheet navigation-menu`
- [ ] Adapter les tokens shadcn pour matcher ceux du `03-design-tokens.md` (remplacer les couleurs par défaut).

## Étape 3 — Qualité & tooling

- [ ] ESLint flat config : `eslint.config.js` avec `@eslint/js`, `typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react-hooks`.
- [ ] Prettier : `.prettierrc` (print-width 100, singleQuote true, trailingComma all).
- [ ] Husky + lint-staged :
  ```json
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
  ```
- [ ] Path aliases : `@/` → `src/` dans `tsconfig.json` + `vite.config.ts`.

## Étape 4 — Structure du src

```
src/
├── main.tsx
├── App.tsx
├── routes/                    ← router config
├── pages/
│   ├── Home.tsx
│   ├── Cv.tsx
│   └── Project.tsx            ← page détail par projet (nouveau)
├── components/
│   ├── ui/                    ← shadcn (ne pas toucher sauf tokens)
│   ├── layout/                ← Header, Footer, Nav
│   └── sections/              ← Hero, Projects, Skills, Parcours, Contact
├── providers/
│   └── ScrollProvider.tsx     ← Lenis + GSAP
├── data/
│   ├── projects.ts            ← typé, ex-Projects.json
│   ├── skills.ts
│   └── presentation.ts
├── hooks/
│   └── useReducedMotion.ts
├── lib/
│   ├── cn.ts                  ← helper clsx + tailwind-merge
│   └── motion.ts
├── styles/
│   ├── globals.css
│   └── tokens.css
└── assets/                    ← images optimisées
```

## Étape 5 — Motion & scroll

- [ ] `npm i gsap @gsap/react @studio-freight/lenis`
- [ ] Créer `src/providers/ScrollProvider.tsx` (code dans `04-motion-principles.md`)
- [ ] Wrapper l'app dans `<ScrollProvider>`.
- [ ] Implémenter 1 section pilote (Hero) avec fade-in staggered pour valider.
- [ ] Implémenter 1 section Project pinned pour valider le scrub.

## Étape 6 — Port du contenu

Ordre recommandé (du moins risqué au plus complexe) :
1. **Données** : JSON → TS typés (`projects.ts` avec type `Project`).
2. **Layout** : Header + Footer avec shadcn `NavigationMenu`.
3. **Page CV** : on garde `@react-pdf-viewer/core` ou on simplifie en iframe + bouton download.
4. **Page Home — Hero** : grand titre + bg photo + fade-in.
5. **Section Présentation** : typo, animation d'entrée.
6. **Section Projets** : pattern Apple pinned. Chaque projet = section à part entière.
7. **Section Compétences** : bento grid avec tags.
8. **Section Parcours** : timeline animée au scroll.
9. **Section Contact** : form RHF + Zod, EmailJS.

## Étape 7 — SEO & meta

- [ ] `npm i react-helmet-async` + ajouter `<Helmet>` par page.
- [ ] Open Graph image (1200x630) + Twitter card — à générer.
- [ ] `sitemap.xml` + `robots.txt` à mettre à jour.
- [ ] Lighthouse ≥ 95 sur toutes les catégories avant merge.

## Étape 8 — Déploiement

Si Vercel :
- [ ] Connecter le repo.
- [ ] `vercel.json` si besoin de rewrites pour le router.
- [ ] Configurer le domaine custom.
- [ ] Activer Web Vitals analytics.

Si on reste GitHub Pages :
- [ ] Garder `gh-pages`.
- [ ] Config du `base` Vite à `/P8--Portfolio-Dev/` dans `vite.config.ts`.
- [ ] Script `deploy` adapté.

## Étape 9 — Nettoyage

- [ ] Supprimer `src-legacy/`.
- [ ] Supprimer les anciennes dépendances inutilisées (FontAwesome, pdfjs-dist si non utilisé).
- [ ] Mettre à jour le README principal.
- [ ] Tag release `v2.0.0`.

## Timing estimé

| Étape | Temps |
|---|---|
| 1–4 (setup) | 3–4h |
| 5 (motion pilote) | 2–3h |
| 6 (port contenu) | 6–10h |
| 7 (SEO) | 1–2h |
| 8 (deploy) | 1–2h |
| 9 (cleanup) | 1h |
| **Total** | **~14–22h** |

Faisable sur 3-4 sessions de travail.

## Risques & mitigations

| Risque | Mitigation |
|---|---|
| Perte de contenu au port | Garder `src-legacy/` jusqu'à la fin + diff visuel page par page |
| Router GitHub Pages qui casse (hash vs history) | Tester avec `base` Vite correct, ou basculer Vercel |
| GSAP + Lenis qui lag sur low-end | Respecter `prefers-reduced-motion`, limiter le nb de ScrollTriggers |
| Police non chargée → FOUT | Préloader la font, utiliser `font-display: swap` |
