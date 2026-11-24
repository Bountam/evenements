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
  await page.getByRole('group', { name: "Catégorie d'appareil" }).getByRole('button', { name: 'Cellulaire' }).click();
  await page.getByRole('group', { name: "Marque de l'appareil" }).getByRole('button', { name: 'Samsung' }).click();
  await page.getByRole('group', { name: 'Gamme ou modèle' }).getByRole('button', { name: 'Galaxy S' }).click();
  await page.getByRole('group', { name: 'Domaine du problème' }).getByRole('button', { name: /Problème Matériel/i }).click();
  await page.getByRole('group', { name: "Symptômes de l'appareil" }).getByRole('button', { name: /Écran \/ Clavier \/ Boîtier/i }).click();
  await page.getByRole('button', { name: /^Continuer/i }).click();
  await page.getByRole('button', { name: /Inscrire le participant/i }).click();
  await page.locator('#rp-firstName').fill('Sophie');
  await page.locator('#rp-lastName').fill('Côté');
  await page.locator('#rp-phone').fill('438 555 9876');
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
  await page.locator('#att-firstName').fill('Jean');
  await page.locator('#att-lastName').fill('Tremblay');
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.getByText('Jean Tremblay').first()).toBeVisible();

  expect(errors).toEqual([]);
});

