# 06 — Inventaire du contenu actuel

Tout ce qui existe aujourd'hui et doit être **préservé** lors du refacto. Check-list pour ne rien perdre.

## Pages

| Route actuelle | Contenu | Statut port |
|---|---|---|
| `/` (Homepage) | Hero + Présentation + Projets + Compétences + Parcours + Contact | À porter |
| `/cv` | Viewer PDF | À porter (à simplifier ?) |
| `/projet-one` | Squelette | À refondre (page détail projet ?) |
| `/projet-two` | Squelette | Idem |

## Assets publics (à garder)

- `public/moi.webp` — photo portrait (hero background)
- `public/CVVittecoq.pdf` + `public/Vittecoq.pdf` — CV (un seul ?)
- `public/icons/` — icônes/screenshots projets (Kasa, Sophie Bluel)
- `public/favicon.ico`, `public/icon.png`, `public/logo192.png`, `public/logo512.png`
- `public/manifest.json`

**À auditer** : y a-t-il 2 CVs à garder ou on consolide ?

## Données (à porter vers TS typés)

### `Presentation.json`
→ `src/data/presentation.ts` avec type `{ text: string }`.

### `Projects.json` — 2 projets
- **Kasa-App** (React, SASS, JSON) — lien GitHub
- **Architecte Sophie Bluel** (JS, HTML5, CSS3) — lien GitHub
→ `src/data/projects.ts` avec type strict :
```ts
type Project = {
  id: number;
  title: string;
  image: string;
  imageAlt: string;
  description: string;
  accentColor: string;     // renommé de bgColor
  link: string;
  technos: Techno[];
};
```

### `Competences.json`
→ `src/data/skills.ts`.

## Composants à reconstruire (refacto, pas juste port)

| Actuel | Devient | Notes |
|---|---|---|
| `Header.jsx` + scroll-to-anchor manuel | `Header` avec `NavigationMenu` shadcn + Lenis `scrollTo` | Nav sticky avec blur bg |
| `Footer.jsx` | `Footer` minimaliste | Liens sociaux + copyright |
| `Button.jsx` | shadcn `Button` (variants) | — |
| `Competences.jsx` | Section Bento | Grid animée |
| `Footer.jsx` | `Footer` | — |
| `Form.jsx` | `ContactSection` avec RHF + Zod + EmailJS | Validation client |
| `Gallery.jsx` | Supprimer si non utilisé (commenté dans Homepage) | — |
| `Layout.jsx` | `RootLayout` | — |
| `Parcours.jsx` | `ParcoursSection` timeline pinned | Scroll storytelling |
| `Project.jsx` | `ProjectsSection` avec 1 section pinned par projet | Refonte majeure |

## Configuration préservée

- Homepage : `https://francoisv34.github.io/P8--Portfolio-Dev/`
- Email de contact (EmailJS) : **à retrouver** dans `Form.jsx` (clés d'API)
- Scripts de deploy `gh-pages` : adapter ou remplacer selon décision Vercel vs GH Pages

## Décisions François (2026-04-20) — voir `00-decisions.md`

- [x] CV officiel : `CVVittecoq.pdf` (l'autre est supprimé).
- [x] Hosting : **Vercel**.
- [x] Logo : **monogramme FV** (à générer avec Claude Design).
- [x] Accent : **graphite sombre**.
- [x] Projets : **sections pinned sur la home** (pas de routes détail).
- [x] EmailJS : conservé tel quel.
- [x] Features in-scope : liens sociaux (GitHub, LinkedIn, email) + **blog** (`/blog` + `/blog/:slug`).
- [x] Features notées pour plus tard : page dispo/freelance, témoignages.
