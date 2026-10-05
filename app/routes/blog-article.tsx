import { useRef, type RefObject } from 'react';
import { Link } from 'react-router';
import '../Style/Blog.scss';
import type { Route } from './+types/blog-article';
import { blogPost, type BodyBlock } from '../.server/blog';
import { siteOrigin } from '../lib/site.server';
import { publicMeta } from '../lib/public-meta';
import useReveal from '../hooks/useReveal';
import useReading from '../Components/blog/useReading';
import CodeBlock from '../Components/blog/CodeBlock';
import { linkedInShare, Pattern, PostMeta, SectionLabel, Topics } from '../Components/blog/parts';

export const loader = ({ params, request }: Route.LoaderArgs) => {
  const found = blogPost(params.slug);
  if (!found) throw new Response('Introuvable.', { status: 404 });
  // Le nonce vient du serveur de production : il autorise le JSON-LD sous la CSP.
  return { origin: siteOrigin(), nonce: request.headers.get('x-nonce') ?? undefined, ...found };
};
export const meta = ({ loaderData }: Route.MetaArgs) => loaderData ? publicMeta(
  loaderData.origin, `/blog/${loaderData.post.slug}`,
  `${loaderData.post.title} — François Vittecoq`, loaderData.post.summary,
  { publishedTime: loaderData.post.date, tags: loaderData.post.tags },
) : [];
export const links = () => [{ rel: 'alternate', type: 'application/rss+xml', title: 'Blog — François Vittecoq', href: '/blog/rss.xml' }];

// Décalages d'apparition 80 / 180 / 280 / 380 ms, puis on reboucle : au-delà,
// le bas d'un long article attendrait plusieurs secondes.
function stagger() {
  let index = 0;
  return () => `reveal reveal-delay-${(index++ % 4) + 1}`;
}

function Block({ block, reveal }: { block: BodyBlock; reveal: string }) {
  if (block.kind === 'code') return <CodeBlock className={reveal} lang={block.lang} file={block.file} code={block.code} />;
  if (block.kind === 'quote') return <blockquote className={`blog-quote ${reveal}`}>
    <span className="blog-quote__label">{block.label}</span>
    {/* HTML rendu côté serveur depuis un fichier du dépôt : HTML brut échappé, liens filtrés (app/.server/blog.ts). */}
    <div className="blog-quote__text" dangerouslySetInnerHTML={{ __html: block.html }} />
  </blockquote>;
  return <div className={`blog-prose ${reveal}`} dangerouslySetInnerHTML={{ __html: block.html }} />;
}

/**
 * L'article : rail de sommaire collant au-dessus de 1040 px, `<details>` natif
 * en dessous — les deux balisages coexistent et le CSS choisit, pour un rendu
 * juste sans JavaScript. Les ancres sont de vrais liens.
 */
export default function BlogArticle({ loaderData }: Route.ComponentProps) {
  const { post, newer, older, origin, nonce } = loaderData;
  const url = `${origin}/blog/${post.slug}`;
  const article = useRef<HTMLElement>(null);
  const active = useReading(article);
  const page = useReveal(0.15, '0px 0px -8% 0px');
  const reveal = stagger();

  const sommaire = post.sections.map((section, index) => <a key={section.id} href={`#${section.id}`} className="blog-toc__entry" aria-current={index === active ? 'location' : undefined}>
    <span className="blog-toc__number">{section.number}</span><span>{section.label}</span>
  </a>);
  const schema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.summary,
    datePublished: post.date, inLanguage: 'fr-FR', url, mainEntityOfPage: url, keywords: post.tags.join(', '),
    author: { '@type': 'Person', name: 'François Vittecoq', url: origin },
  }).replaceAll('<', '\\u003c');

  return <div className="blog-page blog-page--article" ref={page as RefObject<HTMLDivElement>}>
    <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: schema }} />
    <div className="blog-progress" aria-hidden="true"><div className="blog-progress__bar" data-reading-bar /></div>

    <aside className="blog-rail" aria-label="Sommaire et progression">
      <div className="blog-rail__inner">
        <SectionLabel>Sommaire</SectionLabel>
        <nav className="blog-toc" aria-label="Sommaire de l’article">{sommaire}</nav>
        <div className="blog-rail__progress">
          <div className="blog-rail__track"><div className="blog-rail__fill" data-reading-bar /></div>
          <span data-reading-text>0 %</span>
        </div>
      </div>
    </aside>

    <article className="blog-article" ref={article}>
      <Link className={`blog-back ${reveal()}`} to="/blog">← Tous les articles</Link>
      <header className={`blog-article__head ${reveal()}`}>
        <p className="blog-article__meta"><Pattern slug={post.slug} size={36} /><PostMeta date={post.date} minutes={post.readingMinutes} draft={!post.published} /></p>
        <h1>{post.title}</h1>
        <p className="blog-article__lede">{post.summary}</p>
        <div className="blog-article__bar">
          <Topics tags={post.tags} />
          <a className="blog-share" href={linkedInShare(url)} target="_blank" rel="noopener noreferrer">Partager sur LinkedIn ↗</a>
        </div>
      </header>

      {post.sections.length > 0 ? <details className={`blog-toc-mobile ${reveal()}`}>
        <summary><span>Sommaire</span><span data-reading-text>0 %</span></summary>
        <nav className="blog-toc" aria-label="Sommaire de l’article">{sommaire}</nav>
      </details> : null}

      {post.intro.map((block, index) => <Block key={`intro-${index}`} block={block} reveal={reveal()} />)}
      {post.sections.map((section, index) => <section key={section.id} className="blog-section" data-h2={index} aria-labelledby={section.id}>
        <div className={`blog-section__head ${reveal()}`}>
          <p className="blog-section__number" aria-hidden="true"><span>{section.number}</span></p>
          <h2 id={section.id} dangerouslySetInnerHTML={{ __html: section.html }} />
        </div>
        {section.blocks.map((block, blockIndex) => <Block key={blockIndex} block={block} reveal={reveal()} />)}
      </section>)}

      <footer className={`blog-article__foot ${reveal()}`}>
        <div className="blog-author">
          <span className="blog-author__mono" aria-hidden="true">FV</span>
          <div className="blog-author__text">
            <p className="blog-author__name">François Vittecoq</p>
            <p>Développeur web et orchestrateur IA à Montpellier. Référent IA et formateur Claude Code.</p>
          </div>
          <a className="blog-author__share" href={linkedInShare(url)} target="_blank" rel="noopener noreferrer">Partager sur LinkedIn ↗</a>
        </div>
        <nav className="blog-siblings" aria-label="Autres articles">
          {older ? <Link className="blog-sibling" to={`/blog/${older.slug}`}><span className="blog-sibling__label">← Précédent</span><span className="blog-sibling__title">{older.title}</span></Link>
            : <span className="blog-sibling blog-sibling--none"><span className="blog-sibling__label">← Précédent</span><span className="blog-sibling__title">— le plus ancien</span></span>}
          {newer ? <Link className="blog-sibling blog-sibling--next" to={`/blog/${newer.slug}`}><span className="blog-sibling__label">Suivant →</span><span className="blog-sibling__title">{newer.title}</span></Link>
            : <span className="blog-sibling blog-sibling--next blog-sibling--none"><span className="blog-sibling__label">Suivant →</span><span className="blog-sibling__title">— le plus récent</span></span>}
        </nav>
      </footer>
    </article>
  </div>;
}
