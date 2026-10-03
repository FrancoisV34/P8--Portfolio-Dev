import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { z } from 'zod';
import { MAX_ITEMS, MAX_PAGES, MAX_PDF_BYTES } from './pdf-limits.ts';

export { MAX_PDF_BYTES } from './pdf-limits.ts';

const TIMEOUT_MS = 10_000;
// Tas du processus de lecture : un relevé de 20 pages en utilise une
// vingtaine de mégaoctets ; au-delà, c'est un fichier piégé.
const CHILD_HEAP_MB = 128;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
// `nobody` : quand le serveur tourne en root (image Docker), le lecteur perd
// ses droits. La base et ses sauvegardes, en 0600 root, lui restent fermées
// même si un PDF piégé y prenait la main.
const UNPRIVILEGED = 65_534;

export type PdfCell = { x: number; text: string };
export type PdfRow = { page: number; y: number; cells: PdfCell[] };

/** Erreur dont le message peut être montré tel quel au propriétaire. */
export class StatementError extends Error {}

const childOutput = z.union([
  z.object({
    rows: z.array(z.object({
      page: z.number().int().min(1).max(MAX_PAGES), y: z.number(),
      cells: z.array(z.object({ x: z.number(), text: z.string().max(1000) }).strict()).min(1).max(MAX_ITEMS),
    }).strict()).max(MAX_ITEMS),
  }).strict(),
  z.object({ error: z.enum(['pages', 'items', 'unreadable']) }).strict(),
]);

// Le chemin est résolu depuis la racine du projet, pas depuis ce module :
// une fois le serveur assemblé par Vite, `import.meta.url` désigne le bundle.
const childScript = () => join(process.cwd(), 'app', '.server', 'imports', 'pdf-child.ts');

/**
 * Le texte d'un PDF natif, regroupé en lignes visuelles de haut en bas, chaque
 * ligne gardant l'abscisse de ses morceaux.
 *
 * ⚠️ **Le fichier est hostile par principe**, même déposé par le propriétaire.
 * Il est lu dans un processus séparé (`pdf-child.ts`) : tas plafonné, aucune
 * variable d'environnement, sans droit sur la base, tué sans appel au délai.
 * Mesuré le 3 octobre 2026 : un PDF de 160 Ko qui se décompresse en 64 Mo de
 * texte faisait monter le serveur lui-même à 1 Go pendant 15 s — de quoi faire
 * tomber la Machine de 512 Mo. La version de pdfjs-dist est épinglée au-delà des correctifs
 * CVE-2024-4367 et CVE-2026-16633.
 */
export async function pdfRows(bytes: Uint8Array): Promise<PdfRow[]> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES) throw new StatementError('Le fichier doit être un PDF de 5 Mo au plus.');
  if (new TextDecoder('latin1').decode(bytes.subarray(0, 5)) !== '%PDF-') throw new StatementError('Ce fichier n’est pas un PDF.');

  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [`--max-old-space-size=${CHILD_HEAP_MB}`, childScript()], {
      env: {}, stdio: ['pipe', 'pipe', 'ignore'], timeout: TIMEOUT_MS, killSignal: 'SIGKILL',
      ...(process.getuid?.() === 0 ? { uid: UNPRIVILEGED, gid: UNPRIVILEGED } : {}),
    });
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_OUTPUT_BYTES) child.kill('SIGKILL');
      else chunks.push(chunk);
    });
    child.on('error', () => reject(new StatementError('Ce PDF ne peut pas être lu.')));
    child.on('close', (code) => {
      if (code === 0 && size <= MAX_OUTPUT_BYTES) resolve(Buffer.concat(chunks).toString('utf8'));
      // Tué au délai, par le noyau faute de mémoire, ou mort sur son plafond de tas.
      else reject(new StatementError('Ce PDF ne peut pas être lu : il a demandé trop de temps ou de mémoire.'));
    });
    // Un processus mort avant d'avoir tout lu ferme son entrée : l'erreur
    // d'écriture qui s'ensuit est déjà traitée par `close`.
    child.stdin.on('error', () => {});
    child.stdin.end(bytes);
  });

  let parsed: z.infer<typeof childOutput>;
  try { parsed = childOutput.parse(JSON.parse(raw)); } catch { throw new StatementError('Ce PDF ne peut pas être lu.'); }
  if ('error' in parsed) {
    if (parsed.error === 'pages') throw new StatementError(`Un relevé de plus de ${MAX_PAGES} pages n’est pas pris en charge.`);
    if (parsed.error === 'items') throw new StatementError('Ce PDF contient trop de texte pour un relevé.');
    throw new StatementError('Ce PDF ne peut pas être lu.');
  }
  return parsed.rows;
}
