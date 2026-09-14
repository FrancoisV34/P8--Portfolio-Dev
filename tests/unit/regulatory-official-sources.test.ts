import { describe, expect, it } from 'vitest';
import { inspectOfficialRegulatorySource } from '../../app/.server/regulatory/official-sources';

describe('inspection des sources réglementaires officielles', () => {
  it('hachera le contenu d’une URL fixe sans conserver son texte', async () => {
    const result = await inspectOfficialRegulatorySource('micro-bic-services', async () => new Response('contenu officiel', { status: 200 }));
    expect(result).toMatchObject({ available: true, statusCode: 200, sourceUrl: 'https://www.impots.gouv.fr/professionnel/tva', contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it('masque une indisponibilité réseau au lieu de conserver une erreur externe', async () => {
    const result = await inspectOfficialRegulatorySource('sasu-dividends', async () => { throw new Error('réseau indisponible'); });
    expect(result).toEqual({ sourceUrl: 'https://mon-entreprise.urssaf.fr/simulateurs/sasu', contentHash: null, statusCode: null, available: false });
  });
});
