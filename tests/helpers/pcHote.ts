import { expect, type Page } from '@playwright/test';
import type { FakeTablette } from './fakeTablette';

// PC hôte dans la page : crée un kiosque-concours, ouvre la session réseau et renvoie code + clé.
// Le compagnon du lanceur est simulé (liste /tablettes) ; toute requête qui sortirait de la machine est bloquée.
export async function preparerPcHote(page: Page, tablettes: () => FakeTablette[], compagnon: number, nom = 'Concours CI') {
  const sorties: string[] = [];
  await page.route('**/*', (route) => {
    const url = new globalThis.URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    if (url.hostname === '127.0.0.1' && url.port === String(compagnon)) {
      const cors = { 'Access-Control-Allow-Origin': '*' };
      if (url.pathname === '/tablettes') {
        return route.fulfill({
          headers: cors,
          contentType: 'application/json',
          body: JSON.stringify({
            reseaux: [{ nom: 'Wi-Fi', adresse: '127.0.0.1', prefixe: '127.0.0.0' }],
            tablettes: tablettes()
              .filter((t) => t.port)
              .map((t) => ({ ip: '127.0.0.1', port: t.port, ...t.fiche(), vuA: Date.now() }))
          })
        });
      }
      if (url.pathname === '/snapshot' && route.request().method() === 'GET') return route.fulfill({ status: 404, headers: cors, body: '' });
      return route.fulfill({ headers: cors, body: 'ok' });
    }
    sorties.push(url.href);
    return route.abort();
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`http://localhost:4173/?stockage=${compagnon}&cle=test`);
  await page.getByRole('radio', { name: /Kiosque-concours/ }).click();
  await page.locator('#eventName').fill(nom);
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await expect(page.getByRole('tab', { name: 'Pistes' })).toBeVisible();
  await page.getByRole('button', { name: /Synchronisation réseau/ }).click();
  await page.getByRole('button', { name: 'Créer la session hôte' }).click();
  const code = (await page.getByTestId('code-session').innerText()).trim();
  const cle = (await page.getByTestId('cle-session').innerText()).trim().replace(/-/g, '');
  return { code, cle, sorties };
}
