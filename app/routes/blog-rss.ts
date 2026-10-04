import { blogPosts, hasBlog } from '../.server/blog';
import { siteOrigin } from '../lib/site.server';

const xml = (value: string) => value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

export function loader() {
  if (!hasBlog()) return new Response('Introuvable.', { status: 404 });
  const origin = siteOrigin();
  const items = blogPosts().map((post) => `<item><title>${xml(post.title)}</title><link>${origin}/blog/${post.slug}</link><guid>${origin}/blog/${post.slug}</guid><pubDate>${new Date(`${post.date}T08:00:00Z`).toUTCString()}</pubDate><description>${xml(post.summary)}</description></item>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Blog — François Vittecoq</title><link>${origin}/blog</link><description>Développement web, Claude Code et agents IA.</description><language>fr-FR</language>${items}</channel></rss>`, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
