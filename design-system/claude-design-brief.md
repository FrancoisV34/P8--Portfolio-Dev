# Brief pour Claude Design

Prompt initial à coller dans Claude Design quand on crée le projet. Accompagner de :
- Ce dossier `design-system/` complet (docs + JSON tokens).
- Screenshots apple.com (4-5 pages produits, capturer hero + 2-3 sections pinned).
- Photo `public/moi.webp` du portrait.
- Screenshots du site actuel (pour "before → after").

---

## Prompt

> **Contexte** : Je suis François Vittecoq, développeur web React junior. Je refonds mon portfolio personnel. La direction visuelle cible est **Apple Marketing (apple.com)** — scroll storytelling cinématique, typographie XXL, fonds noirs/blancs purs, une seule couleur d'accent, sections pinned qui animent au scroll.
>
> **Stack technique** : Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix) + GSAP/ScrollTrigger + Lenis. Le design system est fourni en pièce jointe (`design-system/`) : tokens sémantiques (couleurs OKLCH, échelle typo Apple-like, espacement 4pt, motion presets).
>
> **Ce que je te demande** :
> 1. Propose 3 variations de **hero section** (fullscreen) en respectant les tokens. Inspiration : apple.com/airpods-pro hero. Inclure un **monogramme FV** (badge compact) haut-gauche.
> 2. Propose un pattern **"project showcase"** type section pinned Apple — image/screenshot produit qui zoome ou se transforme au scroll, texte qui entre à côté. **Chaque projet est une section de la home**, pas une page séparée.
> 3. Propose une **bento grid compétences techniques** (React, JS, CSS/Sass, Git, responsive, a11y) — style Apple `/mac` features grid.
> 4. Propose une **timeline parcours** scrollytelling verticale.
> 5. Propose un **footer minimaliste** avec les essentiels : email, GitHub, LinkedIn.
> 6. Propose un **layout page Blog** (listing `/blog` + article `/blog/:slug`) — éditorial Apple Newsroom style.
> 7. Génère **2-3 variantes de monogramme "FV"** (SVG, dark + light variant). Style : géométrique sobre, type badge ou mark, pas de serif orné.
>
> **Contraintes strictes** :
> - Typographie : Inter (fallback SF Pro). Poids 400, 600, 700 uniquement.
> - Couleurs : neutres (noir/gris Apple `#1d1d1f` / blanc `#f5f5f7`) + accent **graphite sombre** `oklch(0.30 0.02 260)` (light) / `oklch(0.85 0.02 260)` (dark). Monochrome signature, très sobre. Pas d'autre teinte saturée.
> - Radius : 10px à 24px selon la taille des cards. Pas de `border-radius: 50%` sauf avatars.
> - Ombres : ultra subtiles. Pas de glow, pas de glassmorphism criard.
> - Motion : respecter `prefers-reduced-motion`. Easings de `tokens/motion.json`.
> - Accessibilité AAA contraste sur les titres, AA sur le corps. Focus rings visibles.
> - Responsive : mobile (375), tablet (768), desktop (1280+). Mobile-first.
>
> **Anti-patterns à éviter** :
> - Pas de néon, pas de dégradés violet/rose type "AI bro".
> - Pas de 3+ polices.
> - Pas de scroll hijacking.
> - Pas de drop-shadows épaisses ni effet "Web 2.0".
>
> **Contenu à intégrer** (réel, pas lorem ipsum) :
> - Nom : François Vittecoq
> - Titre : Développeur web React junior
> - Projets actuels : Kasa-App (React + SASS), Portfolio Architecte Sophie Bluel (JS + HTML/CSS).
> - Compétences : React, JavaScript, SASS/CSS, HTML5, Git, responsive, accessibilité.
>
> **Livrable souhaité** : code React + Tailwind directement copiable dans `src/components/sections/`, compatible avec les tokens du design system fourni. Respecter les path aliases `@/components`, `@/lib/cn`, `@/data/*`.

---

## Après la première sortie

- Demander variantes de palette (3 accents à comparer côte-à-côte).
- Demander une version **dark mode only** puis une **light mode only** pour choisir.
- Itérer avec screenshots de références précises ("comme ici mais plus… ").
- Faire générer un moodboard 1 page en PDF pour garder la trace.

## Handoff vers Claude Code

Une fois les maquettes validées, utiliser le bouton **"handoff vers Claude Code"** pour que l'implémentation se branche direct sur le repo.
