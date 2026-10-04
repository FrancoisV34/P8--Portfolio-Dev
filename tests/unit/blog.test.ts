import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectPosts, parsePost } from '../../app/.server/blog';

const article = (header: string, body = 'Du texte.') => `---\n${header}\n---\n${body}\n`;
const valide = 'title: Un titre\ndate: 2026-10-04\nsummary: Un résumé.\ntags: Claude Code, React\npublished: true';

describe('articles du blog', () => {
  it('lit l’en-tête, le corps et le temps de lecture', () => {
    const post = parsePost('/content/blog/un-article.md', article(valide, `## Intertitre\n\n${'mot '.repeat(450)}`));
    expect(post).toMatchObject({ slug: 'un-article', title: 'Un titre', date: '2026-10-04', tags: ['Claude Code', 'React'], published: true, readingMinutes: 2 });
    expect(post.html).toContain('<h2>Intertitre</h2>');
  });

  it('refuse un en-tête incomplet, une date impossible ou un nom de fichier non conforme, en nommant le fichier', () => {
    expect(() => parsePost('/content/blog/a.md', 'pas d’en-tête')).toThrow('/content/blog/a.md');
    expect(() => parsePost('/content/blog/a.md', article('title: T\ndate: 2026-10-04\nsummary: S'))).toThrow(/published/);
    expect(() => parsePost('/content/blog/a.md', article(valide.replace('2026-10-04', '2026-02-30')))).toThrow(/date/);
    expect(() => parsePost('/content/blog/a.md', article(valide.replace('published: true', 'published: oui')))).toThrow(/published/);
    expect(() => parsePost('/content/blog/a.md', article(`${valide}\nauteur: quelqu’un`))).toThrow();
    expect(() => parsePost('/content/blog/Mon Article.md', article(valide))).toThrow(/minuscules/);
  });

  it('affiche le HTML brut sans l’interpréter et neutralise les liens dangereux', () => {
    const { html } = parsePost('/content/blog/a.md', article(valide, [
      '<script>alert(1)</script>',
      '',
      'Texte <img src=x onerror=alert(1)> en ligne.',
      '',
      '[piège](javascript:alert(1)) [données](data:text/html,x) [site](https://example.com) [interne](/cv)',
      '',
      '![image](data:image/svg+xml,x) ![photo](/moi.jpeg)',
    ].join('\n')));
    // Seules de vraies balises seraient dangereuses : le texte échappé reste lisible.
    expect(html).not.toMatch(/<script|<img src=x|href="javascript|href="data/i);
    expect(html).toContain('&#60;script&#62;');
    expect(html).toContain('&#60;img src=x onerror=alert(1)&#62;');
    expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer">site</a>');
    expect(html).toContain('<a href="/cv">interne</a>');
    expect(html).toContain('<img src="/moi.jpeg" alt="photo"');
    expect(html).not.toContain('data:image');
  });

  it('ne publie que les articles marqués published: true, du plus récent au plus ancien', () => {
    const sources = {
      '/content/blog/ancien.md': article(valide.replace('2026-10-04', '2026-01-01')),
      '/content/blog/brouillon.md': article(valide.replace('published: true', 'published: false')),
      '/content/blog/recent.md': article(valide),
    };
    expect(collectPosts(sources, { includeDrafts: false }).map(({ slug }) => slug)).toEqual(['recent', 'ancien']);
    expect(collectPosts(sources, { includeDrafts: true }).map(({ slug }) => slug)).toEqual(['brouillon', 'recent', 'ancien']);
  });

  it('accepte chaque article réellement présent dans content/blog', () => {
    // Un article mal formé casserait le serveur au démarrage : on l'attrape ici.
    for (const name of readdirSync('content/blog').filter((file) => file.endsWith('.md'))) {
      expect(() => parsePost(`/content/blog/${name}`, readFileSync(`content/blog/${name}`, 'utf8')), name).not.toThrow();
    }
  });
});
