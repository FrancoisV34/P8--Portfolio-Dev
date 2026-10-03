import { StatementError, type PdfRow } from './pdf-rows.server.ts';

export type StatementLine = {
  rawDate: string; rawLabel: string; rawAmount: string;
  occurredOn: string; label: string; amountCents: number;
};
export type Statement = { openingCents: number; closingCents: number; closingOn: string; lines: StatementLine[] };

const date = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const balance = /^SOLDE (DEBITEUR|CREDITEUR) AU (\d{2}\/\d{2}\/\d{4})$/;
// « - 1 494,08 » : signe toujours écrit, espace des milliers, deux décimales.
const signedAmount = /^([+-]) ?(\d{1,3}(?: \d{3})*),(\d{2})$/;
const MAX_LABEL = 240;

function isoDate(value: string) {
  const match = date.exec(value);
  if (!match) throw new StatementError('Une date du relevé est illisible.');
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function cents(value: string) {
  const match = signedAmount.exec(value);
  if (!match) return null;
  const units = Number(match[2].replaceAll(' ', ''));
  const total = units * 100 + Number(match[3]);
  if (!Number.isSafeInteger(total)) return null;
  return match[1] === '-' ? -total : total;
}

/**
 * Relevé de comptes mensuel de la Caisse d'Épargne (PDF natif).
 *
 * Une opération est une ligne qui commence par deux dates (opération, valeur)
 * et finit par un montant signé. Tout le reste est ignoré : titres de rubrique,
 * compléments de libellé sous un virement, pied de page, et la ligne « FRAIS
 * BANCAIRES… POUR UN TOTAL DE - 1,12 € », dont le montant n'est pas dans la
 * colonne des montants.
 *
 * ⚠️ **Le solde fait foi.** Ignorer des lignes n'est sûr que parce que le
 * relevé est vérifié en entier : solde de départ plus opérations lues doit
 * donner exactement le solde de fin. Une opération manquée, dédoublée ou mal
 * signée fait échouer l'import — aucune lecture partielle n'entre dans la file.
 */
export function readCaisseEpargneStatement(rows: PdfRow[]): Statement {
  let opening: { cents: number } | null = null;
  let closing: { cents: number; on: string } | null = null;
  const lines: StatementLine[] = [];

  for (const { cells } of rows) {
    const first = cells[0]?.text ?? '';
    const last = cells.at(-1)?.text ?? '';
    const solde = balance.exec(first);
    if (solde && cells.length === 2) {
      const value = cents(last);
      if (value === null || (solde[1] === 'DEBITEUR' ? value > 0 : value < 0)) throw new StatementError('Un solde du relevé est illisible.');
      if (!opening) opening = { cents: value };
      else if (!closing) closing = { cents: value, on: isoDate(solde[2]) };
      else throw new StatementError('Ce relevé détaille plusieurs comptes : ce cas n’est pas encore pris en charge.');
      continue;
    }
    if (!date.test(first)) continue;
    if (!opening || closing) throw new StatementError('Une opération figure hors du détail d’un compte : relevé non reconnu.');
    const value = cells.length >= 4 && date.test(cells[1].text) ? cents(last) : null;
    if (value === null || value === 0) throw new StatementError('Une ligne d’opération du relevé est illisible.');
    const label = cells.slice(2, -1).map((cell) => cell.text).join(' ').replace(/\s+/g, ' ').slice(0, MAX_LABEL);
    lines.push({ rawDate: first, rawLabel: label, rawAmount: last, occurredOn: isoDate(first), label, amountCents: value });
  }

  if (!opening || !closing) throw new StatementError('Ce PDF ne ressemble pas à un relevé de comptes Caisse d’Épargne.');
  if (lines.length === 0) throw new StatementError('Ce relevé ne contient aucune opération.');
  const total = lines.reduce((sum, line) => sum + line.amountCents, opening.cents);
  if (total !== closing.cents) throw new StatementError('Les opérations lues ne retombent pas sur le solde de fin du relevé : import refusé, rien n’a été ajouté.');
  return { openingCents: opening.cents, closingCents: closing.cents, closingOn: closing.on, lines };
}
