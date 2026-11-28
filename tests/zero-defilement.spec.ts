import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ECRANS, mesurer, type Mesure } from './helpers/ecrans';

// Plan v1.9, étape 7 : pour chaque écran et chaque taille, la page ne défile pas, rien ne défile en dehors
// d'une ScrollZone, la zone « page » de l'écran tient sans défiler, et le bouton principal est visible.
// Une capture par écran et par taille alimente la galerie captures/index.html (voir scripts/galerie-captures.js).
const DOSSIER = path.resolve('captures');
const RAPPORT = process.env.RAPPORT === '1';

// Titres des écrans pour la galerie
fs.mkdirSync(DOSSIER, { recursive: true });
fs.writeFileSync(path.join(DOSSIER, 'ecrans.json'), JSON.stringify(ECRANS.map((e) => [e.id, e.titre])));

function problemes(m: Mesure): string[] {
  const p: string[] = [];
  if (m.pageX > 1) p.push(`page plus large que l'écran (+${m.pageX}px)`);
  if (m.pageY > 1) p.push(`page plus haute que l'écran (+${m.pageY}px)`);
  for (const z of m.zonesPage) p.push(`l'écran ne tient pas (+${z.oy}px de haut, +${z.ox}px de large)`);
  for (const z of m.horsZone) p.push(`défilement hors ScrollZone : <${z.tag} class="${z.cls}"> (+${z.oy}/${z.ox}px)`);
  if (m.principal && !m.principal.visible) p.push(`bouton principal hors écran : « ${m.principal.texte} »`);
  return p;
}

for (const ecran of ECRANS) {
  test(`Zéro défilement : ${ecran.titre}`, async ({ page }) => {
    test.setTimeout(120_000);
    await ecran.preparer(page);
    const echecs: string[] = [];
    for (const taille of ecran.tailles) {
      const hauteurs = ecran.clavier ? [taille.height, Math.round(taille.height * 0.6)] : [taille.height];
      for (const height of hauteurs) {
        await page.setViewportSize({ width: taille.width, height });
        await page.waitForTimeout(350);
        const m = await mesurer(page);
        const nom = `${ecran.id}--${taille.width}x${height}`;
        fs.mkdirSync(DOSSIER, { recursive: true });
        await page.screenshot({ path: path.join(DOSSIER, `${nom}.png`) });
        const p = problemes(m);
        // Clavier ouvert : seul le bouton principal doit rester visible (le reste peut défiler dans sa zone)
        const retenus = height === taille.height ? p : p.filter((x) => x.startsWith('bouton principal') || x.startsWith('page'));
        if (retenus.length) echecs.push(`${taille.nom} ${taille.width}x${height} : ${retenus.join(' ; ')}`);
      }
    }
    if (RAPPORT) console.log(`\n### ${ecran.titre}\n${echecs.join('\n') || 'OK'}`);
    else expect(echecs, ecran.titre).toEqual([]);
  });
}
