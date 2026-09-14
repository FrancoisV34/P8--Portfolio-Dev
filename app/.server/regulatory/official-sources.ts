import { createHash } from 'node:crypto';

export const officialRegulatorySources = {
  'micro-bic-services': { label: 'TVA et micro-entreprise — impots.gouv.fr', url: 'https://www.impots.gouv.fr/professionnel/tva' },
  'sasu-dividends': { label: 'SASU et dividendes — URSSAF', url: 'https://mon-entreprise.urssaf.fr/simulateurs/sasu' },
} as const;
export type OfficialRegulatorySourceKey = keyof typeof officialRegulatorySources;
export type OfficialRegulatorySourceInspection = { sourceUrl: string; contentHash: string | null; statusCode: number | null; available: boolean };
const maxBytes = 1_500_000;

export function isOfficialRegulatorySourceKey(value: string): value is OfficialRegulatorySourceKey { return Object.hasOwn(officialRegulatorySources, value); }

/** Télécharge seulement une URL officielle pré-définie, sans suivre de redirection ni conserver son contenu. */
export async function inspectOfficialRegulatorySource(key: OfficialRegulatorySourceKey, fetcher: typeof fetch = fetch): Promise<OfficialRegulatorySourceInspection> {
  const source = officialRegulatorySources[key];
  try {
    const response = await fetcher(source.url, { method: 'GET', redirect: 'error', cache: 'no-store', headers: { accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(8_000) });
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (!response.ok || !response.body || !Number.isFinite(contentLength) || contentLength > maxBytes) return { sourceUrl: source.url, contentHash: null, statusCode: response.status, available: false };
    const reader = response.body.getReader();
    const hash = createHash('sha256');
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); return { sourceUrl: source.url, contentHash: null, statusCode: response.status, available: false }; }
      hash.update(value);
    }
    return { sourceUrl: source.url, contentHash: hash.digest('hex'), statusCode: response.status, available: true };
  } catch {
    return { sourceUrl: source.url, contentHash: null, statusCode: null, available: false };
  }
}
