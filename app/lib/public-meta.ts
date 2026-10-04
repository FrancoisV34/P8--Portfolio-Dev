import schemas from '../Data/structured-data.json';

const oldOrigin = 'https://francoisv34.github.io/P8--Portfolio-Dev';

export function publicMeta(origin: string, path: string, title: string, description: string, article?: { publishedTime: string; tags: string[] }) {
  const url = `${origin}${path}`;
  const image = `${origin}/moi.jpeg`;
  // Un article partagé sur LinkedIn s'affiche comme un article, daté et étiqueté.
  const type = article
    ? [{ property: 'og:type', content: 'article' }, { property: 'article:published_time', content: article.publishedTime },
      { property: 'article:author', content: 'François Vittecoq' }, ...article.tags.map((tag) => ({ property: 'article:tag', content: tag }))]
    : [{ property: 'og:type', content: 'profile' }];
  return [
    { title },
    { name: 'description', content: description },
    { name: 'author', content: 'François Vittecoq' },
    { name: 'robots', content: 'index, follow, max-image-preview:large' },
    { tagName: 'link' as const, rel: 'canonical', href: url },
    ...type,
    { property: 'og:locale', content: 'fr_FR' },
    { property: 'og:site_name', content: 'Portfolio François Vittecoq' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { property: 'og:image:alt', content: 'Portrait de François Vittecoq' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
  ];
}

/**
 * Les données structurées sont rendues par la page elle-même, et non par le
 * descripteur `script:ld+json` de React Router : celui-ci n'ajoute pas de
 * nonce, et la politique de contenu bloquerait alors le balisage SEO.
 */
export function structuredData(origin: string) {
  return schemas.map((schema) => JSON.stringify(schema).replaceAll(oldOrigin, origin).replaceAll('/moi.webp', '/moi.jpeg'));
}
