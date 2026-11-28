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
      expect(box?.height ?? 999, "l'en-tête permanent tient sur une seule ligne (<= 72px)").toBeLessThanOrEqual(72);

      // Aucune superposition horizontale dans l'en-tête
      const headerOverlap = await header.evaluate((el) => {
        const items = Array.from(el.querySelectorAll('button, a, h1'))
          .filter((node) => {
            const style = window.getComputedStyle(node);
            const r = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
          })
          .map((node) => ({
            text: (node.getAttribute('aria-label') || node.textContent || '').trim(),
            rect: node.getBoundingClientRect(),
          }));
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i].rect;
            const b = items[j].rect;
            // Ignore parent/child containment
            const contained =
              (a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom) ||
              (b.left <= a.left && b.right >= a.right && b.top <= a.top && b.bottom >= a.bottom);
            if (contained) continue;
            const interX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const interY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            if (interX > 2 && interY > 2) {
              return `${items[i].text} chevauche ${items[j].text}`;
            }
          }
        }
        return null;
      });
      expect(headerOverlap, 'chevauchement dans header').toBeNull();

      await expect(page.getByRole('tablist')).toHaveCount(1);
      await expect(page.getByRole('tablist')).toBeVisible();
      if (viewport.width < 640) {
        const tablistBox = await page.getByRole('tablist').boundingBox();
        expect(tablistBox?.y ?? 0, 'barre mobile fixée en bas').toBeGreaterThan(viewport.height - 100);
      }

      await expect(page.getByRole('button', { name: 'Menu principal' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Synchronisation réseau/i })).toBeVisible();
      await expectIntactUi(page);

      // En-tête allégé : commandes rares + options d'accessibilité 1 clic dans « Plus »
      const moreButton = page.getByRole('button', { name: /^Plus/ });
      await moreButton.click();
      await expect(page.getByRole('button', { name: "Rapport d'Impact & Exports" })).toBeVisible();
      await page.getByRole('button', { name: 'Texte agrandi' }).click();
      await expect(page.locator('html')).toHaveClass(/a11y-large-text/);
      await page.getByRole('button', { name: 'Contraste élevé' }).click();
      await expect(page.locator('html')).toHaveClass(/a11y-high-contrast/);
      // Remettre les options à l'état initial
      await page.getByRole('button', { name: 'Texte agrandi' }).click();
      await page.getByRole('button', { name: 'Contraste élevé' }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: "Rapport d'Impact & Exports" })).toHaveCount(0);
      await expect(moreButton).toBeFocused();

      // Régie en onglets : chaque onglet n'affiche que sa tâche
      await expect(page.getByRole('tab', { name: 'Pistes' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#participant-displayName')).toHaveCount(0);
      await page.getByRole('tab', { name: 'Participants' }).click();
      await expect(page.locator('#participant-displayName')).toBeVisible();
      await page.locator('#participant-displayName').fill('Brouillon conservé');
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.locator('#participant-email').fill('brouillon@exemple.com');
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.locator('#participant-consentActivity').check();
      await page.getByRole('tab', { name: 'Tirage' }).click();
      await expect(page.locator('#launch-raffle')).toBeVisible();
      await page.getByRole('tab', { name: 'Participants' }).click();
      await expect(page.locator('#participant-displayName')).toHaveValue('Brouillon conservé');

      // Pastille de file d'attente, puis envoi sur piste avec retour aux pistes depuis le toast
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.getByRole('button', { name: 'Inscrire le participant' }).click();
      await expect(page.getByRole('tab', { name: /Participants \(\d+ personnes? en attente\)/ })).toBeVisible();

      // Actions rares de la file regroupées sous « Plus d'actions »
      await page.getByRole('button', { name: "Plus d'actions pour Brouillon conservé" }).click();
      await page.getByRole('button', { name: 'Saisir un temps' }).click();
      await expect(page.getByRole('button', { name: "Plus d'actions pour Brouillon conservé" })).toHaveAttribute('aria-expanded', 'false');

      await page.locator('#participant-displayName').fill('Coureur test');
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.locator('#participant-phone').fill('514-555-1234');
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.locator('#participant-consentActivity').check();
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.getByRole('button', { name: 'Inscrire et assigner à la première piste libre' }).click();
      await page.getByRole('button', { name: 'Voir les pistes' }).click();
      await expect(page.getByRole('tab', { name: /^Pistes/ })).toHaveAttribute('aria-selected', 'true');
      await expectIntactUi(page);

      expect(errors, 'erreurs JavaScript').toEqual([]);
    });
  }
}
