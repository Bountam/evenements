import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const URL = pathToFileURL(path.resolve('dist/index.html')).href;

async function openContest(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);
  await page.getByRole('radio', { name: /Kiosque-concours/ }).click();
  await page.locator('#eventName').fill('Formulaire de contact CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await page.getByRole('tab', { name: 'Participants' }).click();
}

const submit = (page: Page) => page.getByRole('button', { name: 'Inscrire le participant' }).click();

test('Formulaire de contact : identité unique, étapes 1-2-3, auto-complétion QC/courriel et marché canadien', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await openContest(page);

  // Aucune option « Hors Canada »
  await expect(page.getByText(/Hors Canada/i)).toHaveCount(0);

  // Étape 1 : un seul champ Nom, prénom ou surnom + petites bulles de pronoms neutres
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByText('Indiquez le nom, prénom ou surnom.')).toBeVisible();
  await expect(page.locator('#participant-displayName')).toBeFocused();

  await page.locator('#participant-displayName').fill('Martine Bouchard');
  await page.getByRole('button', { name: 'Elle / elle' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();

  // Étape 2 : les 2 champs Téléphone et Courriel sont affichés, 1 seul est obligatoire + pas de Hors Canada
  await expect(page.getByText(/Hors Canada/i)).toHaveCount(0);
  await submit(page);
  await expect(page.getByText('Indiquez un téléphone ou un courriel.')).toBeVisible();

  // Auto-complétion Québec : puce 514 + formatage live
  await page.getByRole('button', { name: '514', exact: true }).click();
  await expect(page.locator('#participant-phone')).toHaveValue('514');
  await page.locator('#participant-phone').fill('5145551234');
  await expect(page.locator('#participant-phone')).toHaveValue('514 555-1234');

  // Auto-complétion Courriel
  await page.locator('#participant-email').fill('martine');
  await page.getByRole('button', { name: '@gmail.com' }).click();
  await expect(page.locator('#participant-email')).toHaveValue('martine@gmail.com');

  await page.locator('#participant-postalCode').fill('h2w1y4');
  await expect(page.locator('#participant-postalCode')).toHaveValue('H2W 1Y4');

  // Consentement concours requis
  await submit(page);
  await expect(page.getByText('Cochez ce consentement ou retirez les coordonnées.')).toBeVisible();
  await page.locator('#participant-consentActivity').check();

  // Activer Étape 3 : Bénévolat conditionnelle
  await page.getByLabel('Je souhaite donner des heures de bénévolat').check();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByRole('group', { name: /Comment aimeriez-vous aider/ })).toBeVisible();
  await page.getByLabel('Technique', { exact: true }).check();
  await expect(page.getByLabel('Soudure')).toBeVisible();
  await page.getByLabel('Technique', { exact: true }).uncheck();
  await expect(page.getByLabel('Soudure')).toHaveCount(0);

  await submit(page);
  await expect(page.getByText('Choisissez au moins un rôle.')).toBeVisible();
  await expect(page.getByText('Ce consentement est requis pour le bénévolat.')).toBeVisible();
  await page.getByLabel('Accueil', { exact: true }).check();
  await page.locator('#participant-consentVolunteer').check();

  await submit(page);
  await expect(page.getByText('Martine Bouchard inscrit avec succès !')).toBeVisible();
  // Retour automatique à l'étape 1 vide
  await expect(page.locator('#participant-displayName')).toHaveValue('');

  // Un surnom seul (« Alex ») + téléphone seul fonctionne et signale un doublon si même téléphone
  await page.locator('#participant-displayName').fill('Alex');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#participant-phone').fill('514 555-1234');
  await page.locator('#participant-consentActivity').check();
  await submit(page);
  await expect(page.getByText('Participant déjà inscrit')).toBeVisible();

  expect(errors).toEqual([]);
});

