import { Marked, type Tokens } from 'marked';
import { z } from 'zod';

/**
 * Les articles du blog : des fichiers Markdown dans `content/blog/`, lus au
 * build par Vite et embarqués dans le serveur. Rien n'est écrit au runtime,
 * aucun visiteur ne dépose de contenu : le blog n'ajoute aucune entrée en
 * écriture à un serveur qui héberge aussi les finances (décision D09).
 *
 * En-tête attendu, entre deux lignes `---` :
 *
 *     title: Titre de l'article
 *     date: 2026-10-04
 *     summary: Une ou deux phrases, reprises en liste et dans l'aperçu LinkedIn.
 *     tags: Claude Code, React
 *     published: true
 *
 * ⚠️ **Seul `published: true` publie** (roadmap L17 : « le blog publie
 * seulement le contenu explicitement préparé pour lui »). Un brouillon n'est
 * visible qu'en développement, marqué comme tel.
 */
const files = import.meta.glob('/content/blog/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const slugShape = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const frontmatter = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)),
  summary: z.string().trim().min(1).max(300),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  published: z.boolean(),
}).strict();

export type BlogPost = z.infer<typeof frontmatter> & { slug: string; html: string; readingMinutes: number };
export type BlogSummary = Omit<BlogPost, 'html'>;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
// Liens et images : web, courriel, ou chemin du site. `javascript:` et
// `data:` ne passent pas, même écrits par erreur dans un article.
const safeUrl = (href: string) => /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href.trim());

const markdown = new Marked({ gfm: true });
markdown.use({
  renderer: {
    // Le HTML brut est affiché tel quel, jamais interprété.
    html(token: Tokens.HTML | Tokens.Tag) { return escapeHtml(token.text); },
    link(token: Tokens.Link) {
      if (!safeUrl(token.href)) return this.parser.parseInline(token.tokens);
      const external = /^https?:\/\//i.test(token.href);
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<a href="${escapeHtml(token.href)}"${title}${external ? ' rel="noopener noreferrer"' : ''}>${this.parser.parseInline(token.tokens)}</a>`;
    },
    image(token: Tokens.Image) {
      if (!safeUrl(token.href)) return escapeHtml(token.text);
      return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}" loading="lazy" decoding="async">`;
    },
  },
});

function parseValue(key: string, raw: string): unknown {
  const value = raw.trim().replace(/^(["'])(.*)\1$/, '$2');
  if (key === 'published') return value === 'true' ? true : value === 'false' ? false : value;
  if (key === 'tags') return value ? value.replace(/^\[|\]$/g, '').split(',').map((tag) => tag.trim()).filter(Boolean) : [];
  return value;
}

/** Lit un fichier d'article. Une erreur nomme le fichier : elle doit casser le build, pas passer inaperçue. */
export function parsePost(path: string, source: string): BlogPost {
  const slug = path.split('/').pop()!.replace(/\.md$/, '');
  if (!slugShape.test(slug)) throw new Error(`Article ${path} : le nom du fichier doit être en minuscules, chiffres et tirets.`);
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`Article ${path} : en-tête --- manquant.`);
  const fields: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`Article ${path} : ligne d'en-tête illisible « ${line} ».`);
    const key = line.slice(0, separator).trim();
    fields[key] = parseValue(key, line.slice(separator + 1));
  }
  const parsed = frontmatter.safeParse(fields);
  if (!parsed.success) throw new Error(`Article ${path} : en-tête invalide (${parsed.error.issues.map((issue) => issue.path.join('.') || issue.message).join(', ')}).`);
  const body = match[2];
  const words = body.split(/\s+/).filter(Boolean).length;
  return { ...parsed.data, slug, html: markdown.parse(body, { async: false }), readingMinutes: Math.max(1, Math.round(words / 200)) };
}

export function collectPosts(sources: Record<string, string>, { includeDrafts }: { includeDrafts: boolean }) {
  return Object.entries(sources)
    .map(([path, source]) => parsePost(path, source))
    .filter((post) => post.published || includeDrafts)
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

// Figé au build : un build ne montre jamais de brouillon, même lancé sans
// NODE_ENV. Seul le serveur de développement (`npm run dev`) les affiche.
const posts = collectPosts(files, { includeDrafts: import.meta.env.DEV });

export const blogPosts = (): BlogSummary[] => posts.map(({ html, ...summary }) => (void html, summary));
export const blogPost = (slug: string) => posts.find((post) => post.slug === slug) ?? null;
export const hasBlog = () => posts.length > 0;
