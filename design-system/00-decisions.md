# 00 — Décisions verrouillées

Décisions initiales de François le 20 avril 2026, mises à jour le 8 septembre 2026 après intégration du périmètre CFO. Les choix les plus récents ci-dessous font foi, en cohérence avec [les décisions CFO](../dossier_conception_cfo/16_ARBITRAGES_STACK_PROJET.md). Le 9 septembre, François a autorisé le démarrage : le socle React Router/TypeScript/Node est migré sur `refacto`, avec priorité au budget privé. Voir [le suivi](../dossier_conception_cfo/18_MIGRATION_SOCLE.md).

## Locked

| Sujet | Décision | Impact |
|---|---|---|
| **CV** | `public/CVVittecoq.pdf` (12 nov 2025) | Supprimer `public/Vittecoq.pdf` au refacto |
| **Application** | React Router en mode framework + React + TypeScript + Node.js | Même application, layouts et accès public/privé distincts ; remplace la cible Astro du CFO |
| **Hosting** | Serveur Node avec volume persistant ; Fly.io à évaluer | Remplace le choix Vercel initial ; coût et organisation à vérifier avant déploiement |
| **Données** | SQLite + Drizzle + better-sqlite3 | Base privée côté serveur, migrations et sauvegardes |
| **Accès finance** | François uniquement | Better Auth, inscription désactivée et identité fixe contrôlée côté serveur |
| **Accent color** | Graphite sombre | `oklch(0.30 0.02 260)` light mode · `oklch(0.85 0.02 260)` dark mode. Monochrome signature. |
| **Structure projets** | Sections pinned sur la home | Pas de routes `/projects/*`. Chaque projet = section scrollytelling |
| **Logo** | Monogramme FV | À générer via Claude Design. SVG, 2 variantes (light/dark). Badge compact haut-gauche |
| **EmailJS** | Garder tel quel | Réutiliser les clés existantes dans `Form.jsx` legacy |

## Features — in scope

- **Liens sociaux** : GitHub, LinkedIn, email — footer + peut-être hero.
- **Page Blog / articles** : à prévoir dès l'architecture (route `/blog`, listing + article).
- **CFO et GoMining** : inclus, entièrement privés ; données réelles et projections réservées à François.
- **Bibliothèques** : Tailwind/shadcn, Zod/React Hook Form, Recharts, TanStack Table, decimal.js, Better Auth, Vitest/Playwright validés. Voir [la stack](02-stack-recommendations.md).

## Features — noted, not implemented (pour plus tard)

Gardées en tête pour ne pas fermer de portes architecturales, mais **pas construites** dans le refacto actuel :

- **Page Disponibilité / Freelance** — si activée plus tard : route `/availability` avec statut + form bref. Pas d'impact sur le DS.
- **Témoignages / recommandations** — si activé plus tard : section carousel ou quote-grid sur la home. Le système de tokens couvre déjà ce besoin (cards + accent).
- **Démonstration publique du CFO avec données fictives** — reportée explicitement ; pas de priorité actuelle.
- **Autres utilisateurs** — hors périmètre : ni partage familial ni inscriptions.

## Conséquences architecturales immédiates

- Router : routes publiques `/`, `/cv`, `/blog`, `/blog/:slug` ; connexion et routes `/finance/*` soumises aux contrôles serveur.
- Data layer : prévoir le contenu du blog dans le nouveau socle React Router ; les données financières restent dans SQLite côté serveur.
- Navigation publique : Accueil, Projets, Compétences, Blog, CV. Navigation financière séparée dans le layout privé.
- Design system : accent graphite = tous les CTA, liens, focus rings en graphite. Pas de bleu/orange.
- Animation : CSS dans la finance ; GSAP selon les besoins du portfolio. Lenis et Motion restent facultatifs.

## Ouvert / à confirmer plus tard

- Choix MDX vs CMS headless (Contentlayer, Velite, ou Notion API) pour le blog — décider avant l'étape 4.
- Domaine custom ou nom fourni par l'hébergeur ; organisation Fly.io, coût avant remise et sauvegardes à définir avant déploiement.
- Authentification : préciser le mode de connexion et la récupération du seul compte, sans rouvrir le périmètre utilisateur.
