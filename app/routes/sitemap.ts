import { blogPosts, hasBlog } from '../.server/blog';
import { siteOrigin } from '../lib/site.server';

export function loader() {
  const origin = siteOrigin();
  const pages = ['/', '/cv', ...(hasBlog() ? ['/blog'] : [])].map((path) => `<url><loc>${origin}${path}</loc></url>`);
  const articles = blogPosts().filter((post) => post.published).map((post) => `<url><loc>${origin}/blog/${post.slug}</loc><lastmod>${post.date}</lastmod></url>`);
  const urls = [...pages, ...articles].join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
