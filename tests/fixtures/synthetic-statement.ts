/**
 * Relevé Caisse d'Épargne SYNTHÉTIQUE : même mise en page que le relevé
 * mensuel réel (colonnes, rubriques, compléments de libellé, changement de
 * page, ligne « FRAIS BANCAIRES… »), avec des noms et montants inventés.
 * Aucun vrai relevé n'entre dans le dépôt.
 */
export type Text = [x: number, y: number, text: string];

export const page1: Text[] = [
  [43, 392, 'DETAIL DE VOS OPERATIONS'],
  [43, 366, 'COMPTE DE DEPOT - N° 00000000001'],
  [61, 353, 'DATE'], [125, 353, 'DATE DE'], [512, 353, 'MONTANT'],
  [184, 349, 'DETAIL DES OPERATIONS'],
  [45, 345, "D'OPERATION"], [125, 345, 'VALEUR'], [520, 344, 'EN EUR'],
  [51, 330, 'SOLDE CREDITEUR AU 31/08/2026'], [527, 330, '+ 100,00'],
  [184, 318, 'VIREMENTS RECUS'],
  [54, 305, '02/09/2026'], [122, 305, '02/09/2026'], [184, 305, 'VIR SEPA EMPLOYEUR EXEMPLE'], [515, 305, '+ 2 000,50'],
  [184, 297, 'Virement EMPLOYEUR EXEMPLE'],
  [184, 288, "-Réf. donneur d'ordre : EXEMPLE-0001"],
  [184, 275, 'FRAIS BANCAIRES ET COTISATIONS POUR UN TOTAL DE - 2,00 €'],
  [54, 263, '10/09/2026'], [122, 263, '10/09/2026'], [184, 263, '*COM CB INT BOUTIQUE'], [532, 263, '- 2,00'],
  [185, 219, 'PAIEMENTS carte bancaire N° 0000 TITULAIRE EXEMPLE'],
  [54, 207, '03/09/2026'], [122, 207, '03/09/2026'], [184, 207, 'CB BOULANGERIE'], [256, 207, 'FACT 010926'], [528, 207, '- 12,40'],
  [54, 192, '15/09/2026'], [122, 192, '15/09/2026'], [184, 192, 'CB LIBRAIRIE EXEMPLE FACT 140926'], [528, 192, '- 30,00'],
  [184, 99, 'PRELEVEMENTS'],
  [54, 87, '05/09/2026'], [122, 87, '05/09/2026'], [184, 87, 'PRLV Operateur Exemple'], [528, 87, '- 20,00'],
  [14, 84, 'EN000000000000000'],
  [28, 48, 'Mentions légales du pied de page, capital social de 1 000 000 euros'],
];

export const page2: Text[] = [
  [389, 806, 'Relevé n°1 au 30/09/2026 - Page 2 /'], [524, 806, '2'],
  [61, 730, 'DATE'], [127, 730, 'DATE DE'], [184, 730, 'DETAIL DES OPERATIONS'], [512, 730, 'MONTANT'],
  [45, 722, "D'OPERATION"], [128, 722, 'VALEUR'], [184, 722, 'COMPTE DE DEPOT N° 00000 00000 00000000001 (suite)'], [522, 723, 'EN EUR'],
  [184, 710, 'Operateur Exemple 0000'],
  [54, 678, '20/09/2026'], [122, 678, '20/09/2026'], [184, 678, 'VIR SEPA VERS EPARGNE'], [517, 678, '- 1 000,00'],
  [184, 671, 'VIREMENT VERS EPARGNE'],
  [51, 625, 'SOLDE CREDITEUR AU 30/09/2026'], [522, 625, '+ 1 036,10'],
];

const escape = (text: string) => text.replace(/[\\()]/g, (character) => `\\${character}`);

/**
 * Un PDF minimal mais valide (Helvetica, WinAnsi) qui pose chaque texte à sa
 * position. Écrit à la main pour ne dépendre d'aucune bibliothèque de test.
 */
export function syntheticPdf(pages: Text[][] = [page1, page2]): Uint8Array<ArrayBuffer> {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((texts, index) => {
    const content = texts.map(([x, y, text]) => `BT /F1 7 Tf ${x} ${y} Td (${escape(text)}) Tj ET`).join('\n');
    objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[index] + 1} 0 R >>`;
    objects[pageIds[index] + 1] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
  });
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(body, 'latin1');
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'latin1'));
}
