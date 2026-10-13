import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const distHtml = path.join(rootDir, 'dist', 'index.html');
const androidAssetsDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets');
const targetHtml = path.join(androidAssetsDir, 'index.html');

console.log('🚀 Préparation des assets Android pour le build APK...');

if (!fs.existsSync(distHtml)) {
  console.error('❌ Erreur : dist/index.html introuvable. Exécutez d\'abord npm run build.');
  process.exit(1);
}

// Créer le dossier assets si nécessaire
fs.mkdirSync(androidAssetsDir, { recursive: true });

// Copier le fichier HTML autonome
fs.copyFileSync(distHtml, targetHtml);
console.log(`✅ ${distHtml} copié vers ${targetHtml}`);

// Copier les icônes PWA et assets dans les assets Android
const publicDir = path.join(rootDir, 'public');
if (fs.existsSync(publicDir)) {
  const files = fs.readdirSync(publicDir);
  for (const file of files) {
    const srcPath = path.join(publicDir, file);
    const destPath = path.join(androidAssetsDir, file);
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  console.log('✅ Assets publics synchronisés dans les assets Android.');
}

console.log('🎉 Assets Android prêts pour la compilation Gradle de l\'exécutable APK !');
