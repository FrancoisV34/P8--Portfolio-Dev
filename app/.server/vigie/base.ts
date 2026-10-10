/**
 * Accès à la base de l'application hôte : SQL SQLite simple, sans ORM (ADR-0002, correctif).
 *
 * Deux opérations suffisent : un lot d'écritures **atomique** (D1 n'a pas de transaction
 * interactive, mais son `batch` est atomique) et une lecture. Les adaptateurs ne dépendent que de
 * la forme des API (pas d'import de better-sqlite3 ni des types Workers).
 */

export type Valeur = string | number | null;
export type Ligne = Record<string, Valeur>;

export interface Instruction {
  sql: string;
  params: Valeur[];
}

export interface Base {
  /** Exécute les instructions d'un bloc (tout ou rien) ; renvoie les lignes modifiées par chacune. */
  lot(instructions: Instruction[]): Promise<number[]>;
  lire(sql: string, params: Valeur[]): Promise<Ligne[]>;
}

// --- better-sqlite3 (P8, Node) ---------------------------------------------------------------

export interface BetterSqlite3 {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    all(...params: unknown[]): unknown[];
  };
  transaction<T>(fonction: () => T): () => T;
}

export function baseBetterSqlite3(db: BetterSqlite3): Base {
  return {
    async lot(instructions) {
      const executer = db.transaction(() =>
        instructions.map(({ sql, params }) => db.prepare(sql).run(...params).changes),
      );
      return executer();
    },
    async lire(sql, params) {
      return db.prepare(sql).all(...params) as Ligne[];
    },
  };
}

// --- Cloudflare D1 (atelier, Workers) --------------------------------------------------------

export interface D1Instruction {
  bind(...params: Valeur[]): D1Instruction;
  all(): Promise<{ results: unknown[] }>;
}

export interface D1 {
  prepare(sql: string): D1Instruction;
  batch(instructions: D1Instruction[]): Promise<{ meta: { changes: number } }[]>;
}

export function baseD1(db: D1): Base {
  return {
    async lot(instructions) {
      const resultats = await db.batch(instructions.map(({ sql, params }) => db.prepare(sql).bind(...params)));
      return resultats.map((resultat) => resultat.meta.changes);
    },
    async lire(sql, params) {
      const { results } = await db.prepare(sql).bind(...params).all();
      return results as Ligne[];
    },
  };
}
