import { defineConfig } from 'drizzle-kit';

// Génération uniquement : les migrations sont appliquées par notre connexion
// serveur, qui active les contraintes et vérifie la destination privée.
export default defineConfig({
  dialect: 'sqlite',
  schema: './app/.server/db/schema.ts',
  out: './drizzle',
  strict: true,
});
