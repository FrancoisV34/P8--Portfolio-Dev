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

/**
 * Le corps est découpé en blocs, et non livré en un seul HTML : chaque bloc
 * s'anime à son tour, les citations et le code ont leur propre composant, et
 * le sommaire vient des `h2` eux-mêmes — il ne peut pas se désynchroniser.
 */
export type BodyBlock =
  | { kind: 'html'; html: string }
  | { kind: 'quote'; label: string; html: string }
  | { kind: 'code'; lang: string; file: string; code: string };
export type BodySection = { id: string; number: string; label: string; html: string; blocks: BodyBlock[] };
export type BlogPost = z.infer<typeof frontmatter> & { slug: string; readingMinutes: number; intro: BodyBlock[]; sections: BodySection[] };
export type BlogSummary = Omit<BlogPost, 'intro' | 'sections'>;

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

/** Ancre d'un titre : minuscules, sans accents, tirets ; doublons suffixés. */
export function anchorId(label: string, taken: Set<string>) {
  const base = label.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * Corps Markdown → introduction (avant le premier `h2`) puis sections.
 *
 * Deux conventions d'écriture, documentées dans le modèle d'article :
 * - une citation qui commence par `[!Ce que je retiens]` prend cette étiquette
 *   (« À retenir » sinon) ;
 * - un bloc de code ```` ```ts sandbox/spawn.ts ```` affiche « TS » et le nom
 *   du fichier dans son en-tête.
 */
export function parseBody(body: string) {
  const tokens = markdown.lexer(body);
  const render = (token: (typeof tokens)[number]) => markdown.parser(Object.assign([token], { links: tokens.links }));
  const intro: BodyBlock[] = [];
  const sections: BodySection[] = [];
  const taken = new Set<string>();
  for (const token of tokens) {
    if (token.type === 'space') continue;
    if (token.type === 'heading' && token.depth === 2) {
      const label = token.text.replace(/[*_`]/g, '').trim();
      sections.push({ id: anchorId(label, taken), number: String(sections.length + 1).padStart(2, '0'), label, html: markdown.parseInline(token.text, { async: false }), blocks: [] });
      continue;
    }
    let block: BodyBlock;
    if (token.type === 'code') {
      const [lang = '', ...file] = (token.lang ?? '').trim().split(/\s+/);
      block = { kind: 'code', lang: lang.toUpperCase().slice(0, 12), file: file.join(' ').slice(0, 80), code: token.text };
    } else if (token.type === 'blockquote') {
      const labelled = /^\[!([^\]\n]{1,40})\]\s*\n?/.exec(token.text);
      block = { kind: 'quote', label: labelled ? labelled[1].trim() : 'À retenir', html: markdown.parse(labelled ? token.text.slice(labelled[0].length) : token.text, { async: false }) };
    } else {
      block = { kind: 'html', html: render(token) };
    }
    (sections.at(-1)?.blocks ?? intro).push(block);
  }
  return { intro, sections };
}

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
  return { ...parsed.data, slug, ...parseBody(body), readingMinutes: Math.max(1, Math.round(words / 200)) };
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

const summary = ({ intro, sections, ...rest }: BlogPost): BlogSummary => (void intro, void sections, rest);
export const blogPosts = (): BlogSummary[] => posts.map(summary);
/** Un article et ses voisins : `older` a été publié avant, `newer` après. */
export function blogPost(slug: string) {
  const index = posts.findIndex((post) => post.slug === slug);
  if (index < 0) return null;
  const neighbour = (other?: BlogPost) => other ? { slug: other.slug, title: other.title } : null;
  return { post: posts[index], newer: neighbour(posts[index - 1]), older: neighbour(posts[index + 1]) };
}
export const hasBlog = () => posts.length > 0;
