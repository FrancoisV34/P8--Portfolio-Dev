import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // app/.server/vigie : copie versionnée de Vigie, vérifiée par empreinte (npm run vigie:verifier) ;
  // son code se corrige dans le dépôt Vigie, pas ici.
  { ignores: ['build/**', '.react-router/**', '.cache/**', 'node_modules/**', 'src/**', 'dossier_conception_cfo/**', 'playwright-report/**', 'test-results/**', 'app/.server/vigie/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
