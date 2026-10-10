import { eq } from 'drizzle-orm';
import { readAuthConfiguration } from '../../app/.server/auth/config.ts';
import { openDatabase } from '../../app/.server/db/connection.ts';
import { user } from '../../app/.server/db/schema.ts';
import { runAgentCommand } from '../../app/.server/imports/agent.ts';

// Porte d'entrée de l'agent sur la file des relevés (voir SECURITY.md, revue
// du 10 octobre 2026). Lancée dans la Machine par `fly ssh console -C` : pas
// d'endpoint, pas de jeton. Le propriétaire vient de la configuration, et la
// sortie ne contient que ce que la commande demandée a besoin de montrer.
const connection = openDatabase();
try {
  const owner = connection.db.select({ id: user.id }).from(user).where(eq(user.email, readAuthConfiguration().FINANCE_OWNER_EMAIL)).get();
  if (!owner) throw new Error('Compte propriétaire absent.');
  console.log(JSON.stringify(runAgentCommand(connection.db, owner.id, process.argv.slice(2))));
} catch (error) {
  // Jamais de trace d'exécution : elle décrirait la base et ses chemins.
  console.error(error instanceof Error && !('issues' in error) && !('code' in error) ? error.message : 'Commande refusée.');
  process.exitCode = 1;
} finally {
  connection.close();
}
