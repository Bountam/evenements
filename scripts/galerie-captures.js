// Plan v1.9, étape 7 : galerie des captures du test « zéro défilement » (tests/zero-defilement.spec.ts).
// Lit captures/<écran>--<largeur>x<hauteur>.png et écrit captures/index.html, une page autonome
// (images à côté) pour valider d'un coup d'œil chaque écran à chaque taille.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const DOSSIER = 'captures';
if (!existsSync(DOSSIER)) {
  console.error('Aucun dossier captures/ : lancer d’abord npx playwright test tests/zero-defilement.spec.ts');
  process.exit(1);
}

// Titres et ordre des écrans, écrits par le test (captures/ecrans.json)
const ECRANS_TITRES = new Map(
  existsSync(`${DOSSIER}/ecrans.json`) ? JSON.parse(readFileSync(`${DOSSIER}/ecrans.json`, 'utf8')) : []
);

const fichiers = readdirSync(DOSSIER).filter((f) => /^[\w-]+--\d+x\d+\.png$/.test(f));
const parEcran = new Map();
for (const f of fichiers) {
  const [, id, l, h] = f.match(/^([\w-]+)--(\d+)x(\d+)\.png$/);
  if (!parEcran.has(id)) parEcran.set(id, []);
  parEcran.get(id).push({ f, l: Number(l), h: Number(h) });
}

const echapper = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ordre = [...ECRANS_TITRES.keys()].filter((id) => parEcran.has(id)).concat([...parEcran.keys()].filter((id) => !ECRANS_TITRES.has(id)));

const sections = ordre
  .map((id) => {
    const captures = parEcran
      .get(id)
      .sort((a, b) => a.l * 10000 + a.h - (b.l * 10000 + b.h))
      .map(
        ({ f, l, h }) => `
      <figure>
        <a href="${f}"><img src="${f}" alt="${echapper(ECRANS_TITRES.get(id) || id)} à ${l} × ${h}" loading="lazy" style="aspect-ratio:${l}/${h}"></a>
        <figcaption>${l} × ${h}</figcaption>
      </figure>`
      )
      .join('');
    return `
  <section>
    <h2>${echapper(ECRANS_TITRES.get(id) || id)}</h2>
    <div class="grille">${captures}
    </div>
  </section>`;
  })
  .join('');

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Galerie zéro défilement</title>
<style>
  :root { color-scheme: dark; --fond: #180a2b; --carte: #24123d; --texte: #f1f5f9; --doux: #b8a9cf; --vert: #9ecd33; }
  body { margin: 0; padding: 16px; background: var(--fond); color: var(--texte); font: 16px/1.5 system-ui, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 1.5rem; }
  p { margin: 0 0 24px; color: var(--doux); }
  h2 { font-size: 1.125rem; color: var(--vert); margin: 32px 0 12px; }
  .grille { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  figure { margin: 0; background: var(--carte); padding: 8px; border-radius: 12px; }
  img { display: block; height: 260px; width: auto; max-width: 100%; border-radius: 6px; background: #000; }
  figcaption { font-size: .875rem; color: var(--doux); margin-top: 6px; text-align: center; }
</style>
</head>
<body>
  <h1>Galerie « zéro défilement »</h1>
  <p>${fichiers.length} captures, ${parEcran.size} écrans. Chaque image est l'écran entier : rien ne doit être coupé, le bouton principal doit être visible.</p>
  ${sections}
</body>
</html>
`;
writeFileSync(`${DOSSIER}/index.html`, html);
console.log(`Galerie : ${DOSSIER}/index.html (${fichiers.length} captures, ${parEcran.size} écrans)`);
