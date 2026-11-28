# Journal des modifications (Changelog)

Toutes les évolutions notables d'**Insertech — Tableau de bords événementiel** depuis la version **1.4.0** sont documentées ici.

---

## [1.8.1] — 2026-11-27

### Amélioré
- **Accessibilité WCAG AA/AAA & aides FALC (`src/utils/accessibility.ts`, `src/index.css`, `src/main.tsx`) :**
  - Modes persistés **`Texte agrandi`** (`.a11y-large-text`, échelle `112.5%`) et **`Contraste élevé`** (`.a11y-high-contrast` clair/sombre + anneau `:focus-visible` `3px`), activables en 1 clic dans le menu `Plus`.
  - Cibles tactiles agrandies (`min-h-12` / `min-h-14`), aides textuelles simples (FALC) sous chaque question et annonces `aria-live="polite"`.
- **En-tête permanent compact sur une ligne & barre mobile (`DashboardShell.tsx`, `TabSwitcher.tsx`, `MoreMenu.tsx`, `VolunteerSurveyButton.tsx`, `MultiEventControlBar.tsx`, `App.tsx`) :**
  - En-tête unique permanent (`h-14 min-h-14 sticky top-0 z-40`) sans chevauchement (y compris en mode Kiosque d'inscription ; seul l'Écran Public projecteur conserve son auto-masquage).
  - Boutons en icônes prioritaires avec `aria-label` conservés, fusion du sélecteur multi-événements (`MultiEventHeaderSelector`) directement dans le titre cliquable sur Laptop, et barre d'onglets fixe en bas sur écrans `< 640px` (`variant="bottom"`).
- **Formulaires « 1 question à la fois » & récapitulatif (`ContactForm.tsx`, `src/utils/contact.ts`, `InstallFestMatrix.tsx`, `GenericMatrix.tsx`, `ReparothonMatrix.tsx`) :**
  - Découpage séquentiel de `ContactForm` (`identity` → `contact` → `loi25` → étapes bénévolat conditionnelles `vol_roles` / `vol_skills` / `vol_logistics` / `vol_extra` / `vol_consent` → `Récapitulatif avant validation` avec boutons `Modifier` et avancement via `Entrée`).
  - Parcours `InstallFestMatrix` découpé en **6 étapes** avec auto-avance sur choix unique (catégorie, système actuel, distribution) ; intégration des notes et présence de `GenericMatrix` au récapitulatif final.
- **Cockpit Réparateur unifié & arbre Oui/Non (`ReparateurCockpit.tsx`, `DiagnosticDecisionTree.tsx`, `src/utils/repairLexicon.ts`, `IfixitGuidesPanel.tsx`) :**
  - Suppression des 3 sous-onglets au profit d'une vue unifiée progressive : fiche technique permanente + minuteur en direct, arbre de diagnostic interactif **Oui / Non** (`DIAGNOSTIC_DECISION_TREES`) avec vérifications complémentaires repliables et ciblage des guides, liste de guides pertinents (`embedded`) avec recherche manuelle repliable, et raccourci **`Valider rapidement`** sur le rapport final.
- **Vues simplifiées Formateur & Assistant (`FormateurEvaluationPanel.tsx`, `AssistantCockpit.tsx`) :**
  - Mode guidé par défaut : 1 apprenant et 1 étape à la fois avec auto-avance de `1. Avant` vers `2. Pendant` (bascule `Vue liste` disponible), et 1 action prioritaire à la fois (`Action 1 sur N`) pour l'Assistant (bascule `Voir toute la file` disponible).

---

## [1.8.0] — 2026-11-27

### Ajouté
- **Assistant de diagnostic local 100 % hors-ligne (`src/utils/repairLexicon.ts`, `TicketDiagnosticPanel.tsx`) :**
  - Moteur de règles typé (`DIAGNOSTIC_CHECKLIST_RULES`, `getDiagnosticSuggestions`) filtré par catégorie, OS et mots-clés normalisés dans `initialDiagnosis` / `objectName` (alimentation, batterie, écran, lenteur/OS/disque, surchauffe/ventilateur, clavier/ports, Wi-Fi, mobile/tablette et PC tour).
  - Onglet **`Diagnostic`** dans `ReparateurCockpit.tsx` avec résumé du triage, questions à poser avec conseils techniques et vérifications prioritaires cochables en 1 tap (persistées dans `ticket.extraData.diagnosticChecks`) + compteur de progression.
