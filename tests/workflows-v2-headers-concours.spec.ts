import { expect, test } from '@playwright/test';

const URL = 'http://localhost:4173/';

const SIMULATE_ANDROID = () => {
  (window as any).androidBridge = { postMessage: () => {} };
};

test('Kiosque-Concours Animateur Juge (2 joueurs max, départ commun, 2 arrêts séparés, résultat + prix) & En-têtes minimalistes', async ({
  page
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);

  // 1. Laptop (Admin) crée le Kiosque-Concours et vérifie les éléments réservés au Laptop Admin
  await page.getByRole('radio', { name: /Kiosque-concours/ }).click();
  await page.locator('#eventName').fill('Concours Juges CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  await expect(page.getByRole('tab', { name: 'Tirage' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Écran public/i })).toBeVisible();
  await expect(page.getByTestId('btn-open-impact-report')).toBeVisible();
  // Icône synchro sans texte (uniquement aria-label « Synchronisation réseau : ... »)
  const syncBtn = page.getByRole('button', { name: /Synchronisation réseau/i });
  await expect(syncBtn).toBeVisible();
  await expect(syncBtn).toHaveText('');
  // Le menu principal est dans le logo Insertech cliquable
  await expect(page.getByRole('button', { name: 'Menu principal' })).toBeVisible();

  // 2. Verrouillage optionnel du Laptop via le code par défaut 0000
  await page.getByRole('button', { name: /^Plus/ }).click();
  await page.getByRole('button', { name: /Verrouiller le poste/i }).click();
  await expect(page.getByRole('dialog', { name: 'Déverrouiller la tablette' })).toBeVisible();
  await page.locator('#pin-code').fill('0000');
  await page.getByRole('button', { name: 'Déverrouiller', exact: true }).click();
  await expect(page.getByText('Poste administrateur déverrouillé.')).toBeVisible();

  // 3. Passer en Mobile/Tablette -> Onboarding 4 étapes -> Animateur Juge
  await page.addInitScript(SIMULATE_ANDROID);
  await page.reload();
  await page.getByRole('button', { name: /Animateur Juge/i }).click();
  await page.locator('#mob-vol-firstName').fill('Marc');
  await page.locator('#mob-vol-lastName').fill('Juge');
  await page.locator('#mob-vol-phone').fill('514 555-8888');
  await page.getByLabel('Animation', { exact: true }).check();
  await page.locator('#mob-vol-consentVolunteer').check();
  await page.getByRole('button', { name: /Confirmer et ouvrir mon espace/i }).click();

  // En rôle Juge : pas d'Écran Public, pas de Tirage, pas de Rapport d'Impact, un seul bouton Rôle
  await expect(page.getByRole('tab', { name: /Tirage/i })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Écran public/i })).toHaveCount(0);
  await expect(page.getByTestId('btn-open-impact-report')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Animateur Juge' })).toBeVisible();

  // 4. Inscrire 2 joueurs directement devant le juge
  await page.getByRole('button', { name: /Inscrire mon 1er joueur/i }).click();
  await page.locator('#juge-firstName').fill('Alice');
  await page.locator('#juge-lastName').fill('Roy');
  await page.locator('#juge-phone').fill('514 555-1111');
  await page.locator('#juge-consentActivity').check();
  await page.getByRole('button', { name: /Inscrire et placer devant moi/i }).click();

  await page.getByRole('button', { name: /\+ Inscrire un joueur devant moi/i }).click();
  await page.locator('#juge-firstName').fill('Bob');
  await page.locator('#juge-lastName').fill('Leduc');
  await page.locator('#juge-phone').fill('514 555-2222');
  await page.locator('#juge-consentActivity').check();
  await page.getByRole('button', { name: /Inscrire et placer devant moi/i }).click();

  // Max 2 joueurs devant le juge : le bouton + Inscrire disparaît
  await expect(page.getByText('Mes joueurs devant moi (2/2)')).toBeVisible();
  await expect(page.getByRole('button', { name: /\+ Inscrire un joueur devant moi/i })).toHaveCount(0);

  // Démarrer les 2 joueurs ensemble, puis 2 arrêts séparés
  await page.getByRole('button', { name: /Démarrer mes 2 joueurs/i }).click();
  await expect(page.getByRole('button', { name: /Arrêter Alice Roy/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Arrêter Bob Leduc/i })).toBeVisible();

  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /Arrêter Alice Roy/i }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /Arrêter Bob Leduc/i }).click();

  // Écran de fin de défi : temps, place cumulée, rappel des prix et bouton Nouvelle compétition
  await expect(page.getByRole('heading', { name: /Résultat du défi/i })).toBeVisible();
  await expect(page.getByText(/Place #1/i)).toBeVisible();
  await expect(page.getByText(/Rappel des prix à gagner/i)).toBeVisible();
  await page.getByRole('button', { name: /Nouvelle compétition/i }).click();
  await expect(page.getByText('Mes joueurs devant moi (0/2)')).toBeVisible();

  expect(errors).toEqual([]);
});
