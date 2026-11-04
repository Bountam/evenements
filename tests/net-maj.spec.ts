import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { EmetteurLien, type Lien } from '../src/net/lien';
import {
  DiffusionMaj, empreinteDansSommes, estMessageMaj, recevoirMajTablette, reinitialiserReceptionMaj, sha256Hex, TAILLE_MORCEAU,
  versionCodeDe, type ContexteTablette, type MessageMaj
} from '../src/net/miseAJour';
import { FauxNatifMaj } from './helpers/fauxNatifMaj';

// Deux liaisons reliées en mémoire (copie JSON comme le chiffrement), messages livrés dans l'ordre
class LienMemoire extends EmetteurLien implements Lien {
  autre!: LienMemoire;
  open = true;
  envoyes = 0;
  constructor(readonly connectionId: string, readonly idDistant: string) {
    super();
  }
  send(m: unknown) {
    this.envoyes += 1;
    const copie = JSON.parse(JSON.stringify(m));
    queueMicrotask(() => this.autre.emit('data', copie));
  }
  close() {
    this.open = false;
  }
}

function relier() {
  const pc = new LienMemoire('pc', 'Kiosque entrée');
  const tablette = new LienMemoire('tab', 'PC hôte');
  pc.autre = tablette;
  tablette.autre = pc;
  return { pc, tablette };
}

async function scenario(natif: FauxNatifMaj, options: Partial<ContexteTablette> = {}, taille = 3 * TAILLE_MORCEAU + 123) {
  reinitialiserReceptionMaj();
  const octets = new Uint8Array(randomBytes(taille));
  const diffusion = new DiffusionMaj({ octets, versionName: '1.5.0', versionCode: 10500, sha256: await sha256Hex(octets) });
  const { pc, tablette } = relier();
  const ctx: ContexteTablette = {
    natif,
    versionCodeActuel: () => 10400,
    verrouillee: () => false,
    avantInstallation: async () => {},
    ...options
  };
  let enVol = 0;
  let maxEnVol = 0;
  tablette.on('data', (m) => {
    if ((m as MessageMaj).type === 'MAJ_MORCEAU') maxEnVol = Math.max(maxEnVol, ++enVol);
    if (estMessageMaj(m)) recevoirMajTablette(tablette, m, ctx);
  });
  pc.on('data', (m) => {
    if ((m as MessageMaj).type === 'MAJ_MORCEAU_OK') enVol -= 1;
    if (estMessageMaj(m)) diffusion.recevoir(pc, m);
  });
  diffusion.proposer(pc);
  await expect.poll(() => diffusion.getEnvois()[0]?.etat).not.toMatch(/^(proposee|envoi)$/);
  await expect.poll(() => diffusion.getEnvois()[0]?.etat).not.toBe('verification');
  return { diffusion, octets, maxEnVol: () => maxEnVol };
}

test('Mise à jour : APK envoyé par morceaux, un seul en vol, vérifié puis installé', async () => {
  const natif = new FauxNatifMaj();
  const { diffusion, octets, maxEnVol } = await scenario(natif);
  expect(diffusion.morceaux).toBe(4);
  expect(diffusion.getEnvois()[0]).toMatchObject({ nom: 'Kiosque entrée', etat: 'confirmation' });
  expect(Buffer.compare(natif.recu(), Buffer.from(octets))).toBe(0);
  expect(natif.installe).toBe(true);
  expect(maxEnVol()).toBe(1);
});

