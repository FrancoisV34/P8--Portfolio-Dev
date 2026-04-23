# 01 — Patterns de design Apple Marketing

Synthèse des patterns visuels et d'interaction de **apple.com** (pages produits type AirPods Pro, iPhone, MacBook). Sert de référence pour le ton visuel du portfolio.

## 1. Structure de page type

Une page marketing Apple suit presque toujours cette cadence :

1. **Hero plein écran** — un seul message, typographie XXL, souvent sur fond noir ou blanc pur, éventuellement une vidéo/image qui s'anime en entrée.
2. **Accroche secondaire** — sous-titre, un call-to-action discret.
3. **Sections produits empilées** — alternance fond clair / fond sombre, chaque section raconte *une* idée.
4. **Scrollytelling pinned** — un élément (produit, image) est épinglé, le texte à côté défile et l'image se transforme au scroll.
5. **Galerie / grille de features** — cards bento ou grille stricte.
6. **Specs techniques** — très dense, typographie serrée.
7. **CTA final + footer** — minimal.

**Application portfolio** :
- Hero = nom + accroche "développeur web React junior".
- Sections pinned = chaque projet majeur raconté au scroll (image qui zoome, textes qui entrent).
- Bento grid = compétences techniques.
- Timeline scrollytelling = parcours.
- Form contact final = minimal, une couleur d'accent.

## 2. Typographie

- **Font system** : SF Pro (payant pour web, alternative gratuite : **Inter** ou **Geist**) — la famille est ce qui donne le "feel" Apple instantanément.
- **Tailles massives** : les hero vont de **48px mobile → 96-120px desktop**. Font-weight souvent **600–700** (semibold/bold), jamais thin.
- **Line-height serré** pour les titres : **1.05–1.1**. Corps : **1.4–1.6**.
- **Letter-spacing** : légèrement négatif sur les gros titres (`-0.02em` à `-0.04em`), 0 sur le corps.
- **Hiérarchie très contrastée** : saut visuel net entre H1 (96px), H2 (48px), corps (17-19px). Pas de niveaux intermédiaires flous.
- **Alignement** : centré sur le hero, gauche dans les sections éditoriales.

## 3. Couleurs

Apple marketing alterne **deux modes** dans une même page :
- **Fonds purs** : `#000000` (noir vrai) ou `#FFFFFF` (blanc vrai) ou gris très neutres (`#f5f5f7` — *leur* gris signature).
- **Accents rares** : une seule couleur saturée par produit (ex. orange AirPods, bleu iPhone). Le reste est monochrome.
- **Pas de dégradés cheap** : si dégradé, c'est très subtil ou utilisé sur un produit 3D rendu.
- **Texte** : sur fond noir → `#f5f5f7`. Sur fond blanc → `#1d1d1f` (pas noir pur).

**Application portfolio** : définir une **couleur signature** (p.ex. un bleu profond proche de `#0066CC` Apple) et garder tout le reste en noir/blanc/gris neutre.

## 4. Grille & espacement

- Conteneur max **1024–1440px** centré, marges latérales généreuses.
- Verticale : **sections très hautes** (80–120vh), chaque section respire.
- Espacement vertical entre blocs : **96px–160px desktop**, 64-80px mobile.
- Système **8pt grid** (tout est multiple de 8px, parfois 4px pour les détails).

## 5. Imagerie

- Images **haute définition**, souvent **détourées sur fond pur**.
- Masques et **clip-path animés** (le produit grandit au scroll dans un mask circulaire).
- Pas de drop-shadows cheap — si ombre, elle est **très diffuse, très légère**.
- Vidéos autoplay muettes qui scrubbent au scroll (`currentTime` lié au scroll progress).

## 6. Motion — les 6 recettes signature

| Recette | Description | Tech |
|---|---|---|
| **Pinned + scrub** | Section sticky, l'image/vidéo change selon scroll progress | `ScrollTrigger.pin` + `scrub: true` |
| **Parallax subtil** | Background plus lent que foreground (offset 0.1–0.3) | `ScrollTrigger` + `yPercent` |
| **Fade-in staggered** | Textes/éléments entrent l'un après l'autre à mesure qu'ils deviennent visibles | `gsap.from` + `stagger` |
| **Video scrubbing** | La vidéo avance au scroll (ex. Mac qui s'ouvre) | `video.currentTime = progress * duration` |
| **Mask reveal** | Un clip-path circle grandit pour révéler une image | `clip-path` animé |
| **Smooth scroll inertiel** | Scroll "beurré", physique | **Lenis** |

## 7. Accessibilité — non négociable côté Apple

- Toujours `prefers-reduced-motion` respecté : désactiver scrub/parallax si activé.
- Contraste AAA sur les gros titres, AA sur le corps.
- Nav clavier parfaite, focus visibles (rings subtils).
- `scroll-behavior: smooth` **uniquement** si Lenis absent (Lenis gère déjà).

## 8. Ce qu'on **ne fait pas** (anti-patterns)

- ❌ Neon, glow, glassmorphism criard, ombres portées épaisses.
- ❌ Dégradés violet/rose type "AI bro".
- ❌ Icônes florides / FontAwesome par défaut — préférer **Lucide** ou **SF Symbols-like**.
- ❌ 3+ polices. Un seul système, 2 poids max.
- ❌ Scroll hijacking agressif — Lenis c'est de l'amortissement, pas du détournement.

## Références à envoyer à Claude Design (screenshots à capturer)

- [apple.com/airpods-pro](https://www.apple.com/airpods-pro/) — scrollytelling pinned, couleur signature.
- [apple.com/mac](https://www.apple.com/mac/) — bento grid features.
- [apple.com/iphone-16-pro](https://www.apple.com/iphone-16-pro/) — hero + specs denses.
- [apple.com/newsroom](https://www.apple.com/newsroom/) — éditorial / grille.

## Sources

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- [Apple Design Resources](https://developer.apple.com/design/resources/)
- [Apple Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Scrolling Designs: 8 Patterns (Lovable, 2026)](https://lovable.dev/guides/scrolling-designs-patterns-when-to-use)
- [Learning from Apple — scrolling website interface](https://blackraven.digital/learning-from-apple-scrolling-website-interface/)
- [Master the Art of Apple's Splash Pages](https://blog.prototypr.io/master-the-art-of-apples-splash-pages-with-these-tricks-62a57d30960d)
