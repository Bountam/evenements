# GEMINI.md — Guide Architecture & Conventions (`insertech-tableau-evenements`)

Application événementielle autonome et 100 % hors-ligne pour **Insertech** (PC Windows/Linux, PWA et application native Android Capacitor), v1.7.2.

---

## 1. Architecture & Stockage

- **Frontend :** React 19 + TypeScript + Tailwind CSS v4 + Vite (`vite-plugin-singlefile` générant `dist/index.html`).
- **Base locale & Synchro :**
  - `Dexie.js` (IndexedDB) dans `src/db.ts` (`events`, `tickets`, `technicians`, `participants`, `attendees`).
  - Sauvegarde persistante SQLite hors navigateur (`src/utils/sqliteBackup.ts`) via le lanceur PC ou `InsertechStockage` sur Android.
  - Synchronisation LAN chiffrée PC ↔ Tablettes Android via `P2PNetworkManager` (`src/network.ts`, `src/net/`) et `ServeurLocalPlugin.java` (WebSocket sur port `47630` avec `WifiLock` basse latence).
  - Synchronisation inter-onglets locale via `BroadcastChannel` (ex. fenêtre Écran Public `?vue=public`).

---

## 2. Rôles Terrain (`WorkRole`), Appareils & Workflows

Définis dans `src/types.ts` et gérés par `src/utils/modeLock.ts` + `src/components/tablette/MobileOnboardingWizard.tsx` + `src/components/DashboardShell.tsx` :

- **Poste Laptop (Serveur Hôte) :** toujours `admin`, anti-veille automatique (`src/utils/wakeLock.ts` + `SetThreadExecutionState` dans `launcher/Program.cs`), seul à pouvoir ouvrir le projecteur / Écran Public, verrouillable manuellement via le code PIN par défaut **`0000`** (modifiable dans les réglages réseau).
- **Appareils Mobiles / Tablettes (après scan QR) :** parcours guidé en 4 étapes :
  1. Choix de l'événement actif *(sauté automatiquement s'il n'y en a qu'un seul)*
  2. Choix du rôle adapté à l'événement *(sans Écran Public sur mobile)*
  3. Formulaire bénévole complet (`ContactForm` en mode `volunteer` pour tous les rôles sauf `reparateur`, qui choisit/crée sa fiche technique Nom + Table + Spécialités ; `kiosque_formulaire` saute directement au formulaire visiteur)
  4. Vue dédiée au rôle avec en-tête minimaliste : logo Insertech = Menu principal, icône synchro seule (Bleu/Jaune/Rouge), 1 seul bouton de rôle, et verrouillage réservé au mode `kiosque_formulaire`.
- **`juge` (Animateur Juge Kiosque-Concours) :** `src/components/matrices/concours/JudgeConcoursCockpit.tsx` — inscription directe des 1 ou 2 joueurs devant le juge, bassin multi-animateurs pour départ commun synchronisé (10 pistes réseau), 2 arrêts séparés contrôlés uniquement par le juge, puis écran temps + rang cumulé + rappel des prix + `Nouvelle compétition`. L'onglet `Tirage` reste réservé à `admin`.

1. **`admin` (Administrateur / God Mode) :**
   - Protégé par le code PIN à 4 chiffres de l'événement sur tablette/cellulaire.
   - **Multi-événements :** `src/components/shared/MultiEventControlBar.tsx` permet d'épingler et basculer entre 2+ événements actifs avec une **Tour de contrôle unifiée**.
   - **Vue « Map » des Tables :** `src/components/matrices/reparothon/AdminMapAndGodMode.tsx` affiche chaque table avec chrono de service en direct (`< 25 min`, `25–45 min`, `> 45 min`), assignation d'un **2e appareil**, transfert de table en 2 taps, priorisation et messages flash vers l'Écran Public.
