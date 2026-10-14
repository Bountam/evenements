// Garde-fou du design system du kiosque : refuse les tailles de texte illisibles,
// les couleurs codées en dur et les pas d'espacement hors grille dans les fichiers du module.
import { readFileSync } from 'node:fs';

const FILES = [
  'src/components/matrices/TeardownMatrix.tsx',
  'src/components/DashboardShell.tsx',
  'src/components/shared/Button.tsx',
  'src/components/shared/ConfirmDialog.tsx',
  'src/components/shared/Modal.tsx',
  'src/components/shared/InlineTimeEditor.tsx',
  'src/components/shared/Leaderboard.tsx',
  'src/components/shared/PrizeCard.tsx',
  'src/components/shared/PrizeEditorModal.tsx',
  'src/components/shared/RaffleSpinner.tsx',
  'src/components/shared/RankBadge.tsx',
  'src/components/shared/RecordChip.tsx',
  'src/components/shared/StatTile.tsx',
  'src/components/shared/TextField.tsx',
  'src/components/shared/Toast.tsx'
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

if (errors > 0) {
  console.error(`\n${errors} écart(s) au design system du kiosque.`);
  process.exit(1);
}
console.log('Design system du kiosque : aucun écart.');
