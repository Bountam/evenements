import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const URL = pathToFileURL(path.resolve('dist/index.html')).href;

// Simule l'application Android : @capacitor/core reconnaît la plateforme au pont natif window.androidBridge
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

test('Tablette : mode kiosque formulaire verrouillé par le code du PC, délai après 3 erreurs', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // PC hôte : créer l'activité et régler le code des tablettes dans la fenêtre Réseau local
  await createContestOnPc(page);
  await page.getByRole('button', { name: /Réseau LAN/ }).click();
  await page.locator('#tablet-pin').fill('12a3');
  await expect(page.locator('#tablet-pin')).toHaveValue('123');
  await page.getByRole('button', { name: 'Définir' }).click();
  await expect(page.getByText('Le code doit compter exactement 4 chiffres.')).toBeVisible();
  await page.locator('#tablet-pin').fill('1234');
  await page.getByRole('button', { name: 'Définir' }).click();
  await expect(page.getByText('Code de déverrouillage enregistré')).toBeVisible();
  // Seule l'empreinte est enregistrée, jamais le code
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

  // La même appli, vue comme une tablette Android : choix du mode
  await page.addInitScript(SIMULATE_ANDROID);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Comment utiliser cette tablette ?' })).toBeVisible();
  await page.getByRole('button', { name: /Kiosque formulaire/ }).click();

  // Formulaire seul : ni onglets de régie, ni menu principal
  await expect(page.locator('#participant-firstName')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pistes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Menu principal/ })).toHaveCount(0);

  // Verrouiller, puis redémarrer : la tablette reste verrouillée dans le formulaire
  await page.getByRole('button', { name: 'Verrouiller ce mode' }).click();
  await expect(page.getByRole('button', { name: 'Changer de mode' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#participant-firstName')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Déverrouiller (maintenir 2 secondes)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changer de mode' })).toHaveCount(0);

  // Inscription depuis le kiosque
  await page.locator('#participant-firstName').fill('Léa');
  await page.locator('#participant-lastName').fill('Tremblay');
  await page.locator('#participant-email').fill('lea@example.com');
  await page.locator('#participant-consentActivity').check();
  await page.getByRole('button', { name: 'Inscrire le participant' }).click();
  await expect(page.getByText('Léa Tremblay inscrit avec succès !')).toBeVisible();

  // Un appui court n'ouvre rien ; 3 mauvais codes bloquent la saisie
  await page.getByRole('button', { name: 'Déverrouiller (maintenir 2 secondes)' }).click();
  await expect(page.getByRole('dialog', { name: 'Déverrouiller la tablette' })).toHaveCount(0);
  await holdUnlock(page);
  for (const wrong of ['0000', '1111', '2222']) {
    await page.locator('#pin-code').fill(wrong);
    await page.getByRole('button', { name: 'Déverrouiller', exact: true }).click();
  }
  await expect(page.getByText(/Saisie bloquée encore/)).toBeVisible();
  await expect(page.locator('#pin-code')).toBeDisabled();

  // Délai écoulé (simulé) : le bon code déverrouille
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('insertech_mode_essais') || '{}');
    localStorage.setItem('insertech_mode_essais', JSON.stringify({ ...state, blockedUntil: Date.now() - 1 }));
  });
  await expect(page.locator('#pin-code')).toBeEnabled();
  await page.locator('#pin-code').fill('1234');
  await page.getByRole('button', { name: 'Déverrouiller', exact: true }).click();
  await expect(page.getByText('Tablette déverrouillée.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changer de mode' })).toBeVisible();

  // Accueil de la tablette : rejoindre le PC, aucune création ni import d'activité
  await page.getByRole('button', { name: 'Changer de mode' }).click();
  await page.getByRole('button', { name: /Accueil/ }).click();
  await expect(page.getByRole('heading', { name: 'Rejoindre un événement' })).toBeVisible();
  await expect(page.getByRole('button', { name: "Créer l'activité" })).toHaveCount(0);
  await expect(page.getByText('Restaurer une sauvegarde JSON')).toHaveCount(0);
  await page.getByRole('button', { name: 'Se connecter au PC hôte' }).click();
  await expect(page.getByRole('button', { name: 'Créer la session hôte' })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('Tablette : verrouiller sans code défini sur le PC est refusé', async ({ page }) => {
  await createContestOnPc(page);
  await page.addInitScript(SIMULATE_ANDROID);
  await page.reload();
  await page.getByRole('button', { name: /Écran public/ }).click();
  await page.getByRole('button', { name: 'Verrouiller ce mode' }).click();
  await expect(page.getByText("Définissez un code dans l'administration du PC")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changer de mode' })).toBeVisible();
  // L'écran public de la tablette n'offre pas de retour vers la régie
  await expect(page.getByRole('button', { name: /console d'administration/ })).toHaveCount(0);
});
