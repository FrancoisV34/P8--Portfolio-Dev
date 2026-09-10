import schemas from '../Data/structured-data.json';

const oldOrigin = 'https://francoisv34.github.io/P8--Portfolio-Dev';

export function publicMeta(origin: string, path: '/' | '/cv', title: string, description: string) {
  const url = `${origin}${path}`;
  const image = `${origin}/moi.jpeg`;
  return [
    { title },
    { name: 'description', content: description },
    { name: 'author', content: 'François Vittecoq' },
    { name: 'robots', content: 'index, follow, max-image-preview:large' },
    { tagName: 'link' as const, rel: 'canonical', href: url },
    { property: 'og:type', content: 'profile' },
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
    ...(path === '/' ? schemas.map((schema) => ({
      'script:ld+json': JSON.parse(JSON.stringify(schema).replaceAll(oldOrigin, origin).replaceAll('/moi.webp', '/moi.jpeg')) as Record<string, unknown>,
    })) : []),
  ];
}
