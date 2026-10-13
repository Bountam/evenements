import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const distHtml = path.join(distDir, 'index.html');
const mobileHtml = path.join(distDir, 'InsertechEvenements-Mobile.html');

console.log('📦 Génération du package exécutable PWA Mobile...');

if (!fs.existsSync(distHtml)) {
  console.error('❌ Erreur : dist/index.html introuvable.');
  process.exit(1);
}

// Copier l'exécutable HTML autonome mobile
fs.copyFileSync(distHtml, mobileHtml);
console.log(`✅ Fichier exécutable mobile généré : ${mobileHtml}`);

console.log('📱 Package mobile prêt pour déploiement et téléchargement direct !');
