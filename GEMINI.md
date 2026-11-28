# GEMINI.md — Guide Architecture & Conventions (`insertech-tableau-evenements`)

Application événementielle autonome et 100 % hors-ligne pour **Insertech** (PC Windows/Linux, PWA et application native Android Capacitor), v1.8.1.

---

## 1. Architecture & Stockage

- **Frontend :** React 19 + TypeScript + Tailwind CSS v4 + Vite (`vite-plugin-singlefile` générant `dist/index.html`).
- **Base locale & Synchro :**
  - `Dexie.js` (IndexedDB v3) dans `src/db.ts` (`events`, `tickets`, `technicians`, `participants`, `attendees`, `snapshots`, `ifixitCache`, `repairGuides`).
  - Sauvegarde persistante SQLite hors navigateur (`src/utils/sqliteBackup.ts`) via le lanceur PC (`StorageCompanion.cs` inclut aussi le relais local `/image` allowlisté pour compresser les miniatures iFixit) ou `InsertechStockage` sur Android.
  - Synchronisation LAN chiffrée PC ↔ Tablettes Android via `P2PNetworkManager` (`src/network.ts`, `src/net/`) et `ServeurLocalPlugin.java` (WebSocket sur port `47630` avec `WifiLock` basse latence) + distribution ciblée des guides hors-ligne (`GUIDES_SYNC`, `REQUEST_GUIDE_SEARCH`).
  - Synchronisation inter-onglets locale via `BroadcastChannel` (ex. fenêtre Écran Public `?vue=public`).
  - Fiches de réparation complètes dans `src/data/guidesLocaux.ts` (une fiche = étapes courtes, au moins un avertissement, aucune URL ; `tests/guides-locaux.spec.ts` le vérifie). Ne jamais copier le contenu d'iFixit dans l'application : lier l'article (`ifixitLinks`).
  - Clé API iFixit optionnelle saisie par l'administrateur sur le PC hôte seulement (`localStorage`). Jamais de variable `VITE_*` pour un secret : Vite la copierait en clair dans le bundle public. `scripts/check-bundle-secrets.js` (lancé par `npm run build`) fait échouer le build si une clé s'y retrouve.

---

## 2. Rôles Terrain (`WorkRole`), Appareils & Workflows

Définis dans `src/types.ts` et gérés par `src/utils/modeLock.ts` + `src/components/tablette/MobileOnboardingWizard.tsx` + `src/components/DashboardShell.tsx` :

- **Poste Laptop (Serveur Hôte) :** toujours `admin`, anti-veille automatique (`src/utils/wakeLock.ts` + `SetThreadExecutionState` dans `launcher/Program.cs`), seul à pouvoir ouvrir le projecteur / Écran Public, verrouillable manuellement via le code PIN par défaut **`0000`** (modifiable dans les réglages réseau).
- **Appareils Mobiles / Tablettes (après scan QR) :** parcours guidé en 4 étapes :
  1. Choix de l'événement actif *(sauté automatiquement s'il n'y en a qu'un seul)*
  2. Choix du rôle adapté à l'événement *(sans Écran Public sur mobile)*
  3. Identification rapide : **1 seul champ** `Nom, prénom ou surnom *` (`#mob-vol-displayName`, accepté même si le bénévole est introuvable en base) pour tous les rôles sauf `reparateur` (qui choisit/crée sa fiche technique Nom + Table + Spécialités) ; `kiosque_formulaire` saute directement au formulaire visiteur ; `admin` passe par le code PIN
  4. Vue dédiée au rôle avec en-tête permanent compact sur 1 ligne (`h-14`) : logo Insertech = Menu principal, icône synchro seule (Bleu/Jaune/Rouge), 1 seul bouton de rôle, toggles accessibilité (`Texte agrandi` / `Contraste élevé` via `src/utils/accessibility.ts`) dans `MoreMenu` (`Plus`), barre d'onglets fixe en bas sur `< 640px`, et verrouillage réservé au mode `kiosque_formulaire` (maintenir le cadenas 2 s + PIN `0000` par défaut).
