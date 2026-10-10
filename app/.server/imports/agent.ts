import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, isNull, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { FinanceDatabase } from '../db/connection.ts';
import { accounts, categories, economicEntities, importAgentDecisions, importLines, transactions } from '../db/schema.ts';
import { budgetRepository } from '../repositories/budget.ts';
import { importsRepository, recognitionKey } from '../repositories/imports.ts';

const MAX_DECISIONS = 200;
const EXAMPLE_LIMIT = 300;
const RUN_LIMIT = 20;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// Une décision tient en un seul mot sans espace ni guillemet : elle traverse
// `fly ssh console -C` sans échappement, et rien d'autre qu'un identifiant
// n'entre par la ligne de commande.
const DECISION = new RegExp(`^(?:(suggested):(${UUID})|(accept|transfer):(${UUID}):(${UUID}))$`);

export const USAGE = 'Commandes : list | context | runs | apply [--confirm] <décision…> | undo <lot>. Décisions : suggested:<ligne> accept:<ligne>:<catégorie> transfer:<ligne>:<compte>.';
const POSSIBLE_DUPLICATE = 'Doublon possible : un mouvement du même montant existe déjà. Laissée à François.';
const KNOWN_DECISION = 'L’app a déjà une décision pour ce libellé : utiliser suggested.';
const NO_SUGGESTION = 'L’app ne propose rien pour cette ligne.';

type Decision = { kind: 'suggested'; lineId: string } | { kind: 'accept'; lineId: string; categoryId: string } | { kind: 'transfer'; lineId: string; accountId: string };
class DryRun extends Error {}

function parseDecisions(tokens: string[]): Decision[] {
  if (tokens.length === 0 || tokens.length > MAX_DECISIONS) throw new Error(`Entre 1 et ${MAX_DECISIONS} décisions par lot.`);
  const decisions = tokens.map((token): Decision => {
    const match = DECISION.exec(token);
    if (!match) throw new Error('Décision illisible.');
    if (match[1]) return { kind: 'suggested', lineId: match[2] };
    return match[3] === 'accept' ? { kind: 'accept', lineId: match[4], categoryId: match[5] } : { kind: 'transfer', lineId: match[4], accountId: match[5] };
  });
  if (new Set(decisions.map(({ lineId }) => lineId)).size !== decisions.length) throw new Error('Une ligne ne reçoit qu’une décision par lot.');
  return decisions;
}

/**
 * Ce que l'agent a le droit de faire sur la file des relevés, et rien d'autre.
 * Tout passe par `importsRepository`, donc par les contrôles de l'app. L'agent
 * ne choisit ni montant, ni date, ni note : ils viennent du relevé. Il ne crée
 * ni catégorie ni compte, n'écarte aucune ligne, ne contredit pas une décision
 * déjà prise par François pour le même libellé, et s'arrête devant un doublon
 * possible. ownerId vient de la configuration du serveur, jamais d'un argument.
 */
