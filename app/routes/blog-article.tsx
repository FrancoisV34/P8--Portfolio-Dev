import { Link } from 'react-router';
import '../Style/Blog.scss';
import type { Route } from './+types/blog-article';
import { blogPost } from '../.server/blog';
import { siteOrigin } from '../lib/site.server';
import { publicMeta } from '../lib/public-meta';
import { dateLongue } from '../lib/blog-format';

export const loader = ({ params }: Route.LoaderArgs) => {
  const post = blogPost(params.slug);
  if (!post) throw new Response('Introuvable.', { status: 404 });
  return { origin: siteOrigin(), post };
};
export const meta = ({ loaderData }: Route.MetaArgs) => loaderData ? publicMeta(
  loaderData.origin, `/blog/${loaderData.post.slug}`,
  `${loaderData.post.title} — François Vittecoq`, loaderData.post.summary,
  { publishedTime: loaderData.post.date, tags: loaderData.post.tags },
) : [];

export default function BlogArticle({ loaderData: { post } }: Route.ComponentProps) {
  return <article className="blog blog-article">
    <Link className="blog-article__back" to="/blog">← Tous les articles</Link>
    <header className="blog__header">
      <p className="blog-card__meta"><time dateTime={post.date}>{dateLongue(post.date)}</time> · {post.readingMinutes} min de lecture{post.published ? null : <span className="blog__draft">Brouillon</span>}</p>
      <h1>{post.title}</h1>
      <p>{post.summary}</p>
    </header>
    {/* HTML produit par le serveur depuis un fichier du dépôt, HTML brut échappé
        et liens filtrés (app/.server/blog.ts) : aucun texte de visiteur ici. */}
    <div className="blog-article__body" dangerouslySetInnerHTML={{ __html: post.html }} />
  </article>;
}
