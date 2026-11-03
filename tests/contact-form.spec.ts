import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

// Formulaire de contact commun : validation des champs au kiosque-concours
test('Formulaire de contact : validation, formats canadiens et questionnaire bénévole', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await openContest(page);

  // Prénom et nom obligatoires
  await submit(page);
  await expect(page.getByText('Indiquez le prénom.')).toBeVisible();
  await expect(page.getByText('Indiquez le nom de famille.')).toBeVisible();
  await expect(page.locator('#participant-firstName')).toBeFocused();

  // Au concours, un courriel ou un téléphone est requis
  await page.locator('#participant-firstName').fill('Martine');
  await page.locator('#participant-lastName').fill('Bouchard');
  await submit(page);
  await expect(page.getByText('Indiquez au moins un courriel ou un téléphone.')).toBeVisible();

  // Téléphone et code postal canadiens
  await page.locator('#participant-phone').fill('123');
  await page.locator('#participant-postalCode').fill('12345');
  await submit(page);
  await expect(page.getByText('Numéro à 10 chiffres attendu, par exemple 514 555-1234.')).toBeVisible();
  await expect(page.getByText('Code postal canadien attendu, par exemple H2W 1Y4.')).toBeVisible();
  await page.getByLabel('Hors Canada').check();
  await page.locator('#participant-phone').fill('(514) 555-1234');
  await submit(page);
  await expect(page.getByText('Code postal canadien attendu, par exemple H2W 1Y4.')).toHaveCount(0);
  await page.getByLabel('Hors Canada').uncheck();
  await page.locator('#participant-postalCode').fill('h2w1y4');

  // Consentement au concours requis
  await submit(page);
  await expect(page.getByText('Cochez ce consentement ou retirez les coordonnées.')).toBeVisible();
  await page.locator('#participant-consentActivity').check();

  // Questionnaire bénévole : rôles, puis compétences techniques seulement si Technique est coché
  await page.getByLabel('Je souhaite donner des heures de bénévolat').check();
  await expect(page.getByRole('group', { name: /Comment aimeriez-vous aider/ })).toBeVisible();
  await expect(page.getByLabel('Soudure')).toHaveCount(0);
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
  await expect(page.locator('#participant-firstName')).toHaveValue('');

  // Un même téléphone signale un doublon
  await page.locator('#participant-firstName').fill('Autre');
  await page.locator('#participant-lastName').fill('Personne');
  await page.locator('#participant-phone').fill('+1 514 555 1234');
  await page.locator('#participant-consentActivity').check();
  await submit(page);
  await expect(page.getByText('Participant déjà inscrit')).toBeVisible();

  expect(errors).toEqual([]);
});

// Même formulaire au réparothon et dans les autres activités : consentement requis dès qu'une coordonnée est saisie
test('Formulaire de contact : réparothon et activité générique', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  await page.getByRole('radio', { name: /^Réparothon/ }).click();
  await page.locator('#eventName').fill('Réparothon CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await page.locator('#rp-firstName').fill('Sophie');
  await page.locator('#rp-lastName').fill('Côté');
  await page.locator('#rp-phone').fill('438 555 9876');
  await page.getByPlaceholder('Ex. Asus ZenBook 14 ou Samsung S21').fill('Samsung S20');
  await page.getByPlaceholder("Ex. L'ordinateur surchauffe et s'éteint après 5 minutes de jeu.").fill('Écran fissuré');
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.getByText('Cochez ce consentement ou retirez les coordonnées.')).toBeVisible();
  await page.locator('#rp-consentActivity').check();
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.getByRole('heading', { name: 'Sophie Côté' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Menu principal' }).click();
  await page.getByRole('radio', { name: /Fresque du Numérique/ }).click();
  await page.locator('#eventName').fill('Fresque CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await page.locator('#att-firstName').fill('Jean');
  await page.locator('#att-lastName').fill('Tremblay');
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.getByText('Jean Tremblay').first()).toBeVisible();

  expect(errors).toEqual([]);
});
