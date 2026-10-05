import type { RefObject } from 'react';
import { Link } from 'react-router';
import '../Style/Blog.scss';
import type { Route } from './+types/blog';
import { blogPosts, hasBlog } from '../.server/blog';
import { siteOrigin } from '../lib/site.server';
import { publicMeta } from '../lib/public-meta';
import useReveal from '../hooks/useReveal';
import { Pattern, PostMeta, SectionLabel, Topics } from '../Components/blog/parts';

// Sans article publié, le blog n'existe pas : ni page vide, ni lien, ni entrée au sitemap.
export const loader = () => {
  if (!hasBlog()) throw new Response('Introuvable.', { status: 404 });
  return { origin: siteOrigin(), posts: blogPosts() };
};
export const meta = ({ loaderData }: Route.MetaArgs) => publicMeta(
  loaderData?.origin ?? '', '/blog',
  'Blog — François Vittecoq, dev & orchestrateur IA',
  'Ce que j’apprends en orchestrant des agents de code, vérifié sur de vrais projets.',
);
export const links = () => [{ rel: 'alternate', type: 'application/rss+xml', title: 'Blog — François Vittecoq', href: '/blog/rss.xml' }];

/**
 * L'index : le dernier article à la une, les précédents en lignes.
 * Maquette « titre d'abord » de la passation Claude Design (octobre 2026).
 */
export default function Blog({ loaderData }: Route.ComponentProps) {
  const ref = useReveal(0.15, '0px 0px -8% 0px');
  const [featured, ...older] = loaderData.posts;
  const count = loaderData.posts.length;
  return <div className="blog-page" ref={ref as RefObject<HTMLDivElement>}>
    <header className="blog-index__head reveal">
      <div>
        <h1>Blog</h1>
        <p>Ce que j’apprends en orchestrant des agents de code, vérifié sur de vrais projets.</p>
      </div>
      <p className="blog-index__aside">{count} article{count > 1 ? 's' : ''} <a href="/blog/rss.xml">Flux RSS ↗</a></p>
    </header>

    <section className="blog-index__featured reveal reveal-delay-1" aria-labelledby="a-la-une">
      <SectionLabel>À la une</SectionLabel>
      <article className="blog-featured">
        <Pattern slug={featured.slug} size={56} />
        <div className="blog-featured__text">
          <PostMeta date={featured.date} minutes={featured.readingMinutes} draft={!featured.published} />
          <h2 id="a-la-une"><Link to={`/blog/${featured.slug}`}>{featured.title}</Link></h2>
          <p>{featured.summary}</p>
          <Topics tags={featured.tags} />
          <Link className="blog-featured__more" to={`/blog/${featured.slug}`} aria-hidden="true" tabIndex={-1}>Lire l’article →</Link>
        </div>
      </article>
    </section>

    {older.length > 0 ? <section className="blog-index__older reveal reveal-delay-2" aria-label="Articles précédents">
      <SectionLabel>Plus tôt</SectionLabel>
      <ol className="blog-rows">{older.map((post) => <li key={post.slug}>
        <Link className="blog-row" to={`/blog/${post.slug}`}>
          <Pattern slug={post.slug} size={40} />
          <span className="blog-row__text">
            <PostMeta date={post.date} minutes={post.readingMinutes} draft={!post.published} />
            <span className="blog-row__title">{post.title}</span>
            <span className="blog-row__summary">{post.summary}</span>
          </span>
          <span className="blog-row__chevron" aria-hidden="true">→</span>
        </Link>
      </li>)}</ol>
    </section> : null}
  </div>;
}
