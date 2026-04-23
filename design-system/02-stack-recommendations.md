# 02 — Stack & librairies recommandées

Stack choisie après exploration et validation François. Chaque ligne a une raison précise.

## Build & langage

| Lib | Version cible | Pourquoi |
|---|---|---|
| **Vite** | 5.x | HMR instantané, build rapide, remplace CRA (abandonné). |
| **React** | 19 | Server Components pas nécessaires ici mais hooks + `use` natifs. |
| **TypeScript** | 5.x strict | Fiabilité + auto-complétion, indispensable pour un refacto propre. |
| **React Router** | 7 | Déjà en place, on garde. |

## Styling

| Lib | Pourquoi |
|---|---|
| **Tailwind CSS v4** | CSS-first, tokens via `@theme`, OKLCH par défaut, 5× plus rapide. Match parfait avec shadcn/ui. |
| **PostCSS + Autoprefixer** | Intégré à Tailwind v4. |
| **clsx** + **tailwind-merge** | Composition propre des classes conditionnelles (via `cn()` helper). |
| **tw-animate-css** | Remplace `tailwindcss-animate` (deprecated). Exigé par shadcn/ui v4. |

## Composants

| Lib | Pourquoi |
|---|---|
| **shadcn/ui** | Pas une lib — des composants copiés dans `src/components/ui/`. Full contrôle, pas de dette. |
| **Radix UI Primitives** | Sous-jacent à shadcn. Accessibilité (ARIA, focus trap, keyboard nav) gratuite. |
| **Lucide React** | Icônes épurées, cohérentes, proche SF Symbols. Remplace FontAwesome. |

## Animation & scroll

| Lib | Pourquoi |
|---|---|
| **GSAP** (gratuit en 2025+) | Standard industrie. Timelines, easings pro, ScrollTrigger. |
| **@gsap/react** | Hook `useGSAP()` pour cleanup propre avec React. |
| **ScrollTrigger** | Pinning, scrubbing, progress — le moteur des patterns Apple. |
| **Lenis** (`@studio-freight/lenis`) | Scroll inertiel soyeux. Intégration ScrollTrigger via ticker. |
| **Motion** (ex-Framer Motion) | Optionnel — pour les micro-interactions UI (hover, tap, layout). Complément à GSAP. |

> **Note coexistence GSAP + Lenis** : Lenis émet un événement `scroll` qu'on branche sur `ScrollTrigger.update`, et on pousse `lenis.raf` dans `gsap.ticker`. Code dans `04-motion-principles.md`.

## Formulaires & validation

| Lib | Pourquoi |
|---|---|
| **React Hook Form** | Perf + DX supérieure aux `useState` actuels dans `Form.jsx`. |
| **Zod** | Schémas de validation typés, inférence TS. |
| **@hookform/resolvers** | Pont entre RHF et Zod. |
| **EmailJS** | Déjà en place, on garde — fonctionne côté client sans backend. |

## PDF

| Lib | Pourquoi |
|---|---|
| **@react-pdf-viewer/core** | Déjà en place, fonctionne. On garde pour l'affichage du CV. |
| Alternative : lien direct vers `/CV.pdf` | Plus léger si le viewer embarqué n'est pas critique. |

## Qualité du code

| Lib | Pourquoi |
|---|---|
| **ESLint** (flat config) | Règles React + TS + a11y. |
| **eslint-plugin-jsx-a11y** | Accessibilité (obligatoire pour ce projet). |
| **Prettier** | Formatage auto. |
| **Husky** + **lint-staged** | Pre-commit checks. |
| **Vitest** + **@testing-library/react** | Remplace Jest (intégré Vite). |
| **Playwright** (optionnel) | E2E pour valider les animations scroll. |

## SEO & perf

| Lib | Pourquoi |
|---|---|
| **react-helmet-async** | Meta tags par page (titre, OG, Twitter). |
| **vite-plugin-image-optimizer** | Compression webp/avif automatique à la build. |
| **web-vitals** | Déjà présent, à connecter à un endpoint (Sentry / console). |

## Déploiement

| Option | Pour | Contre |
|---|---|---|
| **GitHub Pages** (actuel, `gh-pages`) | Gratuit, branché | Pas de SSR, hash-router only avec router 7 |
| **Vercel** ⭐ | Build Vite natif, preview deploys, analytics, custom domain gratuit | — |
| **Cloudflare Pages** | Gratuit, CDN global rapide | Moins de DX |

**Reco** : migrer vers **Vercel** — preview deploys sur chaque PR, analytics Core Web Vitals gratuits, zéro config.

## Ce qu'on **retire**

- ❌ `react-scripts` (CRA) — mort depuis 2023.
- ❌ `@fortawesome/fontawesome-free` — remplacé par Lucide.
- ❌ `pdfjs-dist` (utilisé directement ?) — fourni par `@react-pdf-viewer/core` si besoin.
- ❌ Les 9 fichiers SCSS séparés — remplacés par Tailwind + tokens CSS.

## Coût mental

Stack à 15 libs mais toutes **nécessaires et standards**. Pas de dépendance exotique. Tout documenté en français/anglais, grosse communauté.

## Sources

- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4)
- [shadcn/ui Theming](https://ui.shadcn.com/docs/theming)
- [Design Tokens That Scale (Tailwind v4)](https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/)
- [Lenis — darkroomengineering](https://github.com/darkroomengineering/lenis)
- [GSAP + Lenis sync patterns](https://gsap.com/community/forums/topic/40426-patterns-for-synchronizing-scrolltrigger-and-lenis-in-reactnext/)
- [Vite React TS best practices 2026](https://dev.to/denivladislav/set-up-a-new-react-project-vite-typescript-eslint-prettier-and-pre-commit-hooks-3abn)
