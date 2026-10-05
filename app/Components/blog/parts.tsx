import type { CSSProperties } from 'react';

/**
 * Signature visuelle d'un article, calculée depuis son slug : deux trames
 * CSS superposées, aucun fichier téléchargé. Purement décorative.
 */
export function patternVars(slug: string) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return {
    '--p-a1': `${30 + (h % 140)}deg`,
    '--p-a2': `${10 + ((h >> 7) % 160)}deg`,
    '--p-s1': `${5 + ((h >> 3) % 7)}px`,
    '--p-s2': `${4 + ((h >> 11) % 11)}px`,
  } as CSSProperties;
}

export function Pattern({ slug, size }: { slug: string; size: 36 | 40 | 56 }) {
  return <span className={`blog-pattern blog-pattern--${size}`} style={patternVars(slug)} aria-hidden="true" />;
}

// Midi UTC : la date ne glisse pas d'un jour selon le fuseau du lecteur.
const format = (iso: string, month: 'long' | 'short') => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' });

/** Date longue, abrégée sous 640 px : les deux sont rendues, le CSS choisit. */
export function PostMeta({ date, minutes, draft }: { date: string; minutes: number; draft: boolean }) {
  return <span className="blog-meta">
    <time dateTime={date}><span className="blog-meta__long">{format(date, 'long')}</span><span className="blog-meta__short">{format(date, 'short')}</span></time>
    {' · '}{minutes} min<span className="blog-meta__long"> de lecture</span>
    {draft ? <span className="blog-draft">Brouillon</span> : null}
  </span>;
}

/** Pastilles de sujets ; sous 640 px, les deux premières puis « +N ». */
export function Topics({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return <ul className="blog-topics" aria-label="Sujets">
    {tags.map((tag, index) => <li key={tag} className={index >= 2 ? 'blog-topics__extra' : undefined}>{tag}</li>)}
    {tags.length > 2 ? <li className="blog-topics__more" aria-hidden="true">+{tags.length - 2}</li> : null}
  </ul>;
}

export function SectionLabel({ children }: { children: string }) {
  return <p className="blog-label"><span>{children}</span></p>;
}

export const linkedInShare = (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
