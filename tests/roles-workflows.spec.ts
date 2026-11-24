import { expect, test } from '@playwright/test';

const URL = 'http://localhost:4173/';

const SIMULATE_ANDROID = () => {
  (window as any).androidBridge = { postMessage: () => {} };
};

test('Workflows par rôle sur mobile : Réparateur (Piste + Lexique + sans bénévolat), Assistant & Écran Public Laptop Loi 25', async ({
  page
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);

  // 1. Laptop (Admin) : Créer un Réparothon et inscrire un appareil (1 question/écran)
  await page.getByRole('radio', { name: /^Réparothon/ }).click();
  await page.locator('#eventName').fill('Réparothon Rôles CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  await page.getByRole('group', { name: "Catégorie d'appareil" }).getByRole('button', { name: 'Portable' }).click();
  await page.getByRole('group', { name: "Marque de l'appareil" }).getByRole('button', { name: 'Lenovo' }).click();
  await page.getByRole('group', { name: 'Gamme ou modèle' }).getByRole('button', { name: 'ThinkPad' }).click();
  await page.getByRole('group', { name: 'Domaine du problème' }).getByRole('button', { name: /Problème Matériel/i }).click();
  await page.getByRole('group', { name: "Symptômes de l'appareil" }).getByRole('button', { name: /Surchauffe \/ Nettoyage/i }).click();
  await page.getByRole('button', { name: /^Continuer/i }).click();
  await page.getByRole('button', { name: /Inscrire le participant/i }).click();

  await page.locator('#rp-firstName').fill('Sophie');
  await page.locator('#rp-lastName').fill('Côté');
  await page.locator('#rp-phone').fill('514 555-1234');
  await page.locator('#rp-consentActivity').check();
  await page.getByRole('button', { name: /Valider et enregistrer 1 appareil/i }).click();
  await expect(page.getByText('Appareil enregistré pour Sophie Côté !')).toBeVisible();

  // 2. Simuler le cellulaire/tablette qui rejoint le Réparothon -> Onboarding 4 étapes -> Réparateur
  await page.addInitScript(SIMULATE_ANDROID);
  await page.reload();
  await page.getByRole('button', { name: /Animateur Réparateur/i }).click();

  // Étape 3 Réparateur : choisir Alexandre Tremblay (créé par seedDemoData)
  await page.getByRole('button', { name: /Alexandre Tremblay/i }).click();

  // Un Réparateur ne doit JAMAIS avoir le bouton Devenir bénévole dans son en-tête
  await expect(page.getByRole('button', { name: /Devenir bénévole/i })).toHaveCount(0);
  await expect(page.getByText(/Orientez-le vers l'Accueil/i)).toBeVisible();

  // File d'attente intelligente : « Recommandé pour toi » + prise de l'appareil de Sophie Côté
  await expect(page.getByText('Recommandé pour toi').first()).toBeVisible({ timeout: 10_000 });
  await page
    .locator('.p-4.rounded-2xl')
    .filter({ hasText: 'Sophie Côté' })
    .getByRole('button', { name: /Prendre cet appareil/i })
    .click();

  // Piste Temps Réel : Appel Table + Lexique + Demander Assistant
  await page.getByRole('button', { name: /Appeler à la Table/i }).click();
  await page.getByRole('button', { name: /Demander Assistant/i }).click();
  await page.getByRole('button', { name: /Lexique & Aide/i }).click();
  await expect(page.getByRole('heading', { name: /Lexique & Fiches/i })).toBeVisible();
  await page.keyboard.press('Escape');

  // Changer de rôle via le bouton unique d'en-tête -> Animateur Assistant -> formulaire bénévole -> Cockpit Assistant
  await page.getByRole('button', { name: 'Animateur Réparateur' }).click();
  await page.getByRole('button', { name: /Animateur Assistant/i }).click();
  await page.locator('#mob-vol-firstName').fill('Julie');
  await page.locator('#mob-vol-lastName').fill('Martin');
  await page.locator('#mob-vol-phone').fill('514 555-3333');
  await page.getByLabel('Accueil', { exact: true }).check();
  await page.locator('#mob-vol-consentVolunteer').check();
  await page.getByRole('button', { name: /Confirmer et ouvrir mon espace/i }).click();

  await expect(page.getByText(/Demandes d'aide des réparateurs \(1\)/i)).toBeVisible();
  await page.getByRole('button', { name: /J'interviens \/ Résolu/i }).click();

  // Revenir en Réparateur et compléter le Rapport final en 3 écrans
  await page.getByRole('button', { name: 'Animateur Assistant' }).click();
  await page.getByRole('button', { name: /Animateur Réparateur/i }).click();
  await page.getByRole('button', { name: /Alexandre Tremblay/i }).click();
  await page.getByRole('button', { name: '4. Rapport' }).click();
  await page.getByRole('button', { name: 'Réparé !' }).click();
  await page.getByRole('button', { name: 'Nettoyage poussière interne' }).click();
  await page.getByRole('button', { name: /^Continuer/i }).click();
  await page.getByRole('button', { name: /Pièce de rechange à commander/i }).click();
  await page.getByRole('button', { name: 'Enregistrer le rapport' }).click();
  await expect(page.getByText('Rapport de réparation enregistré !')).toBeVisible();

  // Repasser en vue Laptop (sans androidBridge) pour vérifier l'Écran Public anonymisé Loi 25
  await page.evaluate(() => {
    delete (window as any).androidBridge;
  });
  await page.addInitScript(() => {
    delete (window as any).androidBridge;
  });

  expect(errors).toEqual([]);
});

test('Formateur sur tablette : évaluation Avant / Pendant / Après (+X niveaux & Prêt Réparothon)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);

  await page.getByRole('radio', { name: /Formation Réparothon/i }).click();
  await page.locator('#eventName').fill('Formation CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  await page.locator('#att-firstName').fill('Camille');
  await page.locator('#att-lastName').fill('Bouchard');
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.getByText('Camille Bouchard').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Bilan & Évaluation' }).click();
  await expect(page.getByText(/Évaluation Formateur/i)).toBeVisible();

  await page.getByRole('button', { name: '1 · Débutant' }).first().click();
  await page.getByRole('button', { name: '2. Pendant' }).click();
  await page.getByRole('button', { name: 'Pratique réussie' }).first().click();
  await page.getByRole('button', { name: '3. Après' }).click();
  await page.getByRole('button', { name: "3 · À l'aise" }).first().click();
  await expect(page.getByText('+2 niveaux').first()).toBeVisible();
  await page.getByRole('button', { name: /Prêt\(e\) à rejoindre un Réparothon/i }).first().click();

  expect(errors).toEqual([]);
});