test('Formulaire de contact : réparothon et activité générique', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  await page.getByRole('radio', { name: /^Réparothon/ }).click();
  await page.locator('#eventName').fill('Réparothon CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await page.getByRole('group', { name: "Catégorie d'appareil" }).getByRole('button', { name: 'Cellulaire' }).click();
  await page.getByRole('group', { name: "Marque de l'appareil" }).getByRole('button', { name: 'Samsung' }).click();
  await page.getByRole('group', { name: 'Gamme ou modèle' }).getByRole('button', { name: 'Galaxy S' }).click();
  await page.getByRole('group', { name: 'Domaine du problème' }).getByRole('button', { name: /Problème Matériel/i }).click();
  await page.getByRole('group', { name: "Symptômes de l'appareil" }).getByRole('button', { name: /Écran \/ Clavier \/ Boîtier/i }).click();
  await page.getByRole('button', { name: /^Continuer/i }).click();
  await page.getByRole('button', { name: /Inscrire le participant/i }).click();
  await page.locator('#rp-displayName').fill('Sophie Côté');
  await page.locator('#rp-phone').fill('4385559876');
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.getByText('Cochez ce consentement ou retirez les coordonnées.')).toBeVisible();
  await page.locator('#rp-consentActivity').check();
  await page.locator('form button[type="submit"]').first().click();
  await page.getByRole('tab', { name: 'Gestion Techniciens' }).click();
  await expect(page.getByText('Sophie Côté').first()).toBeVisible();

  await page.getByRole('button', { name: 'Menu principal' }).click();
  await page.getByRole('radio', { name: /Fresque du Numérique/ }).click();
  await page.locator('#eventName').fill('Fresque CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await page.locator('#att-displayName').fill('Jean Tremblay');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#att-email').fill('jean');
  await page.getByRole('button', { name: '@proton.me' }).click();
  await expect(page.locator('#att-email')).toHaveValue('jean@proton.me');
  await page.locator('#att-consentActivity').check();
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.getByText('Jean Tremblay').first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('Devenir bénévole : sondage autonome en 3 étapes et registre des bénévoles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  await page.getByRole('button', { name: 'Devenir bénévole' }).click();
  const dialog = page.getByRole('dialog', { name: 'Devenir bénévole' });
  await expect(dialog).toBeVisible();

  // Étape 1 -> Étape 2 -> Étape 3
  await dialog.locator('#vol-displayName').fill('Gabriel Roy');
  await dialog.getByRole('button', { name: 'Suivant' }).click();
  await dialog.locator('#vol-email').fill('gabriel@exemple.com');
  await dialog.getByRole('button', { name: 'Suivant' }).click();

  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog.getByText('Choisissez au moins un rôle.')).toBeVisible();

  await dialog.getByLabel('Accueil', { exact: true }).check();
  await dialog.locator('#vol-birthDay').selectOption('31');
  await dialog.locator('#vol-birthMonth').selectOption('2');
  await dialog.locator('#vol-consentVolunteer').check();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog.getByText("Date d'anniversaire invalide.")).toBeVisible();
  await dialog.locator('#vol-birthDay').selectOption('29');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Merci ! Fiche bénévole enregistrée.')).toBeVisible();
  await expect(dialog.locator('#vol-displayName')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Annuler' }).click();

  await expect(page.getByText('Registre des bénévoles').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Exporter tous les contacts : un onglet, colonnes de ciblage avec découpage auto du nom', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);
  await page.getByRole('button', { name: 'Devenir bénévole' }).click();
  const dialog = page.getByRole('dialog', { name: 'Devenir bénévole' });
  await dialog.locator('#vol-displayName').fill('Nadia Pelletier');
  await dialog.getByRole('button', { name: 'Iel / ellui' }).click();
  await dialog.getByRole('button', { name: 'Suivant' }).click();
  await dialog.locator('#vol-phone').fill('5145551234');
  await dialog.getByRole('button', { name: 'Suivant' }).click();
  await dialog.getByLabel('Technique', { exact: true }).check();
  await dialog.getByLabel('Linux', { exact: true }).check();
  await dialog.locator('#vol-consentVolunteer').check();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Merci ! Fiche bénévole enregistrée.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuler' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter tous les contacts (xlsx)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^contacts_insertech_\d{4}-\d{2}-\d{2}\.xlsx$/);

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(readFileSync(await download.path()));
  expect(workbook.SheetNames).toEqual(['Contacts']);
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.Contacts, { defval: '' });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    Activité: 'Registre des bénévoles',
    Source: 'Sondage bénévole',
    Prénom: 'Nadia',
    Nom: 'Pelletier',
    Pronoms: 'Iel / ellui',
    Téléphone: '514 555-1234',
    Bénévole: 'Oui',
    Technique: 'Oui',
    Linux: 'Oui',
    Accueil: ''
  });
});

