import { expect, test, type Page } from '@playwright/test';
import { FakeTablette } from './helpers/fakeTablette';
import { evenementsAEffacer } from '../src/net/purge';

// Plan v1.9, étape 2 : une tablette ne reçoit que les données de l'événement auquel elle est inscrite,
// à la connexion comme en direct, et ne peut pas écrire dans un autre événement.

const COMPAGNON = 47998;
const URL = `http://localhost:4173/?stockage=${COMPAGNON}&cle=test`;

async function preparerPc(page: Page, tablettes: () => FakeTablette[]) {
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
    return route.abort();
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);
  await page.getByRole('radio', { name: /Kiosque-concours/ }).click();
  await page.locator('#eventName').fill('Événement A');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await expect(page.getByRole('tab', { name: 'Pistes' })).toBeVisible();

  // Un 2e événement et des participants des deux côtés, écrits directement dans la base du PC
  const eventA = await page.evaluate(async () => {
    const idA = localStorage.getItem('insertech_active_event_id') as string;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('insertech_events_db');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const tx = req.result.transaction(['events', 'participants'], 'readwrite');
        const evA = tx.objectStore('events').get(idA);
        evA.onsuccess = () => {
          tx.objectStore('events').put({ ...evA.result, id: 'evt-b', name: 'Événement B' });
          tx.objectStore('participants').put({ id: 'p-a', eventId: idA, name: 'Alice Visible', email: 'a@ex.com', timeMs: null, registeredAt: 1 });
          tx.objectStore('participants').put({ id: 'p-b', eventId: 'evt-b', name: 'Bruno Secret', email: 'b@ex.com', timeMs: null, registeredAt: 1 });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
    return idA;
  });

  await page.getByRole('button', { name: /Synchronisation réseau/ }).click();
  await page.getByRole('button', { name: 'Créer la session hôte' }).click();
  const code = (await page.getByTestId('code-session').innerText()).trim();
  const cle = (await page.getByTestId('cle-session').innerText()).trim().replace(/-/g, '');
  return { code, cle, eventA };
}

async function lireParticipants(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('insertech_events_db');
        req.onsuccess = () => {
          const get = req.result.transaction('participants', 'readonly').objectStore('participants').getAll();
          get.onsuccess = () => resolve(get.result.map((p: any) => p.name));
        };
      })
  );
}

test('Synchro par événement : chaque tablette ne reçoit et n’écrit que son événement', async ({ page }) => {
  test.setTimeout(90_000);
  const tablettes: FakeTablette[] = [];
  const { code, cle, eventA } = await preparerPc(page, () => tablettes);

  const a = new FakeTablette(code, cle, 'Tablette A');
  const b = new FakeTablette(code, cle, 'Tablette B');
  tablettes.push(a, b);
  await a.demarrer();
  await b.demarrer();
  try {
    await expect(page.getByText('Tablette A')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Tablette B')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Connectée', { exact: true })).toHaveCount(2, { timeout: 15_000 });

    // 1. A annonce l'événement A : elle reçoit Alice, jamais Bruno ; B s'inscrit à l'événement B
    a.envoyer({ type: 'REQUEST_INITIAL_SYNC', version: '1.9.0', eventId: eventA });
    const syncA = await a.attendre((m) => m.type === 'INITIAL_SYNC');
    expect(syncA.payload.event.id).toBe(eventA);
    // (l'événement A contient aussi les données de démonstration créées avec l'activité)
    expect(syncA.payload.participants.map((p: any) => p.name)).toContain('Alice Visible');
    expect(syncA.payload.participants.every((p: any) => p.eventId === eventA)).toBe(true);
    expect(JSON.stringify(syncA)).not.toContain('Bruno Secret');
    // La liste des événements actifs n'est qu'une liste de réglages
    for (const e of syncA.payload.activeEvents) expect(Object.keys(e)).not.toContain('participants');

    b.envoyer({ type: 'REQUEST_INITIAL_SYNC', version: '1.9.0' });
    await b.attendre((m) => m.type === 'INITIAL_SYNC');
    b.recus.length = 0;
    b.envoyer({ type: 'SELECT_EVENT', eventId: 'evt-b' });
    const syncB = await b.attendre((m) => m.type === 'INITIAL_SYNC');
    expect(syncB.payload.event.id).toBe('evt-b');
    expect(syncB.payload.participants.map((p: any) => p.name)).toEqual(['Bruno Secret']);
    expect(JSON.stringify(syncB)).not.toContain('Alice Visible');

    // 2. En direct : l'écriture de B (événement B) n'arrive pas chez A
    a.recus.length = 0;
    b.envoyer({
      type: 'DB_WRITE',
      table: 'participants',
      action: 'put',
      data: { id: 'p-b2', eventId: 'evt-b', name: 'Béa Nouvelle', email: 'c@ex.com', timeMs: null, registeredAt: 2 },
      opId: 'b-1'
    });
    await b.attendre((m) => m.type === 'ACK' && m.opId === 'b-1');

    // 3. B tente d'écrire dans l'événement A : accusée mais refusée par le PC
    b.envoyer({
      type: 'DB_WRITE',
      table: 'participants',
      action: 'put',
      data: { id: 'p-intrus', eventId: eventA, name: 'Intrus', email: 'i@ex.com', timeMs: null, registeredAt: 3 },
      opId: 'b-2'
    });
    await b.attendre((m) => m.type === 'ACK' && m.opId === 'b-2');

    // 4. L'écriture de A arrive au PC mais pas chez B
    b.recus.length = 0;
    a.envoyer({
      type: 'DB_WRITE',
      table: 'participants',
      action: 'put',
      data: { id: 'p-a2', eventId: eventA, name: 'Amir Nouveau', email: 'd@ex.com', timeMs: null, registeredAt: 4 },
      opId: 'a-1'
    });
    await a.attendre((m) => m.type === 'ACK' && m.opId === 'a-1');

    // Barrière : un aller-retour de chaque côté garantit que les diffusions éventuelles sont arrivées
    a.envoyer({ type: 'PING' });
    await a.attendre((m) => m.type === 'PONG');
    b.envoyer({ type: 'PING' });
    await b.attendre((m) => m.type === 'PONG');
    expect(JSON.stringify(a.recus)).not.toContain('Béa Nouvelle');
    expect(JSON.stringify(a.recus)).not.toContain('Intrus');
    expect(JSON.stringify(b.recus)).not.toContain('Amir Nouveau');

    const noms = await lireParticipants(page);
    expect(noms).toEqual(expect.arrayContaining(['Alice Visible', 'Bruno Secret', 'Béa Nouvelle', 'Amir Nouveau']));
    expect(noms).not.toContain('Intrus');
  } finally {
    await a.arreter();
    await b.arreter();
  }
});

test('Tablette : un ancien événement est effacé après sa journée, une fois ses envois partis', () => {
  const list = { 'evt-hier': '2026-11-26', 'evt-aujourdhui': '2026-11-27', 'evt-attente': '2026-11-25', 'evt-courant': '2026-11-20' };
  const r = evenementsAEffacer(list, '2026-11-27', 'evt-courant', new Set(['evt-attente']));
  expect(r.effacer).toEqual(['evt-hier']);
  expect(r.garder).toEqual({ 'evt-aujourdhui': '2026-11-27', 'evt-attente': '2026-11-25' });
});
