import { createHash } from 'node:crypto';
import type { importsRepository } from '../repositories/imports.ts';
import { readCaisseEpargneStatement } from './caisse-epargne.ts';
import { pdfRows } from './pdf-rows.server.ts';

/**
 * Lit un relevé PDF déposé et range ses opérations dans la file de validation.
 * Le fichier n'est jamais écrit sur disque : seules les lignes lues et
 * l'empreinte du fichier (qui refuse un second import du même relevé) restent.
 */
export async function importStatement(data: FormData, imports: ReturnType<typeof importsRepository>) {
  const file = data.get('statement');
  const accountId = data.get('accountId');
  if (!(file instanceof File) || typeof accountId !== 'string' || accountId.length > 64) throw new Error('invalid');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const statement = readCaisseEpargneStatement(await pdfRows(bytes));
  // Le nom du fichier ne sert qu'à reconnaître le lot dans la file ; il n'est
  // jamais utilisé comme chemin.
  const sourceName = file.name.replace(/[^\p{L}\p{N} ._=-]/gu, '').trim().slice(0, 120) || `releve-${statement.closingOn}.pdf`;
  return imports.createBatch({
    accountId, sourceKind: 'pdf', sourceName,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'), lines: statement.lines,
  });
}
