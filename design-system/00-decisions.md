# 00 — Décisions verrouillées

Réponses de François le 2026-04-20. Ce fichier fait foi — les autres docs sont mis à jour en conséquence.

## Locked

| Sujet | Décision | Impact |
|---|---|---|
| **CV** | `public/CVVittecoq.pdf` (12 nov 2025) | Supprimer `public/Vittecoq.pdf` au refacto |
| **Hosting** | Vercel | Preview deploys, Core Web Vitals gratuits. Supprimer `gh-pages`, ajouter `vercel.json` si besoin |
| **Accent color** | Graphite sombre | `oklch(0.30 0.02 260)` light mode · `oklch(0.85 0.02 260)` dark mode. Monochrome signature. |
| **Structure projets** | Sections pinned sur la home | Pas de routes `/projects/*`. Chaque projet = section scrollytelling |
| **Logo** | Monogramme FV | À générer via Claude Design. SVG, 2 variantes (light/dark). Badge compact haut-gauche |
| **EmailJS** | Garder tel quel | Réutiliser les clés existantes dans `Form.jsx` legacy |

## Features — in scope

- **Liens sociaux** : GitHub, LinkedIn, email — footer + peut-être hero.
- **Page Blog / articles** : à prévoir dès l'architecture (route `/blog`, listing + article).

## Features — noted, not implemented (pour plus tard)

Gardées en tête pour ne pas fermer de portes architecturales, mais **pas construites** dans le refacto actuel :

- **Page Disponibilité / Freelance** — si activée plus tard : route `/availability` avec statut + form bref. Pas d'impact sur le DS.
- **Témoignages / recommandations** — si activé plus tard : section carousel ou quote-grid sur la home. Le système de tokens couvre déjà ce besoin (cards + accent).

## Conséquences architecturales immédiates

- Router : 3 routes — `/` (home avec toutes les sections pinned), `/cv`, `/blog` + `/blog/:slug`.
- Data layer : prévoir `src/data/posts.ts` (ou un MDX setup) pour le blog dès l'étape 4 du migration plan.
- Navigation : 5 entrées — Accueil (scroll `#accueil`), Projets (scroll `#projets`), Compétences (scroll `#competences`), Blog (route), CV (route).
- Design system : accent graphite = tous les CTA, liens, focus rings en graphite. Pas de bleu/orange.

## Ouvert / à confirmer plus tard

- Choix MDX vs CMS headless (Contentlayer, Velite, ou Notion API) pour le blog — décider avant l'étape 4.
- Domaine custom sur Vercel (ex. `francoisvittecoq.dev`) ou sous-domaine `*.vercel.app` ?
