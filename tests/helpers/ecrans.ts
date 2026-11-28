import { expect, type Page } from '@playwright/test';

// Écrans du plan v1.9 (§ 6.5) et façon d'y arriver, pour le test « zéro défilement » et la galerie de captures.
export const URL = 'http://localhost:4173/';

export const SIMULATE_ANDROID = () => {
  (window as any).androidBridge = { postMessage: () => {} };
};

export interface Taille {
  nom: string;
  width: number;
  height: number;
}

// Tableau 6.1 du plan
export const TAILLES_MOBILES: Taille[] = [
  { nom: 'petit cellulaire portrait', width: 360, height: 640 },
  { nom: 'petit cellulaire paysage', width: 640, height: 360 },
  { nom: 'cellulaire portrait', width: 390, height: 844 },
  { nom: 'cellulaire paysage', width: 844, height: 390 },
  { nom: 'tablette portrait', width: 800, height: 1280 },
  { nom: 'tablette paysage', width: 1280, height: 800 }
];
export const TAILLES_LAPTOP: Taille[] = [{ nom: 'laptop', width: 1366, height: 768 }];
export const TAILLES_TV: Taille[] = [
  { nom: 'TV 1080p', width: 1920, height: 1080 },
  { nom: 'TV 720p', width: 1280, height: 720 }
];

export interface Ecran {
  id: string;
  titre: string;
  tailles: Taille[];
  // Formulaire : aussi vérifié avec 40 % de hauteur en moins (clavier ouvert)
  clavier?: boolean;
  preparer: (page: Page) => Promise<void>;
}

async function creerActivite(page: Page, type: RegExp, nom: string) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(URL);
  await page.getByRole('radio', { name: type }).click();
  await page.locator('#eventName').fill(nom);
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();
}

async function versTablette(page: Page) {
  await page.addInitScript(SIMULATE_ANDROID);
  await page.reload();
}

async function concoursSurTablette(page: Page) {
  await creerActivite(page, /Kiosque-concours/, 'Kiosque captures');
  await expect(page.getByRole('tab', { name: 'Pistes' })).toBeVisible();
  await versTablette(page);
  await expect(page.getByRole('heading', { name: "Quel est votre rôle aujourd'hui ?" })).toBeVisible();
}

async function inscrireAppareil(page: Page, nom: string) {
  await page.getByRole('group', { name: "Catégorie d'appareil" }).getByRole('button', { name: 'Portable' }).click();
  await page.getByRole('group', { name: "Marque de l'appareil" }).getByRole('button', { name: 'Lenovo' }).click();
  await page.getByRole('group', { name: 'Gamme ou modèle' }).getByRole('button', { name: 'ThinkPad' }).click();
  await page.getByRole('group', { name: 'Domaine du problème' }).getByRole('button', { name: /Problème Matériel/i }).click();
  await page.getByRole('group', { name: "Symptômes de l'appareil" }).getByRole('button', { name: /Alimentation \/ Batterie/i }).click();
  await page.getByRole('button', { name: /^Continuer/i }).click();
  await page.getByRole('button', { name: /Inscrire le participant/i }).click();
  await page.locator('#rp-displayName').fill(nom);
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#rp-phone').fill('514 555-7788');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#rp-consentActivity').check();
  await page.getByRole('button', { name: /Valider et enregistrer 1 appareil/i }).click();
  await expect(page.getByText(`Appareil enregistré pour ${nom} !`)).toBeVisible();
}

async function reparateurSurTablette(page: Page) {
  await creerActivite(page, /^Réparothon/, 'Réparothon captures');
  await inscrireAppareil(page, 'Marc Tremblay');
  await page.route('https://*.ifixit.com/**', (route) => route.abort());
  await versTablette(page);
  await page.getByRole('button', { name: /Animateur Réparateur/i }).click();
  await page.getByRole('button', { name: /Alexandre Tremblay/i }).click();
}

