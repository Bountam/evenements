import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Tablette en mode écran public (envoyée au téléviseur par Smart View) : plein écran, écran allumé et
// paysage sans rien régler, aucune commande dans la page, et les commandes de l'en-tête s'effacent au repos.
const URL = pathToFileURL(path.resolve('dist/index.html')).href;

// Plugins natifs simulés par le pont de Capacitor : chaque appel est noté dans window.__appelsNatifs
const TABLETTE = () => {
  (window as any).androidBridge = { postMessage: () => {} };
  const appels: string[] = [];
  (window as any).__appelsNatifs = appels;
  const promesse = (noms: string[]) => noms.map((name) => ({ name, rtype: 'promise' }));
  (window as any).Capacitor = {
    PluginHeaders: [
      { name: 'InsertechNatif', methods: promesse(['pleinEcran', 'epingler', 'desepingler', 'etat', 'quitter']) },
      { name: 'KeepAwake', methods: promesse(['keepAwake', 'allowSleep', 'isSupported', 'isKeptAwake']) },
      { name: 'ScreenOrientation', methods: promesse(['lock', 'unlock', 'orientation']) }
    ],
    nativePromise: async (plugin: string, methode: string, options: any) => {
      appels.push(`${plugin}.${methode}${options && Object.keys(options).length ? ' ' + JSON.stringify(options) : ''}`);
      return {};
    },
    nativeCallback: () => 'ecouteur'
  };
};

test('Tablette en écran public : plein écran, allumée, paysage, aucune commande visible', async ({ page }) => {
  test.setTimeout(60_000);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));

  // L'activité est créée sur le « PC », puis la même page devient une tablette
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);
  await page.getByRole('radio', { name: /Kiosque-concours/ }).click();
  await page.locator('#eventName').fill('Écran public CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await expect(page.getByRole('tab', { name: 'Pistes' })).toBeVisible();
  await page.addInitScript(TABLETTE);
  await page.reload();
  await page.getByRole('button', { name: /Écran public/ }).click();

  await expect(page.getByText('Tableau des Champions')).toBeVisible();
  const appels = () => page.evaluate(() => (window as any).__appelsNatifs as string[]);
  await expect.poll(appels).toContain('InsertechNatif.pleinEcran {"actif":true}');
  await expect.poll(appels).toContain('KeepAwake.keepAwake');
  await expect.poll(appels).toContain('ScreenOrientation.lock {"orientation":"landscape"}');

  // Rien à toucher dans la page : l'écran public ne peut rien modifier
  await expect(page.locator('main').locator('button, input, select, textarea, [contenteditable="true"]')).toHaveCount(0);

  // Au repos, même les commandes de la tablette s'effacent (rien sur le téléviseur), sans devenir intouchables
  const commandes = page.getByTestId('commandes-tablette');
  await expect(commandes).toHaveCSS('opacity', '0', { timeout: 6000 });
  await page.mouse.move(640, 400);
  await expect(commandes).toHaveCSS('opacity', '1');

  // Changer de mode : la tablette retrouve ses barres, sa rotation libre et sa mise en veille
  await page.getByRole('button', { name: 'Changer de mode' }).click();
  await expect(page.getByRole('heading', { name: 'Comment utiliser cette tablette ?' })).toBeVisible();
  await expect.poll(async () => (await appels()).filter((a) => a.startsWith('InsertechNatif.pleinEcran')).at(-1)).toBe(
    'InsertechNatif.pleinEcran {"actif":false}'
  );
  await expect.poll(async () => (await appels()).filter((a) => a.startsWith('ScreenOrientation.')).at(-1)).toBe('ScreenOrientation.unlock');
  await expect.poll(async () => (await appels()).filter((a) => a.startsWith('KeepAwake.')).at(-1)).toBe('KeepAwake.allowSleep');
  expect(erreurs).toEqual([]);
});
