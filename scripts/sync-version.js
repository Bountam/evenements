// Propage la version de package.json (seule source de vérité) aux autres cibles :
// lanceur .NET (Windows/Linux), manifeste Windows et APK Android.
//   node scripts/sync-version.js          → réécrit les fichiers
//   node scripts/sync-version.js --check  → échoue si un fichier n'est pas synchronisé
// Appelé automatiquement par `npm version patch|minor|major` (script "version").
import { readFileSync, writeFileSync } from 'node:fs';

const check = process.argv.includes('--check');
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!match) {
  console.error(`Version invalide dans package.json : ${version} (attendu X.Y.Z)`);
  process.exit(1);
}
const [major, minor, patch] = match.slice(1).map(Number);
const fourPart = `${version}.0`;
// Toujours croissant d'une version à l'autre, condition pour qu'Android accepte la mise à jour
const versionCode = major * 10000 + minor * 100 + patch;

const TARGETS = [
  {
    file: 'launcher/InsertechLauncher.csproj',
    rules: [
      [/<Version>[^<]*<\/Version>/, `<Version>${version}</Version>`],
      [/<FileVersion>[^<]*<\/FileVersion>/, `<FileVersion>${fourPart}</FileVersion>`],
      [/<AssemblyVersion>[^<]*<\/AssemblyVersion>/, `<AssemblyVersion>${fourPart}</AssemblyVersion>`]
    ]
  },
  {
    file: 'app.manifest',
    rules: [[/(<assemblyIdentity version=")[^"]*(")/, `$1${fourPart}$2`]]
  },
  {
    file: 'android/app/build.gradle',
    rules: [
      [/versionCode \d+/, `versionCode ${versionCode}`],
      [/versionName "[^"]*"/, `versionName "${version}"`]
    ]
  }
];

let outOfSync = 0;
for (const { file, rules } of TARGETS) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [pattern, replacement] of rules) {
    if (!pattern.test(after)) {
      console.error(`${file} : motif introuvable ${pattern}`);
      process.exit(1);
    }
    after = after.replace(pattern, replacement);
  }
  if (after === before) continue;
  if (check) {
    outOfSync++;
    console.error(`${file} n'est pas à la version ${version} : lancer node scripts/sync-version.js`);
  } else {
    writeFileSync(file, after);
    console.log(`${file} → ${version}`);
  }
}

if (outOfSync > 0) process.exit(1);
if (check) console.log(`Version ${version} synchronisée sur toutes les cibles.`);
