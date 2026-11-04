import { expect, test } from '@playwright/test';

const GITHUB_RELEASE_API = 'https://api.github.com/repos/Bountam/evenements/releases/latest';

function makeReleasePayload(overrides: Record<string, any> = {}) {
  const tag = overrides.tag_name ?? 'v1.9.0';
  const ver = String(tag).replace(/^[vV]/, '');
  return {
    tag_name: tag,
    name: `Release ${tag}`,
    draft: false,
    prerelease: false,
    html_url: `https://github.com/Bountam/evenements/releases/tag/${tag}`,
    published_at: '2026-10-16T12:00:00Z',
    body: '- Ajout de la détection de mises à jour (#35)\n- Vérification SHA-256 des paquets',
    assets: [
      {
        name: `InsertechEvenements-Setup-${ver}.exe`,
        browser_download_url: `https://github.com/Bountam/evenements/releases/download/${tag}/InsertechEvenements-Setup-${ver}.exe`
      },
      {
        name: 'InsertechEvenements-Android.apk',
        browser_download_url: `https://github.com/Bountam/evenements/releases/download/${tag}/InsertechEvenements-Android.apk`
      },
      {
        name: 'SHA256SUMS.txt',
        browser_download_url: `https://github.com/Bountam/evenements/releases/download/${tag}/SHA256SUMS.txt`
      }
    ],
    ...overrides
  };
}

test('Mise à jour — nouvelle version détectée, pastille, Plus tard et Ignorer cette version', async ({ page }) => {
  let currentTag = 'V1.9.0'; // Casse majuscule V aussi supportée
  await page.route(GITHUB_RELEASE_API, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeReleasePayload({ tag_name: currentTag }))
    });
  });

  let apiCalls = 0;
  page.on('request', (req) => {
    if (req.url().startsWith(GITHUB_RELEASE_API)) apiCalls++;
  });
  await page.goto('http://localhost:4173/');

  // Aucun appel à internet au lancement : la vérification se fait seulement à la demande
  const dialog = page.getByRole('dialog', { name: 'Version 1.9.0 disponible' });
  await expect(page.getByRole('heading', { name: 'Insertech Événements' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(apiCalls).toBe(0);
  await expect(dialog).toBeHidden();

  // Fenêtre ouverte par le bouton, avec le titre, les notes et le lien vers la release
  await page.getByRole('button', { name: 'Rechercher une mise à jour' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Ajout de la détection de mises à jour (#35)')).toBeVisible();
  const releaseLink = dialog.getByRole('link', { name: 'Voir la release sur GitHub' });
  await expect(releaseLink).toHaveAttribute('href', 'https://github.com/Bountam/evenements/releases/tag/V1.9.0');
  await expect(dialog.getByRole('button', { name: 'Mettre à jour' })).toBeEnabled();

  // Fermer avec la croix : la pastille « Nouvelle version » reste dans l'en-tête et rouvre la fenêtre
  await dialog.getByRole('button', { name: 'Fermer la boîte de dialogue' }).click();
  await expect(dialog).toBeHidden();
  const pill = page.getByRole('button', { name: /Nouvelle version \(1\.9\.0\)/ });
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(dialog).toBeVisible();

  // « Plus tard » masque cette version pendant 24 h (pastille et fenêtre absentes au rechargement)
  await dialog.getByRole('button', { name: 'Plus tard' }).click();
  await expect(dialog).toBeHidden();
  await expect(pill).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Insertech Événements' })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(pill).toBeHidden();

  // Le bouton « Rechercher une mise à jour » réaffiche la fenêtre même après « Plus tard »
  await page.getByRole('button', { name: 'Rechercher une mise à jour' }).click();
  await expect(dialog).toBeVisible();

  // « Ignorer cette version » masque 1.9.0 jusqu'à la version suivante
  await dialog.getByRole('button', { name: 'Ignorer cette version' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(dialog).toBeHidden();

  // Une version suivante (1.9.1) n'est pas ignorée et s'affiche
  currentTag = 'v1.9.1';
  await page.reload();
  await page.getByRole('button', { name: 'Rechercher une mise à jour' }).click();
  await expect(page.getByRole('dialog', { name: 'Version 1.9.1 disponible' })).toBeVisible();
});

test('Mise à jour — version identique, pré-version, hors ligne et limite atteinte', async ({ page }) => {
  let mode: 'same' | 'prerelease' | 'rate_limit' | 'offline' = 'same';

  await page.route(GITHUB_RELEASE_API, async (route) => {
    if (mode === 'offline') {
      await route.abort('failed');
      return;
    }
    if (mode === 'rate_limit') {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'API rate limit exceeded' }) });
      return;
    }
    if (mode === 'prerelease') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeReleasePayload({ tag_name: 'v9.9.9', prerelease: true }))
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeReleasePayload({ tag_name: 'v1.2.7' }))
    });
  });

  // 1. Version identique : rien ne s'affiche au lancement ; recherche manuelle informe l'utilisateur
  await page.goto('http://localhost:4173/');
  await expect(page.getByRole('heading', { name: 'Insertech Événements' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Nouvelle version/ })).toBeHidden();

  await page.getByRole('button', { name: 'Rechercher une mise à jour' }).click();
  await expect(page.getByText(/Vous utilisez déjà la dernière version/)).toBeVisible();

  // 2. Pré-version ignorée
  mode = 'prerelease';
  await page.getByRole('button', { name: 'Rechercher une mise à jour' }).click();
  await expect(page.getByRole('dialog', { name: /Version 9\.9\.9 disponible/ })).toBeHidden();

  // 3. Limite GitHub atteinte : silence au lancement, message clair en recherche manuelle
  mode = 'rate_limit';
  await page.reload();
  await expect(page.getByRole('button', { name: /Nouvelle version/ })).toBeHidden();
  await page.getByRole('button', { name: 'Rechercher une mise à jour' }).click();
  await expect(page.getByText(/Limite de vérifications GitHub atteinte/)).toBeVisible();

  // 4. Hors ligne : silence au lancement, message clair en recherche manuelle
  mode = 'offline';
  await page.reload();
  await expect(page.getByRole('button', { name: /Nouvelle version/ })).toBeHidden();
  await page.getByRole('button', { name: 'Rechercher une mise à jour' }).click();
  await expect(page.getByText(/Impossible de vérifier les mises à jour hors ligne/)).toBeVisible();
});

test('Mise à jour — bloquée pendant un chrono en cours ou une session active', async ({ page }) => {
  await page.route(GITHUB_RELEASE_API, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeReleasePayload({ tag_name: 'v1.9.0' }))
    });
  });

  // Simuler un chrono en cours dans localStorage
  await page.addInitScript(() => {
    localStorage.setItem(
      'insertech_tracks_state',
      JSON.stringify({
        1: { trackId: 1, participantId: 'p-1', participantName: 'Alex', isRunning: true, startTime: Date.now() - 5000, elapsedBeforeStart: 0 }
      })
    );
  });

  await page.goto('http://localhost:4173/');
  await page.getByRole('button', { name: 'Rechercher une mise à jour' }).click();
  const dialog = page.getByRole('dialog', { name: 'Version 1.9.0 disponible' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Termine la session pour mettre à jour')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Mettre à jour' })).toBeDisabled();
});