- **Retour aux sessions actives sur tablette (`src/App.tsx`) :** si l'utilisateur revient à l'écran d'accueil tablette (*Rejoindre un événement*) alors que l'appareil est connecté ou synchronisé, les activités actives s'affichent directement en boutons cliquables pour y revenir en 1 tap.
- **`juge` (Animateur Juge Kiosque-Concours) :** `src/components/matrices/concours/JudgeConcoursCockpit.tsx` — inscription directe des 1 ou 2 joueurs devant le juge, bassin multi-animateurs pour départ commun synchronisé (10 pistes réseau), 2 arrêts séparés contrôlés uniquement par le juge, puis écran temps + rang cumulé + rappel des prix + `Nouvelle compétition`. L'onglet `Tirage` reste réservé à `admin`.

1. **`admin` (Administrateur / God Mode) :**
   - Protégé par le code PIN à 4 chiffres de l'événement sur tablette/cellulaire.
   - **Multi-événements :** `MultiEventHeaderSelector` (`src/components/shared/MultiEventControlBar.tsx`) intégré au titre cliquable sur Laptop permet d'épingler et basculer entre 2+ événements actifs avec une **Tour de contrôle unifiée**.
   - **Vue « Map » des Tables :** `src/components/matrices/reparothon/AdminMapAndGodMode.tsx` affiche chaque table avec chrono de service en direct (`< 25 min`, `25–45 min`, `> 45 min`), assignation d'un **2e appareil**, transfert de table en 2 taps, priorisation et messages flash vers l'Écran Public.
2. **`accueil` (Animateur d'Accueil) :**
   - Assistant **1 question par écran** dans `src/components/matrices/ReparothonMatrix.tsx` : `Catégorie` → `Marque` → `Modèle` → `Matériel / Logiciel` → `4 cartes à icônes` → `Panier (Un autre appareil ?)` → `3. Inscription d'un participant` (`ContactForm` en micro-étapes Identité / Contact / Code postal & Loi 25) → `4. Questions de bénévolat Insertech` (conditionnel, 1 question à la fois).
   - Bouton permanent `Devenir bénévole` dans l'en-tête (`VolunteerSurveyButton.tsx`, icône seule avec libellé accessible).
3. **`reparateur` (Animateur Réparateur) :**
   - `src/components/matrices/reparothon/ReparateurCockpit.tsx` : file d'attente intelligente (`Recommandé pour toi`), puis **vue unifiée sans sous-onglets** : fiche technique permanente en haut (participant, symptôme, minuteur, boutons `Appeler Table`, `Assistant` et `Lexique`), arbre de diagnostic interactif **Oui / Non** (`DiagnosticDecisionTree.tsx` via `DIAGNOSTIC_DECISION_TREES` dans `src/utils/repairLexicon.ts` + vérifications complémentaires repliables persistées dans `ticket.extraData.diagnosticChecks`), guides pertinents juste en dessous (`IfixitGuidesPanel.tsx` en mode `embedded` + `IfixitGuideViewer.tsx` combinant `src/utils/offlineGuideLibrary.ts`, le relais LAN Laptop et l'API iFixit `src/services/ifixitService.ts` ; sur tablette, `setIfixitRelay` fait passer toute demande iFixit par le PC hôte via `IFIXIT_REQUEST` / `IFIXIT_RESULT` / `IFIXIT_IMAGE` dans `src/network.ts` : une tablette ne doit JAMAIS appeler ifixit.com ni charger une image distante), et clôture 3 questions avec raccourci **`Valider rapidement`**. Gestionnaire Laptop `OfflineGuidesLibraryModal.tsx` accessible depuis `MoreMenu` (**Bibliothèque de guides hors-ligne**).
4. **`assistant` (Animateur Assistant) :**
   - `src/components/matrices/reparothon/AssistantCockpit.tsx` : vue guidée par défaut sur **1 action prioritaire à la fois** (`Action 1 sur N` : alertes `Demander Assistant`, accompagnement aux tables, orientation de sortie/boutique Insertech), avec bascule `Voir toute la file`.
