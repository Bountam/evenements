import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { FakeTablette } from './helpers/fakeTablette';
import { preparerPcHote } from './helpers/pcHote';

// Plan v1.9, étape 5 : la tablette ne contacte jamais ifixit.com. Elle demande l'article au PC hôte, qui
// l'obtient avec SA clé, renvoie le texte sans aucune adresse d'image, puis les photos compressées.

const CLE_IFIXIT = 'ifx_cle_du_pc_hote_0123456789';

// PNG 64x48 uni, assez grand pour être redimensionné par le PC hôte
function png(largeur: number, hauteur: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const bloc = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const lignes = Buffer.alloc((largeur * 3 + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) lignes.set([72, 10, 148], y * (largeur * 3 + 1) + 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(lignes)),
    bloc('IEND', Buffer.alloc(0))
  ]);
}

const IMAGE = 'https://guide-images.cdn.ifixit.com/igi/etape1.medium';

test('Articles iFixit : relayés par le PC hôte, sans clé ni adresse iFixit envoyées à la tablette', async ({ page }) => {
  test.setTimeout(90_000);
  const tablettes: FakeTablette[] = [];
  const { code, cle, sorties } = await preparerPcHote(page, () => tablettes, 47996, 'Réparothon relais');

  // Le PC hôte a sa clé ; iFixit simulé (enregistré après le blocage général, donc prioritaire)
  await page.evaluate((k) => localStorage.setItem('insertech_ifixit_api_key', k), CLE_IFIXIT);
  const auth: Array<string | undefined> = [];
  let ifixitDown = false;
  await page.route('https://*.ifixit.com/api/2.0/**', async (route) => {
    if (ifixitDown) return route.abort();
    auth.push(route.request().headers()['authorization']);
    const url = route.request().url();
    if (url.includes('/search/')) {
      return route.fulfill({
        json: {
          results: [
            { guideid: 1001, title_raw: 'Remplacement de la batterie ThinkPad', category: 'Lenovo ThinkPad', image: { medium: IMAGE } },
            { guideid: 1002, title_raw: 'Nettoyage du ventilateur ThinkPad', category: 'Lenovo ThinkPad', image: { medium: IMAGE } },
            { guideid: 1003, title_raw: 'Clavier ThinkPad', category: 'Lenovo ThinkPad' }
          ]
        }
      });
    }
    if (url.includes('/guides/1001')) {
      return route.fulfill({
        json: {
          guideid: 1001,
          title_raw: 'Remplacement de la batterie ThinkPad',
          category: 'Lenovo ThinkPad',
          difficulty: 'Facile',
          url: 'https://fr.ifixit.com/Tutoriel/Batterie+ThinkPad/1001',
          author: { username: 'Technicienne iFixit' },
          steps: [
            {
              stepid: 1,
              title: 'Retirer le capot',
              media: { data: [{ id: 7, medium: IMAGE, original: 'https://guide-images.cdn.ifixit.com/igi/etape1.huge' }] },
              lines: [{ text_raw: 'Dévisser les vis du capot.', bullet: 'black', level: 0 }]
            }
          ]
        }
      });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route('https://guide-images.cdn.ifixit.com/**', (route) =>
    route.fulfill({ contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: png(64, 48) })
  );

  const t = new FakeTablette(code, cle, 'Réparateur');
  tablettes.push(t);
  await t.demarrer();
  try {
    await expect(page.getByText('Connectée', { exact: true })).toHaveCount(1, { timeout: 15_000 });

    // 1. Recherche : résultats sans miniature distante, puis miniatures compressées en data:
    t.envoyer({ type: 'IFIXIT_REQUEST', requestId: 'r1', kind: 'search', query: 'ThinkPad batterie', enQuery: 'ThinkPad battery' });
    const recherche = await t.attendre((m) => m.type === 'IFIXIT_RESULT' && m.requestId === 'r1');
    expect(recherche.ok).toBe(true);
    expect(recherche.search.results.map((r: any) => r.guideid)).toEqual([1001, 1002, 1003]);
    expect(recherche.search.results.every((r: any) => r.thumbnail === '')).toBe(true);
    const miniature = await t.attendre((m) => m.type === 'IFIXIT_IMAGE' && m.requestId === 'r1' && m.imageIndex === 0);
    expect(miniature.stepIndex).toBe(-1);
    expect(miniature.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(auth).toContain(`Bearer ${CLE_IFIXIT}`);

    // 2. Article complet : texte et attribution tout de suite, aucune adresse d'image, photo de l'étape ensuite
    t.envoyer({ type: 'IFIXIT_REQUEST', requestId: 'r2', kind: 'guide', guideId: 1001, lang: 'fr' });
    const article = await t.attendre((m) => m.type === 'IFIXIT_RESULT' && m.requestId === 'r2');
    expect(article.ok).toBe(true);
    expect(article.guide).toMatchObject({
      title: 'Remplacement de la batterie ThinkPad',
      author: 'Technicienne iFixit',
      url: 'https://fr.ifixit.com/Tutoriel/Batterie+ThinkPad/1001'
    });
    expect(article.guide.steps[0].lines[0].text).toBe('Dévisser les vis du capot.');
    expect(JSON.stringify(article.guide.steps)).not.toContain('ifixit.com');
    const photo = await t.attendre((m) => m.type === 'IFIXIT_IMAGE' && m.requestId === 'r2');
    expect(photo).toMatchObject({ stepIndex: 0, imageIndex: 0 });
    expect(photo.dataUrl).toMatch(/^data:image\/jpeg;base64,/);

    // 3. Demande invalide, puis iFixit injoignable pour un article jamais ouvert : réponse claire, sans planter
    t.envoyer({ type: 'IFIXIT_REQUEST', requestId: 'r3', kind: 'guide', guideId: -4 });
    expect(await t.attendre((m) => m.type === 'IFIXIT_RESULT' && m.requestId === 'r3')).toMatchObject({ ok: false });
    ifixitDown = true;
    t.envoyer({ type: 'IFIXIT_REQUEST', requestId: 'r4', kind: 'guide', guideId: 2002, lang: 'en' });
    const echec = await t.attendre((m) => m.type === 'IFIXIT_RESULT' && m.requestId === 'r4');
    expect(echec.ok).toBe(false);
    expect(echec.erreur).toBeTruthy();

    // 4. L'article déjà ouvert reste disponible depuis le cache du PC
    t.envoyer({ type: 'IFIXIT_REQUEST', requestId: 'r5', kind: 'guide', guideId: 1001, lang: 'fr' });
    expect(await t.attendre((m) => m.type === 'IFIXIT_RESULT' && m.requestId === 'r5')).toMatchObject({ ok: true });

    // 5. La clé du PC n'a jamais été transmise à la tablette
    expect(JSON.stringify(t.recus)).not.toContain(CLE_IFIXIT);
  } finally {
    await t.arreter();
  }
  expect(sorties).toEqual([]);
});
