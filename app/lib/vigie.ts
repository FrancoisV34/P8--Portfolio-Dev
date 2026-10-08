// Vigie, côté navigateur : le SDK envoie ses erreurs au tunnel de l'application (même origine,
// aucun CORS). La clé du DSN est **publique par nature** (lisible dans le JavaScript) : elle filtre
// le bruit, elle ne protège rien. La protection du tunnel, ce sont ses limites (taille, origine,
// quota par IP) — voir app/.server/vigie.server.ts.
export const VIGIE_CLE_NAVIGATEUR = '79c4a8a5d9499ec8ea0e784fb2f1a98f';
export const VIGIE_TUNNEL = '/_vigie/enveloppe';
export const VIGIE_DSN_NAVIGATEUR = `https://${VIGIE_CLE_NAVIGATEUR}@vigie.invalid/1`;
