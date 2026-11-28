// Garde-fou du design system du kiosque : refuse les tailles de texte illisibles,
// les couleurs codées en dur et les pas d'espacement hors grille dans les fichiers du module.
import { readdirSync, readFileSync } from 'node:fs';

const FILES = [
  'src/components/matrices/TeardownMatrix.tsx',
  'src/components/matrices/InstallFestMatrix.tsx',
  'src/components/matrices/GenericMatrix.tsx',
  'src/components/matrices/ReparothonMatrix.tsx',
  'src/components/DashboardShell.tsx',
  'src/components/shared/Button.tsx',
  'src/components/shared/ConfirmDialog.tsx',
  'src/components/shared/Modal.tsx',
  'src/components/shared/MoreMenu.tsx',
  'src/components/shared/InlineTimeEditor.tsx',
  'src/components/shared/Leaderboard.tsx',
  'src/components/shared/PrizeCard.tsx',
  'src/components/shared/PrizeEditorModal.tsx',
  'src/components/shared/RaffleSpinner.tsx',
  'src/components/shared/RankBadge.tsx',
  'src/components/shared/RecordChip.tsx',
  'src/components/shared/SessionQrPanel.tsx',
  'src/components/shared/StatTile.tsx',
  'src/components/shared/TabSwitcher.tsx',
  'src/components/shared/TextField.tsx',
  'src/components/shared/Toast.tsx',
  'src/components/shared/UpdateModal.tsx'
];

const RULES = [
  { pattern: /\btext-\[(\d+(?:\.\d+)?)px\]/g, message: 'taille de texte en pixels : utiliser text-micro, text-xs ou text-kiosk-*' },
  { pattern: /\b(?:bg|text|border|from|via|to)-\[#[0-9a-fA-F]{3,8}\]/g, message: 'couleur codée en dur : utiliser un token (app-*, success, warning, danger…)' },
  { pattern: /\b[pm][xytrbl]?-0\.2\b/g, message: "pas d'espacement hors grille (0.2) : utiliser 0.5" },
  { pattern: /\bdark:/g, message: 'variante dark: : utiliser les tokens, qui suivent le thème' }
];

let errors = 0;
for (const file of FILES) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    for (const rule of RULES) {
      for (const match of line.matchAll(rule.pattern)) {
        errors++;
        console.error(`${file}:${idx + 1}  ${match[0]}  →  ${rule.message}`);
      }
    }
  });
}

// Dans tout src/ : une classe Tailwind construite morceau par morceau (`bg-${couleur}-500`) n'est pas
// vue par Tailwind au build et disparaît de l'interface compilée. Écrire les classes en entier.
const DYNAMIC_CLASS = /\b(?:bg|text|border|from|via|to|ring|fill|stroke|shadow)-\$\{/g;
const sourceFiles = readdirSync('src', { recursive: true })
  .filter((name) => /\.(tsx?|jsx?)$/.test(name))
  .map((name) => `src/${name}`);
for (const file of sourceFiles) {
  readFileSync(file, 'utf8').split('\n').forEach((line, idx) => {
    for (const match of line.matchAll(DYNAMIC_CLASS)) {
      errors++;
      console.error(`${file}:${idx + 1}  ${match[0]}…  →  classe Tailwind dynamique, absente du CSS compilé : écrire la classe complète`);
    }
  });
}

// Plan v1.9, étape 6 : la page ne défile jamais. Seule ScrollZone peut faire défiler une liste, et la
// hauteur d'écran se prend en dvh (barre d'adresse et clavier des cellulaires), jamais en vh.
const NO_SCROLL_RULES = [
  { pattern: /\boverflow(?:-[xy])?-(?:auto|scroll)\b/g, message: 'défilement hors ScrollZone : utiliser <ScrollZone> (src/components/shared/ScrollZone.tsx)' },
  { pattern: /\b(?:min-|max-)?h-screen\b/g, message: 'h-screen : utiliser h-dvh (la page ne défile pas)' },
  // index.html est exclu de cette règle : son message « navigateur trop ancien » vise des moteurs sans dvh
  { pattern: /\b\d+(?:\.\d+)?vh\b/g, message: 'unité vh : utiliser dvh', saufIndex: true }
];
for (const file of [...sourceFiles, 'index.html', 'src/index.css']) {
  if (file.endsWith('ScrollZone.tsx')) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, idx) => {
    for (const rule of NO_SCROLL_RULES) {
      if (rule.saufIndex && file === 'index.html') continue;
      for (const match of line.matchAll(rule.pattern)) {
        errors++;
        console.error(`${file}:${idx + 1}  ${match[0]}  →  ${rule.message}`);
      }
    }
  });
}

if (errors > 0) {
  console.error(`\n${errors} écart(s) au design system du kiosque.`);
  process.exit(1);
}
console.log('Design system du kiosque : aucun écart.');