2. **`accueil` (Animateur d'Accueil) :**
   - Assistant **1 question par écran** dans `src/components/matrices/ReparothonMatrix.tsx` : `Catégorie` → `Marque` → `Modèle` → `Matériel / Logiciel` → `4 cartes à icônes` → `Panier (Un autre appareil ?)` → `3. Inscription d'un participant` (`ContactForm` Loi 25 + pronoms) → `4. Questions de bénévolat Insertech` (conditionnel).
   - Bouton permanent `Devenir bénévole` dans l'en-tête (`VolunteerSurveyButton.tsx`).
3. **`reparateur` (Animateur Réparateur) :**
   - `src/components/matrices/reparothon/ReparateurCockpit.tsx` : file d'attente intelligente (`Recommandé pour toi`), **Piste Temps Réel en 4 étapes** (`1. Accueil` → `2. Diagnostic` → `3. Réparation` → `4. Rapport final en 3 écrans`), appel de table sur l'Écran Public, demande d'Assistant, et tiroir **Lexique hors-ligne** (`src/utils/repairLexicon.ts`) pour les 8 catégories de pannes.
4. **`assistant` (Animateur Assistant) :**
   - `src/components/matrices/reparothon/AssistantCockpit.tsx` : réception des alertes `Demander Assistant`, accompagnement des visiteurs appelés aux tables et orientation de sortie (pièce de rechange / boutique Insertech).
5. **`formateur` (Formateur) :**
   - `src/components/matrices/generic/FormateurEvaluationPanel.tsx` dans `GenericMatrix.tsx` : suivi **1. Avant** (niveau `1`–`4`), **2. Pendant** (4 jalons pratiques + statut), **3. Après** (niveau `1`–`4`, calcul du gain `+X niveaux` et pastille `Prêt Réparothon`).
6. **`kiosque_formulaire`** & **`ecran_public`** : modes verrouillables sur tablette (`ModePicker.tsx`).

---

## 3. Loi 25, Anonymisation & Exports

- **Consentements :** gérés dans `src/utils/contact.ts` et `src/components/shared/ContactForm.tsx`.
- **Écran Public :** ne jamais afficher de nom complet, courriel ou téléphone ; toujours utiliser `formatPublicShortName(name)` (`"Sophie Côté"` → `"Sophie C."`).
- **Exports Excel / CSV & Centre de Rapport d'Impact (`src/utils/impactReport.ts`, `src/components/shared/ImpactReportModal.tsx`, `src/utils/contactExport.ts`) :**
  - Modale **Centre de Rapport d'Impact** en gros boutons avec aperçu des 4 piliers (Écologie kg + $\text{CO}_2\text{e}$ ACV, Opérations & Boutique, Mobilisation & Loi 25, Pédagogie Formation) et copie rapide du résumé exécutif.
  - Classeur Excel `.xlsx` à **3 onglets** (`Sommaire d'Impact`, `Données Détaillées`, `Équipe & Tables`) + **Bilan Consolidé Multi-Événements**.
  - Réparothon : inclut `Temps d'attente (min)`, `Durée de réparation (min)`, `Actions réalisées`, `Suite proposée` et `Pièce / Détail boutique`.
  - Formations : inclut `Niveau Avant (1-4)`, `Jalons Pendant`, `Statut Formateur`, `Niveau Après (1-4)`, `Progression (+)` et `Prêt Réparothon`.

---

## 4. Garde-fous du Design System (`scripts/check-design-tokens.js`)

Toujours respecter ces règles dans `src/` :
- **Interdit :** `text-[...px]`, couleurs hexadécimales `[#...]`, espacements `p-0.2` / `m-0.2`, variantes `dark:`, et classes Tailwind dynamiques (`bg-${color}`).
- **Obligatoire :** tokens sémantiques (`bg-primary`, `text-secondary`, `bg-app-card`, `bg-app-input`, `text-app-text`, `text-app-text-muted`, `border-app-card-border`, `text-micro`) et dictionnaires statiques pour les variantes de couleur.

---

## 5. Commandes de Validation & Build

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