// Bouton permanent « Devenir bénévole » : depuis le menu principal, la fiche va au registre des bénévoles
test('Devenir bénévole : sondage autonome et registre des bénévoles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  await page.getByRole('button', { name: 'Devenir bénévole' }).click();
  const dialog = page.getByRole('dialog', { name: 'Devenir bénévole' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Je souhaite donner des heures de bénévolat')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog.getByText('Choisissez au moins un rôle.')).toBeVisible();

  await dialog.locator('#vol-firstName').fill('Gabriel');
  await dialog.locator('#vol-lastName').fill('Roy');
  await dialog.locator('#vol-email').fill('gabriel@exemple.com');
  await dialog.getByLabel('Accueil', { exact: true }).check();
  await dialog.locator('#vol-birthDay').selectOption('31');
  await dialog.locator('#vol-birthMonth').selectOption('2');
  await dialog.locator('#vol-consentVolunteer').check();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog.getByText("Date d'anniversaire invalide.")).toBeVisible();
  await dialog.locator('#vol-birthDay').selectOption('29');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Merci ! Fiche bénévole enregistrée.')).toBeVisible();
  await expect(dialog.locator('#vol-firstName')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Annuler' }).click();

  await expect(page.getByText('Registre des bénévoles').first()).toBeVisible();
  expect(errors).toEqual([]);
});

// Export global : un seul onglet « Contacts », une colonne Oui par rôle pour filtrer dans Excel
test('Exporter tous les contacts : un onglet, colonnes de ciblage', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);
  await page.getByRole('button', { name: 'Devenir bénévole' }).click();
  const dialog = page.getByRole('dialog', { name: 'Devenir bénévole' });
  await dialog.locator('#vol-firstName').fill('Nadia');
  await dialog.locator('#vol-lastName').fill('Pelletier');
  await dialog.getByRole('button', { name: 'Iel / ellui' }).click();
  await dialog.locator('#vol-phone').fill('5145551234');
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

// Réparothon : 1 question par écran, problèmes allégés avec icônes, sobriété Étape 3 et Étape 4 Bénévolat conditionnelle
test("Réparothon : Étape 4 bénévolat conditionnelle et sobriété de l'Étape 3", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto(URL);

  await page.getByRole('radio', { name: /^Réparothon/ }).click();
  await page.locator('#eventName').fill('Réparothon Étape 4 CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  // 1 seule question affichée à la fois : Catégorie d'abord (Marque/Modèle/Problème masqués)
  await expect(page.getByRole('group', { name: "Catégorie d'appareil" })).toBeVisible();
  await expect(page.getByRole('group', { name: "Marque de l'appareil" })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Gamme ou modèle' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Domaine du problème' })).toHaveCount(0);

  // Enchaînement automatique : Catégorie -> Marque -> Modèle -> Domaine -> 4 cartes Problème
  await page.getByRole('group', { name: "Catégorie d'appareil" }).getByRole('button', { name: 'Portable' }).click();
  await expect(page.getByRole('group', { name: "Catégorie d'appareil" })).toHaveCount(0);
  await page.getByRole('group', { name: "Marque de l'appareil" }).getByRole('button', { name: 'Lenovo' }).click();
  await page.getByRole('group', { name: 'Gamme ou modèle' }).getByRole('button', { name: 'ThinkPad' }).click();
  await page.getByRole('group', { name: 'Domaine du problème' }).getByRole('button', { name: /Problème Matériel/i }).click();

  // Exactement 4 cartes de problèmes matériels affichées, multi-sélection possible
  const symptomButtons = page.getByRole('group', { name: "Symptômes de l'appareil" }).getByRole('button');
  await expect(symptomButtons).toHaveCount(4);
  await page.getByRole('button', { name: /Alimentation \/ Batterie/i }).click();
  await page.getByRole('button', { name: /Surchauffe \/ Nettoyage/i }).click();
  await page.getByRole('button', { name: /^Continuer/i }).click();

  // Écran dédié « Avez-vous un autre appareil à inscrire ? » (OS modifiable discrètement ici)
  await expect(page.getByRole('heading', { name: /Avez-vous un autre appareil à inscrire/i })).toBeVisible();
  await expect(page.getByLabel(/Système d'exploitation de/i)).toHaveValue('windows');
  await expect(page.getByRole('button', { name: /\+ Ajouter un autre appareil/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Inscrire le participant/i }).click();

  // Étape 3 : formulaire Participant seul à l'écran, sans panier empilé ni questions dépliées
  await expect(page.getByRole('heading', { name: /3\. Inscription d'un participant/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Avez-vous un autre appareil/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Devenir bénévole' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Étape 4/ })).toHaveCount(0);

  // Cocher « Je souhaite donner des heures de bénévolat » ajoute l'Étape 4 sans déplier les questions sur l'Étape 3
  await page.getByLabel('Je souhaite donner des heures de bénévolat').check();
  await expect(page.getByRole('button', { name: /Étape 4\s+Bénévolat/i })).toBeVisible();
  await expect(page.getByText('Comment aimeriez-vous aider ? *')).toHaveCount(0);

  const nextStep4Btn = page.getByRole('button', { name: /Étape 4 : Questions bénévolat/i });
  await expect(nextStep4Btn).toBeVisible();

  // La validation Loi 25 des coordonnées bloque le passage vers l'Étape 4 si incomplet
  await nextStep4Btn.click();
  await expect(page.getByText('Indiquez le prénom.')).toBeVisible();
  await expect(page.getByText('Indiquez le nom de famille.')).toBeVisible();
  await expect(page.getByText('Indiquez au moins un courriel ou un téléphone.')).toBeVisible();
  await expect(page.getByText('Comment aimeriez-vous aider ? *')).toHaveCount(0);

  // Remplir les coordonnées + pronoms inclusifs + consentement activité puis passer à l'Étape 4
  await page.locator('#rp-firstName').fill('Marc');
  await page.locator('#rp-lastName').fill('Lavoie');
  await page.getByRole('button', { name: 'Autre', exact: true }).click();
  await page.locator('#rp-pronounsCustom').fill('il / iel');
  await page.locator('#rp-phone').fill('514 555-2468');
  await nextStep4Btn.click();
  await expect(page.getByText('Cochez ce consentement ou retirez les coordonnées.')).toBeVisible();
  await page.locator('#rp-consentActivity').check();
  await nextStep4Btn.click();

  // Étape 4 : questions de bénévolat en gros boutons tactiles
  await expect(page.getByRole('heading', { name: /4\. Questions de bénévolat Insertech/i })).toBeVisible();
  await expect(page.getByText('Marc Lavoie (il / iel)')).toBeVisible();
  await expect(page.getByText('Comment aimeriez-vous aider ? *')).toBeVisible();
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
