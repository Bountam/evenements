import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const URL = pathToFileURL(path.resolve('dist/index.html')).href;

const SIMULATE_ANDROID = () => {
  (window as any).androidBridge = { postMessage: () => {} };
};

async function createContestOnPc(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);
  await page.getByRole('radio', { name: /Kiosque-concours/ }).click();
  await page.locator('#eventName').fill('Kiosque tablette CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await expect(page.getByRole('tab', { name: 'Pistes' })).toBeVisible();
}

async function holdUnlock(page: Page) {
  const lock = page.getByRole('button', { name: 'Déverrouiller (maintenir 2 secondes)' });
  await lock.dispatchEvent('pointerdown');
  await page.waitForTimeout(2300);
  await lock.dispatchEvent('pointerup');
  await expect(page.getByRole('dialog', { name: 'Déverrouiller la tablette' })).toBeVisible();
}

test('Tablette : seul le Kiosque d\'inscription est verrouillable, code 0000 par défaut puis personnalisé, délai après 3 erreurs', async ({
  page
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // PC hôte : créer l'activité (PIN 0000 créé par défaut) et tester le changement vers 1234
  await createContestOnPc(page);
  await page.getByRole('button', { name: /Synchronisation réseau/ }).click();
  // Sur le PC hôte seulement : rappel du code par défaut tant qu'aucun code personnalisé n'est choisi
  await expect(page.getByText("Code actuel : 0000 par défaut. Changez-le avant d'ouvrir l'événement.")).toBeVisible();
  await page.locator('#tablet-pin').fill('12a3');
  await expect(page.locator('#tablet-pin')).toHaveValue('123');
  await page.getByRole('button', { name: 'Définir' }).click();
  await expect(page.getByText('Le code doit compter exactement 4 chiffres.')).toBeVisible();
  await page.locator('#tablet-pin').fill('1234');
  await page.getByRole('button', { name: 'Définir' }).click();
  await expect(page.getByText('Code de déverrouillage enregistré')).toBeVisible();
  await expect(page.getByText('Un code personnalisé protège cette activité.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changer' })).toBeVisible();

  const stored = await page.evaluate(async () => {
    const id = localStorage.getItem('insertech_active_event_id');
    return await new Promise<any>((resolve) => {
      const req = indexedDB.open('insertech_events_db');
      req.onsuccess = () => {
        const tx = req.result.transaction('events', 'readonly');
        const get = tx.objectStore('events').get(id as string);
        get.onsuccess = () => resolve(get.result?.extraData?.verrouillage);
      };
      req.onerror = () => resolve(null);
    });
  });
  expect(stored?.empreinte).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(stored)).not.toContain('1234');

  // Sur tablette : saut auto de l'étape 1 (1 seul événement actif), arrivée directe au choix de rôle (sans Écran public)
  await page.addInitScript(SIMULATE_ANDROID);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Quel est votre rôle aujourd\'hui ?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Écran Public/i })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('0000');

  // Choisir Kiosque d'inscription (saute l'étape 3 bénévole et ouvre le formulaire visiteur en étapes)
  await page.getByRole('button', { name: /Kiosque d'inscription/ }).click();
  await expect(page.locator('#participant-displayName')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pistes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Changer de mode' })).toHaveCount(0);

  // Verrouiller le kiosque, puis recharger : reste verrouillé sans bouton Menu principal ni rôle
  await page.getByRole('button', { name: 'Verrouiller le kiosque' }).click();
  await expect(page.getByRole('button', { name: /Kiosque d'inscription/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Menu principal' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#participant-displayName')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Déverrouiller (maintenir 2 secondes)' })).toBeVisible();

  // Inscription depuis le kiosque (1 question par écran -> Récapitulatif -> M'inscrire)
  await page.locator('#participant-displayName').fill('Léa Tremblay');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#participant-email').fill('lea@example.com');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#participant-consentActivity').check();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Inscrire le participant' }).click();
  await expect(page.getByText('Léa Tremblay inscrit avec succès !')).toBeVisible();

  // Un appui court n'ouvre rien ; 3 mauvais codes bloquent la saisie
  await page.getByRole('button', { name: 'Déverrouiller (maintenir 2 secondes)' }).click();
  await expect(page.getByRole('dialog', { name: 'Déverrouiller la tablette' })).toHaveCount(0);
  await holdUnlock(page);
  // Le code par défaut n'est jamais affiché sur la tablette (fenêtre du code, onboarding, en-tête)
  await expect(page.getByRole('dialog', { name: 'Déverrouiller la tablette' })).not.toContainText('0000');
  expect(await page.locator('body').innerText()).not.toContain('0000');
  for (const wrong of ['0000', '1111', '2222']) {
    await page.locator('#pin-code').fill(wrong);
    await page.getByRole('button', { name: 'Déverrouiller', exact: true }).click();
  }
  await expect(page.getByText(/Saisie bloquée encore/)).toBeVisible();
  await expect(page.locator('#pin-code')).toBeDisabled();

  // Délai écoulé : déverrouillage avec 1234
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('insertech_mode_essais') || '{}');
    localStorage.setItem('insertech_mode_essais', JSON.stringify({ ...state, blockedUntil: Date.now() - 1 }));
  });
  await expect(page.locator('#pin-code')).toBeEnabled();
  await page.locator('#pin-code').fill('1234');
  await page.getByRole('button', { name: 'Déverrouiller', exact: true }).click();
  await expect(page.getByText('Tablette déverrouillée.')).toBeVisible();

  // Bouton unique du rôle actif dans l'en-tête + Logo Insertech = Menu principal
  await expect(page.getByRole('button', { name: /Kiosque d'inscription/ })).toBeVisible();
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.getByRole('heading', { name: 'Rejoindre un événement' })).toBeVisible();
  await expect(page.getByRole('button', { name: "Créer l'activité" })).toHaveCount(0);

  // Possibilité de revenir directement dans l'activité active sans rester bloqué sur l'écran d'accueil tablette
  await page.getByRole('button', { name: /Kiosque tablette CI/i }).click();
  await expect(page.getByRole('button', { name: /Kiosque d'inscription/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test('Tablette : code 0000 actif par défaut et aucun verrouillage pour le rôle Animateur d\'Accueil', async ({ page }) => {
  await createContestOnPc(page);
  await page.addInitScript(SIMULATE_ANDROID);
  await page.reload();

  // Passer en Animateur d'Accueil via l'onboarding (étape 2 -> étape 3 identification rapide 1 champ)
  await page.getByRole('button', { name: /Animateur d'Accueil/ }).click();
  await page.locator('#mob-vol-displayName').fill('Sam Dufour');
  await page.getByRole('button', { name: /Confirmer et ouvrir mon espace/i }).click();

  // Aucun bouton de verrouillage en mode Accueil, ni Écran Public, ni Tirage
  await expect(page.getByRole('button', { name: /Verrouiller/i })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Écran public/i })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Tirage' })).toHaveCount(0);
});