5. **`formateur` (Formateur) :**
   - `src/components/matrices/generic/FormateurEvaluationPanel.tsx` dans `GenericMatrix.tsx` : mode guidé par défaut (**1 apprenant et 1 phase à la fois** avec auto-avance `1. Avant` → `2. Pendant` → `3. Après` → `Récapitulatif`, bascule `Vue liste` incluse), calcul du gain `+X niveaux` et pastille `Prêt Réparothon`.
6. **`kiosque_formulaire`** : seul mode verrouillable sur tablette (`ModeControls.tsx`, cadenas discret à maintenir 2 s + PIN `0000` par défaut). L'**Écran Public** est réservé au Laptop.

---

## 3. Formulaires uniformisés, Loi 25, Anonymisation & Exports

- **Formulaires uniformisés « 1 question à la fois » (`src/utils/contact.ts`, `src/components/shared/ContactForm.tsx`, `InstallFestMatrix.tsx`) :**
  - Micro-étapes séquentielles avec aides FALC et écran **`Récapitulatif avant validation`** (avec boutons `Modifier`) : `Identité` (`Nom, prénom ou surnom *` + pronoms neutres) → `Contact` (Téléphone QC ou Courriel @domaines, **1 seul requis**, marché canadien uniquement) → `Code postal & Loi 25` → micro-étapes `Bénévolat` conditionnelles (`Rôles`, `Compétences`, `Véhicule & t-shirt`, `Alimentation & anniversaire`, `Consentement`). `InstallFestMatrix` suit également 6 étapes séquentielles avec auto-avance sur choix unique.
- **Installeur Windows NSIS (`packaging/windows/installer.nsi`) :** ferme automatiquement `InsertechEvenements.exe` (y compris le compagnon SQLite actif 2 min en arrière-plan) avant d'écrire ou supprimer l'exécutable.
- **Écran Public :** ne jamais afficher de nom complet, courriel ou téléphone ; toujours utiliser `formatPublicShortName(name)` (`"Sophie Côté"` → `"Sophie C."`).
- **Exports Excel / CSV & Centre de Rapport d'Impact (`src/utils/impactReport.ts`, `src/components/shared/ImpactReportModal.tsx`, `src/utils/contactExport.ts`) :**
  - Modale **Centre de Rapport d'Impact** en gros boutons avec aperçu des 4 piliers (Écologie kg + $\text{CO}_2\text{e}$ ACV, Opérations & Boutique, Mobilisation & Loi 25, Pédagogie Formation) et copie rapide du résumé exécutif.
  - Classeur Excel `.xlsx` à **3 onglets** (`Sommaire d'Impact`, `Données Détaillées`, `Équipe & Tables`) + **Bilan Consolidé Multi-Événements**.
  - Réparothon : inclut `Temps d'attente (min)`, `Durée de réparation (min)`, `Actions réalisées`, `Suite proposée` et `Pièce / Détail boutique`.
  - Formations : inclut `Niveau Avant (1-4)`, `Jalons Pendant`, `Statut Formateur`, `Niveau Après (1-4)`, `Progression (+)` et `Prêt Réparothon`.

---

## 4. Fonctionnement des Mises à Jour & Releases

- **Source unique de version (`package.json` + `scripts/sync-version.js`) :**
  - `package.json` (`version` `X.Y.Z`) est la seule source de vérité.
  - `node scripts/sync-version.js` propage automatiquement la version vers `launcher/InsertechLauncher.csproj` (`Version`, `FileVersion`, `AssemblyVersion`), `app.manifest` (`X.Y.Z.0`) et `android/app/build.gradle` (`versionName` + `versionCode = major * 10000 + minor * 100 + patch`, strictement croissant pour permettre à Android la mise à jour par-dessus).
  - `npm run lint` échoue si une cible est désynchronisée (`scripts/sync-version.js --check`).
