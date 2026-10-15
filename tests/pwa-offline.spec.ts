import { expect, test } from '@playwright/test';

// PWA (http) : après une première visite, l'application démarre hors ligne,
// y compris avec un lien d'invitation (?rejoindre=…) jamais ouvert auparavant.
test('PWA — démarrage hors ligne depuis le cache du service worker', async ({ page, context }) => {
  await page.goto('http://localhost:4173/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // La page est contrôlée par le service worker après un rechargement
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.goto('http://localhost:4173/?rejoindre=HORSLIGNE');
  await expect(page.getByRole('heading', { name: 'Insertech Événements' })).toBeVisible();
  await context.setOffline(false);
});
