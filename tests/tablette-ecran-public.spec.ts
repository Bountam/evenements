import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const URL = pathToFileURL(path.resolve('dist/index.html')).href;

// L'écran public est désormais réservé au Laptop (onglet Écran public ou fenêtre ?vue=public) :
// jamais proposé sur mobile/tablette.
test('Laptop Écran public : aucune commande dans la page, barre d\'en-tête auto-masquée au repos', async ({ page }) => {
  test.setTimeout(45_000);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);
  await page.getByRole('radio', { name: /Kiosque-concours/ }).click();
  await page.locator('#eventName').fill('Écran public CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  await page.getByRole('tab', { name: 'Écran public' }).click();
  await expect(page.getByText('Tableau des Champions')).toBeVisible();

  // Rien à toucher dans le corps de l'écran public
  await expect(page.locator('main').locator('button, input, select, textarea, [contenteditable="true"]')).toHaveCount(0);

  // Au repos, le bouton Mode Régie redevient accessible au mouvement de la souris
  await page.mouse.move(640, 400);
  await expect(page.getByRole('button', { name: /console d'administration/i })).toBeVisible();
  expect(erreurs).toEqual([]);
});
