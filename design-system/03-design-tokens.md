# 03 — Design Tokens

Système de tokens **sémantiques** (pas juste des valeurs brutes). Chaque token a un rôle, pas un look. C'est ce qui permet à Claude Design de respecter le DS sans avoir à deviner.

## Principes

1. **Deux niveaux** : *primitives* (valeurs brutes) → *semantic* (rôles).
2. **OKLCH** pour les couleurs (Tailwind v4 par défaut — meilleure cohérence perceptuelle).
3. **Echelle 4pt/8pt** pour l'espace et la typo.
4. **Light + Dark** en parité, pas d'afterthought.
5. **Tout exposé en CSS variables** via `@theme inline` — consommable par Tailwind ET par du CSS custom.

## Primitives → Semantic (exemple couleurs)

```
primitive: --color-gray-950 → semantic: --color-background (dark)
primitive: --color-gray-50  → semantic: --color-background (light)
primitive: --color-blue-600 → semantic: --color-accent
```

On n'utilise **jamais** `bg-gray-950` dans un composant — toujours `bg-background`.

## Palette — direction Apple neutre + accent signature

### Neutres

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-background` | `oklch(0.99 0 0)` (≈ #FDFDFD) | `oklch(0 0 0)` (#000) | Fond de page |
| `--color-surface` | `oklch(0.97 0 0)` (≈ #f5f5f7) | `oklch(0.14 0 0)` (≈ #1d1d1f) | Cards, sections alternées |
| `--color-surface-elevated` | `oklch(1 0 0)` (#fff) | `oklch(0.20 0 0)` | Modals, dropdowns |
| `--color-border` | `oklch(0.9 0 0)` | `oklch(0.25 0 0)` | Séparateurs |
| `--color-foreground` | `oklch(0.14 0 0)` (≈ #1d1d1f) | `oklch(0.97 0 0)` (#f5f5f7) | Texte principal |
| `--color-foreground-muted` | `oklch(0.45 0 0)` | `oklch(0.65 0 0)` | Texte secondaire |

> Note : `#1d1d1f` (pas noir pur) pour le texte sur blanc = signature Apple. À valider côté contraste.

### Accent — **Graphite sombre** (décidé)

Monochrome signature, ultra sobre. Voir `00-decisions.md`.

- Light mode : `--color-accent` = `oklch(0.30 0.02 260)` — graphite profond sur fond clair.
- Dark mode : `--color-accent` = `oklch(0.85 0.02 260)` — graphite clair lisible sur fond noir.
- `--color-accent-foreground` : inverse du background du même mode (blanc sur light accent, noir sur dark accent).
- `--color-accent-muted` : graphite à opacité réduite pour hover léger (`/ 0.1` suffit).

Le `0.02 260` = très légère teinte bleu-froid (axe 260°), presque imperceptible mais évite l'effet "gris mort" du 0-chroma pur.

### Sémantiques (feedback)

- `--color-success` : vert neutre
- `--color-warning` : ambre
- `--color-destructive` : rouge calibré (pas criard)
- `--color-info` : même que accent

## Typographie

### Familles

```
--font-sans: "Inter", "SF Pro Display", "SF Pro Text",
             -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", ui-monospace, monospace;
```

> **Inter** est le plus proche gratuit de SF Pro. Alternative : **Geist** (Vercel), très moderne.

### Échelle

| Token | Size | Line-height | Weight | Tracking | Usage |
|---|---|---|---|---|---|
| `--text-display-xl` | clamp(3.5rem, 8vw, 7.5rem) | 1.02 | 700 | -0.04em | Hero |
| `--text-display-lg` | clamp(2.5rem, 5vw, 4.5rem) | 1.05 | 700 | -0.03em | Section titles |
| `--text-h1` | clamp(2rem, 3.5vw, 3rem) | 1.1 | 600 | -0.02em | Page titles |
| `--text-h2` | clamp(1.5rem, 2.5vw, 2rem) | 1.2 | 600 | -0.015em | Sub-sections |
| `--text-h3` | 1.25rem | 1.3 | 600 | -0.01em | Card titles |
| `--text-body-lg` | 1.125rem | 1.55 | 400 | 0 | Lead paragraphs |
| `--text-body` | 1rem | 1.6 | 400 | 0 | Corps |
| `--text-caption` | 0.875rem | 1.4 | 400 | 0 | Légendes, meta |
| `--text-micro` | 0.75rem | 1.3 | 500 | 0.02em | Labels, tags |

## Espacement — 4pt base

```
--space-0:  0;
--space-1:  0.25rem;  /* 4px  */
--space-2:  0.5rem;   /* 8px  */
--space-3:  0.75rem;  /* 12px */
--space-4:  1rem;     /* 16px */
--space-6:  1.5rem;   /* 24px */
--space-8:  2rem;     /* 32px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-24: 6rem;     /* 96px */
--space-32: 8rem;     /* 128px */
--space-40: 10rem;    /* 160px */
```

Sections Apple-style : padding vertical de `--space-24` à `--space-40`.

## Radius

```
--radius-xs:   2px;   /* inputs fins */
--radius-sm:   6px;   /* boutons, badges */
--radius-md:   10px;  /* cards standards */
--radius-lg:   16px;  /* cards proéminentes */
--radius-xl:   24px;  /* sections, hero blocks */
--radius-2xl:  32px;  /* huge cards */
--radius-full: 9999px;
```

Apple tend vers `--radius-lg` à `--radius-xl` sur les cards produit.

## Elevation (ombres)

Très subtiles. Jamais dramatiques.

```
--shadow-xs: 0 1px 2px oklch(0 0 0 / 0.04);
--shadow-sm: 0 2px 6px oklch(0 0 0 / 0.06);
--shadow-md: 0 8px 24px oklch(0 0 0 / 0.08);
--shadow-lg: 0 20px 50px oklch(0 0 0 / 0.12);
--shadow-glass: 0 8px 32px oklch(0 0 0 / 0.08), inset 0 1px 0 oklch(1 0 0 / 0.1);
```

## Motion

```
--duration-instant: 80ms;
--duration-fast:    150ms;
--duration-base:    250ms;
--duration-slow:    400ms;
--duration-slower:  700ms;
--duration-cinematic: 1200ms;

--ease-out:     cubic-bezier(0.22, 1, 0.36, 1);      /* Apple-ish ease-out */
--ease-in-out:  cubic-bezier(0.65, 0, 0.35, 1);
--ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);   /* léger bounce */
```

## Breakpoints

Alignés sur Tailwind v4 par défaut :
- `sm` : 640px
- `md` : 768px
- `lg` : 1024px
- `xl` : 1280px
- `2xl` : 1536px

## Consommation dans Tailwind v4

Tout ce qui précède sera défini dans `src/styles/tokens.css` via `@theme inline`, p.ex. :

```css
@theme inline {
  --color-background: var(--color-background);
  --color-accent:     var(--color-accent);
  --font-sans:        var(--font-sans);
  --text-display-xl:  var(--text-display-xl);
  /* etc. */
}
```

→ Utilisation : `bg-background`, `text-accent`, `text-display-xl`, `font-sans` directement en utility classes.

## Fichiers JSON associés

Les tokens structurés en JSON (format **Style Dictionary-compatible**) sont dans `./tokens/` — plus facile à parser pour Claude Design, Figma Tokens, et générateurs futurs.
