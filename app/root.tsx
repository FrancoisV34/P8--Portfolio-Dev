import type { ReactNode } from 'react';
import { isRouteErrorResponse, Links, Link, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { Route } from './+types/root';
import './styles.css';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0b0f" />
        <link rel="icon" type="image/png" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <Meta />
        <Links />
      </head>
      <body>{children}<ScrollRestoration /><Scripts /></body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="status-page">
      <title>{`${missing ? 'Page introuvable' : 'Page indisponible'} — François Vittecoq`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <h1>{missing ? 'Page introuvable' : 'Cette page est indisponible'}</h1>
      <p>{missing ? 'Cette adresse ne correspond à aucune page.' : 'Réessayez dans quelques instants.'}</p>
      <Link to="/">Revenir au portfolio</Link>
    </main>
  );
}
