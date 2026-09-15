import { index, layout, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  layout('routes/public-layout.tsx', [
    index('routes/home.tsx'),
    route('cv', 'routes/cv.tsx'),
  ]),
  route('co', 'routes/login.tsx'),
  route('login', 'routes/legacy-login.ts'),
  route('api/auth/*', 'routes/api-auth.ts'),
  route('api/finance/backup', 'routes/finance-backup.ts'),
  route('finance/*', 'routes/finance.tsx'),
  route('api/finance/*', 'routes/finance-api.ts'),
  route('robots.txt', 'routes/robots.ts'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('healthz', 'routes/health.ts'),
] satisfies RouteConfig;
