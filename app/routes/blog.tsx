import { Link } from 'react-router';
import '../Style/Blog.scss';
import type { Route } from './+types/blog';
import { blogPosts, hasBlog } from '../.server/blog';
import { siteOrigin } from '../lib/site.server';
import { publicMeta } from '../lib/public-meta';
import { dateLongue } from '../lib/blog-format';

// Sans article publié, le blog n'existe pas : ni page vide, ni lien, ni entrée au sitemap.
export const loader = () => {
  if (!hasBlog()) throw new Response('Introuvable.', { status: 404 });
  return { origin: siteOrigin(), posts: blogPosts() };
};
export const meta = ({ loaderData }: Route.MetaArgs) => publicMeta(
  loaderData?.origin ?? '', '/blog',
  'Blog — François Vittecoq, dev & orchestrateur IA',
  'Articles de François Vittecoq sur le développement web, Claude Code et l’orchestration d’agents IA, tirés de projets réels.',
);

export default function Blog({ loaderData }: Route.ComponentProps) {
  return <section className="blog">
    <header className="blog__header">
      <h1>Blog</h1>
      <p>Notes de terrain : développement web, Claude Code et agents IA, tirées de projets réels.</p>
      <a className="blog__rss" href="/blog/rss.xml">Flux RSS</a>
    </header>
    <ol className="blog__list">{loaderData.posts.map((post) => <li key={post.slug}>
      <article className="blog-card">
        <p className="blog-card__meta"><time dateTime={post.date}>{dateLongue(post.date)}</time> · {post.readingMinutes} min de lecture{post.published ? null : <span className="blog__draft">Brouillon</span>}</p>
        <h2><Link to={`/blog/${post.slug}`}>{post.title}</Link></h2>
        <p>{post.summary}</p>
        {post.tags.length > 0 ? <ul className="blog__tags" aria-label="Sujets">{post.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul> : null}
      </article>
    </li>)}</ol>
  </section>;
}
