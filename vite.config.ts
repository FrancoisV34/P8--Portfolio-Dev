import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter()],
  // Cartes de sources pour Vigie : générées sans référence dans le JavaScript servi, puis
  // déplacées hors de build/client par scripts/assets/deplacer-cartes.ts (jamais publiques).
  build: { sourcemap: 'hidden' },
  server: {
    fs: {
      // Conserver les exclusions Vite et bloquer les fichiers privés aussi en dev.
      deny: [
        '.env', '.env.*', '*.{crt,pem}', '**/.git/**',
        '**/*.sqlite*', '**/*.db*', '**/data/**', '**/dossier_conception_cfo/**',
        '**/.cache/**', '**/test-results/**', '**/playwright-report/**',
        '**/.claude/**', '**/.codex/**', '**/.agents/**',
      ],
    },
    watch: { ignored: ['**/data/**', '**/.cache/**', '**/*.sqlite*', '**/*.db*'] },
  },
});
