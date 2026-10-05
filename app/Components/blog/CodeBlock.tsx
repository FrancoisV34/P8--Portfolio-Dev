import { useEffect, useRef, useState } from 'react';

/**
 * Bloc de code avec en-tête. « Copier » n'existe que si le presse-papiers est
 * disponible, ce qui ne se sait qu'après le montage : le rendu serveur ne le
 * montre jamais, et l'hydratation ne peut pas diverger.
 */
export default function CodeBlock({ lang, file, code, className }: { lang: string; file: string; code: string; className?: string }) {
  const [canCopy, setCanCopy] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    setCanCopy(typeof navigator !== 'undefined' && Boolean(navigator.clipboard));
    return () => clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* refusé par le navigateur : le texte reste sélectionnable */ }
  };
  return <figure className={`blog-code${className ? ` ${className}` : ''}`}>
    {lang || file || canCopy ? <figcaption className="blog-code__head">
      <span className="blog-code__id">{lang ? <span className="blog-code__lang">{lang}</span> : null}{file ? <span className="blog-code__file">{file}</span> : null}</span>
      {canCopy ? <button type="button" className="blog-code__copy" onClick={copy}><span aria-live="polite">{copied ? 'Copié' : 'Copier'}</span></button> : null}
    </figcaption> : null}
    <div className="blog-code__body"><pre><code>{code}</code></pre></div>
  </figure>;
}
