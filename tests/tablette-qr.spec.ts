import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import QRCode from 'qrcode';

// La tablette rejoint l'événement en scannant le QR affiché par le PC hôte. La caméra est simulée :
// getUserMedia rend un flux dessiné à partir de l'image du QR (window.__imageQr).
const URL = pathToFileURL(path.resolve('dist/index.html')).href;

const TABLETTE_AVEC_CAMERA = () => {
  (window as any).androidBridge = { postMessage: () => {} };
  // Plugin natif ServeurLocal simulé par le pont de Capacitor : il démarre et note les appels
  const appels: Array<{ methode: string; options: any }> = [];
  (window as any).__appelsServeur = appels;
  const methodes = ['demarrer', 'majFiche', 'envoyer', 'fermer', 'arreter', 'infos', 'removeListener'];
  (window as any).Capacitor = {
    PluginHeaders: [
      { name: 'ServeurLocal', methods: [...methodes.map((name) => ({ name, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }] }
    ],
    nativePromise: async (plugin: string, methode: string, options: any) => {
      appels.push({ methode, options });
      if (methode === 'demarrer') return { port: 47630, ip: '192.168.43.20' };
      if (methode === 'infos') return { modele: 'samsung SM-X200' };
      return undefined;
    },
    nativeCallback: (_plugin: string, _methode: string, options: any) => `ecouteur-${options?.eventName}`
  };
  const md = navigator.mediaDevices as any;
  md.getUserMedia = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.src = (window as any).__imageQr;
    await img.decode();
    const dessiner = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 480, 480);
      ctx.drawImage(img, 40, 40, 400, 400);
    };
    dessiner();
    setInterval(dessiner, 100);
    return canvas.captureStream(10);
  };
};

async function qrDuPc(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);
  await page.getByRole('radio', { name: /Kiosque-concours/ }).click();
  await page.locator('#eventName').fill('Kiosque QR CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
  await expect(page.getByRole('tab', { name: 'Pistes' })).toBeVisible();
  await page.getByRole('button', { name: /Réseau LAN/ }).click();
  await page.getByRole('button', { name: 'Créer la session hôte' }).click();
  const code = (await page.getByTestId('code-session').innerText()).trim();
  const img = page.getByRole('img', { name: /Code QR pour rejoindre la session/ });
  await expect(img).toHaveAttribute('src', /^data:image\/png/);
  const src = (await img.getAttribute('src'))!;
  return { code, src, cle: (await page.getByTestId('cle-session').innerText()).trim().replace(/-/g, '') };
}

test('Tablette : scanner le QR du PC rejoint la session, un autre QR est refusé, la session est gardée', async ({ browser }) => {
  test.setTimeout(60_000);
  const pc = await browser.newPage();
  const { code, src, cle } = await qrDuPc(pc);

  const tablette = await browser.newPage();
  const erreurs: string[] = [];
  tablette.on('pageerror', (e) => erreurs.push(e.message));
  await tablette.addInitScript(TABLETTE_AVEC_CAMERA);
  await tablette.setViewportSize({ width: 800, height: 1280 });
  await tablette.goto(URL);
  await expect(tablette.getByRole('heading', { name: 'Rejoindre un événement' })).toBeVisible();

  // Un QR qui n'est pas celui du PC : message, le scanner reste ouvert
  await tablette.evaluate((s) => ((window as any).__imageQr = s), await QRCode.toDataURL('https://exemple.org/', { width: 400 }));
  await tablette.getByRole('button', { name: 'Scanner le QR du PC' }).click();
  await expect(tablette.getByText("Ce QR n'est pas un QR Insertech.")).toBeVisible({ timeout: 10_000 });
  await tablette.getByRole('button', { name: 'Annuler' }).click();

  // Le QR du PC : la tablette mémorise code et clé et attend l'appel du PC
  await tablette.evaluate((s) => ((window as any).__imageQr = s), src);
  await tablette.getByRole('button', { name: 'Scanner le QR du PC' }).click();
  await expect(tablette.getByText(`Connectée à la session ${code}`)).toBeVisible({ timeout: 10_000 });
  const memo = await tablette.evaluate(() => ({
    code: localStorage.getItem('insertech_net_session_code'),
    cle: localStorage.getItem('insertech_net_session_key'),
    evenement: localStorage.getItem('insertech_net_event_nom'),
    nom: localStorage.getItem('insertech_net_tablet_name')
  }));
  expect(memo).toEqual({ code, cle, evenement: 'Kiosque QR CI', nom: 'samsung SM-X200' });

  expect(await tablette.evaluate(() => (window as any).__appelsServeur.find((a: any) => a.methode === 'demarrer')?.options)).toEqual({
    port: 47630,
    nom: 'samsung SM-X200',
    session: code
  });

  // Relancer l'appli : la session reprend sans rien demander (serveur redémarré avec la même session)
  await tablette.reload();
  await expect(tablette.getByText(`Connectée à la session ${code}`)).toBeVisible();
  await expect.poll(() => tablette.evaluate(() => (window as any).__appelsServeur.some((a: any) => a.methode === 'demarrer'))).toBe(true);

  // Renommer la tablette : la fiche vue par le PC change sans couper la liaison
  await tablette.getByRole('button', { name: 'Voir la connexion' }).click();
  await expect(tablette.getByTestId('adresse-tablette')).toHaveText('Adresse : 192.168.43.20');
  await tablette.locator('#nom-tablette').fill('Kiosque entrée');
  await tablette.getByRole('button', { name: 'Renommer' }).click();
  await expect
    .poll(() => tablette.evaluate(() => (window as any).__appelsServeur.find((a: any) => a.methode === 'majFiche')?.options))
    .toEqual({ nom: 'Kiosque entrée', session: code });

  // Quitter cet événement : confirmation, puis la tablette oublie tout
  await tablette.getByRole('button', { name: 'Quitter cet événement' }).click();
  await tablette.getByRole('alertdialog').getByRole('button', { name: 'Quitter' }).click();
  await expect(tablette.getByRole('button', { name: 'Scanner le QR du PC' })).toBeVisible();
  expect(await tablette.evaluate(() => localStorage.getItem('insertech_net_session_key'))).toBeNull();
  expect(erreurs).toEqual([]);
});

test('PC hôte : « Nouvelle clé » change la clé et le QR', async ({ page }) => {
  const { cle, src } = await qrDuPc(page);
  await page.getByRole('button', { name: 'Nouvelle clé' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Changer la clé' }).click();
  await expect(page.getByTestId('cle-session')).not.toHaveText(new RegExp(cle.slice(0, 4)));
  const nouvelle = (await page.getByTestId('cle-session').innerText()).trim().replace(/-/g, '');
  expect(nouvelle).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
  expect(nouvelle).not.toBe(cle);
  expect(await page.evaluate(() => localStorage.getItem('insertech_net_session_key'))).toBe(nouvelle);
  await expect(page.getByRole('img', { name: /Code QR pour rejoindre la session/ })).not.toHaveAttribute('src', src);
});
