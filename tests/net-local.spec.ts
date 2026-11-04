import { expect, test, type Page } from '@playwright/test';
import { FakeTablette } from './helpers/fakeTablette';
import { FauxNatifMaj } from './helpers/fauxNatifMaj';

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

test('PC hôte : « Mettre à jour les tablettes » envoie l\'APK par le réseau local', async ({ page }) => {
  test.setTimeout(60_000);
  let tablette: FakeTablette | null = null;
  const { code, cle, sorties } = await preparerPc(page, () => (tablette ? [tablette] : []));
  tablette = new FakeTablette(code, cle, 'Kiosque entrée');
  const natif = new FauxNatifMaj();
  tablette.natifMaj = natif;
  await tablette.demarrer();
  try {
    await expect(page.getByText('Connectée', { exact: true })).toBeVisible({ timeout: 15_000 });
    tablette.envoyer({ type: 'REQUEST_INITIAL_SYNC', version: '1.2.5' });
    await tablette.attendre((m) => m.type === 'INITIAL_SYNC');

    // Un faux APK de 200 Ko (une archive ZIP commence par « PK »), version lue dans le nom du fichier
    const apk = Buffer.alloc(200 * 1024, 7);
    apk.write('PK', 0);
    await page.getByText('Mettre à jour les tablettes').click();
    await page.locator('#apk-fichier').setInputFiles({ name: 'InsertechEvenements-9.9.9.apk', mimeType: 'application/vnd.android.package-archive', buffer: apk });
    await expect(page.getByTestId('apk-pret')).toContainText('0,2 Mo');
    await expect(page.locator('#apk-version')).toHaveValue('9.9.9');
    await page.getByRole('button', { name: 'Envoyer aux tablettes (1)' }).click();

    await expect(page.getByTestId('etat-maj')).toHaveText('À confirmer sur la tablette', { timeout: 15_000 });
    expect(Buffer.compare(natif.recu(), apk)).toBe(0);
    expect(natif.installe).toBe(true);

    // Après l'installation, la tablette revient avec sa nouvelle version : le PC l'affiche
    tablette.version = '9.9.9';
    tablette.envoyer({ type: 'REQUEST_INITIAL_SYNC', version: '9.9.9' });
    await expect(page.getByTestId('etat-maj')).toHaveText('Installée (9.9.9)');

    // Un fichier qui n'est pas un APK est refusé dès le PC
    await page.locator('#apk-fichier').setInputFiles({ name: 'photo.apk', mimeType: 'image/png', buffer: Buffer.from('pas un apk') });
    await expect(page.getByRole('alert')).toContainText("n'est pas un APK");
  } finally {
    await tablette.arreter();
  }
  expect(sorties).toEqual([]);
});
