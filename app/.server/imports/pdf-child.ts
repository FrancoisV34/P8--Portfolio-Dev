/**
 * Processus jetable qui lit le texte d'un PDF. Il reçoit le fichier sur
 * l'entrée standard et rend les lignes visuelles en JSON sur la sortie.
 *
 * ⚠️ **Pourquoi un processus à part.** pdf.js travaille de façon synchrone :
 * un PDF piégé (flux compressé qui se déploie en gigaoctets, des millions de
 * morceaux de texte) bloque la boucle d'événements — aucun minuteur ne peut
 * l'interrompre — et peut épuiser la mémoire de la Machine. Ici, le parent
 * tue ce processus au délai, son tas est plafonné, il ne reçoit aucune
 * variable d'environnement (donc aucun secret), et il se désigne lui-même au
 * noyau comme premier à sacrifier en cas de manque de mémoire.
 *
 * Il n'écrit qu'un objet JSON : `{ rows }` ou `{ error: code }`. Le parent ne
 * fait jamais confiance à un message venu d'ici, seulement à ces codes.
 */
import { writeFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MAX_ITEMS, MAX_PAGES, SAME_ROW } from './pdf-limits.ts';

type Cell = { x: number; text: string };
type Row = { page: number; y: number; cells: Cell[] };

try { writeFileSync('/proc/self/oom_score_adj', '1000'); } catch { /* hors Linux */ }

class Limit extends Error {}

async function read(data: Uint8Array) {
  const task = getDocument({ data, disableFontFace: true, useSystemFonts: false, enableXfa: false, stopAtErrors: true, verbosity: 0 });
  const document = await task.promise;
  if (document.numPages > MAX_PAGES) throw new Limit('pages');
  const rows: Row[] = [];
  let items = 0;
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    items += content.items.length;
    if (items > MAX_ITEMS) throw new Limit('items');
    const cells: (Cell & { y: number })[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const text = item.str.replace(/[\u00a0\u202f]/g, ' ').trim();
      if (text) cells.push({ x: item.transform[4], y: item.transform[5], text });
    }
    cells.sort((a, b) => b.y - a.y || a.x - b.x);
    const pageRows: Row[] = [];
    for (const { x, y, text } of cells) {
      const row = pageRows.find((candidate) => Math.abs(candidate.y - y) <= SAME_ROW);
      if (row) row.cells.push({ x, text });
      else pageRows.push({ page: number, y, cells: [{ x, text }] });
    }
    for (const row of pageRows) row.cells.sort((a, b) => a.x - b.x);
    rows.push(...pageRows);
    page.cleanup();
  }
  await task.destroy();
  return rows;
}

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
let output: string;
try {
  output = JSON.stringify({ rows: await read(new Uint8Array(Buffer.concat(chunks))) });
} catch (error) {
  output = JSON.stringify({ error: error instanceof Limit ? error.message : 'unreadable' });
}
process.stdout.write(output, () => process.exit(0));