- **Bibliothèque locale hors-ligne de guides & distribution LAN (`src/utils/offlineGuideLibrary.ts`, `src/db.ts`, `src/network.ts`, `OfflineGuidesLibraryModal.tsx`) :**
  - Nouvelle table IndexedDB **`repairGuides`** (Dexie `version(3)`) incluant dès le démarrage **9 fiches pas à pas maison Insertech** (`BUILTIN_REPAIR_GUIDES`).
  - Gestionnaire **Plus → Bibliothèque de guides hors-ligne** sur Laptop Administrateur pour gérer les fiches, pré-télécharger des guides depuis iFixit (avec compression automatique d'1 miniature par étape via le relais local sécurisé `/image` de `launcher/StorageCompanion.cs`), créer des fiches maison et importer/exporter des packs `.json`.
  - **Filtrage strict selon l'inscription du participant (`matchOfflineGuidesForTicket`) :** exclusion automatique des guides d'une autre marque, catégorie, OS ou sans recouvrement de symptôme (ex. un guide batterie Dell n'apparaît jamais pour un PC Lenovo sous Linux lent).
  - **Distribution LAN automatique avec le participant :** le Laptop serveur pousse uniquement les guides pertinents vers les tablettes via `GUIDES_SYNC` (à l'ajout/mise à jour du ticket et à `INITIAL_SYNC`) et répond aux recherches manuelles à la demande (`REQUEST_GUIDE_SEARCH` → `GUIDE_SEARCH_RESULTS`).
- **Client API iFixit v2.0 + cache IndexedDB + lecteur intégré avec zoom HD (`src/services/ifixitService.ts`, `IfixitGuidesPanel.tsx`, `IfixitGuideViewer.tsx`) :**
  - Table Dexie `ifixitCache` (Dexie `version(2)`, TTL 7 jours, repli hors-ligne sur le cache existant).
  - Priorité `fr.ifixit.com` avec repli automatique sur `www.ifixit.com` si moins de 3 résultats FR, déduplication par `guideid`, filtres `Tous / FR / EN` et timeout strict de 6 s.
  - Prise en charge sécurisée de la clé API iFixit (`Authorization: Bearer`) via `.env.local` (non suivi par Git), secret CI `VITE_IFIXIT_API_KEY`, ou saisie locale optionnelle dans l'interface (`localStorage`).
  - Lecteur pas à pas 100 % intégré (`IfixitGuideViewer.tsx`) : difficulté, durée, outils, pièces, navigation `Précédent` / `Suivant`, puces `Attention` / `Rappel` / `Note`, et **clic sur la miniature d'étape pour ouvrir l'image pleine résolution si disponible** (sinon la miniature reste inchangée).
- **Navigation par onglets dans `ReparateurCockpit.tsx` :** `[Fiche]`, `[Diagnostic]`, `[Guides iFixit]` sur la fiche du ticket actif.

### Corrigé
- **Retour aux sessions actives sur tablette / cellulaire (`src/App.tsx`, `tests/tablette-modes.spec.ts`) :** lorsque l'utilisateur revient à l'écran d'accueil tablette (*Rejoindre un événement*) alors que l'appareil est déjà connecté au PC hôte (ou possède des activités synchronisées), les sessions actives s'affichent directement en gros boutons cliquables pour y revenir en 1 tap sans rester bloqué sur « En attente de l'activité du PC hôte… ». La restauration conserve également l'onglet `formulaire` pour le rôle `Kiosque d'inscription`.

---

## [1.7.2] — 2026-11-24

### Corrigé
- **Installeur Windows NSIS (`packaging/windows/installer.nsi`) :** fermeture automatique et silencieuse de toute instance en cours de `InsertechEvenements.exe` (`taskkill /F /IM InsertechEvenements.exe` + attente de libération du verrou) avant d'écrire ou de supprimer l'exécutable lors d'une mise à jour ou d'une désinstallation. Résout l'erreur *« Erreur lors de l'ouverture du fichier en écriture »* causée par le compagnon SQLite qui reste actif 2 minutes en arrière-plan après la fermeture de la fenêtre.

---

## [1.7.1] — 2026-11-24

### Amélioré
- **Onboarding mobile bénévole simplifié (`src/components/tablette/MobileOnboardingWizard.tsx`) :**
  - Pour tous les rôles hors réparateur (Accueil, Assistant, Formateur, Juge), l'étape 3 ne demande plus qu'un seul champ **« Nom, prénom ou surnom \* »** (`#mob-vol-displayName`), accepté même si le bénévole est introuvable dans la base de données locale.
  - Pour le rôle **Réparateur**, sélection ou création rapide de sa fiche technique (Nom, Table, Spécialités matérielles et logicielles).
- **Champ d'identité unique & pronoms neutres (`src/utils/contact.ts`, `src/components/shared/ContactForm.tsx`) :**
  - Remplacement des deux champs séparés *Prénom* / *Nom* par un champ unique **« Nom, prénom ou surnom \* »** (accepte un surnom seul comme `Alex` ou un nom complet comme `Sophie Côté`, découpé automatiquement par `splitDisplayName` pour les exports Excel/CSV et l'anonymisation Loi 25).
  - Bulles de pronoms compactes (`Il / lui`, `Elle / elle`, `Iel / ellui`, `Autre`), sans aucune icône genrée.
- **Saisie rapide Téléphone & Courriel — marché canadien uniquement (`src/utils/contact.ts`, `src/components/shared/ContactForm.tsx`) :**
  - Suppression complète de l'option *« Hors Canada »* dans l'interface et la validation.
  - Affichage simultané des champs **Téléphone** et **Courriel**, avec **1 seul moyen de contact requis** sur les deux.
  - Formatage en direct `XXX XXX-XXXX` + puces 1-tap des indicatifs régionaux du Québec (`514`, `438`, `263`, `450`, `579`, `418`, `581`, `819`, `873`).
  - Puces 1-tap d'auto-complétion courriel (`@gmail.com`, `@hotmail.com`, `@hotmail.fr`, `@outlook.com`, `@yahoo.ca`, `@icloud.com`, `@proton.me`, `@videotron.ca`, `@bell.net`), filtrées dynamiquement dès la saisie de `@`.
- **Formulaires uniformisés en étapes `1 - 2 - (3)` :**
  - Parcours `1. Identité` → `2. Contact` → `3. Bénévolat` (conditionnelle) déployé sur `TeardownMatrix`, `JudgeConcoursCockpit`, `GenericMatrix`, `InstallFestMatrix` et `VolunteerSurveyButton`. `ReparothonMatrix` conserve son assistant appareil/problème suivi de l'étape 3 (`Coordonnées`) et de l'étape 4 (`Bénévolat` conditionnelle).

---

## [1.7.0] — 2026-11-24

### Ajouté
- **Poste Laptop = Serveur Hôte Administrateur & anti-veille (`src/utils/wakeLock.ts`, `launcher/Program.cs`, `src/utils/modeLock.ts`) :**
  - Le Laptop est toujours en rôle `admin` avec maintien éveillé automatique (`navigator.wakeLock` côté web + `SetThreadExecutionState` dans le lanceur Windows).
  - Code PIN par défaut **`0000`** initialisé à la création d'événement (modifiable par l'administrateur) et verrouillage manuel rapide disponible sur le Laptop.
- **Onboarding mobile / tablette guidé en 4 étapes (`src/components/tablette/MobileOnboardingWizard.tsx`, `src/network.ts`) :**
  1. Choix de l'événement actif envoyé par le PC hôte *(sauté automatiquement s'il n'y en a qu'un seul)*.
  2. Choix du rôle adapté à l'événement *(sans Écran Public sur mobile)*.
  3. Identification du bénévole / profil réparateur *(le Kiosque d'inscription saute directement au formulaire visiteur ; Administrateur demande le PIN)*.
  4. Ouverture directe de l'espace dédié au rôle.
- **Cockpit « Animateur Juge » pour Kiosque-Concours (`src/components/matrices/concours/JudgeConcoursCockpit.tsx`, `src/components/matrices/TeardownMatrix.tsx`, `src/network.ts`) :**
  - Inscription directe de **1 ou 2 joueurs maximum** devant le juge sans file d'attente préalable.
  - Bassin multi-animateurs sur **10 pistes réseau** : visibilité des joueurs prêts chez les autres juges et **départ commun synchronisé** (`TIMER_START_BATCH`).
  - **2 arrêts séparés** contrôlés exclusivement par le juge, suivis de l'écran de fin (temps réalisé, rang cumulé, rappel des prix et bouton `Nouvelle compétition`).
- **En-têtes épurés par appareil et par rôle (`src/components/DashboardShell.tsx`, `src/components/tablette/ModeControls.tsx`) :**
  - Logo Insertech cliquable = **Menu principal** (suppression du bouton séparé).
  - Indicateur de synchronisation réduit à une **icône seule** (Bleu = synchronisé, Jaune = en cours, Rouge = hors ligne).
  - **1 seul bouton de rôle** sur mobile/tablette (suppression de *Changer de mode*).
  - **Écran Public / projecteur** réservé au **Laptop** uniquement.
  - **Verrouillage PIN** réservé au mode **Kiosque d'inscription** (maintenir le cadenas discret 2 secondes + PIN `0000` par défaut).
  - Onglet **Tirage** et **Rapport d'Impact** réservés à **Administrateur**.
  - Bouton **Devenir bénévole** masqué pour le **Réparateur** (rappel d'orientation vers l'Accueil, un Assistant ou un Administrateur).

---

## [1.6.0] — 2026-11-23

### Ajouté
- **Workflows par persona / rôle terrain (`WorkRole`) :**
  - **Administrateur (`admin`) :** barre multi-événements (`MultiEventControlBar.tsx`) avec Tour de contrôle unifiée, et **Vue « Map » des Tables** (`AdminMapAndGodMode.tsx`) avec chronos de service (`< 25 min`, `25–45 min`, `> 45 min`), assignation d'un 2e appareil, transfert de table en 2 taps, priorisation et messages flash vers l'Écran Public.
  - **Animateur d'Accueil (`accueil`) :** assistant Réparothon **1 question par écran** (`Catégorie` → `Marque` → `Modèle` → `Matériel / Logiciel` → `4 cartes à icônes` → `Panier multi-appareils` → `Participant` → `Bénévolat conditionnel`).
  - **Animateur Réparateur (`reparateur`) :** `ReparateurCockpit.tsx` avec file d'attente intelligente (*Recommandé pour toi*), **Piste Temps Réel en 4 étapes** (`1. Accueil` → `2. Diagnostic` → `3. Réparation` → `4. Rapport final en 3 écrans`), appel de table sur Écran Public, demande d'Assistant et tiroir **Lexique hors-ligne** (`src/utils/repairLexicon.ts`).
  - **Animateur Assistant (`assistant`) :** `AssistantCockpit.tsx` pour traiter les demandes d'aide des réparateurs, accompagner les visiteurs appelés aux tables et orienter la sortie (pièces / boutique Insertech).
  - **Formateur (`formateur`) :** `FormateurEvaluationPanel.tsx` dans `GenericMatrix.tsx` avec suivi **1. Avant** (niveau 1–4), **2. Pendant** (4 jalons + statut) et **3. Après** (gain `+X niveaux` et pastille `Prêt Réparothon`).
- **Centre de Rapport d'Impact & conformité Loi 25 (`src/utils/impactReport.ts`, `src/components/shared/ImpactReportModal.tsx`, `src/utils/contactExport.ts`) :**
  - Modale de synthèse en 4 piliers (Écologie kg + $\text{CO}_2\text{e}$ ACV, Opérations & Boutique, Mobilisation & Loi 25, Pédagogie Formation) avec copie rapide du résumé exécutif.
  - Export Excel `.xlsx` à **3 onglets** (`Sommaire d'Impact`, `Données Détaillées`, `Équipe & Tables`) + **Bilan Consolidé Multi-Événements**.
  - Anonymisation systématique sur l'Écran Public (`formatPublicShortName` : `"Sophie Côté"` → `"Sophie C."`).
- **Audit UX & garde-fous Design System (`scripts/check-design-tokens.js`) :**
  - Vérification automatisée dans `npm run lint` interdisant les tailles fixes `text-[...px]`, hexadécimaux `[#...]`, variantes `dark:` et classes Tailwind dynamiques au profit des tokens sémantiques.

---

## [1.5.0] — 2026-11-20

### Ajouté — Application Android native (Capacitor 8) & Synchro 100 % réseau local (Lots 1 à 9)
- **Lot 1 — Migration Capacitor 8 (`capacitor.config.ts`, `android/`) :** application Android 10+ native sans dépendance aux services Google, avec icônes adaptatives, splash screens et sauvegarde SQLite persistante (`StorageBridge.java` / `window.InsertechStockage`).
- **Lot 2 — Fichiers & exports Android (`src/utils/saveFile.ts`, `src/native/android.ts`) :** enregistrement des exports Excel, CSV, contacts et sauvegardes JSON dans `Documents/Insertech`, ouverture de la feuille de partage native Android et sélecteur de fichiers fiable pour les imports/logos.
- **Lot 3 — Modes d'usage tablette & code PIN à 4 chiffres (`src/utils/modeLock.ts`, `PinDialog.tsx`, `TabletPinSettings.tsx`) :** verrouillage protégé par empreinte SHA-256 salée du code PIN (jamais stocké en clair) avec délai anti-brute-force de 30 secondes après 3 essais erronés.
- **Lot 4 — Verrouillage matériel Android (`InsertechNatifPlugin.java`) :** plein écran immersif, épinglage d'application (`epingler` / `desepingler`), maintien de l'écran allumé (`@capacitor-community/keep-awake`) et gestion du bouton Retour.
- **Lot 5 — Synchronisation 100 % réseau local chiffrée (`src/net/`, `ServeurLocalPlugin.java`, `launcher/TabletDiscovery.cs`) :** la tablette écoute sur le port `47630` (WebSocket local avec `WifiLock`) et le PC hôte l'appelle en sortie (aucune fenêtre pare-feu Windows, aucun droit administrateur), poignée de main `DEFI` / `PREUVE` (HMAC-SHA256 + HKDF + AES-GCM 256 bits), file d'envoi hors-ligne (`insertech_net_outbox`) avec accusés `ACK` et reconnexion automatique.
- **Lot 6 — Appairage par QR Code (`src/utils/joinLink.ts`, `RejoindreEvenement.tsx`) :** lien profond `insertech://rejoindre?code=…&cle=…&nom=…` scannable depuis l'application ou l'appareil photo natif.
- **Lot 7 — Écran public sur téléviseur (`docs/ecran-public-chromecast.md`) :** masquage automatique des contrôles et du curseur après 3 secondes d'inactivité et guide d'affichage sans internet.
- **Lot 8 — Mise à jour des tablettes par le PC en LAN (`src/net/miseAJour.ts`, `VerificationMaj.java`) :** transfert d'APK par morceaux de 64 Ko avec reprise, vérification SHA-256 / paquet / `versionCode` / certificat de signature avant installation Android.
- **Lot 9 — Qualité, tests & compatibilité WebView (`tests/`, `android-emulateur.yml`, `docs/android-verification-tablette.md`) :** tests JUnit Java, tests instrumentés sur émulateur Android sans services Google (API 29 et 35), détection d'un WebView trop ancien (absence d'`oklch`) et liste de vérification terrain des tablettes.
