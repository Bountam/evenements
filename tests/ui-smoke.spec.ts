import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Le même bundle doit afficher la même interface quelle que soit la façon dont il est ouvert.
const TARGETS = [
  { name: 'file:// (exe, APK)', url: pathToFileURL(path.resolve('dist/index.html')).href },
  { name: 'http (PWA)', url: 'http://localhost:4173/' }
];

const VIEWPORTS = [
  { name: 'portable 1366x768', width: 1366, height: 768 },
  { name: 'tablette 800x1280', width: 800, height: 1280 },
  { name: 'téléphone 412x915', width: 412, height: 915 }
];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function expectIntactUi(page: Page) {
  // Images inlinées (logo, chapiteau) réellement décodées
  const brokenImages = await page.evaluate(() =>
    [...document.images].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.alt || img.src.slice(0, 40))
  );
  expect(brokenImages, 'images non chargées').toEqual([]);

  // Polices embarquées disponibles hors ligne
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [document.fonts.check('16px Oswald'), document.fonts.check('16px Roboto')];
  });
  expect(fonts, 'polices Oswald et Roboto').toEqual([true, true]);

  // Rien ne déborde à droite de l'écran
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'débordement horizontal (px)').toBeLessThanOrEqual(1);
}

for (const target of TARGETS) {
  for (const viewport of VIEWPORTS) {
    test(`${target.name} — ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const errors = collectErrors(page);
      await page.goto(target.url);

      // Accueil : identité, actions principales et catalogue des activités
      await expect(page.getByRole('heading', { name: 'Insertech Événements' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Rejoindre une session réseau' })).toBeVisible();
      await expect(page.getByRole('radio', { name: /Kiosque-concours/ })).toBeVisible();
      await expectIntactUi(page);

      // Création d'un kiosque-concours : la console et son en-tête collant s'affichent
      await page.getByRole('radio', { name: /Kiosque-concours/ }).click();
      await page.locator('#eventName').fill('Test de rendu CI');
      await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
      await page.getByRole('button', { name: "Créer l'activité" }).click();
      const header = page.locator('header').first();
      await expect(header).toBeVisible();
      const box = await header.boundingBox();
      expect(box?.y ?? -1, "l'en-tête commence en haut de l'écran").toBeGreaterThanOrEqual(0);
      await expect(page.getByRole('tablist')).toBeVisible();
      await expectIntactUi(page);

      // Régie en onglets : chaque onglet n'affiche que sa tâche
      await expect(page.getByRole('tab', { name: 'Pistes' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#participant-name')).toHaveCount(0);
      await page.getByRole('tab', { name: 'Participants' }).click();
      await expect(page.locator('#participant-name')).toBeVisible();
      await page.locator('#participant-name').fill('Brouillon conservé');
      await page.getByRole('tab', { name: 'Tirage' }).click();
      await expect(page.locator('#launch-raffle')).toBeVisible();
      await page.getByRole('tab', { name: 'Participants' }).click();
      await expect(page.locator('#participant-name')).toHaveValue('Brouillon conservé');
      await expectIntactUi(page);

      expect(errors, 'erreurs JavaScript').toEqual([]);
    });
  }
}