- **Pipeline de publication GitHub Actions (`.github/workflows/ci-cd.yml` + `build.yml`) :**
  - Pousser un tag `vX.Y.Z` correspondant exactement à `package.json` déclenche un build multiplateforme depuis un unique `dist/` : PWA/Web, `InsertechEvenements.exe`, `InsertechEvenements-linux-x64`, `InsertechEvenements-Android.apk`, installeur Windows NSIS (`InsertechEvenements-Setup-X.Y.Z.exe`) et `.deb`, puis publie la GitHub Release avec `SHA256SUMS.txt`.
  - Les binaires ne sont pas committés dans Git (ignorés par `.gitignore`) ; ils sont publiés sur **GitHub Releases**.
- **Détection & installation sur le poste PC (`src/utils/updateCheck.ts`, `src/components/shared/UpdateModal.tsx`) :**
  - Requête légère JSON vers `https://api.github.com/repos/Bountam/evenements/releases/latest` (aucun téléchargement automatique d'exécutable).
  - Affiche une pastille `Nouvelle version (X.Y.Z)` avec notes de version et liens vérifiés vers GitHub Releases ; options *Plus tard* (24 h, `insertech_update_postponed`) ou *Ignorer cette version* (`insertech_update_ignored`).
  - Vérification bloquée pendant un chronomètre en cours ou une session hôte active ; `sauvegarderMaintenant()` (`src/utils/sqliteBackup.ts`) force la sauvegarde SQLite avant mise à jour.
  - Sur Windows, l'installeur NSIS (`packaging/windows/installer.nsi`) ferme automatiquement `InsertechEvenements.exe` (y compris le compagnon SQLite actif 2 min en arrière-plan) avant d'écraser l'exécutable ; les données utilisateur dans `%LOCALAPPDATA%\InsertechEvenements` sont préservées.
- **Mise à jour des tablettes Android par le PC en réseau local (`src/net/miseAJour.ts`, `VerificationMaj.java`, `InsertechNatifPlugin.java`) :**
  - Depuis la fenêtre *Réseau local* du PC (**Mettre à jour les tablettes**), le PC sélectionne un `.apk` local (ou le télécharge depuis GitHub avec contrôle `SHA256SUMS.txt`) et le pousse vers les tablettes connectées sur la liaison chiffrée LAN, sans internet ni Play Store sur les tablettes.
  - Transfert par morceaux de `64 Ko` avec reprise après coupure (`MAJ_PROPOSEE` → `MAJ_ACCEPTEE` `{ depuis }` → `MAJ_MORCEAU` / `MAJ_MORCEAU_OK` → `MAJ_FIN` → `MAJ_VERIFIEE`).
  - Avant l'installation Android (`PackageInstaller`, avec confirmation utilisateur), la tablette vérifie SHA-256, nom du paquet, `versionCode` supérieur et **même certificat de signature** (`android/app/debug.keystore` en debug, ou keystore release via secrets CI). Une tablette verrouillée refuse tant qu'elle n'est pas déverrouillée.
  - En cas d'écart de version entre le PC et une tablette connectée, un bandeau d'avertissement s'affiche dans l'en-tête (`mismatchedClientVersions`) tout en maintenant la synchronisation.

---

## 5. Garde-fous du Design System (`scripts/check-design-tokens.js`)

Toujours respecter ces règles dans `src/` :
- **Interdit :** `text-[...px]`, couleurs hexadécimales `[#...]`, espacements `p-0.2` / `m-0.2`, variantes `dark:`, et classes Tailwind dynamiques (`bg-${color}`).
- **Obligatoire :** tokens sémantiques (`bg-primary`, `text-secondary`, `bg-app-card`, `bg-app-input`, `text-app-text`, `text-app-text-muted`, `border-app-card-border`, `text-micro`) et dictionnaires statiques pour les variantes de couleur.

---

## 6. Commandes de Validation & Build

```powershell
# 1. Types, design system et synchronisation de version
npm run lint

# 2. Bundle web autonome (dist/index.html)
npm run build

# 3. Tests E2E Playwright (ex. rôles et formulaires)
npx playwright test tests/roles-workflows.spec.ts tests/contact-form.spec.ts tests/ui-smoke.spec.ts

# 4. Synchronisation Capacitor et compilation APK Android Debug
npx cap sync android
cd android
.\gradlew.bat assembleDebug testDebugUnitTest --no-daemon
```
