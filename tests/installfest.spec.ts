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
  // Étape 1 : Catégorie (auto-avance) -> Étape 2 : Modèle
  await page.getByRole('button', { name: 'Portable' }).click();
  await page.getByLabel('Marque et modèle').fill('Lenovo T450');
  await page.getByRole('button', { name: 'Suivant' }).click();
  // Étape 3 : OS précédent (auto-avance) -> Étape 4 : Distribution (auto-avance) -> Étape 5 : Options & notes
  await page.getByRole('button', { name: 'Windows 7' }).click();
  await page.getByRole('button', { name: 'Zorin OS' }).click();
  await page.getByLabel(/Double démarrage/).first().check();
  await page.getByRole('button', { name: 'Suivant' }).click();
  // Étape 6 : Coordonnées une question à la fois -> Récapitulatif -> Inscrire
  await page.locator('#if-displayName').fill('Martine Bouchard');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#if-phone').fill('514 555-1234');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#if-consentActivity').check();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Inscrire' }).click();
  await expect(page.getByText(/Lenovo T450 · Windows 7/)).toBeVisible();

  await page.getByLabel("Assigner l'ordinateur de Martine Bouchard").selectOption({ label: 'Gabriel Roy · 0/2' });
  await expect(page.getByText('En installation · Gabriel Roy')).toBeVisible();

  await page.getByRole('button', { name: 'Terminé', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Linux installé !' })).toBeVisible();
  await expect(page.getByText('Installé par Gabriel Roy')).toBeVisible();

  expect(errors).toEqual([]);
});
