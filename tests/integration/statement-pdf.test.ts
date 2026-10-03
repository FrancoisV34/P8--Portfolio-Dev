import { describe, expect, it } from 'vitest';
import { readCaisseEpargneStatement } from '../../app/.server/imports/caisse-epargne';
import { pdfRows, StatementError } from '../../app/.server/imports/pdf-rows.server';
import { page1, page2, syntheticPdf, type Text } from '../fixtures/synthetic-statement';

const read = async (pages?: Text[][]) => readCaisseEpargneStatement(await pdfRows(syntheticPdf(pages)));
const withoutRow = (texts: Text[], row: number) => texts.filter(([, y]) => y !== row);
const replaced = (texts: Text[], from: string, to: string) => texts.map(([x, y, text]): Text => [x, y, text === from ? to : text]);

describe('relevé PDF Caisse d’Épargne', () => {
  it('lit chaque opération, sur deux pages, et ignore rubriques, compléments et pied de page', async () => {
    const statement = await read();
    expect(statement).toMatchObject({ openingCents: 10_000, closingCents: 103_610, closingOn: '2026-09-30' });
    expect(statement.lines.map(({ occurredOn, label, amountCents }) => [occurredOn, label, amountCents])).toEqual([
      ['2026-09-02', 'VIR SEPA EMPLOYEUR EXEMPLE', 200_050],
      ['2026-09-10', '*COM CB INT BOUTIQUE', -200],
      ['2026-09-03', 'CB BOULANGERIE FACT 010926', -1_240],
      ['2026-09-15', 'CB LIBRAIRIE EXEMPLE FACT 140926', -3_000],
      ['2026-09-05', 'PRLV Operateur Exemple', -2_000],
      ['2026-09-20', 'VIR SEPA VERS EPARGNE', -100_000],
    ]);
    // Le texte lu est gardé tel quel, pour être montré à côté de la correction.
    expect(statement.lines[0]).toMatchObject({ rawDate: '02/09/2026', rawAmount: '+ 2 000,50' });
  });

  it('refuse tout le relevé si une opération manque au contrôle du solde', async () => {
    await expect(read([withoutRow(page1, 207), page2])).rejects.toThrow(/solde de fin/);
    await expect(read([[...page1, [54, 150, '16/09/2026'], [122, 150, '16/09/2026'], [184, 150, 'CB EN TROP'], [528, 150, '- 1,00']], page2])).rejects.toThrow(/solde de fin/);
    await expect(read([replaced(page1, '- 20,00', '+ 20,00'), page2])).rejects.toThrow(/solde de fin/);
  });

  it('refuse un relevé sans solde de fin, ou qui détaille plusieurs comptes', async () => {
    await expect(read([page1])).rejects.toThrow(StatementError);
    const second: Text[] = [
      [51, 500, 'SOLDE CREDITEUR AU 31/08/2026'], [527, 500, '+ 1,00'],
      [51, 400, 'SOLDE CREDITEUR AU 30/09/2026'], [527, 400, '+ 1,00'],
    ];
    await expect(read([page1, page2, second])).rejects.toThrow(/plusieurs comptes/);
  });

  it('refuse une ligne datée dont le montant ne se lit pas, plutôt que de la sauter', async () => {
    await expect(read([replaced(page1, '- 12,40', '12.40'), page2])).rejects.toThrow(/illisible/);
  });

  it('refuse un solde dont le signe contredit le libellé', async () => {
    await expect(read([replaced(page1, '+ 100,00', '- 100,00'), page2])).rejects.toThrow(/solde/);
  });

  it('refuse ce qui n’est pas un PDF lisible, sans détailler l’erreur interne', async () => {
    await expect(pdfRows(new Uint8Array())).rejects.toThrow(StatementError);
    await expect(pdfRows(new TextEncoder().encode('date;libelle;montant\n'))).rejects.toThrow('Ce fichier n’est pas un PDF.');
    await expect(pdfRows(new TextEncoder().encode('%PDF-1.4\ncassé'))).rejects.toThrow('Ce PDF ne peut pas être lu.');
    await expect(pdfRows(new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow(/5 Mo/);
  });

  it('refuse un PDF de plus de 20 pages', async () => {
    await expect(pdfRows(syntheticPdf(Array.from({ length: 21 }, () => page2)))).rejects.toThrow(/20 pages/);
  });
});