export function importAgent(db: FinanceDatabase, ownerId: string) {
  const imports = importsRepository(db, ownerId);
  const budget = budgetRepository(db, ownerId);

  const activeCategories = () => budget.listCategories().filter((category) => category.isActive);
  function activeAccounts() {
    return db.select({ id: accounts.id, name: accounts.name, type: accounts.type }).from(accounts)
      .innerJoin(economicEntities, eq(accounts.entityId, economicEntities.id))
      .where(and(eq(economicEntities.ownerId, ownerId), eq(accounts.isActive, true))).orderBy(asc(accounts.name)).all();
  }

  function decide(decision: Decision, runId: string) {
    const found = imports.describePending(decision.lineId);
    if (!found) throw new Error('Ligne introuvable.');
    const { line, suggestion, duplicate } = found;
    let action: 'create' | 'link';
    let previousOccurredOn: string | null = null;
    let transactionId: string;
    if (decision.kind === 'suggested') {
      if (!suggestion.quick) throw new Error(NO_SUGGESTION);
      action = suggestion.quick;
      const target = suggestion.candidates.find((candidate) => candidate.id === suggestion.linkTo);
      // Rattacher aligne la date du mouvement sur le relevé : l'ancienne est
      // gardée pour que l'annulation la rende.
      if (target && target.kind !== 'transfer' && target.occurredOn !== line.occurredOn) previousOccurredOn = target.occurredOn;
      transactionId = imports.acceptSuggested(line.id);
    } else {
      if (duplicate !== null || suggestion.candidates.some((candidate) => candidate.amountCents === line.amountCents)) throw new Error(POSSIBLE_DUPLICATE);
      if (suggestion.known) throw new Error(KNOWN_DECISION);
      action = 'create';
      const common = { id: line.id, amountCents: Math.abs(line.amountCents), occurredOn: line.occurredOn, note: line.label };
      if (decision.kind === 'accept') {
        const kind = line.amountCents < 0 ? 'expense' : 'income';
        if (!activeCategories().some((category) => category.id === decision.categoryId && category.kind === kind)) throw new Error('Catégorie introuvable.');
        transactionId = imports.acceptLine({ ...common, kind, categoryId: decision.categoryId });
      } else {
        // Compte étranger, fermé ou identique : refusé par le dépôt lui-même.
        transactionId = imports.acceptLine({ ...common, kind: 'transfer', counterpartAccountId: decision.accountId });
      }
    }
    db.insert(importAgentDecisions).values({
      id: randomUUID(), ownerId, runId, lineId: line.id, action, transactionId, previousOccurredOn, createdAt: new Date().toISOString(),
    }).run();
    return action;
  }

  return {
    /** La file en attente, réduite à ce qu'il faut pour décider. */
    list() {
      return imports.listPending().map(({ line, accountName, batch, duplicate, suggestion }) => ({
        line: line.id, account: accountName, accountId: batch.accountId, date: line.occurredOn, label: line.label, amountCents: line.amountCents,
        duplicate, suggested: suggestion.quick,
        candidates: suggestion.candidates.map(({ occurredOn, amountCents, kind, note, categoryName, counterpartAccountName, exact }) =>
          ({ date: occurredOn, amountCents, kind, note, category: categoryName, counterpart: counterpartAccountName, exact })),
      }));
    },
    /**
     * Les catégories et comptes utilisables, et la façon dont François a déjà
     * classé ses libellés — sans aucun montant.
     */
    context() {
      const rows = db.select({ label: importLines.label, category: categories.name }).from(importLines)
        .innerJoin(transactions, eq(importLines.transactionId, transactions.id))
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(and(eq(importLines.ownerId, ownerId), eq(transactions.ownerId, ownerId), eq(importLines.status, 'accepted'), eq(categories.isActive, true)))
        .orderBy(desc(importLines.decidedAt)).limit(2000).all();
      const examples = new Map<string, string>();
      for (const { label, category } of rows) {
        const key = recognitionKey(label);
        if (key && !examples.has(key) && examples.size < EXAMPLE_LIMIT) examples.set(key, category);
      }
      return {
        categories: activeCategories().map(({ id, name, kind }) => ({ id, name, kind })),
        accounts: activeAccounts(),
        examples: [...examples].map(([label, category]) => ({ label, category })),
      };
    },
    /**
     * Applique un lot de décisions. Sans `confirm`, tout est joué puis annulé :
     * le résultat dit ce qui passerait. Une décision refusée reste dans la file
     * sans faire échouer les autres.
     */
    apply(tokens: string[], options: { confirm: boolean }) {
      const decisions = parseDecisions(tokens);
      const runId = randomUUID();
      const applied: { line: string; action: 'create' | 'link' }[] = [];
      const refused: { line: string; reason: string }[] = [];
      try {
        db.transaction(() => {
          for (const decision of decisions) {
            try {
              applied.push({ line: decision.lineId, action: db.transaction(() => decide(decision, runId)) });
            } catch (error) {
              // Un refus de l'app est écrit pour être lu ; toute autre erreur
              // (validation, SQLite) pourrait décrire la base.
              refused.push({ line: decision.lineId, reason: error instanceof Error && !(error instanceof z.ZodError) && !('code' in error) ? error.message : 'Refusée.' });
            }
          }
          if (!options.confirm) throw new DryRun();
        });
      } catch (error) {
        if (!(error instanceof DryRun)) throw error;
      }
      return { run: options.confirm && applied.length > 0 ? runId : null, written: options.confirm, applied, refused };
    },
    /**
     * Annule un lot : un mouvement créé est supprimé, un mouvement rattaché est
     * détaché et retrouve sa date, et la ligne revient dans la file. Une ligne
     * que François a modifiée depuis (mouvement supprimé, rapproché autrement)
     * est laissée telle quelle.
     */
    undo(runId: string) {
      z.uuid().parse(runId);
      return db.transaction(() => {
        const decisions = db.select().from(importAgentDecisions).where(and(
          eq(importAgentDecisions.ownerId, ownerId), eq(importAgentDecisions.runId, runId), isNull(importAgentDecisions.undoneAt),
        )).all();
        if (decisions.length === 0) throw new Error('Lot introuvable, ou déjà annulé.');
        let undone = 0;
        for (const decision of decisions) {
          try {
            db.transaction(() => {
              imports.reopenLine(decision.lineId, decision.transactionId);
              if (decision.action === 'create') {
                budget.deleteTransaction(decision.transactionId);
              } else if (decision.previousOccurredOn) {
                const current = db.select().from(transactions).where(and(eq(transactions.id, decision.transactionId), eq(transactions.ownerId, ownerId))).get();
                if (!current || current.kind === 'transfer') throw new Error('Transaction introuvable.');
                budget.updateTransaction({
                  id: current.id, accountId: current.accountId, categoryId: current.categoryId!, kind: current.kind, amountCents: Math.abs(current.amountCents),
                  occurredOn: decision.previousOccurredOn, note: current.note, recurringCommitmentId: current.recurringCommitmentId,
                });
              }
              db.update(importAgentDecisions).set({ undoneAt: new Date().toISOString() }).where(eq(importAgentDecisions.id, decision.id)).run();
            });
          } catch {
            continue;
          }
          undone++;
        }
        return { undone, kept: decisions.length - undone };
      });
    },
    /** Les derniers lots de l'agent, pour retrouver celui à annuler. */
    runs() {
      return db.select({
        run: importAgentDecisions.runId, at: max(importAgentDecisions.createdAt), decisions: count(),
        undone: sql<number>`sum(case when ${importAgentDecisions.undoneAt} is not null then 1 else 0 end)`,
      }).from(importAgentDecisions).where(eq(importAgentDecisions.ownerId, ownerId))
        .groupBy(importAgentDecisions.runId).orderBy(desc(max(importAgentDecisions.createdAt))).limit(RUN_LIMIT).all();
    },
  };
}

/** Lit la ligne de commande du script. Toute forme inattendue est refusée. */
export function runAgentCommand(db: FinanceDatabase, ownerId: string, args: string[]) {
  const agent = importAgent(db, ownerId);
  const [command, ...rest] = args;
  if (command === 'list' && rest.length === 0) return agent.list();
  if (command === 'context' && rest.length === 0) return agent.context();
  if (command === 'runs' && rest.length === 0) return agent.runs();
  if (command === 'undo' && rest.length === 1) return agent.undo(rest[0]);
  if (command === 'apply') {
    const confirm = rest[0] === '--confirm';
    return agent.apply(confirm ? rest.slice(1) : rest, { confirm });
  }
  throw new Error(USAGE);
}
