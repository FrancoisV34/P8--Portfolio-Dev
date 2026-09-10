import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter()],
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
