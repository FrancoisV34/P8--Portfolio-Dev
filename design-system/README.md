# Design System — Portfolio François Vittecoq

Dossier de référence pour le refacto du portfolio. Sert aussi de **source d'entrée pour Claude Design** (Anthropic Labs) pour générer visuels, prototypes et itérations.

## Contexte

- **Projet** : Portfolio développeur web (personnel, long terme).
- **Stack actuelle** : CRA + React 18 + React Router 7 + SCSS + FontAwesome + EmailJS.
- **Stack cible** : Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui (Radix) + GSAP/ScrollTrigger + Lenis.
- **Direction visuelle** : Apple Marketing (apple.com) — scroll storytelling, pinned sections, parallax, animations cinétiques, grandes typographies, surfaces génereuses.

## Structure du dossier

```
design-system/
├── README.md                     ← ce fichier (index)
├── 00-decisions.md               ← décisions verrouillées (lire en premier)
├── 01-apple-patterns.md          ← analyse des patterns Apple (visuel + motion)
├── 02-stack-recommendations.md   ← libs retenues + alternatives + pourquoi
├── 03-design-tokens.md           ← système de tokens (couleurs, type, espace, radius)
├── 04-motion-principles.md       ← règles d'animation GSAP/Lenis + recettes scroll
├── 05-migration-plan.md          ← plan de refacto CRA → Vite + TS par étapes
├── 06-content-inventory.md       ← inventaire du contenu actuel à préserver
├── claude-design-brief.md        ← brief à envoyer à Claude Design
└── tokens/
    ├── colors.json               ← palette sémantique (light/dark)
    ├── typography.json           ← échelle typo SF-style
    ├── spacing.json              ← échelle d'espace 4pt/8pt
    ├── motion.json               ← durées, easings
    └── elevation.json            ← ombres, blur, glass
```

## Comment feeder Claude Design

D'après la doc Anthropic (avril 2026), Claude Design accepte :

- **Repos de code** (ou sous-dossiers — éviter les monorepos entiers).
- **Screenshots / wireframes / inspirations visuelles**.
- **Slide decks, PDF, docs**.
- **Assets individuels** : logos, palettes, specimens typo.

**Recommandation pour ce projet** :
1. Uploader ce dossier `design-system/` entier (markdown + JSON tokens).
2. Ajouter le sous-dossier `src/` (une fois refacto Vite fait) comme repo de code.
3. Joindre 3–5 screenshots apple.com comme référence visuelle ("make it look like this").
4. Partager le `claude-design-brief.md` comme prompt initial du projet.

## Prochaines étapes

1. ✅ Recherche + structure du DS (ce dossier).
2. ⏭ Valider direction visuelle avec François (palette, ton, références précises apple.com).
3. ⏭ Setup projet Vite + TS + Tailwind v4 + shadcn/ui (voir `05-migration-plan.md`).
4. ⏭ Implémenter 2-3 sections pilotes (hero + un projet pinned) pour valider le motion.
5. ⏭ Itérer avec Claude Design sur les variations visuelles.
