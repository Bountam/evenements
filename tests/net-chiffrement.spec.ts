import { expect, test } from '@playwright/test';
import { chiffrer, cleDeSession, dechiffrer, formaterCle, normaliserCle, nouvelleCle, nouveauNonce } from '../src/net/chiffrement';
import { PoigneeHote, PoigneeTablette } from '../src/net/poignee';

// Poignée de main complète entre deux côtés en mémoire ; renvoie les clés de liaison obtenues
async function poignee(cleHote: string, cleTablette: string, code = 'ABC123') {
  const versHote: string[] = [];
  const versTablette: string[] = [];
  const tablette = new PoigneeTablette(cleTablette, code, (t) => versHote.push(t));
  const hote = new PoigneeHote(cleHote, code, (t) => versTablette.push(t));
  tablette.ouvrir();
  const r1 = await hote.recevoir(versHote.shift()!);
  if (r1 !== 'attente') return { hote: r1, tablette: null };
  const cleT = await tablette.recevoir(versTablette.shift()!);
  if (!cleT) return { hote: null, tablette: null };
  const cleH = await hote.recevoir(versHote.shift()!);
  return { hote: cleH as CryptoKey | null, tablette: cleT };
}

test('Clé de session : format, saisie tolérante', () => {
  const cle = nouvelleCle();
  expect(cle).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
  expect(normaliserCle(formaterCle(cle).toLowerCase().replace(/-/g, ' - '))).toBe(cle);
  expect(normaliserCle('ABCD-EFGH-JKL0')).toBeNull();
  expect(normaliserCle('ABCD')).toBeNull();
});

test('Poignée de main : même clé → liaison chiffrée dans les deux sens', async () => {
  const cle = nouvelleCle();
  const { hote, tablette } = await poignee(cle, cle);
  expect(hote).not.toBeNull();
  expect(tablette).not.toBeNull();
  const message = { type: 'DB_WRITE', table: 'tickets', action: 'put', data: { id: 'é', n: 1 } };
  const texte = await chiffrer(hote!, message);
  expect(texte).not.toContain('tickets');
  expect(await dechiffrer(tablette!, texte)).toEqual(message);
  expect(await dechiffrer(hote!, await chiffrer(tablette!, { ok: true }))).toEqual({ ok: true });
});

test('Poignée de main : mauvaise clé refusée des deux côtés', async () => {
  const { hote, tablette } = await poignee(nouvelleCle(), nouvelleCle());
  expect(hote).toBeNull();
  expect(tablette).toBeNull();
});

test('Poignée de main : preuve du PC renvoyée telle quelle à un PC refusée', async () => {
  const cle = nouvelleCle();
  // Une « tablette » qui envoie un défi puis renvoie au PC sa propre preuve
  const defi = JSON.stringify({ type: 'DEFI', nonce: nouveauNonce() });
  const sortie: string[] = [];
  const hote2 = new PoigneeHote(cle, 'ABC123', (t) => sortie.push(t));
  expect(await hote2.recevoir(defi)).toBe('attente');
  const preuvePc = JSON.parse(sortie[0]);
  expect(await hote2.recevoir(JSON.stringify({ type: 'PREUVE', preuve: preuvePc.preuve }))).toBeNull();
});

test('Message altéré ou chiffré avec une autre liaison : refusé', async () => {
  const cle = nouvelleCle();
  const a = await cleDeSession(cle, nouveauNonce(), nouveauNonce());
  const b = await cleDeSession(cle, nouveauNonce(), nouveauNonce());
  const texte = await chiffrer(a, { type: 'PING' });
  await expect(dechiffrer(b, texte)).rejects.toThrow();
  const octets = Buffer.from(texte, 'base64');
  octets[octets.length - 1] ^= 1;
  await expect(dechiffrer(a, octets.toString('base64'))).rejects.toThrow();
});
