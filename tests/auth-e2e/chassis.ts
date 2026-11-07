import { expect, type Page } from '@playwright/test';

/**
 * La barre latérale et les onglets sont tous deux dans la page ; seule la
 * feuille de l'espace privé cache celui qui ne correspond pas à la largeur.
 * Tant qu'elle n'est pas appliquée, chaque lien de section existe en double et
 * un clic échoue (« strict mode violation »). On attend donc qu'un seul menu
 * soit visible avant d'agir.
 */
export async function attendreChassis(page: Page) {
  await expect(page.getByRole('link', { name: 'Synthèse', exact: true })).toHaveCount(1);
}
