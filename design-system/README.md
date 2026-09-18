# Design System — Portfolio François Vittecoq

Dossier de référence pour le refacto du portfolio. Sert aussi de **source d'entrée pour Claude Design** (Anthropic Labs) pour générer visuels, prototypes et itérations.

## Contexte

- **Projet** : Portfolio développeur web public, complété par un CFO et GoMining entièrement privés pour François seul.
- **Stack actuelle sur `refacto`** : React Router framework 8 + React 19 + TypeScript + Node 24 + SCSS. Les bibliothèques financières arrivent avec leurs modules.
- **Stack cible validée le 8 septembre 2026** : React Router en mode framework + React + TypeScript + Node.js + SQLite/Drizzle/better-sqlite3 ; Tailwind/shadcn, Better Auth, Recharts, TanStack Table, decimal.js, Zod/React Hook Form, Vitest/Playwright. GSAP selon les besoins du portfolio ; Lenis/Motion facultatifs.
- **Hébergement envisagé** : Fly.io avec volume persistant, à évaluer. Voir [le cadrage commun](../dossier_conception_cfo/16_ARBITRAGES_STACK_PROJET.md).
- **Périmètre actuel** : socle migré et vérifié localement, budget privé prioritaire ; aucune démo publique du CFO.
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
├── 05-migration-plan.md          ← plan CRA → React Router framework + TS + CFO privé
├── 06-content-inventory.md       ← inventaire du contenu actuel à préserver
├── claude-design-brief.md        ← brief Claude Design — PUBLIC uniquement
├── claude-design-brief-prive.md ← brief Claude Design — ESPACE PRIVÉ (CFO)
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
2. Ajouter uniquement les composants publics pertinents du futur dossier `app/`, sans données financières ni secrets.
3. Joindre 3–5 screenshots apple.com comme référence visuelle ("make it look like this").
4. Partager le `claude-design-brief.md` (public) ou `claude-design-brief-prive.md`
   (espace financier) comme prompt initial du projet — **jamais les deux ensemble** :
   ils décrivent deux langages visuels distincts sur une identité commune.

## Prochaines étapes

1. ✅ Recherche + structure du DS (ce dossier).
2. ⏭ Valider direction visuelle avec François (palette, ton, références précises apple.com).
3. ✅ Socle React Router framework + TS + Node sur `refacto` ; SQLite et Tailwind/shadcn suivent avec le privé (voir le [suivi](../dossier_conception_cfo/18_MIGRATION_SOCLE.md)).
4. ⏭ Implémenter 2-3 sections pilotes (hero + un projet pinned) pour valider le motion.
5. ⏭ Itérer avec Claude Design sur les variations visuelles.