test('Mise à jour : APK altéré, autre clé, version plus ancienne ou tablette verrouillée → refus clair', async () => {
  let r = await scenario(new FauxNatifMaj({ alterer: true }));
  expect(r.diffusion.getEnvois()[0]).toMatchObject({ etat: 'erreur', raison: expect.stringContaining('SHA-256') });

  r = await scenario(new FauxNatifMaj({ autreCle: true }));
  expect(r.diffusion.getEnvois()[0]).toMatchObject({ etat: 'erreur', raison: expect.stringContaining('autre clé') });

  const natif = new FauxNatifMaj();
  r = await scenario(natif, { versionCodeActuel: () => 10500 });
  expect(r.diffusion.getEnvois()[0]).toMatchObject({ etat: 'refusee', raison: expect.stringContaining('pas plus récente') });
  expect(natif.morceaux).toHaveLength(0);

  r = await scenario(new FauxNatifMaj(), { verrouillee: () => true });
  expect(r.diffusion.getEnvois()[0]).toMatchObject({ etat: 'refusee', raison: expect.stringContaining('verrouillée') });

  r = await scenario(new FauxNatifMaj(), { natif: null });
  expect(r.diffusion.getEnvois()[0]).toMatchObject({ etat: 'refusee', raison: expect.stringContaining('Android') });
});

test('Mise à jour : reprise après une coupure, sans renvoyer les morceaux déjà reçus', async () => {
  const natif = new FauxNatifMaj();
  const octets = new Uint8Array(randomBytes(2 * TAILLE_MORCEAU + 5));
  // Le premier morceau était déjà arrivé avant la coupure
  natif.morceaux = [Buffer.from(octets.subarray(0, TAILLE_MORCEAU))];
  reinitialiserReceptionMaj();
  const diffusion = new DiffusionMaj({ octets, versionName: '1.5.0', versionCode: 10500, sha256: await sha256Hex(octets) });
  const { pc, tablette } = relier();
  const ctx: ContexteTablette = { natif, versionCodeActuel: () => 10400, verrouillee: () => false, avantInstallation: async () => {} };
  tablette.on('data', (m) => estMessageMaj(m) && recevoirMajTablette(tablette, m, ctx));
  pc.on('data', (m) => estMessageMaj(m) && diffusion.recevoir(pc, m));
  diffusion.proposer(pc);
  await expect.poll(() => diffusion.getEnvois()[0]?.etat).toBe('confirmation');
  expect(Buffer.compare(natif.recu(), Buffer.from(octets))).toBe(0);
  // Proposition + 2 morceaux restants + fin, pas 3 morceaux
  expect(pc.envoyes).toBe(4);
});

test('Mise à jour : versions et SHA256SUMS.txt', () => {
  expect(versionCodeDe('1.4.0')).toBe(10400);
  expect(versionCodeDe('v2.10.3')).toBe(21003);
  expect(versionCodeDe('1.4')).toBeNull();
  const sommes = `${'a'.repeat(64)}  InsertechEvenements-Setup-1.5.0.exe\n${'B'.repeat(64)}  InsertechEvenements-Android.apk\n`;
  expect(empreinteDansSommes(sommes, 'InsertechEvenements-Android.apk')).toBe('b'.repeat(64));
  expect(empreinteDansSommes(sommes, 'autre.apk')).toBeNull();
});

test('Mise à jour : APK déjà reçu en entier (renvoi après autorisation) → vérification sans rien renvoyer', async () => {
  const octets = new Uint8Array(randomBytes(TAILLE_MORCEAU + 7));
  const natif = new FauxNatifMaj();
  natif.morceaux = [Buffer.from(octets)];
  natif.ouvrir = async () => octets.length;
  reinitialiserReceptionMaj();
  const diffusion = new DiffusionMaj({ octets, versionName: '1.5.0', versionCode: 10500, sha256: await sha256Hex(octets) });
  const { pc, tablette } = relier();
  const ctx: ContexteTablette = { natif, versionCodeActuel: () => 10400, verrouillee: () => false, avantInstallation: async () => {} };
  tablette.on('data', (m) => estMessageMaj(m) && recevoirMajTablette(tablette, m, ctx));
  pc.on('data', (m) => estMessageMaj(m) && diffusion.recevoir(pc, m));
  diffusion.proposer(pc);
  await expect.poll(() => diffusion.getEnvois()[0]?.etat).toBe('confirmation');
  expect(pc.envoyes).toBe(2); // proposition puis fin
});
