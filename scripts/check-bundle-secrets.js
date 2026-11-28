// Garde-fou (plan v1.9, étape 3) : aucune clé d'API ne doit se retrouver dans le bundle publié
// (GitHub Pages, exe, APK). La clé iFixit vit uniquement sur le PC hôte, saisie par l'administrateur.
import { existsSync, readFileSync } from 'node:fs';

const fichier = process.argv[2] || 'dist/index.html';
if (!existsSync(fichier)) {
  console.error(`Garde-fou des secrets : ${fichier} introuvable (lancer le build d'abord).`);
  process.exit(1);
}
const contenu = readFileSync(fichier, 'utf8');
const problemes = [];

// Une valeur de jeton collée après « Bearer » (le code légitime construit l'en-tête à l'exécution)
const bearer = contenu.match(/Bearer\s+[A-Za-z0-9._~+/-]{20,}/);
if (bearer) problemes.push(`jeton « Bearer » en clair : ${bearer[0].slice(0, 16)}…`);

// La valeur d'un secret présent dans l'environnement du build
for (const nom of ['VITE_IFIXIT_API_KEY', 'IFIXIT_API_KEY']) {
  const valeur = (process.env[nom] || '').trim();
  if (valeur.length >= 8 && contenu.includes(valeur)) problemes.push(`valeur de ${nom}`);
}

if (problemes.length > 0) {
  console.error('Garde-fou des secrets : le bundle contient une clé d\'API !');
  for (const p of problemes) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('Garde-fou des secrets : aucune clé dans le bundle.');
