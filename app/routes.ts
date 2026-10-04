import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  layout('routes/public-layout.tsx', [
    index('routes/home.tsx'),
    route('cv', 'routes/cv.tsx'),
    route('blog', 'routes/blog.tsx'),
    route('blog/:slug', 'routes/blog-article.tsx'),
  ]),
  route('api/auth/*', 'routes/api-auth.ts'),
  route('api/finance/backup', 'routes/finance-backup.ts'),
  route('finance/*', 'routes/finance.tsx'),
  route('api/finance/*', 'routes/finance-api.ts'),
  route('blog/rss.xml', 'routes/blog-rss.ts'),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('healthz', 'routes/health.ts'),
  // Dernier recours : la connexion privée ne figure pas dans la table des
  // routes. Elle se reconnaît à l'exécution (PRIVATE_LOGIN_PATH) et toute
  // autre adresse inconnue reçoit la même page « introuvable ».
  route('*', 'routes/login.tsx'),
] satisfies RouteConfig;
