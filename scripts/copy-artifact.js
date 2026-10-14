import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const target = process.argv[2];

if (target === 'win') {
  const src = path.join(rootDir, 'dist-win', 'InsertechEvenements.exe');
  const dest = path.join(rootDir, 'InsertechEvenements.exe');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    fs.rmSync(path.join(rootDir, 'dist-win'), { recursive: true, force: true });
    console.log(`✅ Exécutable Windows prêt : ${dest}`);
  } else {
    console.error(`❌ Source introuvable : ${src}`);
    process.exit(1);
  }
} else if (target === 'linux') {
  const src = path.join(rootDir, 'dist-linux', 'InsertechEvenements-linux-x64');
  const dest = path.join(rootDir, 'InsertechEvenements-linux-x64');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    fs.rmSync(path.join(rootDir, 'dist-linux'), { recursive: true, force: true });
    console.log(`✅ Exécutable Linux prêt : ${dest}`);
  } else {
    console.error(`❌ Source introuvable : ${src}`);
    process.exit(1);
  }
} else {
  console.error(`Type de cible inconnu : ${target}`);
  process.exit(1);
}
