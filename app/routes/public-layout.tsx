import { Outlet } from 'react-router';
import Nav from '../Components/Nav';
import { hasBlog } from '../.server/blog';
import type { Route } from './+types/public-layout';

// Le lien « Blog » n'apparaît qu'avec un premier article publié.
export const loader = () => ({ blog: hasBlog() });

export const links = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' as const },
  { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap' },
];

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  return <><a className="skip-link" href="#contenu">Aller au contenu</a><Nav blog={loaderData.blog} /><main id="contenu"><Outlet /></main></>;
}