test("Réparothon : Étape 4 bénévolat conditionnelle et sobriété de l'Étape 3", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto(URL);

  await page.getByRole('radio', { name: /^Réparothon/ }).click();
  await page.locator('#eventName').fill('Réparothon Étape 4 CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  await page.getByRole('group', { name: "Catégorie d'appareil" }).getByRole('button', { name: 'Portable' }).click();
  await page.getByRole('group', { name: "Marque de l'appareil" }).getByRole('button', { name: 'Lenovo' }).click();
  await page.getByRole('group', { name: 'Gamme ou modèle' }).getByRole('button', { name: 'ThinkPad' }).click();
  await page.getByRole('group', { name: 'Domaine du problème' }).getByRole('button', { name: /Problème Matériel/i }).click();
  await page.getByRole('button', { name: /Alimentation \/ Batterie/i }).click();
  await page.getByRole('button', { name: /Surchauffe \/ Nettoyage/i }).click();
  await page.getByRole('button', { name: /^Continuer/i }).click();
  await page.getByRole('button', { name: /Inscrire le participant/i }).click();

  await expect(page.getByRole('heading', { name: /3\. Inscription d'un participant/i })).toBeVisible();
  await page.getByLabel('Je souhaite donner des heures de bénévolat').check();

  const nextStep4Btn = page.getByRole('button', { name: /Étape 4 : Questions bénévolat/i });
  await nextStep4Btn.click();
  await expect(page.getByText('Indiquez le nom, prénom ou surnom.')).toBeVisible();
  await expect(page.getByText('Indiquez un téléphone ou un courriel.')).toBeVisible();

  await page.locator('#rp-displayName').fill('Marc Lavoie');
  await page.getByRole('button', { name: 'Autre', exact: true }).click();
  await page.locator('#rp-pronounsCustom').fill('il / iel');
  await page.locator('#rp-phone').fill('5145552468');
  await nextStep4Btn.click();
  await expect(page.getByText('Cochez ce consentement ou retirez les coordonnées.')).toBeVisible();
  await page.locator('#rp-consentActivity').check();
  await nextStep4Btn.click();

  await expect(page.getByRole('heading', { name: /4\. Questions de bénévolat Insertech/i })).toBeVisible();
  await expect(page.getByText('Marc Lavoie (il / iel)')).toBeVisible();
  await page.getByLabel('Technique', { exact: true }).check();
  await page.getByLabel('Linux', { exact: true }).check();
  await page.getByLabel("J'ai un véhicule").check();
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.locator('#rp-consentVolunteer').check();

  await page.getByRole('button', { name: /Valider et enregistrer 1 appareil/i }).click();
  await expect(page.getByText('Appareil enregistré pour Marc Lavoie !')).toBeVisible();

  await page.getByRole('tab', { name: 'Gestion Techniciens' }).click();
  await expect(page.getByText('Marc Lavoie').first()).toBeVisible();
  await expect(page.getByText('(il / iel)').first()).toBeVisible();
  await expect(page.getByText('Futur bénévole').first()).toBeVisible();

  expect(errors).toEqual([]);
});
