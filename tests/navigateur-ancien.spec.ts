import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Une tablette Android 10 dont le WebView n'a jamais été mis à jour (Chrome 74) ne sait pas afficher l'interface
// (Tailwind 4 demande Chrome 111+). index.html doit alors dire quoi faire, au lieu d'une page blanche.
const URL = pathToFileURL(path.resolve('dist/index.html')).href;

test('un navigateur sans oklch voit le message de mise à jour, et l\'appli ne se monte pas', async ({ page }) => {
  await page.addInitScript(() => {
    const original = CSS.supports.bind(CSS);
    (CSS as any).supports = (...args: any[]) =>
      String(args[1] ?? args[0]).includes('oklch') ? false : (original as any)(...args);
  });
  await page.goto(URL);
  const message = page.locator('#navigateur-trop-ancien');
  await expect(message).toBeVisible();
  await expect(message).toContainText('Android System WebView');
  await expect(page.getByRole('alert')).toBeVisible();
  // React n'a rien monté par-dessus le message
  await page.waitForTimeout(1000);
  await expect(page.locator('#root > *')).toHaveCount(1);
  await expect(message).toBeVisible();
});

test('un navigateur récent ne voit pas le message', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('#root > *').first()).toBeVisible();
  await expect(page.locator('#navigateur-trop-ancien')).toHaveCount(0);
});
