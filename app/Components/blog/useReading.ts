import { useEffect, useState, type RefObject } from 'react';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Progression de lecture et section active d'un article.
 *
 * ⚠️ **La progression n'est pas un état React.** Elle est écrite directement
 * sur les nœuds `[data-reading-bar]` (transform) et `[data-reading-text]`
 * (texte) dans un `requestAnimationFrame` : un rendu par image ferait ramer
 * le défilement. Le pourcentage en texte double la barre colorée.
 *
 * La section active vient d'un `IntersectionObserver` : parmi les sections
 * visibles dans la bande haute de l'écran, la plus haute l'emporte.
 */
export default function useReading(article: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const node = article.current;
    if (!node) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const span = Math.max(1, node.offsetHeight - window.innerHeight * 0.75);
      const ratio = clamp01((window.scrollY - node.offsetTop + 120) / span);
      for (const bar of document.querySelectorAll<HTMLElement>('[data-reading-bar]')) bar.style.transform = `scaleX(${ratio})`;
      for (const text of document.querySelectorAll<HTMLElement>('[data-reading-text]')) text.textContent = `${Math.round(ratio * 100)} %`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    const sections = [...node.querySelectorAll<HTMLElement>('[data-h2]')];
    const visible = new Set<number>();
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const index = Number((entry.target as HTMLElement).dataset.h2);
        if (entry.isIntersecting) visible.add(index); else visible.delete(index);
      }
      if (visible.size > 0) setActive(Math.min(...visible));
    }, { rootMargin: '-80px 0px -65% 0px', threshold: 0 }) : null;
    sections.forEach((section) => observer?.observe(section));

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      observer?.disconnect();
    };
  }, [article]);

  return active;
}
