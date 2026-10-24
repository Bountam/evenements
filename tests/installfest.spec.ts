import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const URL = pathToFileURL(path.resolve('dist/index.html')).href;

// Parcours complet d'un Install Fest : bénévole, inscription, assignation, installation réussie
test('Install Fest : inscription, assignation et installation terminée', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  await page.getByRole('radio', { name: /Install Fest/ }).click();
  await page.locator('#eventName').fill('Install Fest CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  await page.getByRole('tab', { name: 'Bénévoles' }).click();
  await page.getByLabel('Nom', { exact: true }).fill('Gabriel Roy');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).first().click();
  await expect(page.getByText('0/2 ordinateurs')).toBeVisible();

  await page.getByRole('tab', { name: 'Accueil et suivi' }).click();
  await page.getByLabel('Nom de la personne').fill('Martine Bouchard');
  await page.getByLabel('Marque et modèle').fill('Lenovo T450');
  await page.getByLabel('OS précédent').selectOption('windows_7');
  await page.getByLabel('Distribution choisie').selectOption('Zorin OS');
  await page.getByLabel(/Double démarrage/).first().check();
  await page.getByRole('button', { name: 'Inscrire' }).click();
  await expect(page.getByText(/Lenovo T450 · Windows 7/)).toBeVisible();

  await page.getByLabel("Assigner l'ordinateur de Martine Bouchard").selectOption({ label: 'Gabriel Roy · 0/2' });
  await expect(page.getByText('En installation · Gabriel Roy')).toBeVisible();

  await page.getByRole('button', { name: 'Terminé', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Linux installé !' })).toBeVisible();
  await expect(page.getByText('Installé par Gabriel Roy')).toBeVisible();

  expect(errors).toEqual([]);
});
