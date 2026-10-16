import { expect, test, type Page } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

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

function resolveDotnetBinary(): string {
  const candidates = [
    process.env.DOTNET_ROOT ? path.join(process.env.DOTNET_ROOT, process.platform === 'win32' ? 'dotnet.exe' : 'dotnet') : '',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'dotnet', 'dotnet.exe') : '',
    process.env.HOME ? path.join(process.env.HOME, '.dotnet', 'dotnet') : '',
    '/usr/bin/dotnet',
    '/usr/share/dotnet/dotnet'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const out = execFileSync(candidate, ['--list-sdks'], { encoding: 'utf8' });
        if (out.trim().length > 0) return candidate;
      } catch {
        // Continuer avec le candidat suivant
      }
    }
  }
  return 'dotnet';
}

test('Mise à jour Windows (lanceur C#) — origine refusée, fichier tronqué, mauvaise et bonne empreinte SHA-256, copie SQLite et relance', async ({
  page
}) => {
  test.setTimeout(60000);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'insertech-maj-lot2-'));
  const binDir = path.join(tmpRoot, 'bin');
  const appDataDir = path.join(tmpRoot, 'appdata');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(appDataDir, { recursive: true });

  // S'assurer que dist/index.html existe pour la ressource embarquée du lanceur
  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndex = path.join(distDir, 'index.html');
  let createdStubDist = false;
  if (!fs.existsSync(distIndex)) {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(distIndex, '<!doctype html><html><body>stub</body></html>', 'utf8');
    createdStubDist = true;
  }

  const dotnetBin = resolveDotnetBinary();
  let launcherProc: ChildProcess | null = null;
  let releaseServer: http.Server | null = null;

  try {
    execFileSync(
      dotnetBin,
      [
        'build',
        'launcher',
        '-p:SelfContained=false',
        '-p:PublishSingleFile=false',
        '-p:PublishTrimmed=false',
        '-o',
        binDir
      ],
      { cwd: process.cwd(), stdio: 'pipe' }
    );

    const dllPath = fs.existsSync(path.join(binDir, 'InsertechEvenements.dll'))
      ? path.join(binDir, 'InsertechEvenements.dll')
      : path.join(binDir, 'InsertechEvenements-linux-x64.dll');

    // Faux installeur binaire (128 Ko) et son empreinte SHA-256 réelle
    const installerBytes = crypto.randomBytes(128 * 1024);
    const validSha256 = crypto.createHash('sha256').update(installerBytes).digest('hex');
    const badSha256 = '0'.repeat(64);
    const targetVersion = '1.9.0';
    const installerFileName = `InsertechEvenements-Setup-${targetVersion}.exe`;

    let serveMode: 'bad_hash' | 'truncated' | 'good_hash' = 'bad_hash';

    releaseServer = http.createServer((req, res) => {
      if (req.url === `/${installerFileName}`) {
        if (serveMode === 'truncated') {
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(installerBytes.length)
          });
          res.write(installerBytes.subarray(0, 16 * 1024));
          setTimeout(() => req.socket.destroy(), 20);
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(installerBytes.length)
        });
        res.end(installerBytes);
        return;
      }

      if (req.url === '/SHA256SUMS.txt') {
        const hashToUse = serveMode === 'bad_hash' ? badSha256 : validSha256;
        const body = `${hashToUse}  ${installerFileName}\n${'f'.repeat(64)}  InsertechEvenements-Android.apk\n`;
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(body);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => releaseServer!.listen(0, '127.0.0.1', () => resolve()));
    const mockPort = (releaseServer.address() as any).port as number;
    const mockBaseUrl = `http://127.0.0.1:${mockPort}`;
    const installerRecordPath = path.join(appDataDir, 'installer-launched.txt');

    launcherProc = spawn(dotnetBin, [dllPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        INSERTECH_APPDATA_DIR: appDataDir,
        INSERTECH_HEADLESS_COMPANION: '1',
        INSERTECH_TEST_UPDATE_PREFIX: `${mockBaseUrl}/`,
        INSERTECH_TEST_INSTALLER_RECORD: installerRecordPath
      },
      stdio: 'ignore'
    });

    // Attendre la création de stockage.txt par le lanceur C#
    const stockageFile = path.join(appDataDir, 'stockage.txt');
    let companionPort = '';
    let companionToken = '';
    for (let i = 0; i < 60; i++) {
      if (fs.existsSync(stockageFile)) {
        const lines = fs.readFileSync(stockageFile, 'utf8').trim().split(/\r?\n/);
        if (lines.length >= 2 && lines[0] && lines[1]) {
          companionPort = lines[0].trim();
          companionToken = lines[1].trim();
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(companionPort).not.toBe('');
    expect(companionToken).not.toBe('');

    // 1. Toute adresse hors origine autorisée est refusée par le lanceur
    const badOriginRes = await fetch(`http://127.0.0.1:${companionPort}/mise-a-jour?cle=${companionToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        version: targetVersion,
        installerUrl: `https://evil.example.com/${installerFileName}`,
        sha256SumsUrl: `${mockBaseUrl}/SHA256SUMS.txt`
      })
    });
    expect(badOriginRes.status).toBe(400);
    const badOriginJson = await badOriginRes.json();
    expect(badOriginJson.state).toBe('error');
    expect(badOriginJson.error).toBe('origine');

    // Configurer la page Playwright connectée au vrai serveur SQLite/mise-à-jour du lanceur
    await page.addInitScript((prefix: string) => {
      (window as any).__INSERTECH_TEST_DOWNLOAD_PREFIX__ = prefix;
      (window as any).__INSERTECH_SKIP_WINDOW_CLOSE__ = true;
    }, `${mockBaseUrl}/`);

    await page.route(GITHUB_RELEASE_API, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          makeReleasePayload({
            tag_name: `v${targetVersion}`,
            assets: [
              {
                name: installerFileName,
                browser_download_url: `${mockBaseUrl}/${installerFileName}`
              },
              {
                name: 'SHA256SUMS.txt',
                browser_download_url: `${mockBaseUrl}/SHA256SUMS.txt`
              }
            ]
          })
        )
      });
    });

    await page.goto(`http://localhost:4173/?stockage=${companionPort}&cle=${companionToken}`);

    const dialog = page.getByRole('dialog', { name: `Version ${targetVersion} disponible` });
    await expect(dialog).toBeVisible();

    // 2. Mauvaise empreinte SHA-256 : le fichier est supprimé et rien n'est installé
    serveMode = 'bad_hash';
    await dialog.getByRole('button', { name: 'Mettre à jour' }).click();
    await expect(dialog.getByRole('alert')).toContainText(/empreinte SHA-256 ne correspond pas/i);

    const finalInstallerPath = path.join(appDataDir, 'mises-a-jour', installerFileName);
    const partInstallerPath = `${finalInstallerPath}.part`;
    expect(fs.existsSync(finalInstallerPath)).toBe(false);
    expect(fs.existsSync(partInstallerPath)).toBe(false);
    expect(fs.existsSync(installerRecordPath)).toBe(false);

    // 3. Fichier tronqué : le fichier .part est supprimé et rien n'est installé
    serveMode = 'truncated';
    await dialog.getByRole('button', { name: 'Mettre à jour' }).click();
    await expect(dialog.getByRole('alert')).toContainText(/fichier tronqué/i);
    expect(fs.existsSync(finalInstallerPath)).toBe(false);
    expect(fs.existsSync(partInstallerPath)).toBe(false);
    expect(fs.existsSync(installerRecordPath)).toBe(false);

    // 4. Bonne empreinte SHA-256 : copie SQLite, téléchargement vérifié, lancement /S /RELANCER et sortie du lanceur
    serveMode = 'good_hash';
    const exitPromise = new Promise<number | null>((resolve) => {
      launcherProc!.once('exit', (code) => resolve(code));
    });

    await dialog.getByRole('button', { name: 'Mettre à jour' }).click();
    await expect(dialog.getByText(/Installation en cours/)).toBeVisible();

    const exitCode = await exitPromise;
    expect(exitCode).toBe(0);

    // L'installeur vérifié est présent dans mises-a-jour/ avec la bonne empreinte
    expect(fs.existsSync(finalInstallerPath)).toBe(true);
    const savedHash = crypto.createHash('sha256').update(fs.readFileSync(finalInstallerPath)).digest('hex');
    expect(savedHash).toBe(validSha256);

    // La copie SQLite avant installation est présente dans sauvegardes-sqlite/
    const backupsDir = path.join(appDataDir, 'sauvegardes-sqlite');
    const backupFiles = fs.readdirSync(backupsDir);
    expect(backupFiles.some((f) => f.includes('-avant-maj.db'))).toBe(true);

    // L'installeur a été invoqué avec /S /RELANCER et stockage.txt a été nettoyé
    expect(fs.existsSync(installerRecordPath)).toBe(true);
    const launchedContent = fs.readFileSync(installerRecordPath, 'utf8').trim().split(/\r?\n/);
    expect(launchedContent[0]).toBe(finalInstallerPath);
    expect(launchedContent[1]).toBe('/S /RELANCER');
    expect(launchedContent[2]).toBe(targetVersion);
    expect(fs.existsSync(stockageFile)).toBe(false);

    // 5. À la relance après mise à jour, l'application affiche « Mise à jour vers 1.9.0 terminée »
    await page.addInitScript((ver: string) => {
      (window as any).__INSERTECH_APP_VERSION__ = ver;
    }, targetVersion);
    await page.goto(`http://localhost:4173/?maj=${targetVersion}`);
    await expect(page.getByText(`Mise à jour vers ${targetVersion} terminée`)).toBeVisible();
  } finally {
    if (launcherProc && !launcherProc.killed) {
      try {
        launcherProc.kill();
      } catch {}
    }
    if (releaseServer) {
      await new Promise<void>((resolve) => releaseServer!.close(() => resolve()));
    }
    if (createdStubDist) {
      try {
        fs.rmSync(distDir, { recursive: true, force: true });
      } catch {}
    }
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  }
});