export const ECRANS: Ecran[] = [
  {
    id: 'rejoindre',
    titre: 'Rejoindre un événement (tablette)',
    tailles: TAILLES_MOBILES,
    preparer: async (page) => {
      await page.addInitScript(SIMULATE_ANDROID);
      await page.goto(URL);
      await expect(page.getByRole('heading', { name: 'Rejoindre un événement' })).toBeVisible();
    }
  },
  {
    id: 'onboarding-role',
    titre: 'Onboarding : choix du rôle',
    tailles: TAILLES_MOBILES,
    preparer: concoursSurTablette
  },
  {
    id: 'onboarding-identification',
    titre: 'Onboarding : identification',
    tailles: TAILLES_MOBILES,
    clavier: true,
    preparer: async (page) => {
      await concoursSurTablette(page);
      await page.getByRole('button', { name: /Animateur Juge/i }).click();
      await expect(page.locator('#mob-vol-displayName')).toBeVisible();
    }
  },
  {
    id: 'kiosque-formulaire',
    titre: "Kiosque d'inscription : question 1",
    tailles: TAILLES_MOBILES,
    clavier: true,
    preparer: async (page) => {
      await concoursSurTablette(page);
      await page.getByRole('button', { name: /Kiosque d'inscription/ }).click();
      await expect(page.locator('#participant-displayName')).toBeVisible();
    }
  },
  {
    id: 'kiosque-recapitulatif',
    titre: "Kiosque d'inscription : récapitulatif",
    tailles: TAILLES_MOBILES,
    preparer: async (page) => {
      await concoursSurTablette(page);
      await page.getByRole('button', { name: /Kiosque d'inscription/ }).click();
      await page.locator('#participant-displayName').fill('Léa Tremblay');
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.locator('#participant-email').fill('lea@example.com');
      await page.getByRole('button', { name: 'Suivant' }).click();
      await page.locator('#participant-consentActivity').check();
      await page.getByRole('button', { name: 'Suivant' }).click();
      await expect(page.getByRole('button', { name: 'Inscrire le participant' })).toBeVisible();
    }
  },
  {
    id: 'juge',
    titre: 'Cockpit juge',
    tailles: TAILLES_MOBILES,
    preparer: async (page) => {
      await concoursSurTablette(page);
      await page.getByRole('button', { name: /Animateur Juge/i }).click();
      await page.locator('#mob-vol-displayName').fill('Marc Juge');
      await page.getByRole('button', { name: /Confirmer et ouvrir mon espace/i }).click();
      await expect(page.getByRole('button', { name: /Inscrire mon 1er joueur/i })).toBeVisible();
    }
  },
  {
    id: 'reparateur-file',
    titre: "Réparateur : file d'attente",
    tailles: TAILLES_MOBILES,
    preparer: async (page) => {
      await reparateurSurTablette(page);
      await expect(page.getByRole('button', { name: /Prendre cet appareil/i }).first()).toBeVisible();
    }
  },
  {
    id: 'reparateur-ticket',
    titre: 'Réparateur : appareil en cours',
    tailles: TAILLES_MOBILES,
    preparer: async (page) => {
      await reparateurSurTablette(page);
      await page.getByRole('button', { name: /Prendre cet appareil/i }).first().click();
      await expect(page.getByRole('region', { name: "Fiche technique de l'appareil" })).toBeVisible();
    }
  },
  {
    id: 'ecran-public',
    titre: 'Écran public (TV 16:9)',
    tailles: TAILLES_TV,
    preparer: async (page) => {
      await creerActivite(page, /Kiosque-concours/, 'Kiosque écran public');
      await page.getByRole('tab', { name: /Écran public/i }).click();
    }
  },
  {
    id: 'pc-pistes',
    titre: 'Laptop : pistes du concours',
    tailles: TAILLES_LAPTOP,
    preparer: async (page) => {
      await creerActivite(page, /Kiosque-concours/, 'Kiosque laptop');
      await expect(page.getByRole('tab', { name: 'Pistes' })).toBeVisible();
    }
  }
];

export interface Mesure {
  pageX: number;
  pageY: number;
  zonesPage: { cls: string; oy: number; ox: number }[];
  horsZone: { tag: string; cls: string; oy: number; ox: number }[];
  principal: { visible: boolean; texte: string } | null;
}

// Ce qui déborde : la page, la zone « page » d'un écran, ou un élément défilant hors ScrollZone
export async function mesurer(page: Page): Promise<Mesure> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const de = document.documentElement;
    const res: any = { pageX: de.scrollWidth - vw, pageY: de.scrollHeight - vh, zonesPage: [], horsZone: [], principal: null };
    // Page coupée sans défiler (html et body en overflow: hidden) : l'écran dépasse quand même
    const racines = [document.body, document.getElementById('root'), ...Array.from(document.getElementById('root')?.children ?? [])];
    for (const el of racines) {
      if (!el) continue;
      res.pageY = Math.max(res.pageY, el.scrollHeight - Math.min(el.clientHeight, vh), el.getBoundingClientRect().bottom - vh);
      res.pageX = Math.max(res.pageX, el.scrollWidth - Math.min(el.clientWidth, vw));
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const cs = getComputedStyle(el);
      const sy = /(auto|scroll)/.test(cs.overflowY);
      const sx = /(auto|scroll)/.test(cs.overflowX);
      if (!sy && !sx) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const oy = sy ? el.scrollHeight - el.clientHeight : 0;
      const ox = sx ? el.scrollWidth - el.clientWidth : 0;
      if (oy <= 1 && ox <= 1) continue;
      const kind = el.getAttribute('data-scroll-zone');
      const d = { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 90), oy, ox };
      if (kind === 'page') res.zonesPage.push(d);
      else if (!kind) res.horsZone.push(d);
    }
    const p = document.querySelector<HTMLElement>('[data-primary-action]');
    if (p && p.getBoundingClientRect().width > 0) {
      const r = p.getBoundingClientRect();
      res.principal = {
        visible: r.top >= -0.5 && r.bottom <= vh + 0.5 && r.left >= -0.5 && r.right <= vw + 0.5,
        texte: (p.innerText || p.getAttribute('aria-label') || '').trim().slice(0, 60)
      };
    }
    return res;
  });
}
