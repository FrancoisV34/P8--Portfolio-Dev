# 04 — Motion Principles

Comment on anime, concrètement. Référence pour l'implémentation et pour Claude Design.

## Règles du jeu

1. **Motion sert le contenu, pas l'inverse.** Si on enlève l'anim et que ça raconte encore l'histoire, l'anim est bien placée.
2. **Toujours cohérent** : mêmes durées, mêmes easings. Les tokens de `03-design-tokens.md` sont la source de vérité.
3. **`prefers-reduced-motion: reduce` respecté sans compromis** — animations désactivées ou radicalement simplifiées.
4. **Pas de scroll hijacking agressif.** Lenis amortit, il ne verrouille pas.
5. **60fps minimum** — tester sur un Mac low-end et un mid-range Android.

## Stack motion

- **GSAP 3.x** — timelines, ScrollTrigger.
- **@gsap/react** — hook `useGSAP()` pour cleanup React.
- **Lenis** (`@studio-freight/lenis`) — scroll inertiel.
- **CSS** pour les micro-interactions (hover, focus) — plus perf.
- **Motion** *en option* pour `AnimatePresence` (transitions de pages) et `layout` animations.

## Setup Lenis + GSAP (pattern standard 2026)

Une fois, dans un provider haut-niveau :

```tsx
// src/providers/ScrollProvider.tsx
import { useEffect } from "react";
import Lenis from "@studio-freight/lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    lenis.on("scroll", ScrollTrigger.update);

    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      gsap.ticker.remove(lenis.raf);
    };
  }, []);

  return <>{children}</>;
}
```

Puis dans un composant :

```tsx
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

export function HeroTitle() {
  const ref = useRef<HTMLHeadingElement>(null);

  useGSAP(() => {
    gsap.from(ref.current, {
      opacity: 0,
      y: 40,
      duration: 1.2,
      ease: "power3.out",
    });
  }, { scope: ref });

  return <h1 ref={ref}>…</h1>;
}
```

## Les 6 recettes Apple — code pattern

### 1. Pinned + scrub (section épinglée qui anime au scroll)

```tsx
useGSAP(() => {
  gsap.to(imageRef.current, {
    scale: 1.2,
    scrollTrigger: {
      trigger: sectionRef.current,
      start: "top top",
      end: "+=100%",
      pin: true,
      scrub: 1,           // scrub lissé
    },
  });
}, { scope: sectionRef });
```

### 2. Parallax subtil

```tsx
useGSAP(() => {
  gsap.to(bgRef.current, {
    yPercent: -20,
    ease: "none",
    scrollTrigger: {
      trigger: containerRef.current,
      start: "top bottom",
      end: "bottom top",
      scrub: true,
    },
  });
}, { scope: containerRef });
```

### 3. Fade-in staggered (texte qui entre mot par mot ou ligne par ligne)

```tsx
useGSAP(() => {
  gsap.from(".fade-line", {
    opacity: 0,
    y: 24,
    duration: 0.8,
    stagger: 0.08,
    ease: "power2.out",
    scrollTrigger: {
      trigger: containerRef.current,
      start: "top 75%",
    },
  });
}, { scope: containerRef });
```

### 4. Video scrubbing (la vidéo avance au scroll)

```tsx
useGSAP(() => {
  const video = videoRef.current!;
  ScrollTrigger.create({
    trigger: video,
    start: "top bottom",
    end: "bottom top",
    scrub: true,
    onUpdate: (self) => {
      if (video.duration) {
        video.currentTime = self.progress * video.duration;
      }
    },
  });
}, { scope: videoRef });
```

### 5. Mask reveal (image qui se dévoile dans un cercle qui grandit)

```css
.mask-reveal {
  clip-path: circle(10% at 50% 50%);
  transition: clip-path 0.8s var(--ease-out);
}
.mask-reveal.visible {
  clip-path: circle(100% at 50% 50%);
}
```

Combinable avec IntersectionObserver ou ScrollTrigger `onEnter`.

### 6. Micro-interactions hover (pur CSS)

```css
.card {
  transition: transform var(--duration-base) var(--ease-out),
              box-shadow var(--duration-base) var(--ease-out);
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}
```

## Reduced motion — pattern

Wrapper utilitaire à créer :

```tsx
// src/lib/motion.ts
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

Puis dans `useGSAP` :

```tsx
useGSAP(() => {
  if (prefersReducedMotion()) {
    gsap.set(ref.current, { opacity: 1, y: 0 });
    return;
  }
  gsap.from(ref.current, { /* ... */ });
});
```

Et pour Lenis : `if (prefersReducedMotion()) return;` avant d'instancier.

## Anti-patterns à éviter

- ❌ Animer `box-shadow` sur de gros éléments → jank. Préférer un pseudo-element en `opacity`.
- ❌ Animer `width`/`height` → préférer `scale` + compensation de layout.
- ❌ `scrub: true` sans `pin` sur du texte qui défile naturellement — c'est redondant avec Lenis.
- ❌ Mélanger Motion (`layout`) et GSAP sur le même élément — ils se battent.
- ❌ Lancer 20 ScrollTriggers sur une même page sans regroupement — utiliser `gsap.matchMedia()` pour les responsive.

## Performance

- **Tout en `transform` + `opacity`** (composité GPU).
- `will-change: transform` **seulement** si effet nerveux — l'enlever sinon (coûte en mémoire).
- Images lazy-loaded : `loading="lazy"` sur tout ce qui n'est pas above-the-fold.
- Vidéos : `preload="metadata"`, `playsInline`, `muted`, `autoplay`.
- `ScrollTrigger.refresh()` après les chargements async (fonts, images).

## Sources

- [GSAP + Lenis React patterns](https://gsap.com/community/forums/topic/40426-patterns-for-synchronizing-scrolltrigger-and-lenis-in-reactnext/)
- [Lenis GitHub](https://github.com/darkroomengineering/lenis)
- [ScrollTrigger docs](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- [@gsap/react useGSAP hook](https://gsap.com/resources/React/)
