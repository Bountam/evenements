import { expect, test, type Page } from '@playwright/test';
import { FakeTablette } from './helpers/fakeTablette';

// Synchro 100 % réseau local : la page du PC hôte appelle une tablette simulée (serveur WebSocket Node sur
// 127.0.0.1), comme l'exe le fait avec la liste /tablettes de son lanceur. Aucune requête ne doit sortir
// de la machine.

const COMPAGNON = 47999;
const URL = `http://localhost:4173/?stockage=${COMPAGNON}&cle=test`;

async function preparerPc(page: Page, tablettes: () => FakeTablette[]) {
  const sorties: string[] = [];
  await page.route('**/*', (route) => {
    const url = new globalThis.URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    if (url.hostname === '127.0.0.1' && url.port === String(COMPAGNON)) {
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
  await page.goto(URL);
  await page.getByRole('radio', { name: /Kiosque-concours/ }).click();
  await page.locator('#eventName').fill('Synchro locale CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await expect(page.getByRole('tab', { name: 'Pistes' })).toBeVisible();
  await page.getByRole('button', { name: /Réseau LAN/ }).click();
  await page.getByRole('button', { name: 'Créer la session hôte' }).click();
  const code = (await page.getByTestId('code-session').innerText()).trim();
  const cle = (await page.getByTestId('cle-session').innerText()).trim().replace(/-/g, '');
  return { code, cle, sorties };
}

test('PC hôte : appelle la tablette, synchro chiffrée, accusés et reconnexion, sans internet', async ({ page }) => {
  test.setTimeout(90_000);
  let tablette: FakeTablette | null = null;
  const { code, cle, sorties } = await preparerPc(page, () => (tablette ? [tablette] : []));
  expect(code).toMatch(/^\S{4,}$/);
  expect(cle).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);

  tablette = new FakeTablette(code, cle, 'Tablette accueil');
  const port = await tablette.demarrer();
  try {
    // 1. Le PC appelle la tablette et se fait connaître ; la tablette demande la synchro complète
    await expect(page.getByText('Tablette accueil')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Connectée', { exact: true })).toBeVisible({ timeout: 15_000 });
    tablette.envoyer({ type: 'REQUEST_INITIAL_SYNC', version: '1.2.5' });
    const sync = await tablette.attendre((m) => m.type === 'INITIAL_SYNC');
    expect(sync.payload.event?.name).toBe('Synchro locale CI');
    await expect(page.getByText(/Tablette en 1\.2\.5, PC en /).first()).toBeVisible();

    // 2. Une écriture de la tablette est enregistrée par le PC, qui en accuse réception
    tablette.envoyer({
      type: 'DB_WRITE',
      table: 'attendees',
      action: 'put',
      data: { id: 'participant-test', eventId: sync.payload.event.id, name: 'Test' },
      opId: 'op-1'
    });
    await tablette.attendre((m) => m.type === 'ACK' && m.opId === 'op-1');

    // 3. La tablette disparaît puis revient (veille, Wi-Fi) : le PC la rappelle de lui-même
    await tablette.arreter();
    await expect(page.getByText('Injoignable', { exact: true })).toBeVisible({ timeout: 15_000 });
    tablette.recus.length = 0;
    await tablette.demarrer(port);
    await expect(page.getByText('Connectée', { exact: true })).toBeVisible({ timeout: 15_000 });
    tablette.envoyer({ type: 'PING' });
    await tablette.attendre((m) => m.type === 'PONG');
  } finally {
    await tablette.arreter();
  }
  expect(sorties).toEqual([]);
});

test('PC hôte : une tablette avec une autre clé est refusée', async ({ page }) => {
  test.setTimeout(60_000);
  let tablette: FakeTablette | null = null;
  const { code } = await preparerPc(page, () => (tablette ? [tablette] : []));
  tablette = new FakeTablette(code, 'ABCDEFGHJKLM', 'Tablette intruse');
  await tablette.demarrer();
  try {
    await expect(page.getByText('Clé refusée', { exact: true })).toBeVisible({ timeout: 15_000 });
    expect(tablette.lien).toBeNull();
    expect(tablette.refus).toBeGreaterThan(0);
  } finally {
    await tablette.arreter();
  }
});
