import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const URL = 'http://localhost:4173/';

test('Audit UX & Centre de Rapport d\'Impact : Billet Peak-End, Formateur 1-tap, Écran Public dynamique & Excel 3 onglets', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.goto(URL);

  // 1. Créer un Réparothon et inscrire un appareil
  await page.getByRole('radio', { name: /^Réparothon/ }).click();
  await page.locator('#eventName').fill('Réparothon Impact CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  await page.getByRole('group', { name: "Catégorie d'appareil" }).getByRole('button', { name: 'Portable' }).click();
  await page.getByRole('group', { name: "Marque de l'appareil" }).getByRole('button', { name: 'Lenovo' }).click();
  await page.getByRole('group', { name: 'Gamme ou modèle' }).getByRole('button', { name: 'ThinkPad' }).click();
  await page.getByRole('group', { name: 'Domaine du problème' }).getByRole('button', { name: /Problème Matériel/i }).click();
  await page.getByRole('group', { name: "Symptômes de l'appareil" }).getByRole('button', { name: /Surchauffe \/ Nettoyage/i }).click();
  await page.getByRole('button', { name: /^Continuer/i }).click();
  await page.getByRole('button', { name: /Inscrire le participant/i }).click();

  await page.locator('#rp-displayName').fill('Sophie Côté');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#rp-phone').fill('514 555-1234');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#rp-consentActivity').check();
  await page.getByRole('button', { name: /Valider et enregistrer 1 appareil/i }).click();

  // Vérifier le Billet de Confirmation Visiteur (« Peak-End Rule »)
  await expect(page.getByText(/Billet de Confirmation/i)).toBeVisible();
  await expect(page.getByText(/Bienvenue Sophie Côté !/i)).toBeVisible();
  await expect(page.getByText(/Attente estimée :/i)).toBeVisible();
  await page.getByRole('button', { name: /Inscrire le prochain visiteur/i }).click();
  await expect(page.getByText(/Billet de Confirmation/i)).toHaveCount(0);

  // 2. Vérifier le badge dynamique sur l'Écran Public (ne doit plus afficher « Concours Insertech »)
  await page.getByRole('tab', { name: 'Écran Public' }).click();
  await expect(page.getByText('Concours Insertech')).toHaveCount(0);
  await page.mouse.move(100, 100);
  await page.getByRole('button', { name: /Basculer vers la console/i }).click();

  // 3. Ouvrir le Centre de Rapport d'Impact et télécharger le classeur Excel (.xlsx) à 3 onglets
  await page.getByTestId('btn-open-impact-report').click();
  await expect(page.getByRole('heading', { name: /Centre de Rapport d'Impact/i })).toBeVisible();
  await expect(page.getByText(/1\. Impact Écologique/i)).toBeVisible();
  await expect(page.getByText(/2\. Opérations & Boutique/i)).toBeVisible();
  await expect(page.getByText(/3\. Mobilisation & Loi 25/i)).toBeVisible();
  await expect(page.getByText(/4\. Pédagogie Formation/i)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Rapport Excel Complet \(\.xlsx — 3 onglets\)/i }).click()
  ]);

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(readFileSync(await download.path()));
  expect(workbook.SheetNames).toEqual(["Sommaire d'Impact", 'Données Détaillées', 'Équipe & Tables']);

  expect(errors).toEqual([]);
});
