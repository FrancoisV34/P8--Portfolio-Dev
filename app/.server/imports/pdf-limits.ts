// Limites de lecture d'un relevé PDF, partagées par le serveur et le
// processus de lecture (`pdf-child.ts`).
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_PAGES = 20;
export const MAX_ITEMS = 20_000;
// Deux morceaux de texte décalés de moins de 2 points appartiennent à la même
// ligne : l'en-tête d'un relevé pose « EN EUR » un point sous « D'OPERATION ».
export const SAME_ROW = 2;
