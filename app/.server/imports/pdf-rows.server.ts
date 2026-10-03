import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PAGES = 20;
const MAX_ITEMS = 20_000;
const TIMEOUT_MS = 10_000;
// Deux morceaux de texte décalés de moins de 2 points appartiennent à la même
// ligne : l'en-tête d'un relevé pose « EN EUR » un point sous « D'OPERATION ».
const SAME_ROW = 2;

export type PdfCell = { x: number; text: string };
export type PdfRow = { page: number; y: number; cells: PdfCell[] };

/** Erreur dont le message peut être montré tel quel au propriétaire. */
export class StatementError extends Error {}

/**
 * Le texte d'un PDF natif, regroupé en lignes visuelles de haut en bas, chaque
 * ligne gardant l'abscisse de ses morceaux.
 *
 * ⚠️ **Le fichier est hostile par principe**, même déposé par le propriétaire :
 * taille, pages, morceaux de texte et durée sont bornés et aucune police n'est
 * chargée. Rien n'est rendu, seul le texte est lu. La version de pdfjs-dist est
 * épinglée au-delà des correctifs CVE-2024-4367 et CVE-2026-16633.
 */
export async function pdfRows(bytes: Uint8Array): Promise<PdfRow[]> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES) throw new StatementError('Le fichier doit être un PDF de 5 Mo au plus.');
  if (new TextDecoder('latin1').decode(bytes.subarray(0, 5)) !== '%PDF-') throw new StatementError('Ce fichier n’est pas un PDF.');

  // pdf.js détache le tampon qu'on lui confie : on lui en donne une copie.
  const task = getDocument({
    data: bytes.slice(), disableFontFace: true, useSystemFonts: false,
    enableXfa: false, stopAtErrors: true, verbosity: 0,
  });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StatementError('La lecture du PDF a pris trop de temps.')), TIMEOUT_MS);
  });
  try {
    return await Promise.race([read(task.promise), timeout]);
  } catch (error) {
    if (error instanceof StatementError) throw error;
    throw new StatementError('Ce PDF ne peut pas être lu.');
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}

async function read(loading: ReturnType<typeof getDocument>['promise']) {
  const document = await loading;
  if (document.numPages > MAX_PAGES) throw new StatementError(`Un relevé de plus de ${MAX_PAGES} pages n’est pas pris en charge.`);
  const rows: PdfRow[] = [];
  let items = 0;
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    items += content.items.length;
    if (items > MAX_ITEMS) throw new StatementError('Ce PDF contient trop de texte pour un relevé.');
    const cells: (PdfCell & { y: number })[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const text = item.str.replace(/[\u00a0\u202f]/g, ' ').trim();
      if (text) cells.push({ x: item.transform[4], y: item.transform[5], text });
    }
    cells.sort((a, b) => b.y - a.y || a.x - b.x);
    const pageRows: PdfRow[] = [];
    for (const { x, y, text } of cells) {
      const row = pageRows.find((candidate) => Math.abs(candidate.y - y) <= SAME_ROW);
      if (row) row.cells.push({ x, text });
      else pageRows.push({ page: number, y, cells: [{ x, text }] });
    }
    for (const row of pageRows) row.cells.sort((a, b) => a.x - b.x);
    rows.push(...pageRows);
    page.cleanup();
  }
  return rows;
}
