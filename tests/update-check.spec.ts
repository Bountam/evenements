import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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

  await page.goto('http://localhost:4173/');

  // Fenêtre ouverte au menu principal avec le titre, les notes et le lien vers la release
  const dialog = page.getByRole('dialog', { name: 'Version 1.9.0 disponible' });
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
  const dialog = page.getByRole('dialog', { name: 'Version 1.9.0 disponible' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Termine la session pour mettre à jour')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Mettre à jour' })).toBeDisabled();
});

// Pont PeerJS en mémoire entre deux pages Playwright pour tester le réseau PC ↔ Tablette sans Internet
async function wireInMemoryPeerBridge(hostPage: Page, clientPage: Page) {
  await hostPage.exposeFunction('__peerBridgeFromHost', (payload: any) => {
    setTimeout(() => {
      clientPage.evaluate((p) => (window as any).__peerReceiveFromHost?.(p), payload).catch(() => {});
    }, 0);
  });

  await clientPage.exposeFunction('__peerBridgeFromClient', (payload: any) => {
    setTimeout(() => {
      hostPage.evaluate((p) => (window as any).__peerReceiveFromClient?.(p), payload).catch(() => {});
    }, 0);
  });

  const initScript = (side: 'host' | 'client') => {
    class FakeConnection {
      connectionId = 'conn-tablet-1';
      open = false;
      private handlers: Record<string, Array<(...args: any[]) => void>> = {};
      constructor(private sendFn: (msg: any) => void) {}
      on(event: string, cb: (...args: any[]) => void) {
        (this.handlers[event] ||= []).push(cb);
      }
      emit(event: string, ...args: any[]) {
        for (const cb of this.handlers[event] || []) cb(...args);
      }
      send(data: any) {
        this.sendFn({ type: 'data', data });
      }
      close() {
        if (!this.open) return;
        this.open = false;
        this.emit('close');
        this.sendFn({ type: 'close' });
      }
    }

    class FakePeer {
      id: string;
      disconnected = false;
      destroyed = false;
      private handlers: Record<string, Array<(...args: any[]) => void>> = {};
      private conn: FakeConnection | null = null;

      constructor(idOrOpts?: any) {
        this.id = typeof idOrOpts === 'string' ? idOrOpts : 'client-peer-1';
        setTimeout(() => {
          if (this.destroyed) return;
          this.emit('open', this.id);
        }, 5);

        if (side === 'host') {
          (window as any).__peerReceiveFromClient = (payload: any) => {
            if (payload.type === 'connect') {
              const conn = new FakeConnection((msg) => (window as any).__peerBridgeFromHost(msg));
              conn.open = true;
              this.conn = conn;
              this.emit('connection', conn);
              (window as any).__peerBridgeFromHost({ type: 'connected' });
            } else if (payload.type === 'data' && this.conn) {
              this.conn.emit('data', payload.data);
            } else if (payload.type === 'close' && this.conn) {
              this.conn.open = false;
              this.conn.emit('close');
            }
          };
        } else {
          (window as any).__peerReceiveFromHost = (payload: any) => {
            if (payload.type === 'connected' && this.conn) {
              this.conn.open = true;
              this.conn.emit('open');
            } else if (payload.type === 'data' && this.conn) {
              this.conn.emit('data', payload.data);
            } else if (payload.type === 'close' && this.conn) {
              this.conn.open = false;
              this.conn.emit('close');
            }
          };
        }
      }

      on(event: string, cb: (...args: any[]) => void) {
        (this.handlers[event] ||= []).push(cb);
      }
      emit(event: string, ...args: any[]) {
        for (const cb of this.handlers[event] || []) cb(...args);
      }
      connect(_code: string) {
        const conn = new FakeConnection((msg) => (window as any).__peerBridgeFromClient(msg));
        this.conn = conn;
        setTimeout(() => {
          (window as any).__peerBridgeFromClient({ type: 'connect' });
        }, 10);
        return conn;
      }
      reconnect() {}
      destroy() {
        this.destroyed = true;
      }
    }

    (window as any).__INSERTECH_PEER_CLASS__ = FakePeer;
  };

  await hostPage.addInitScript(initScript, 'host');
  await clientPage.addInitScript(initScript, 'client');
}

test('Réseau PC et tablette avec deux versions — avertissement sur le PC sans bloquer la synchro', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const tabletContext = await browser.newContext();

  try {
    const hostPage = await hostContext.newPage();
    const tabletPage = await tabletContext.newPage();

    await wireInMemoryPeerBridge(hostPage, tabletPage);

    // Le PC est en 1.2.7, la tablette est en 1.2.5
    await hostPage.addInitScript(() => {
      (window as any).__INSERTECH_APP_VERSION__ = '1.2.7';
    });
    await tabletPage.addInitScript(() => {
      (window as any).__INSERTECH_APP_VERSION__ = '1.2.5';
    });

    for (const p of [hostPage, tabletPage]) {
      await p.route(GITHUB_RELEASE_API, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeReleasePayload({ tag_name: 'v1.2.5' }))
        })
      );
    }

    await hostPage.goto('http://localhost:4173/');
    await tabletPage.goto('http://localhost:4173/');

    // Le PC crée une activité Kiosque-concours et lance la session hôte
    await hostPage.getByRole('radio', { name: /Kiosque-concours/ }).click();
    await hostPage.locator('#eventName').fill('Concours Version Test');
    await hostPage.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
    await hostPage.getByRole('button', { name: "Créer l'activité" }).click();

    await hostPage.getByRole('button', { name: 'Réseau LAN' }).click();
    await hostPage.getByRole('button', { name: 'Créer la session hôte' }).click();

    const codeLocator = hostPage.locator('span.text-3xl');
    await expect(codeLocator).toHaveText(/^INS-\d{4}-/);
    const sessionCode = (await codeLocator.textContent())!.trim();
    await hostPage.getByRole('button', { name: 'Fermer la boîte de dialogue' }).click();

    // La tablette (1.2.5) rejoint la session du PC (1.2.7)
    await tabletPage.getByRole('button', { name: 'Rejoindre une session réseau' }).click();
    await tabletPage.getByPlaceholder('Ex. INS-4821').fill(sessionCode);
    await tabletPage.getByRole('button', { name: 'Rejoindre', exact: true }).click();

    // La synchronisation fonctionne sans blocage : la tablette bascule sur l'activité du PC
    await expect(tabletPage.getByText('Concours Version Test').first()).toBeVisible();

    // Le PC affiche l'avertissement de différence de version
    await expect(hostPage.getByText('Tablette en 1.2.5, PC en 1.2.7')).toBeVisible();
  } finally {
    await hostContext.close();
    await tabletContext.close();
  }
});
