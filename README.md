# 📋 Insertech — Tableau de bords événementiel

> **Documentation complète · Version 1.1.0 · Rédigée en français (Canada)**

---

## Table des matières

1. [Présentation du projet](#1-présentation-du-projet)
2. [Architecture complète](#2-architecture-complète)
3. [Démarrage développeur](#3-démarrage-développeur)
4. [Types TypeScript (types.ts)](#4-types-typescript-typests)
5. [Base de données IndexedDB (db.ts)](#5-base-de-données-indexeddb-dbts)
6. [Réseau local (network.ts et src/net/)](#6-réseau-local-networkts-et-srcnet)
7. [App.tsx — Application principale](#7-apptsx--application-principale)
8. [MatrixSelector.tsx — Création d'événement](#8-matrixselectortsx--création-dévénement)
9. [DashboardShell.tsx — Coquille du tableau de bord](#9-dashboardshelltsx--coquille-du-tableau-de-bord)
10. [ReparothonMatrix.tsx — Module de réparation](#10-reparothonmatrixtsx--module-de-réparation)
11. [TeardownMatrix.tsx — Kiosque-Concours](#11-teardownmatrixtsx--kiosque-concours)
12. [GenericMatrix.tsx — Module générique](#12-genericmatrixtsx--module-générique)
13. [Composants partagés](#13-composants-partagés)
14. [Importation universelle](#14-importation-universelle)
15. [Exportation universelle](#15-exportation-universelle)
16. [Thème clair / foncé](#16-thème-clair--foncé)
17. [Référence des formats de fichiers](#17-référence-des-formats-de-fichiers)
18. [Guide de déploiement](#18-guide-de-déploiement)
19. [Référence complète des champs de formulaire](#19-référence-complète-des-champs-de-formulaire)
20. [Dépendances](#20-dépendances)
21. [FAQ](#21-faq)
22. [Application Android](#22-application-android)

---

## 1. Présentation du projet

### 🤔 C'est quoi, en termes simples ?

Imagine que tu organises une journée de réparation d'ordinateurs dans un gymnase. Des dizaines de personnes arrivent avec leurs vieux laptops, et il y a plusieurs techniciens pour les réparer. Comment garder la trace de qui répare quoi ? Comment montrer sur un grand écran le progrès de la journée ?

**Insertech Tableau de bords événementiel**, c'est exactement cet outil. C'est une application web qui fonctionne dans un navigateur (comme Google Chrome), et qui permet de gérer **en direct** plusieurs types d'événements organisés par Insertech :

| Type d'événement | Ce que ça fait |
|---|---|
| 🔧 **Réparothon** | Gérer les tickets de réparation d'appareils électroniques |
| 🐧 **Install Fest Linux** | Gérer les inscriptions pour l'installation de Linux |
| 🖼️ **Fresque numérique** | Gérer les participants à un atelier créatif |
| 💻 **Prolonger la vie de l'ordi** | Gérer un atelier de sensibilisation |
| 🏆 **Kiosque-Concours** | Chronométrer un concours d'assemblage avec tirage au sort |
| 📢 **Conférence pollution** | Gérer les présences à une conférence |
| 🤝 **Communauté de pratique** | Gérer une réunion de groupe |
| 🎓 **Formation Réparothon** | Gérer une session de formation |

### 🌐 Pourquoi hors-ligne ?

Les événements d'Insertech se déroulent souvent dans des lieux où le Wi-Fi est mauvais (gymnases, sous-sols, salles communautaires). L'application **n'a pas besoin d'Internet** pour fonctionner ! Toutes les données sont sauvegardées directement dans le navigateur grâce à **IndexedDB** (une mini-base de données intégrée dans Chrome et Firefox).

Plusieurs tablettes Android se connectent au PC hôte **par le réseau local seulement** (le hotspot d'un cellulaire, données mobiles coupées) : jamais d'internet, jamais de service Google, et aucune permission administrateur ni fenêtre du pare-feu sur le PC. Voir la [section 6](#6-réseau-local-networkts-et-srcnet) et la [section 22](#22-application-android).

### 👥 Pour qui ?

- **Les animateurs/trices d'Insertech** : pour gérer les événements en temps réel
- **Les techniciens** : pour voir leur tableau de bord de réparation
- **Le public** : pour voir un écran de présentation avec les statistiques en direct

---

## 2. Architecture complète

### 🗂️ Arborescence des fichiers

```
Insertech - Tableau de bords événementiel/
│
├── index.html                    → Page HTML principale (point d'entrée, message si le navigateur est trop ancien)
├── package.json                  → Dépendances, scripts npm et version unique de l'application
├── vite.config.ts                → Configuration du bundler Vite
├── capacitor.config.ts           → Application Android (Capacitor)
│
├── dist/                         → Généré par npm run build (NE PAS MODIFIER)
├── launcher/                     → Lanceur .NET (exe Windows, binaire Linux) : sert dist/, sauvegarde SQLite,
│                                   liste des tablettes du réseau local (TabletDiscovery.cs)
├── android/                      → Projet Android : plugins Java InsertechNatif et ServeurLocal, tests
├── packaging/                    → Installeurs .deb et Windows (NSIS)
├── docs/                         → Écran public sur téléviseur, vérification des tablettes avant un événement
├── tests/                        → Tests Playwright (interface, réseau local avec tablette simulée)
│
└── src/
    ├── main.tsx                  → Point d'entrée React
    ├── index.css                 → Styles globaux + variables CSS thème clair/foncé
    ├── types.ts                  → Types TypeScript du projet
    ├── db.ts                     → Base de données IndexedDB (Dexie.js)
    ├── network.ts                → networkManager : session hôte ou tablette, file d'envoi, synchronisation
    ├── App.tsx                   → Composant racine : navigation, import/export, événements
    ├── net/                      → Réseau local : appel des tablettes, poignée de main, chiffrement, mises à jour
    ├── native/android.ts         → Appels aux plugins Android (plein écran, épinglage, liens, mise à jour)
    ├── utils/                    → Exports (saveFile.ts), verrouillage des modes (modeLock.ts), lien du QR…
    │
    └── components/
        ├── DashboardShell.tsx    → Coquille du tableau de bord (en-tête + onglets)
        ├── MatrixSelector.tsx    → Écran de création/sélection d'un événement
        ├── matrices/             → Modules par type d'événement (Réparothon, Kiosque-Concours, Install Fest, générique)
        ├── reseau/               → Fenêtres Réseau local du PC et de la tablette, mise à jour des tablettes
        ├── tablette/             → Rejoindre un événement, choix et verrouillage du mode de la tablette
        └── shared/               → Composants réutilisables (graphiques, chrono, classement, tirage, QR…)
```

### 📝 Description de chaque fichier

#### `index.html`
Le fichier HTML minimal qui charge l'application React. Il contient une `<div id="root">` dans laquelle React injecte tout le contenu. Vite s'occupe d'y injecter les scripts automatiquement lors de la compilation.

#### `src/main.tsx`
Le fichier de démarrage React. Il importe `App.tsx` et l'accroche à `<div id="root">`. Il s'assure aussi que le thème (clair/foncé) est appliqué dès le démarrage en lisant le `localStorage`.

#### `src/index.css`
Toutes les variables CSS du thème (couleurs, typographie) et les classes utilitaires. Utilise la classe `.light` sur la balise `<html>` pour basculer entre le thème foncé (défaut) et le thème clair.

#### `src/types.ts`
Le "dictionnaire" du projet. Il définit la forme exacte de toutes les données : un ticket de réparation, un technicien, un participant, etc. TypeScript utilise ces définitions pour détecter les erreurs de code avant même de lancer l'application.

#### `src/db.ts`
Le "cerveau de stockage". Il définit les 5 tables de la base de données locale et expose les fonctions pour les manipuler. Utilise **Dexie.js**, une bibliothèque qui simplifie l'utilisation d'IndexedDB.

#### `src/network.ts`
Le "cerveau réseau". Gère la communication entre le PC hôte et les tablettes, uniquement sur le réseau local : le PC appelle les tablettes, qui écoutent (voir la section 6).

#### `src/App.tsx`
Le composant principal qui orchestre tout : quel événement est actif, quel onglet est affiché, les imports/exports de données, la navigation entre les écrans.

#### `src/components/MatrixSelector.tsx`
L'écran d'accueil. Permet de créer un nouvel événement, de sélectionner un événement passé, ou de rejoindre/créer une session réseau.

#### `src/components/DashboardShell.tsx`
L'enveloppe visuelle du tableau de bord actif. Affiche le nom de l'événement, les onglets de navigation, et les boutons d'action (export, réseau, thème).

#### `src/components/matrices/ReparothonMatrix.tsx`
Le module le plus complexe. Gère les tickets de réparation, les techniciens, les statistiques, et l'écran public avec animation de célébration.

#### `src/components/matrices/TeardownMatrix.tsx`
Gère le concours d'assemblage d'ordinateur : 5 pistes de chronométrage simultanées, classement en temps réel, et tirage au sort animé.

#### `src/components/matrices/GenericMatrix.tsx`
Module polyvalent pour les événements qui ne sont pas un réparothon ni un concours : gestion des présences, collecte de rétroaction (étoiles), chrono de session.

#### `src/components/shared/Charts.tsx`
Deux graphiques réutilisables basés sur **Chart.js** : un diagramme circulaire (Doughnut) et un diagramme à barres (Bar).

#### `src/components/shared/Stopwatch.tsx`
Un chronomètre qui se met à jour toutes les 10 millisecondes pour un affichage précis au centième de seconde. Peut fonctionner en mode lecture seule.

#### `src/components/shared/Leaderboard.tsx`
Un classement animé qui affiche les participants avec leur temps, leur rang (médailles 🥇🥈🥉), et des animations via **Framer Motion**.

#### `src/components/shared/RaffleSpinner.tsx`
La roue de tirage au sort. Passe par trois états : idle (en attente), spinning (animation de défilement des noms avec ralentissement exponentiel), et celebrating (annonce du gagnant avec confettis).

---

## 3. Démarrage développeur

### 📦 Prérequis

Avant de commencer, tu as besoin de :

1. **Node.js** version 18 ou plus récente → [nodejs.org](https://nodejs.org)
2. **npm** (inclus avec Node.js)
3. Un éditeur de code, idéalement **VS Code** avec l'extension TypeScript

Vérifie ta version avec :
```bash
node --version   # Doit afficher v18.x.x ou plus
npm --version    # Doit afficher 9.x.x ou plus
```

### 🚀 Installation

```bash
# 1. Navigue dans le dossier du projet
cd "Insertech - Tableau  de bords événementiel"

# 2. Installe toutes les dépendances (ça peut prendre 1-2 minutes)
npm install
```

### 🛠️ Scripts disponibles

| Commande | Ce qu'elle fait |
|---|---|
| `npm run dev` | Lance le serveur de développement local (avec rechargement automatique) |
| `npm run build` | Compile l'application pour la production dans le dossier `dist/` |
| `npm run preview` | Prévisualise la version compilée localement |
| `npm run lint` | Vérifie les erreurs TypeScript sans exécuter le code |
| `npm run clean` | Supprime le dossier `dist/` pour repartir propre |

### 🔥 Développement local

```bash
npm run dev
```

Ouvre ensuite ton navigateur à l'adresse affichée (généralement `http://localhost:5173`).

> [!NOTE]
> Le serveur de développement recharge automatiquement la page dès que tu sauvegardes un fichier. Très pratique pour voir les changements en direct !

### 📦 Compilation pour la production

```bash
npm run build
```

Le dossier `dist/` contiendra **un seul fichier HTML** autonome grâce au plugin `vite-plugin-singlefile`. Ce fichier unique peut être ouvert directement dans n'importe quel navigateur sans serveur web.

> [!IMPORTANT]
> Le fichier `dist/index.html` est le fichier à distribuer aux animateurs. Il contient tout l'application (CSS, JavaScript, polices) en un seul bloc.

---

## 4. Types TypeScript (types.ts)

Le fichier `src/types.ts` est le contrat de données du projet. Il définit exactement la forme de chaque objet manipulé. Voici une documentation exhaustive de chaque type.

### 4.1 `EventType` — Les 8 types d'événements

```typescript
export type EventType =
  | 'reparothon'           // Journée de réparation d'appareils électroniques
  | 'formation_reparothon' // Formation pour les futurs techniciens
  | 'fresque_numerique'    // Atelier créatif de fresque numérique
  | 'prolonger_vie_ordi'   // Atelier : donner une seconde vie à son ordinateur
  | 'kiosque_concours'     // Concours d'assemblage avec tirage au sort
  | 'install_fest_linux'   // Journée d'installation de Linux
  | 'conference_pollution' // Conférence sur la pollution numérique
  | 'communaute_pratique'; // Réunion de communauté de pratique
```

**Comment choisir ?**
- Si tu veux des tickets de réparation → `reparothon` ou `formation_reparothon`
- Si tu veux un chrono + classement + tirage → `kiosque_concours`
- Pour tout le reste → les 5 autres types utilisent `GenericMatrix`

### 4.2 `EventSettings` — La fiche d'un événement

```typescript
export interface EventSettings {
  id: string;         // Identifiant unique généré automatiquement (ex: "evt-a3f2b1c9d")
  name: string;       // Nom de l'événement (ex: "Réparothon Rosemont 2025")
  type: EventType;    // Un des 8 types ci-dessus
  date: string;       // Date en format ISO (ex: "2025-10-15")
  location: string;   // Ville ou lieu (ex: "Montréal")
  partner?: string;   // Organisation partenaire optionnelle (ex: "Ville de Montréal")
  place?: string;     // Lieu précis optionnel (ex: "Bibliothèque Rosemont")
  extraData?: Record<string, any>; // Données supplémentaires flexibles (logos, etc.)
  tags?: string[];    // Étiquettes libres optionnelles
  createdAt: number;  // Timestamp de création (Date.now())
}
```

**Exemple JSON concret :**
```json
{
  "id": "evt-a3f2b1c9d",
  "name": "Réparothon Rosemont 2025",
  "type": "reparothon",
  "date": "2025-10-15",
  "location": "Montréal",
  "partner": "Ville de Montréal",
  "place": "Bibliothèque Rosemont",
  "extraData": {
    "partnerLogos": [
      {
        "id": "logo-1",
        "name": "Logo Ville de Montréal",
        "type": "image/png",
        "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEU..."
      }
    ]
  },
  "tags": ["écologie", "communauté"],
  "createdAt": 1728950400000
}
```

### 4.3 `TicketStatus` — Les 7 statuts d'un ticket de réparation

```typescript
export type TicketStatus =
  | 'en_attente'    // 🟡 Ticket créé, aucun technicien assigné
  | 'assigne'       // 🔵 Technicien assigné, travail pas encore commencé
  | 'en_cours'      // 🟠 Technicien est en train de réparer
  | 'repare'        // 🟢 Réparation réussie à 100% → déclenche confettis !
  | 'semi_repare'   // 🟤 Réparation partielle (certains problèmes résolus)
  | 'non_reparable' // 🔴 Appareil trop endommagé pour être réparé
  | 'abandonne';    // ⚫ Le visiteur est parti sans attendre la fin
```

**Transitions de statut typiques :**
```
en_attente → assigne → en_cours → repare ✨
                                → semi_repare
                                → non_reparable
             en_attente → abandonne
```

### 4.4 `DeviceCategory` — Les 5 catégories d'appareils

```typescript
export type DeviceCategory =
  | 'pc_tour'    // Ordinateur de bureau (tour)
  | 'laptop'     // Ordinateur portable
  | 'cellulaire' // Téléphone mobile
  | 'tablette'   // Tablette numérique
  | 'autre';     // Tout autre appareil (imprimante, console, etc.)
```

### 4.5 `OperatingSystem` — Les 5 systèmes d'exploitation

```typescript
export type OperatingSystem =
  | 'mac'     // macOS (Apple)
  | 'windows' // Microsoft Windows
  | 'linux'   // Linux (toutes distributions)
  | 'autre'   // Android, ChromeOS, iOS, etc.
  | 'aucun';  // Pas de système d'exploitation (appareil sans OS)
```

### 4.6 `RepairTicket` — La fiche d'un appareil à réparer

```typescript
export interface RepairTicket {
  id: string;                    // Identifiant unique (ex: "tkt-a3b2c1d9e")
  eventId: string;               // Lien vers l'événement parent
  visitorName: string;           // Nom du visiteur qui apporte l'appareil
  visitorEmail?: string;         // Courriel optionnel du visiteur
  objectName: string;            // Nom de l'appareil (ex: "ThinkPad T480")
  objectCategory: DeviceCategory;// Catégorie de l'appareil
  operatingSystem: OperatingSystem; // Système d'exploitation
  initialDiagnosis: string;      // Description du problème par le visiteur
  status: TicketStatus;          // Statut actuel du ticket
  assignedTechId: string | null; // ID du technicien assigné (ou null)
  assignedTechName: string | null; // Nom du technicien (dénormalisé pour affichage rapide)
  resultRemarks: string;         // Notes du technicien après réparation
  weightKg: number;              // Poids en kg pour le calcul de l'impact écologique
  createdAt: number;             // Timestamp de création
  updatedAt: number;             // Timestamp de dernière modification
  extraData?: Record<string, any>; // Données supplémentaires libres
  tags?: string[];               // Étiquettes libres
}
```

**Exemple JSON concret :**
```json
{
  "id": "tkt-a3b2c1d9e",
  "eventId": "evt-a3f2b1c9d",
  "visitorName": "Sophie Girard",
  "visitorEmail": "sophie.g@email.com",
  "objectName": "ThinkPad T480",
  "objectCategory": "laptop",
  "operatingSystem": "windows",
  "initialDiagnosis": "Batterie se décharge trop rapidement et Windows est très lent.",
  "status": "repare",
  "assignedTechId": "tech-001",
  "assignedTechName": "Alexandre Tremblay",
  "resultRemarks": "Nettoyage des ventilateurs, désinstallation des bloatwares et calibration de la batterie.",
  "weightKg": 1.6,
  "createdAt": 1728943200000,
  "updatedAt": 1728946800000
}
```

### 4.7 `Technician` — La fiche d'un technicien

```typescript
export interface Technician {
  id: string;                       // Identifiant unique
  eventId: string;                  // Lien vers l'événement parent
  name: string;                     // Nom complet du technicien
  specialties: string[];            // Spécialités matérielles (ex: ["laptop", "cellulaire"])
  softwareSpecialties?: string[];   // Spécialités logicielles (ex: ["windows", "linux"])
  status: TechStatus;               // "libre" | "occupe" | "en_pause"
  currentTicketId: string | null;   // ID du ticket en cours (ou null si libre)
  tableNumber?: number | null;      // Numéro de table physique dans la salle (number, pas string!)
  createdAt: number;                // Timestamp de création
}
```

> [!NOTE]
> **Attention :** `tableNumber` est de type `number` (un chiffre), pas une chaîne de caractères. Quand on exporte les données vers CSV ou Excel, on doit chercher ce numéro dans la table des techniciens (pas dans les tickets). Le ticket lui-même ne stocke pas le numéro de table.

**Exemple JSON concret :**
```json
{
  "id": "tech-001",
  "eventId": "evt-a3f2b1c9d",
  "name": "Alexandre Tremblay",
  "specialties": ["laptop", "pc_tour"],
  "softwareSpecialties": ["windows", "linux"],
  "status": "occupe",
  "currentTicketId": "tkt-a3b2c1d9e",
  "tableNumber": 3,
  "createdAt": 1728936000000
}
```

### 4.8 `PartnerLogo` — Un logo de partenaire

```typescript
export interface PartnerLogo {
  id: string;   // Identifiant unique du logo
  name: string; // Nom du fichier original (ex: "logo_ville_montreal.png")
  type: string; // Type MIME (ex: "image/png", "image/jpeg", "image/svg+xml")
  data: string; // Image encodée en Base64 (voir note ci-dessous)
}
```

> [!NOTE]
> **C'est quoi le Base64 ?** Normalement, une image est un fichier séparé sur ton ordinateur. Pour qu'on puisse la stocker dans la base de données (qui ne stocke que du texte), on transforme l'image en une très longue chaîne de caractères en utilisant le codage Base64. C'est comme traduire une image en "langage texte". Exemple : `"data:image/png;base64,iVBORw0KGgoAAAA..."` (ça continue sur des milliers de caractères).

### 4.9 `Participant` — Un participant au Kiosque-Concours

```typescript
export interface Participant {
  id: string;               // Identifiant unique
  eventId: string;          // Lien vers l'événement parent
  name: string;             // Nom complet du participant
  email: string;            // Courriel (obligatoire pour le concours)
  postalCode?: string;      // Code postal optionnel (ex: "H2W 1Y4")
  timeMs: number | null;    // Temps réalisé en millisecondes (null si pas encore terminé)
  registeredAt: number;     // Timestamp d'inscription
  extraData?: Record<string, any>; // Données libres supplémentaires
  tags?: string[];          // Étiquettes libres
}
```

**Exemple JSON concret :**
```json
{
  "id": "p1",
  "eventId": "evt-a3f2b1c9d",
  "name": "Sébastien Lavoie",
  "email": "seb@lavoie.net",
  "postalCode": "H2W 1Y4",
  "timeMs": 142350,
  "registeredAt": 1728936000000
}
```

> Le temps `142350` ms = 2 minutes, 22 secondes et 350 millisecondes.

### 4.10 `GenericAttendee` — Un participant générique

```typescript
export interface GenericAttendee {
  id: string;                    // Identifiant unique
  eventId: string;               // Lien vers l'événement parent
  name: string;                  // Nom complet
  email?: string;                // Courriel optionnel
  presenceConfirmed: boolean;    // La présence a-t-elle été confirmée sur place ?
  notes?: string;                // Notes libres sur la personne
  feedbackScore?: number;        // Note de satisfaction de 1 (mauvais) à 5 (excellent)
  feedbackText?: string;         // Commentaire de satisfaction en texte libre
  registeredAt: number;          // Timestamp d'inscription
  extraData?: Record<string, any>; // Données libres supplémentaires
  tags?: string[];               // Ex: ["Réussi", "En cours"] pour Install Fest Linux
}
```

### 4.11 `TrackState` — L'état d'une piste de chronométrage

```typescript
export interface TrackState {
  trackId: number;              // Numéro de la piste (1 à 5)
  participantId: string | null; // ID du participant assigné à cette piste
  participantName: string | null; // Nom du participant (pour affichage rapide)
  isRunning: boolean;           // Le chrono est-il en cours ?
  startTime: number | null;     // Timestamp du dernier départ (null si arrêté)
  elapsedBeforeStart: number;   // Temps déjà accumulé avant ce départ (en ms)
}
```

> [!NOTE]
> Le temps total affiché se calcule ainsi : si `isRunning` est vrai → `elapsedBeforeStart + (Date.now() - startTime)`. Si faux → juste `elapsedBeforeStart`.

### 4.12 `RaffleState` — L'état du tirage au sort

```typescript
export type RaffleStatus = 'idle' | 'spinning' | 'celebrating';

export interface RaffleState {
  status: RaffleStatus;         // État actuel de l'animation
  winnerId: string | null;      // ID du gagnant (calculé AVANT l'animation)
  spinStartTime: number | null; // Quand l'animation a démarré
}
```

> [!IMPORTANT]
> Le gagnant est calculé **avant** que l'animation commence ! On tire au sort le gagnant, puis on lance l'animation de défilement qui finit sur son nom. Cela évite tout calcul "en direct" qui pourrait sembler truqué.

### 4.13 `SyncMessage` — Les 10 types de messages de synchronisation

Ce type union regroupe tous les messages qui peuvent être échangés entre onglets (BroadcastChannel) ou entre appareils sur le réseau local (liaison chiffrée, section 6).

```typescript
export type SyncMessage =
  // 1. Notification qu'un événement a changé
  | { type: 'EVENT_CHANGED'; eventId: string }

  // 2. Synchronisation générale d'état
  | { type: 'STATE_SYNC'; payload: any }

  // 3. Démarrer un chronomètre sur une piste
  | { type: 'TIMER_START'; trackId: number; startTime: number; elapsedBeforeStart: number }

  // 4. Arrêter un chronomètre sur une piste
  | { type: 'TIMER_STOP'; trackId: number; elapsed: number }

  // 5. Remettre un chronomètre à zéro
  | { type: 'TIMER_RESET'; trackId: number }

  // 6. Démarrer le tirage au sort (le gagnant est déjà calculé)
  | { type: 'RAFFLE_START'; spinStartTime: number; winnerId: string }

  // 7. Remettre le tirage à zéro
  | { type: 'RAFFLE_RESET' }

  // 8. Notification générique de mise à jour de la base de données
  | { type: 'DB_UPDATE'; timestamp: number }

  // 9. Déclencher une animation de célébration sur tous les écrans
  | { type: 'PEER_CELEBRATION'; payload: any }

  // 10. Assigner un participant à une piste de chrono
  | { type: 'TRACK_ASSIGN'; trackId: number; participantId: string | null; participantName: string | null }

  // 11. Synchroniser l'état complet de toutes les pistes
  | { type: 'TRACKS_STATE_SYNC'; tracks: Record<number, TrackState> };
```

---

## 5. Base de données IndexedDB (db.ts)

### 🗄️ C'est quoi IndexedDB ?

IndexedDB, c'est comme une petite base de données SQL, mais elle vit **directement dans ton navigateur** ! Pas besoin de serveur. Les données survivent même si tu fermes et rouvres l'onglet. La bibliothèque **Dexie.js** est utilisée pour simplifier les requêtes, car IndexedDB brut est assez compliqué.

### 5.1 Schéma Dexie — Les 5 tables

```typescript
class InsertechDatabase extends Dexie {
  // Table des événements
  events!: Table<EventSettings>;

  // Table des tickets de réparation (Réparothon)
  tickets!: Table<RepairTicket>;

  // Table des techniciens (Réparothon)
  technicians!: Table<Technician>;

  // Table des participants au concours (Kiosque-Concours)
  participants!: Table<Participant>;

  // Table des présents aux autres événements (Générique)
  attendees!: Table<GenericAttendee>;

  constructor() {
    super('insertech_events_db'); // Nom de la base IndexedDB

    this.version(1).stores({
      // Format : 'clé primaire, index1, index2, ...'
      events:       'id, name, type, date',
      tickets:      'id, eventId, status, visitorName, assignedTechId',
      technicians:  'id, eventId, name, status',
      participants: 'id, eventId, name, email, timeMs, registeredAt',
      attendees:    'id, eventId, name, presenceConfirmed, registeredAt'
    });
  }
}
```

**Pourquoi des index ?** Les colonnes listées dans les stores permettent de faire des recherches rapides. Par exemple, `where('eventId').equals('evt-123')` est ultra-rapide car `eventId` est indexé.

| Table | Clé primaire | Colonnes indexées |
|---|---|---|
| `events` | `id` | `name`, `type`, `date` |
| `tickets` | `id` | `eventId`, `status`, `visitorName`, `assignedTechId` |
| `technicians` | `id` | `eventId`, `name`, `status` |
| `participants` | `id` | `eventId`, `name`, `email`, `timeMs`, `registeredAt` |
| `attendees` | `id` | `eventId`, `name`, `presenceConfirmed`, `registeredAt` |

### 5.2 `notifySync()` — Le système d'alerte inter-onglets

```typescript
// Canal de communication entre les onglets du même navigateur
const channel = new BroadcastChannel('insertech_db_sync_channel');

export function notifySync() {
  // Étape 1 : Alerter les écouteurs dans CET onglet immédiatement
  localListeners.forEach(callback => callback());

  // Étape 2 : Envoyer un message aux AUTRES onglets ouverts
  channel.postMessage({ type: 'DB_UPDATE', timestamp: Date.now() });
}
```

**À quoi ça sert ?** Imagine que tu as le tableau de bord ouvert dans deux fenêtres. Quand tu ajoutes un ticket dans la première fenêtre, la deuxième doit se rafraîchir automatiquement. `notifySync()` envoie un signal à tous les onglets ouverts pour qu'ils rechargent leurs données.

### 5.3 `registerSyncListener(callback)` — S'abonner aux mises à jour

```typescript
export function registerSyncListener(callback: () => void): () => void {
  // S'abonner localement
  localListeners.add(callback);

  // S'abonner aux messages des autres onglets
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'DB_UPDATE') {
      callback(); // Appeler la fonction fournie à chaque mise à jour
    }
  };

  channel.addEventListener('message', handler);

  // Retourner une fonction de nettoyage (pour React useEffect)
  return () => {
    localListeners.delete(callback);
    channel.removeEventListener('message', handler);
  };
}
```

**Utilisation typique dans un composant React :**
```typescript
useEffect(() => {
  loadData(); // Charger les données au démarrage

  // S'abonner : chaque fois que la BD change, recharger
  const unsubscribe = registerSyncListener(() => {
    loadData();
  });

  // Nettoyage quand le composant est démonté
  return () => unsubscribe();
}, [event.id]);
```

### 5.4 `clearAllData()` — Effacer toutes les données

```typescript
export async function clearAllData(): Promise<void> {
  // Transaction atomique : soit TOUT est effacé, soit rien
  await db.transaction('rw', [db.events, db.tickets, db.technicians, db.participants, db.attendees], async () => {
    await db.events.clear();
    await db.tickets.clear();
    await db.technicians.clear();
    await db.participants.clear();
    await db.attendees.clear();
  });

  // Notifier tous les onglets du changement
  notifySync();
}
```

**Transaction atomique :** Si une table échoue à être effacée, TOUT est annulé. On ne se retrouve jamais avec des données partiellement supprimées.

### 5.5 `seedDemoData(eventId, type)` — Données de démonstration

Cette fonction insère des données fictives réalistes pour permettre de tester l'application sans avoir à remplir des formulaires manuellement.

```typescript
export async function seedDemoData(eventId: string, type: string): Promise<void> {
  if (type === 'reparothon') {
    // Insère 3 techniciens fictifs (Alexandre, Chloé, Gabriel)
    // Insère 3 tickets fictifs (ThinkPad T480, iPhone XR, PC Asus K53U)

  } else if (type === 'kiosque_concours') {
    // Insère 4 participants fictifs avec des temps réels en ms
    // (Sébastien: 142350ms, Nadia: 168900ms, Étienne: 118400ms, Camille: pas encore terminé)

  } else {
    // Insère 4 participants génériques avec rétroaction
    // (Jean-Pierre: 5 étoiles, Isabelle: 4 étoiles, Mathieu: absent, Valérie: 5 étoiles)
  }

  notifySync(); // Signaler la mise à jour
}
```

---

## 6. Réseau local (network.ts et src/net/)

### 🌐 Le principe

Le PC hôte et les tablettes se parlent **seulement sur le réseau local** (en événement : le hotspot du cellulaire,
données mobiles coupées). Aucun serveur sur internet, aucun service Google, aucune fenêtre du pare-feu Windows :

- la **tablette** (application Android) **écoute** sur le port **47630** du réseau local (plugin Java `ServeurLocal`) ;
- le **PC** **appelle** les tablettes. Il n'écoute jamais sur le réseau, ce qui évite le pare-feu et les droits administrateur ;
- le **lanceur** (`InsertechEvenements.exe` ou le binaire Linux) balaie le réseau local par des connexions sortantes
  et donne la liste des tablettes à la page sur `127.0.0.1` (`/tablettes`, `launcher/TabletDiscovery.cs`). Sans le
  lanceur, on peut ajouter une tablette à la main par son adresse IP (fenêtre Réseau local du PC).

Une tablette ne peut donc se synchroniser qu'avec l'**APK** installé : dans un simple navigateur, elle n'a pas de
serveur local.

### 6.1 Les fichiers

| Fichier | Rôle |
|---|---|
| `src/network.ts` | `networkManager` : session hôte ou tablette, file d'envoi, synchronisation des tables et des chronos |
| `src/net/hoteLocal.ts` | PC : liste des tablettes (lanceur ou adresses à la main), appel de chaque tablette de la session |
| `src/net/tabletteLocale.ts` | Tablette : démarre le serveur local (`ServeurLocal`) et sa fiche `/decouverte` |
| `src/net/poignee.ts` | Poignée de main DEFI / PREUVE, puis liaison chiffrée |
| `src/net/chiffrement.ts` | HMAC-SHA256, HKDF, AES-GCM (Web Crypto) |
| `src/net/lien.ts` | Interface `Lien` commune aux deux côtés (envoyer, recevoir, fermer) |
| `src/net/miseAJour.ts` | Envoi de l'APK du PC aux tablettes (messages `MAJ_*`) |
| `src/utils/joinLink.ts` | Lien du QR `insertech://rejoindre?code=…&cle=…&nom=…` |

### 6.2 Code et clé de session

Le PC crée un **code de session** lisible (ex. `INS-4287-A3F2`) et une **clé** de 12 caractères (ex.
`ABCD-EFGH-JKLM`). La fenêtre Réseau local du PC montre les deux et un QR qui les contient. La clé ne voyage
jamais : chaque côté prouve qu'il la connaît, puis une clé AES propre à la liaison est dérivée :

1. tablette → PC : `DEFI` (nonce de la tablette) ;
2. PC → tablette : `PREUVE` = HMAC(clé, nonce tablette | code | « pc »), plus le nonce du PC ;
3. tablette → PC : `PREUVE` = HMAC(clé, nonce PC | code | « tablette »).

Ensuite, chaque message est du JSON chiffré en AES-GCM 256 bits. Une tablette avec une mauvaise clé n'est jamais
connectée (le PC l'affiche « Clé refusée »). **Nouvelle clé** sur le PC déconnecte toutes les tablettes : il faut
rescanner le QR.

### 6.3 `startHost(eventId, existingCode?)` — PC hôte

Crée ou reprend le code, garde la clé tant que la session dure, puis démarre `HoteLocal` : toutes les 2 secondes,
il lit la liste des tablettes, appelle celles de la session qui ne sont pas encore reliées, et ferme les liaisons
muettes depuis trop longtemps (veille, hors de portée) pour les rappeler au tour suivant.

### 6.4 `joinSession(code, eventId, { cle, nom, evenement })` — tablette

Mémorise le code, la clé et le nom de la tablette, démarre le serveur local et **attend l'appel du PC**. On y
arrive en scannant le QR du PC (scanner de l'application ou appareil photo Samsung, qui ouvre le lien
`insertech://rejoindre`), ou en tapant le code et la clé (`RejoindreEvenement.tsx`).

### 6.5 `writeToDatabase(table, action, data)` — qui écrit où

- **PC hôte** ou **autonome** : écrit dans IndexedDB, puis diffuse le changement (`DB_DELTA`) aux tablettes.
- **Tablette** : écrit chez elle, puis envoie `DB_WRITE` au PC. Le message reste dans une **file d'envoi**
  (`insertech_net_outbox`, gardée dans le `localStorage`) jusqu'à l'accusé `ACK` du PC. Une saisie faite pendant
  une coupure part donc dès que le PC rappelle la tablette.

À chaque liaison, la tablette demande `REQUEST_INITIAL_SYNC` et reçoit `INITIAL_SYNC` : toutes les données de
l'activité. Le PC refuse les mises à jour d'application pendant qu'une session est ouverte avec des tablettes
d'une autre version (bandeau dans l'en-tête).

### 6.6 `leaveSession()` — quitter

Ferme les liaisons, arrête le serveur local (tablette) ou les appels (PC), et oublie la session. Sur une tablette,
quitter demande confirmation et est refusé tant que le mode est verrouillé.

### 6.7 `sendChronoAction(action)` et l'horloge

Les chronos et le tirage passent par `CHRONO_ACTION`. Le PC est l'horloge de référence : chaque tablette mesure
son décalage (`CLOCK_PING` / `CLOCK_PONG`) pour que les chronos affichent le même temps partout.

### 6.8 Mise à jour des tablettes par le PC

Dans la fenêtre Réseau local du PC, **Mettre à jour les tablettes** : choisir un `.apk` (ou le télécharger depuis
GitHub, le seul bouton qui utilise internet, sur le PC). Le PC l'envoie en morceaux de 64 Ko, un à la fois, avec
reprise. La tablette vérifie le SHA-256, le nom du paquet, la version et le certificat de signature, puis Android
demande confirmation avant d'installer. Une tablette verrouillée refuse tant que le code n'est pas saisi.

### 6.9 Reprise après un rechargement ou un redémarrage

Le rôle, le code, la clé et l'activité sont gardés dans le `localStorage` (`insertech_net_role`,
`insertech_net_session_code`, `insertech_net_event_id`). Au démarrage, le PC relance sa session avec le même
code et la même clé ; la tablette relance son serveur local et attend l'appel du PC, sans rien retaper.

---

## 7. App.tsx — Application principale

`App.tsx` est le chef d'orchestre. C'est le composant qui contient tous les états globaux et toutes les fonctions de haut niveau.

### 7.1 Les états React principaux

```typescript
// L'événement actuellement affiché dans le tableau de bord
const [activeEvent, setActiveEvent] = useState<EventSettings | null>(null);

// Liste de tous les événements passés (pour la liste de sélection)
const [pastEvents, setPastEvents] = useState<EventSettings[]>([]);

// Quel onglet est actif dans le tableau de bord
const [activeTab, setActiveTab] = useState<string>('enregistrements');

// Est-ce que l'interface de réseau est affichée ?
const [showNetwork, setShowNetwork] = useState(false);

// Le statut réseau actuel affiché dans l'en-tête
const [networkStatus, setNetworkStatus] = useState('Local uniquement');

// Le code de session réseau actuel (ex: "INS-4287-A3F2")
const [sessionCode, setSessionCode] = useState<string>('');

// Thème : false = sombre (défaut), true = clair
const [isLightTheme, setIsLightTheme] = useState(false);

// Données reçues lors d'un import (avant validation)
const [importPreviewData, setImportPreviewData] = useState<any>(null);

// Les conflits détectés lors d'un import
const [importConflicts, setImportConflicts] = useState<any[]>([]);
```

### 7.2 `initApp()` — Initialisation au démarrage

```typescript
async function initApp() {
  // 1. Lire la préférence de thème
  const theme = localStorage.getItem('insertech_theme');
  if (theme === 'light') setIsLightTheme(true);

  // 2. Charger la liste des événements passés
  await loadPastEvents();

  // 3. Tenter une reconnexion réseau automatique si une session était active
  const savedRole = localStorage.getItem('insertech_net_role');
  // ... (voir section 6.9)

  // 4. Restaurer l'événement actif si un ID est mémorisé
  const savedEventId = localStorage.getItem('insertech_active_event_id');
  if (savedEventId) {
    const event = await db.events.get(savedEventId);
    if (event) setActiveEvent(event);
  }
}
```

### 7.3 `loadPastEvents()` — Charger les événements passés

```typescript
async function loadPastEvents() {
  // Charger tous les événements, triés par date de création décroissante
  const events = await db.events.orderBy('createdAt').reverse().toArray();
  setPastEvents(events);
}
```

### 7.4 `handleCreateEvent(settings)` — Créer un nouvel événement

```typescript
async function handleCreateEvent(settings: EventSettings) {
  // Sauvegarder l'événement dans IndexedDB
  await db.events.put(settings);

  // Mémoriser l'ID de l'événement actif
  localStorage.setItem('insertech_active_event_id', settings.id);

  // Définir cet événement comme actif
  setActiveEvent(settings);

  // Rafraîchir la liste des événements passés
  await loadPastEvents();
}
```

### 7.5 `handleSelectPastEvent(event)` — Ouvrir un événement passé

```typescript
function handleSelectPastEvent(event: EventSettings) {
  setActiveEvent(event);
  localStorage.setItem('insertech_active_event_id', event.id);

  // Remettre l'onglet par défaut selon le type d'événement
  if (event.type === 'reparothon' || event.type === 'formation_reparothon') {
    setActiveTab('accueil');
  } else if (event.type === 'kiosque_concours') {
    setActiveTab('admin');
  } else {
    setActiveTab('enregistrements');
  }
}
```

### 7.6 `handleLeaveEvent()` — Quitter l'événement actif

Retourne à l'écran d'accueil (MatrixSelector) sans supprimer les données.

```typescript
function handleLeaveEvent() {
  setActiveEvent(null);
  localStorage.removeItem('insertech_active_event_id');
}
```

### 7.7 `handleDeleteEvent(eventId)` — Supprimer un événement

```typescript
async function handleDeleteEvent(eventId: string) {
  // Transaction atomique : tout ou rien
  await db.transaction('rw', [db.events, db.tickets, db.technicians, db.participants, db.attendees], async () => {
    await db.events.delete(eventId);
    await db.tickets.where('eventId').equals(eventId).delete();
    await db.technicians.where('eventId').equals(eventId).delete();
    await db.participants.where('eventId').equals(eventId).delete();
    await db.attendees.where('eventId').equals(eventId).delete();
  });

  // Si c'était l'événement actif, retourner à l'accueil
  if (activeEvent?.id === eventId) {
    handleLeaveEvent();
  }

  await loadPastEvents();
}
```

### 7.8 `handleExportData()` — Exporter les données (5 formats)

```typescript
async function handleExportData(format: 'json' | 'csv' | 'md' | 'latex' | 'excel') {
  if (!activeEvent) return;

  // Charger toutes les données liées à l'événement actif
  const tickets = await db.tickets.where('eventId').equals(activeEvent.id).toArray();
  const technicians = await db.technicians.where('eventId').equals(activeEvent.id).toArray();
  // ... etc.

  // Construire la carte "numéro de table" depuis les techniciens
  // (tableNumber est sur Technician, PAS sur RepairTicket !)
  const techTableMap: Record<string, number | null> = {};
  technicians.forEach(t => { techTableMap[t.id] = t.tableNumber ?? null; });

  // Générer le fichier selon le format demandé
  switch (format) {
    case 'json':   exportJson(activeEvent, tickets, technicians, ...);  break;
    case 'csv':    exportCsv(activeEvent, tickets, techTableMap, ...);  break;
    case 'md':     exportMarkdown(activeEvent, tickets, ...);           break;
    case 'latex':  exportLatex(activeEvent, tickets, ...);              break;
    case 'excel':  exportExcel(activeEvent, tickets, techTableMap, ...); break;
  }
}
```

### 7.9 Session hôte et tablettes

- **PC** : **Créer la session hôte** dans la fenêtre Réseau local (bouton **Réseau LAN** de l'en-tête) appelle
  `networkManager.startHost(activeEvent.id)`. La session suit l'activité ouverte.
- **Tablette** : l'accueil propose **Scanner le QR du PC** ou la saisie du code et de la clé
  (`RejoindreEvenement.tsx`), qui appellent `networkManager.joinSession(code, eventId, { cle, nom, evenement })`.
- **Quitter** : `networkManager.leaveSession()` (sur une tablette : confirmation, refusé si le mode est verrouillé).

### 7.10 `renderImportValidationModal()` — Résolveur de conflits

Quand on importe un fichier et que des données existent déjà dans la base (même ID), un modal s'affiche pour demander quoi faire :

```typescript
// Pour chaque conflit détecté, on affiche 3 options :
// 1. "Garder l'existant" → ignorer la ligne importée
// 2. "Remplacer par l'importé" → écraser avec les nouvelles données
// 3. "Créer les deux" → générer un nouvel ID et les garder tous les deux

function renderImportValidationModal() {
  if (!importConflicts.length) return null;

  return (
    <div className="modal-overlay">
      <h2>Conflits détectés ({importConflicts.length})</h2>
      {importConflicts.map((conflict, i) => (
        <div key={i}>
          <p>Ticket #{conflict.imported.id} existe déjà</p>
          <button onClick={() => resolveConflict(i, 'keep_existing')}>
            Garder l'existant
          </button>
          <button onClick={() => resolveConflict(i, 'replace')}>
            Remplacer
          </button>
          <button onClick={() => resolveConflict(i, 'keep_both')}>
            Garder les deux
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## 8. MatrixSelector.tsx — Création d'événement

### 8.1 Les 3 sections de l'écran d'accueil

L'écran d'accueil est divisé en 3 zones verticales :

1. **Créer un nouvel événement** : formulaire de création avec choix du type, nom, date, lieu, partenaire, logos
2. **Événements récents** : liste des événements passés stockés localement (cliquables pour rouvrir)
3. **Sur une tablette Android** : rejoindre l'événement du PC (scanner le QR, ou taper le code et la clé)

### 8.2 `MATRICES_LIST` — Les 8 types avec couleurs

```typescript
const MATRICES_LIST = [
  { type: 'reparothon',           label: 'Réparothon',                color: '#9ecd33', icon: Wrench },
  { type: 'formation_reparothon', label: 'Formation Réparothon',       color: '#f59e0b', icon: BookOpen },
  { type: 'fresque_numerique',    label: 'Fresque numérique',          color: '#06b6d4', icon: Palette },
  { type: 'prolonger_vie_ordi',   label: 'Prolonger la vie de l\'ordi',color: '#10b981', icon: RefreshCw },
  { type: 'kiosque_concours',     label: 'Kiosque-Concours',           color: '#8b5cf6', icon: Trophy },
  { type: 'install_fest_linux',   label: 'Install Fest Linux',         color: '#ef4444', icon: Terminal },
  { type: 'conference_pollution',  label: 'Conférence pollution',       color: '#f97316', icon: Megaphone },
  { type: 'communaute_pratique',  label: 'Communauté de pratique',     color: '#ec4899', icon: Users },
];
```

### 8.3 `compressImage(file)` — Algorithme Canvas 2D

Pour éviter que les logos de partenaires prennent trop de place en base de données, les images sont compressées avant stockage :

```typescript
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target!.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 300; // Largeur/hauteur maximale en pixels

        // Calculer le ratio pour garder les proportions
        let w = img.width, h = img.height;
        if (w > h && w > MAX_SIZE) { h = (h * MAX_SIZE) / w; w = MAX_SIZE; }
        else if (h > MAX_SIZE)     { w = (w * MAX_SIZE) / h; h = MAX_SIZE; }

        canvas.width  = w;
        canvas.height = h;

        // Dessiner l'image redimensionnée
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);

        // Exporter en JPEG à 70% de qualité → bon compromis taille/qualité
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    };

    reader.readAsDataURL(file);
  });
}
```

### 8.4 `handleAddLogo()` — Sélection multiple de logos

```typescript
async function handleAddLogo(event: React.ChangeEvent<HTMLInputElement>) {
  const files = event.target.files;
  if (!files) return;

  const newLogos: PartnerLogo[] = [];

  for (const file of Array.from(files)) {
    // Compresser chaque image sélectionnée
    const compressed = await compressImage(file);
    newLogos.push({
      id: 'logo-' + Math.random().toString(36).substring(2, 9),
      name: file.name,
      type: file.type,
      data: compressed  // Base64 compressé
    });
  }

  // Ajouter les nouveaux logos à la liste existante
  setPartnerLogos(prev => [...prev, ...newLogos]);
}
```

### 8.5 `handleSubmit()` — Validation et création d'événement

```typescript
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();

  // Validation : le nom et la date sont obligatoires
  if (!eventName.trim() || !eventDate) {
    setError('Le nom et la date sont requis.');
    return;
  }

  const newEvent: EventSettings = {
    id: 'evt-' + Math.random().toString(36).substring(2, 11),
    name: eventName.trim(),
    type: selectedType,
    date: eventDate,
    location: eventLocation.trim(),
    partner: eventPartner.trim() || undefined,
    place: eventPlace.trim() || undefined,
    extraData: { partnerLogos },
    createdAt: Date.now()
  };

  // Sauvegarder et naviguer vers le tableau de bord
  await onCreateEvent(newEvent);
}
```

### 8.6 `downloadImportExample()` — Télécharger un gabarit d'importation

Cette fonction génère et télécharge un fichier CSV (ou JSON) prérempli avec des données fictives pour montrer le format attendu lors de l'importation.

---

## 9. DashboardShell.tsx — Coquille du tableau de bord

### 9.1 L'en-tête sticky

L'en-tête reste visible en tout temps quand on fait défiler la page. Elle affiche :
- Le logo Insertech
- Le nom et la date de l'événement actif
- Le statut réseau (avec indicateur couleur : vert = connecté, jaune = connecting, gris = local)
- Les boutons d'action (Export, Réseau, Thème, Quitter)

### 9.2 Les onglets par type d'événement

| Type d'événement | Onglets disponibles |
|---|---|
| `reparothon` / `formation_reparothon` | Console d'accueil · Gestion Techniciens · Écran Public |
| `kiosque_concours` | Admin · Public |
| Tous les autres types | Enregistrements · Bilan · Public |

```typescript
// Dans DashboardShell.tsx
const TABS = {
  reparothon: [
    { id: 'accueil',      label: 'Console d\'accueil',    icon: LayoutGrid },
    { id: 'techniciens',  label: 'Gestion Techniciens',   icon: Users },
    { id: 'public',       label: 'Écran Public',          icon: Monitor },
  ],
  kiosque_concours: [
    { id: 'admin',  label: 'Admin',  icon: Settings },
    { id: 'public', label: 'Public', icon: Monitor },
  ],
  default: [
    { id: 'enregistrements', label: 'Enregistrements', icon: UserPlus },
    { id: 'bilan',           label: 'Bilan',           icon: BarChart2 },
    { id: 'public',          label: 'Public',          icon: Monitor },
  ]
};
```

### 9.3 Boutons d'action

| Bouton | Action |
|---|---|
| **Exporter** | Ouvre un menu déroulant avec les 5 formats d'export |
| **Réseau** | Ouvre le panneau de gestion réseau (hôte/client) |
| **Thème** | Bascule entre le mode clair et le mode foncé |
| **Quitter** | Retourne à l'écran d'accueil (MatrixSelector) |

---

## 10. ReparothonMatrix.tsx — Module de réparation

### 10.1 Les 3 onglets

#### Onglet 1 : Console d'accueil (`activeTab === 'accueil'`)

C'est l'onglet principal pour les bénévoles d'accueil. Il contient :
- **Statistiques temps réel** : compteurs de tickets par statut, poids total réparé (kg), bilan carbone estimé
- **Formulaire d'ajout de ticket** : tous les champs d'un appareil
- **Liste des tickets** : avec badges de statut colorés et menu d'assignation

**Statistiques calculées en temps réel :**
```typescript
const totalTickets    = tickets.length;
const waitingTickets  = tickets.filter(t => t.status === 'en_attente').length;
const inProgressCount = tickets.filter(t => t.status === 'en_cours' || t.status === 'assigne').length;
const repairedCount   = tickets.filter(t => t.status === 'repare').length;
const totalWeightKg   = tickets.filter(t => t.status === 'repare').reduce((sum, t) => sum + (t.weightKg || 0), 0);
```

#### Onglet 2 : Gestion Techniciens (`activeTab === 'techniciens'`)

- Formulaire d'ajout de technicien avec spécialités matérielles et logicielles (cases à cocher)
- Liste des techniciens avec leur statut et le ticket en cours
- Import CSV de techniciens
- Supprimer un technicien

#### Onglet 3 : Écran Public (`activeTab === 'public'`)

Conçu pour être affiché sur un grand écran (projecteur ou télé) visible par les visiteurs :
- Compteurs en grand format
- Rotation automatique des logos de partenaires (toutes les 4 secondes)
- **Animation de célébration** quand un appareil est réparé

### 10.2 Formulaire de ticket — Tous les champs

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| Nom du visiteur | Texte | ✅ | Nom complet de la personne |
| Courriel | Texte | ❌ | Pour un suivi après l'événement |
| Nom de l'appareil | Texte | ✅ | Modèle exact (ex: "ThinkPad T480") |
| Catégorie | Sélection | ✅ | `pc_tour`, `laptop`, `cellulaire`, `tablette`, `autre` |
| Système d'exploitation | Sélection | ✅ | `windows`, `mac`, `linux`, `autre`, `aucun` |
| Diagnostic initial | Textarea | ❌ | Description du problème par le visiteur |
| Poids (kg) | Nombre | ✅ | Pour calculer l'impact écologique |

### 10.3 Badges de statut des tickets

```
🟡 en_attente    → Badge jaune   "En attente"
🔵 assigne       → Badge bleu    "Assigné"
🟠 en_cours      → Badge orange  "En cours"
🟢 repare        → Badge vert    "Réparé" ✨
🟤 semi_repare   → Badge brun    "Semi-réparé"
🔴 non_reparable → Badge rouge   "Non réparable"
⚫ abandonne     → Badge gris    "Abandonné"
```

### 10.4 `handleAddTicket()` — Créer un ticket

```typescript
const handleAddTicket = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newVisitorName.trim() || !newObjectName.trim()) return;

  const newTicket: RepairTicket = {
    id: 'tkt-' + Math.random().toString(36).substring(2, 11),
    eventId: event.id,
    visitorName: newVisitorName.trim(),
    visitorEmail: newVisitorEmail.trim() || undefined,
    objectName: newObjectName.trim(),
    objectCategory: newCategory,
    operatingSystem: newOS,
    initialDiagnosis: newDiagnosis.trim(),
    status: 'en_attente', // Toujours "en attente" à la création
    assignedTechId: null,
    assignedTechName: null,
    resultRemarks: '',
    weightKg: Number(newWeight) || 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Utiliser networkManager pour propager selon le rôle (client/host/standalone)
  await networkManager.writeToDatabase('tickets', 'put', newTicket);

  // Réinitialiser le formulaire
  setNewVisitorName('');
  setNewVisitorEmail('');
  setNewObjectName('');
  setNewDiagnosis('');
  setNewWeight(1.5);

  await loadData();
};
```

### 10.5 `handleUpdateTicketStatus()` — Logique de libération/assignation

Quand un ticket passe à un statut "terminal" (réparé, non réparable, etc.), le technicien qui y était assigné est automatiquement libéré :

```typescript
const handleUpdateTicketStatus = async (ticketId: string, newStatus: TicketStatus) => {
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const updatedTicket = { ...ticket, status: newStatus, updatedAt: Date.now() };
  await networkManager.writeToDatabase('tickets', 'put', updatedTicket);

  // Si le ticket est dans un statut "terminal", libérer le technicien
  const terminalStatuses: TicketStatus[] = ['repare', 'semi_repare', 'non_reparable', 'abandonne'];
  if (terminalStatuses.includes(newStatus) && ticket.assignedTechId) {
    const tech = technicians.find(t => t.id === ticket.assignedTechId);
    if (tech) {
      const updatedTech = { ...tech, status: 'libre' as TechStatus, currentTicketId: null };
      await networkManager.writeToDatabase('technicians', 'put', updatedTech);
    }

    // Si "repare", déclencher la célébration !
    if (newStatus === 'repare') {
      triggerCelebration({ visitorName: ticket.visitorName, objectName: ticket.objectName, ... });
    }
  }

  await loadData();
};
```

### 10.6 `handleDeleteTicket()` — Supprimer un ticket

```typescript
const handleDeleteTicket = async (ticketId: string) => {
  if (!confirm('Supprimer ce ticket ?')) return;

  // Libérer le technicien si ce ticket lui était assigné
  const ticket = tickets.find(t => t.id === ticketId);
  if (ticket?.assignedTechId) {
    const tech = technicians.find(t => t.id === ticket.assignedTechId);
    if (tech) {
      await networkManager.writeToDatabase('technicians', 'put',
        { ...tech, status: 'libre', currentTicketId: null }
      );
    }
  }

  await networkManager.writeToDatabase('tickets', 'delete', ticketId);
  await loadData();
};
```

### 10.7 `handleAddTech()` — Ajouter un technicien

```typescript
const handleAddTech = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newTechName.trim()) return;

  const tech: Technician = {
    id: 'tech-' + Math.random().toString(36).substring(2, 11),
    eventId: event.id,
    name: newTechName.trim(),
    specialties: newTechSpecs,               // Spécialités matérielles
    softwareSpecialties: newTechSoftwareSpecs, // Spécialités logicielles
    status: 'libre',
    currentTicketId: null,
    tableNumber: newTechTable ? Number(newTechTable) : null,
    createdAt: Date.now()
  };

  await networkManager.writeToDatabase('technicians', 'put', tech);
  setNewTechName('');
  setNewTechSpecs([]);
  setNewTechTable('');
  await loadData();
};
```

### 10.8 `handleImportCSV()` — Import CSV avec synonymes d'en-têtes

Le système d'importation CSV reconnaît plusieurs variantes de noms de colonnes pour être robuste aux différences de formatage :

```typescript
// Tableau de synonymes pour chaque champ attendu :
const HEADER_SYNONYMS: Record<string, string[]> = {
  visitorName:      ['nom', 'name', 'visiteur', 'prénom nom', 'nom du visiteur'],
  visitorEmail:     ['email', 'courriel', 'e-mail', 'mail'],
  objectName:       ['appareil', 'device', 'objet', 'modèle', 'nom de l\'appareil'],
  objectCategory:   ['catégorie', 'category', 'type'],
  operatingSystem:  ['os', 'système', 'system', 'système d\'exploitation'],
  initialDiagnosis: ['problème', 'problem', 'description', 'diagnostic', 'notes'],
  weightKg:         ['poids', 'weight', 'kg', 'poids (kg)'],
  status:           ['statut', 'status', 'état'],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function findField(headers: string[], synonyms: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeader(headers[i]);
    if (synonyms.some(s => normalizeHeader(s) === normalized)) return i;
  }
  return -1;
}
```

### 10.9 `handleUpdateResultRemarks()` — Sauvegarder les notes de réparation

```typescript
const handleUpdateResultRemarks = async (ticketId: string, remarks: string) => {
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  await networkManager.writeToDatabase('tickets', 'put', {
    ...ticket,
    resultRemarks: remarks,
    updatedAt: Date.now()
  });
};
```

### 10.10 `playCelebrationSound()` — L'arpège de fanfare (Web Audio API)

```typescript
const playCelebrationSound = () => {
  const ctx = new AudioContext();
  const now = ctx.currentTime;

  // Arpège festif : Do (C4) → Mi (E4) → Sol (G4) → Do aigu (C5)
  const notes     = [261.63, 329.63, 392.00, 523.25]; // Fréquences en Hz
  const durations = [0.15,   0.15,   0.15,   0.45  ]; // Durée de chaque note
  const startTimes= [0,      0.15,   0.30,   0.45  ]; // Décalage de chaque note

  notes.forEach((freq, index) => {
    const osc      = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'triangle'; // Son doux et chaleureux (vs 'square' = carré agressif)
    osc.frequency.setValueAtTime(freq, now + startTimes[index]);

    // Enveloppe : attaque rapide (20ms), déclin progressif
    gainNode.gain.setValueAtTime(0, now + startTimes[index]);
    gainNode.gain.linearRampToValueAtTime(0.25, now + startTimes[index] + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + startTimes[index] + durations[index]);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + startTimes[index]);
    osc.stop(now + startTimes[index] + durations[index]);
  });
};
```

L'animation de célébration déclenche aussi des confettis avec les couleurs d'Insertech (vert lime `#9ecd33` et violet `#480A94`).

---

## 11. TeardownMatrix.tsx — Kiosque-Concours

### 11.1 Onglet Admin

L'onglet Admin est la console de contrôle pour le personnel d'Insertech. Il contient :

- **Liste des participants inscrits** : avec statut (a joué / n'a pas encore joué)
- **5 pistes de chronométrage simultanées** : jusqu'à 5 participants peuvent être chronométrés en même temps
- **Classement en temps réel** : mis à jour automatiquement dès qu'un temps est validé
- **Bouton de tirage au sort** : accessible une fois l'événement terminé

### 11.2 Onglet Public

Affiché sur un grand écran pour les visiteurs :
- Classement avec médailles et animations
- Animation de tirage au sort (RaffleSpinner)

### 11.2.1 Utilisation en événement (un portable + projecteur)

- **Fenêtre projecteur** : **Plus** > **Ouvrir le projecteur** ouvre l'écran public dans une fenêtre séparée (`index.html?vue=public`), à glisser sur le projecteur puis passer en plein écran. Cette fenêtre reste verrouillée sur l'écran public, même après un rechargement, et suit la console du même ordinateur sans connexion Internet.
- **Tablette en écran public** : une tablette en mode Écran public passe d'elle-même en plein écran, en paysage, sans mise en veille, et peut envoyer son écran au téléviseur avec Smart View ([docs/ecran-public-chromecast.md](docs/ecran-public-chromecast.md)).
- **Prix configurables** : « Modifier les prix » (bloc Tirage au sort) définit le prix du meilleur chrono et celui du tirage (nom, titre court, valeur, description, image). Ils sont enregistrés dans `event.extraData.contestPrizes`, propres à chaque événement.
- **Pistes par événement** : une piste assignée dans un autre événement s'affiche comme libre.
- **Doublons** : une confirmation est demandée si le nom ou le courriel est déjà inscrit.
- **Tirage** : l'historique est conservé dans `event.extraData.raffleWinners`. Une personne déjà tirée ne peut pas l'être de nouveau ; « Absent ? Retirer un autre nom » la marque absente et relance le tirage. « Effacer l'historique » remet tout le monde éligible (utile après un essai). Le tirage en cours est mémorisé par navigateur, l'écran public le retrouve après un rechargement.
- **Consentement (Loi 25)** : un courriel ou un code postal ne peut être enregistré que si la case de consentement est cochée (`participant.extraData.consentContact`).
- **Exports** : classement, meilleur chrono lisible, consentement et résultat du tirage. La colonne `Temps (ms)` est conservée pour la réimportation.

### 11.3 `handleRegisterParticipant()` — Inscrire un participant

```typescript
const handleRegisterParticipant = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newName.trim() || !newEmail.trim()) return;

  const participant: Participant = {
    id: 'p-' + Math.random().toString(36).substring(2, 11),
    eventId: event.id,
    name: newName.trim(),
    email: newEmail.trim(),
    postalCode: newPostalCode.trim() || undefined,
    timeMs: null, // Pas encore chronométré
    registeredAt: Date.now()
  };

  await networkManager.writeToDatabase('participants', 'put', participant);
  setNewName('');
  setNewEmail('');
  await loadParticipants();
};
```

### 11.4 `handleStartTrack(trackId, participantId)` — Démarrer un chrono

```typescript
const handleStartTrack = (trackId: number, participantId: string) => {
  const participant = participants.find(p => p.id === participantId);
  if (!participant) return;

  // 1. Assigner le participant à la piste
  networkManager.sendChronoAction({
    type: 'TRACK_ASSIGN',
    trackId,
    participantId,
    participantName: participant.name
  });

  // 2. Démarrer le chrono
  networkManager.sendChronoAction({
    type: 'TIMER_START',
    trackId,
    startTime: Date.now(),
    elapsedBeforeStart: 0
  });
};
```

### 11.5 `handleStopTrack(trackId)` — Arrêter un chrono

```typescript
const handleStopTrack = (trackId: number) => {
  const track = tracksState[trackId];
  const elapsed = track.elapsedBeforeStart + (track.startTime ? Date.now() - track.startTime : 0);

  networkManager.sendChronoAction({
    type: 'TIMER_STOP',
    trackId,
    elapsed
  });
};
```

### 11.6 `handleValidateTime(trackId)` — Valider et sauvegarder le temps

```typescript
const handleValidateTime = async (trackId: number) => {
  const track = tracksState[trackId];
  if (!track.participantId) return;

  const finalTime = track.elapsedBeforeStart; // Temps à l'arrêt

  const participant = participants.find(p => p.id === track.participantId);
  if (participant) {
    await networkManager.writeToDatabase('participants', 'put', {
      ...participant,
      timeMs: finalTime // Sauvegarder le temps en millisecondes
    });
  }

  // Réinitialiser la piste
  networkManager.sendChronoAction({ type: 'TIMER_RESET', trackId });
};
```

### 11.7 `handleStartRaffle()` — Tirage au sort

```typescript
const handleStartRaffle = () => {
  // Filtrer les participants éligibles (ont un temps enregistré)
  const eligible = participants.filter(p => p.timeMs !== null);
  if (eligible.length === 0) return;

  // Choisir le gagnant AVANT de lancer l'animation
  const winner = eligible[Math.floor(Math.random() * eligible.length)];

  // Propager à tous les appareils : le gagnant est inclus dans le message
  networkManager.sendChronoAction({
    type: 'RAFFLE_START',
    spinStartTime: Date.now(),
    winnerId: winner.id  // Calculé à l'avance !
  });
};
```

> [!IMPORTANT]
> Le gagnant est calculé **côté hôte** et inclus dans le message `RAFFLE_START`. Tous les appareils reçoivent la même information en même temps. L'animation de défilement est purement cosmétique : elle s'arrête toujours sur le gagnant prédéterminé.

---

## 12. GenericMatrix.tsx — Module générique

Ce module sert pour tous les types d'événements qui ne sont pas un réparothon ni un kiosque-concours.

### 12.1 Les 3 onglets

| Onglet | Contenu |
|---|---|
| **Enregistrements** | Formulaire d'inscription + liste des participants avec confirmation de présence |
| **Bilan** | Statistiques (taux de présence, score moyen de satisfaction, graphiques) |
| **Public** | Compteurs en grand format pour affichage sur écran |

### 12.2 Formulaire d'inscription

```typescript
// Champs du formulaire
const newAttendee: GenericAttendee = {
  id: 'att-' + Math.random().toString(36).substring(2, 11),
  eventId: event.id,
  name: newName.trim(),       // Obligatoire
  email: newEmail.trim(),     // Optionnel
  presenceConfirmed: newPresence, // Coché par défaut (true)
  notes: newNote.trim(),      // Notes libres optionnelles
  registeredAt: Date.now()
};
```

### 12.3 Confirmations de présence

Chaque ligne de la liste a un bouton pour cocher/décocher la présence. Un clic appelle :

```typescript
const togglePresence = async (id: string) => {
  const att = await db.attendees.get(id);
  if (att) {
    att.presenceConfirmed = !att.presenceConfirmed; // Inverser l'état
    await networkManager.writeToDatabase('attendees', 'put', att);
    await loadAttendees();
  }
};
```

### 12.4 Collecte de notes de satisfaction (1-5 étoiles)

Après un événement, on peut enregistrer la satisfaction de chaque participant :

```typescript
const handleSaveFeedback = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedAttendeeId) return;

  const att = await db.attendees.get(selectedAttendeeId);
  if (att) {
    att.feedbackScore = feedbackScore;  // 1, 2, 3, 4 ou 5
    att.feedbackText  = feedbackText.trim() || undefined;
    await networkManager.writeToDatabase('attendees', 'put', att);

    setSelectedAttendeeId(null);
    setFeedbackScore(5); // Réinitialiser à 5 pour le prochain
    setFeedbackText('');
    await loadAttendees();
  }
};
```

**Statistiques calculées :**
```typescript
const averageFeedback = feedbackList.length > 0
  ? (feedbackList.reduce((sum, a) => sum + a.feedbackScore!, 0) / feedbackList.length).toFixed(1)
  : 'N/A';

// Distribution des scores pour le graphique à barres :
const scoreCounts = [0, 0, 0, 0, 0]; // Indices 0-4 = scores 1-5
feedbackList.forEach(a => { scoreCounts[Math.round(a.feedbackScore!) - 1]++; });
```

### 12.5 Tags spéciaux pour Install Fest Linux

Pour le type `install_fest_linux`, chaque participant reçoit un tag indiquant le statut de son installation :

```typescript
const setLinuxInstallTag = async (id: string, step: 'Réussi' | 'Échec' | 'En cours') => {
  const att = await db.attendees.get(id);
  if (att) {
    att.tags = [step]; // Remplacer les tags existants
    await networkManager.writeToDatabase('attendees', 'put', att);
    await loadAttendees();
  }
};
```

---

## 13. Composants partagés

### 13.1 Charts.tsx — Graphiques

```typescript
// Diagramme circulaire (camembert)
export function DoughnutChart({ data, options }: { data: ChartData, options?: ChartOptions }) {
  return <Doughnut data={data} options={{
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: 'var(--color-text-secondary)' } }
    },
    ...options
  }} />;
}

// Diagramme à barres verticales
export function BarChart({ data, options }: { data: ChartData, options?: ChartOptions }) {
  return <Bar data={data} options={{
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true, ticks: { color: 'var(--color-text-secondary)' } },
      x: { ticks: { color: 'var(--color-text-secondary)' } }
    },
    ...options
  }} />;
}
```

### 13.2 Stopwatch.tsx — Chronomètre précis

```typescript
// Convertit un nombre de millisecondes en texte lisible
export function formatTime(ms: number): string {
  const minutes  = Math.floor(ms / 60000);
  const seconds  = Math.floor((ms % 60000) / 1000);
  const centis   = Math.floor((ms % 1000) / 10); // Centièmes de seconde

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  // Exemple : 2 min 22.35 sec → "02:22.35"
}
```

Le chronomètre se met à jour **toutes les 10 millisecondes** pour un affichage fluide :

```typescript
useEffect(() => {
  if (!isRunning) return;

  const interval = setInterval(() => {
    // Calculer le temps écoulé en temps réel
    setDisplayTime(elapsedBeforeStart + (Date.now() - startTime!));
  }, 10); // 10ms = 100 fois par seconde

  return () => clearInterval(interval);
}, [isRunning, startTime, elapsedBeforeStart]);
```

**Mode `readOnly`** : quand `readOnly={true}`, le chronomètre affiche le temps mais les boutons Démarrer/Arrêter sont cachés. Utilisé dans le classement public.

### 13.3 Leaderboard.tsx — Classement animé

```typescript
// Retourner le badge de médaille selon le rang
function getRankBadge(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}
```

**Animation Framer Motion :** Quand le classement change (quelqu'un finit et entre dans le top), les lignes du tableau se réarrangent avec une animation fluide de glissement :

```typescript
import { motion, AnimatePresence } from 'motion/react';

// Chaque ligne du classement est enveloppée dans <motion.div>
// avec layout={true} pour que Framer Motion anime automatiquement
// le repositionnement quand l'ordre change.
<AnimatePresence>
  {sortedParticipants.map((p, index) => (
    <motion.div
      key={p.id}
      layout
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      {getRankBadge(index + 1)} {p.name} — {formatTime(p.timeMs!)}
    </motion.div>
  ))}
</AnimatePresence>
```

### 13.4 RaffleSpinner.tsx — La roue de tirage au sort

**3 états d'animation :**

| État | Description visuelle |
|---|---|
| `idle` | Liste de noms statique, bouton "Lancer le tirage" visible |
| `spinning` | Les noms défilent de plus en plus lentement (ralentissement exponentiel) |
| `celebrating` | Le gagnant est mis en avant, confettis, message de félicitations |

**Algorithme de ralentissement exponentiel :**
```typescript
// La vitesse de défilement diminue exponentiellement selon le temps écoulé
function getScrollSpeed(elapsed: number, totalDuration: number): number {
  // Plus on est proche de la fin, plus on ralentit
  const progress = elapsed / totalDuration; // 0.0 à 1.0
  const speed = Math.max(50, 500 * (1 - progress) ** 2);
  // 500ms entre chaque nom au début → 50ms à la fin
  return speed;
}
```

---

## 14. Importation universelle

### 14.1 Processus général

```
Lecture du fichier
      ↓
Détection du format (JSON / CSV / MD / LaTeX / Excel)
      ↓
Parsing (extraction des données brutes)
      ↓
Validation (vérifier les champs obligatoires, les types)
      ↓
Détection des conflits (IDs déjà existants en base)
      ↓
Résolution des conflits (modal si nécessaire)
      ↓
Écriture dans IndexedDB
```

### 14.2 Parsing JSON

```typescript
// Le JSON doit avoir cette structure :
{
  "event": { /* EventSettings */ },
  "tickets": [ /* RepairTicket[] */ ],
  "technicians": [ /* Technician[] */ ],
  "participants": [ /* Participant[] */ ],
  "attendees": [ /* GenericAttendee[] */ ]
}
```

L'import JSON importe la structure complète d'un événement et peut remplacer tout l'historique d'une session.

### 14.3 Parsing CSV

Le CSV accepte des **synonymes d'en-têtes** : les noms de colonnes peuvent varier selon l'outil utilisé pour créer le fichier (Excel, LibreOffice, Google Sheets, etc.).

**Exemple de CSV valide pour un Réparothon :**
```csv
Nom du visiteur;Courriel;Appareil;Catégorie;OS;Problème;Poids (kg);Statut
Sophie Girard;sophie.g@email.com;ThinkPad T480;laptop;windows;Batterie se vide vite;1.6;repare
Marc-André Fortin;;iPhone XR;cellulaire;autre;Écran fissuré;0.2;en_cours
Léa Bouchard;;PC Asus K53U;laptop;windows;Écran bleu;2.1;en_attente
```

> [!NOTE]
> Le séparateur est le **point-virgule** (`;`) et non la virgule, pour la compatibilité avec Excel en français (Excel québécois/européen utilise le `;` par défaut).

**Tableau complet des synonymes reconnus :**

| Champ interne | Synonymes acceptés |
|---|---|
| `visitorName` | `nom`, `name`, `visiteur`, `nom du visiteur`, `prénom nom` |
| `visitorEmail` | `email`, `courriel`, `e-mail`, `mail` |
| `objectName` | `appareil`, `device`, `objet`, `modèle`, `nom de l'appareil` |
| `objectCategory` | `catégorie`, `category`, `type` |
| `operatingSystem` | `os`, `système`, `system`, `système d'exploitation` |
| `initialDiagnosis` | `problème`, `problem`, `description`, `diagnostic`, `notes` |
| `weightKg` | `poids`, `weight`, `kg`, `poids (kg)` |
| `status` | `statut`, `status`, `état` |
| `name` (technicien) | `nom`, `name`, `technicien` |
| `specialties` | `spécialités`, `specialties`, `matériel` |

### 14.4 Parsing Markdown

```markdown
# Réparothon Rosemont 2025

| Visiteur | Appareil | Catégorie | Statut |
|---|---|---|---|
| Sophie Girard | ThinkPad T480 | laptop | repare |
| Marc-André Fortin | iPhone XR | cellulaire | en_cours |
```

Le parser Markdown détecte le tableau principal et en extrait les lignes. Les en-têtes du tableau sont normalisés avec les mêmes synonymes que le CSV.

### 14.5 Parsing LaTeX

```latex
\begin{tabular}{llll}
\hline
Visiteur & Appareil & Catégorie & Statut \\
\hline
Sophie Girard & ThinkPad T480 & laptop & repare \\
Marc-André Fortin & iPhone XR & cellulaire & en\_cours \\
\hline
\end{tabular}
```

Le parser LaTeX extrait les lignes entre `\hline` du premier environnement `tabular`.

### 14.6 Parsing Excel (SheetJS)

```typescript
import * as XLSX from 'xlsx';

function parseExcel(arrayBuffer: ArrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  // Lire la première feuille du classeur
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convertir en tableau de tableaux (JSON)
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // La première ligne est les en-têtes
  const headers = rows[0] as string[];
  const dataRows = rows.slice(1);

  // Mapper les colonnes aux champs attendus (avec synonymes)
  return dataRows.map(row => mapRowToObject(headers, row));
}
```

---

## 15. Exportation universelle

### 15.1 JSON (structure complète)

```typescript
function exportJson(event, tickets, technicians, participants, attendees) {
  const data = {
    exportedAt: new Date().toISOString(),
    event,
    tickets,
    technicians,
    participants,
    attendees
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadFile(blob, `${event.name}_${event.date}.json`);
}
```

**Format du fichier généré :**
```json
{
  "exportedAt": "2025-10-15T22:00:00.000Z",
  "event": { "id": "evt-...", "name": "Réparothon Rosemont 2025", ... },
  "tickets": [ ... ],
  "technicians": [ ... ],
  "participants": [],
  "attendees": []
}
```

### 15.2 CSV (séparateur point-virgule, toutes les colonnes)

**Colonnes exportées pour un Réparothon :**
```
ID Ticket;Nom Visiteur;Courriel;Appareil;Catégorie;OS;Diagnostic Initial;Statut;Technicien;Table Tech;Notes Résultat;Poids (kg);Date Création;Dernière MAJ
```

> [!NOTE]
> **`techTableMap`** : Le numéro de table vient du type `Technician.tableNumber` et **non** du `RepairTicket`. Lors de l'export, on construit un dictionnaire `techTableMap` en itérant sur les techniciens, puis on l'utilise pour retrouver le numéro de table à partir de l'`assignedTechId` du ticket.

```typescript
// Construction du techTableMap
const techTableMap: Record<string, number | null> = {};
technicians.forEach(t => {
  techTableMap[t.id] = t.tableNumber ?? null;
});

// Utilisation lors de l'export
tickets.forEach(ticket => {
  const tableNum = ticket.assignedTechId
    ? (techTableMap[ticket.assignedTechId] ?? '')
    : '';
  // ... ajouter au CSV
});
```

### 15.3 Markdown (en-têtes + tableau)

```markdown
# Réparothon Rosemont 2025
**Date :** 2025-10-15  
**Lieu :** Montréal  
**Exporté le :** 2025-10-15 22:00

## Tickets de réparation

| Visiteur | Appareil | Catégorie | Statut | Technicien | Table | Poids (kg) |
|---|---|---|---|---|---|---|
| Sophie Girard | ThinkPad T480 | laptop | Réparé | Alexandre Tremblay | 3 | 1.6 |
| Marc-André Fortin | iPhone XR | cellulaire | En cours | Chloé Dubé | 2 | 0.2 |
```

### 15.4 LaTeX (document compilable)

```latex
\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{longtable}
\usepackage{booktabs}

\title{Réparothon Rosemont 2025}
\date{2025-10-15}

\begin{document}
\maketitle

\section{Tickets de réparation}

\begin{longtable}{llllll}
\toprule
Visiteur & Appareil & Catégorie & Statut & Technicien & Poids (kg) \\
\midrule
Sophie Girard & ThinkPad T480 & laptop & repare & Alexandre Tremblay & 1.6 \\
\bottomrule
\end{longtable}
\end{document}
```

### 15.5 Excel (SheetJS, feuille 'Export')

```typescript
import * as XLSX from 'xlsx';

function exportExcel(event, tickets, techTableMap) {
  const rows = [
    // En-tête
    ['ID Ticket', 'Nom Visiteur', 'Appareil', 'Catégorie', 'OS', 'Statut', 'Technicien', 'Table Tech', 'Poids (kg)'],
    // Données
    ...tickets.map(t => [
      t.id,
      t.visitorName,
      t.objectName,
      t.objectCategory,
      t.operatingSystem,
      t.status,
      t.assignedTechName ?? '',
      t.assignedTechId ? (techTableMap[t.assignedTechId] ?? '') : '',
      t.weightKg
    ])
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Export'); // Nom de la feuille : 'Export'
  XLSX.writeFile(workbook, `${event.name}_${event.date}.xlsx`);
}
```

---

## 16. Thème clair / foncé

### 16.1 Persistance dans localStorage

```typescript
// Sauvegarder la préférence quand l'utilisateur change de thème
function toggleTheme() {
  const newTheme = !isLightTheme;
  setIsLightTheme(newTheme);
  localStorage.setItem('insertech_theme', newTheme ? 'light' : 'dark');

  // Appliquer la classe CSS immédiatement
  if (newTheme) {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
}

// Au démarrage de l'application (initApp) :
const savedTheme = localStorage.getItem('insertech_theme');
if (savedTheme === 'light') {
  setIsLightTheme(true);
  document.documentElement.classList.add('light');
}
```

### 16.2 Classe CSS `.light` sur `<html>`

Le thème foncé est le **thème par défaut**. Quand la classe `.light` est ajoutée sur la balise `<html>`, les variables CSS changent de valeur.

```css
/* Thème FONCÉ (défaut) — variables sur :root */
:root {
  --color-app-bg:       #0f0a1e;   /* Fond principal très sombre */
  --color-surface:      #1a1030;   /* Fond des cartes et panneaux */
  --color-text:         #e2e8f0;   /* Texte principal (clair sur fond sombre) */
  --color-text-secondary: #94a3b8; /* Texte secondaire (gris clair) */
  --color-border:       #2d2050;   /* Couleur des bordures */
  --color-brand:        #9ecd33;   /* Vert lime Insertech */
  --color-brand-dark:   #480A94;   /* Violet Insertech */
}

/* Thème CLAIR — variables sur html.light */
html.light {
  --color-app-bg:       #f8fafc;   /* Fond blanc cassé */
  --color-surface:      #ffffff;   /* Fond des cartes (blanc pur) */
  --color-text:         #0f172a;   /* Texte principal (très sombre) */
  --color-text-secondary: #64748b; /* Texte secondaire (gris) */
  --color-border:       #e2e8f0;   /* Bordures légères */
  --color-brand:        #9ecd33;   /* Même vert (identique dans les deux thèmes) */
  --color-brand-dark:   #480A94;   /* Même violet */
}
```

### 16.3 Utilisation dans les composants

Les composants utilisent ces variables CSS directement, jamais de valeurs codées en dur :

```css
.card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.badge-repare {
  background-color: var(--color-brand); /* Vert Insertech */
  color: #000000;
}
```

---

## 17. Référence des formats de fichiers

### 17.1 Format CSV — Réparothon

| Colonne | Nom exact | Type | Valeurs acceptées |
|---|---|---|---|
| 1 | `Nom du visiteur` | Texte | N'importe quel texte |
| 2 | `Courriel` | Texte | Adresse courriel (optionnel) |
| 3 | `Appareil` | Texte | N'importe quel texte |
| 4 | `Catégorie` | Énuméré | `pc_tour`, `laptop`, `cellulaire`, `tablette`, `autre` |
| 5 | `OS` | Énuméré | `windows`, `mac`, `linux`, `autre`, `aucun` |
| 6 | `Problème` | Texte | Description libre |
| 7 | `Poids (kg)` | Nombre | Ex: `1.6`, `0.2`, `2.1` |
| 8 | `Statut` | Énuméré | `en_attente`, `assigne`, `en_cours`, `repare`, `semi_repare`, `non_reparable`, `abandonne` |

### 17.2 Format CSV — Techniciens (Réparothon)

| Colonne | Nom exact | Type | Valeurs acceptées |
|---|---|---|---|
| 1 | `Nom` | Texte | Nom complet du technicien |
| 2 | `Spécialités` | Texte | Valeurs séparées par des virgules : `laptop`, `pc_tour`, `cellulaire`, `tablette`, `autre` |
| 3 | `Spécialités logicielles` | Texte | Ex: `windows,linux` |
| 4 | `Numéro de table` | Nombre | Ex: `1`, `2`, `3` |

### 17.3 Format CSV — Kiosque-Concours

| Colonne | Nom exact | Type | Valeurs acceptées |
|---|---|---|---|
| 1 | `Nom` | Texte | Nom complet du participant |
| 2 | `Courriel` | Texte | Adresse courriel (obligatoire) |
| 3 | `Code postal` | Texte | Ex: `H2W 1Y4` (optionnel) |
| 4 | `Temps (ms)` | Nombre | Temps en millisecondes, vide si pas encore joué |

### 17.4 Format CSV — Générique (Fresque, Conférence, etc.)

| Colonne | Nom exact | Type | Valeurs acceptées |
|---|---|---|---|
| 1 | `Nom` | Texte | Nom complet du participant |
| 2 | `Courriel` | Texte | Adresse courriel (optionnel) |
| 3 | `Présence confirmée` | Booléen | `oui`, `true`, `1` = présent ; tout autre = absent |
| 4 | `Notes` | Texte | Notes libres |
| 5 | `Note de satisfaction` | Nombre | `1` à `5` |
| 6 | `Commentaire` | Texte | Texte libre de satisfaction |

---

## 18. Guide de déploiement

### Étape 1 : Compiler l'application

#### Option A : Bundle Web autonome (HTML unique)
```bash
npm run build
```
Cela génère le fichier `dist/index.html`. C'est ce fichier unique qui contient toute l'application.

#### Option B : Exécutable portable Windows x64 (.NET 8 avec icône et zéro permission)
```bash
npm run build:exe
```
Cela génère l'exécutable portable `InsertechEvenements.exe` à la racine, prêt à l'emploi avec icône intégrée, sans installation et sans alerte de sécurité.

#### Option C : Exécutable portable Linux Debian x64 (.NET 8 ELF autonome)
```bash
npm run build:linux
```
Cela génère le binaire portable `InsertechEvenements-linux-x64` à la racine (idéal pour les *Install Fest Linux* ou les postes sous Debian/Ubuntu/Mint). Au premier lancement (`./InsertechEvenements-linux-x64`), il extrait automatiquement le logo du chapiteau magique et enregistre un raccourci Freedesktop (`~/.local/share/applications/insertech-evenements.desktop`) sans demander de mot de passe administrateur (`sudo`).

**Installeurs.** La CI produit aussi, à partir des mêmes exécutables :
- `InsertechEvenements-Setup-<version>.exe` (NSIS, `packaging/windows/installer.nsi`) : installation sans droits administrateur dans `%LOCALAPPDATA%\Programs`, raccourcis menu Démarrer et bureau, désinstallation depuis les paramètres Windows. Les données (`%LOCALAPPDATA%\InsertechEvenements`) sont conservées à la désinstallation.
- `insertech-evenements_<version>_amd64.deb` (`packaging/linux/build-deb.sh`) : `sudo apt install ./insertech-evenements_<version>_amd64.deb`, puis lancer « Insertech Événements » depuis le menu ou `insertech-evenements`.

Le lanceur affiche toujours l'interface embarquée dans l'exécutable : un `index.html` posé à côté est ignoré. Pour tester un autre bundle, définir `INSERTECH_DEV_HTML=/chemin/vers/index.html`.

#### Option D : Exécutable Mobile Android APK (.apk) & PWA
```bash
npm run build:mobile
```
Cela compile l'application et génère `dist/InsertechEvenements-Mobile.html`.
L'appli Android est un projet [Capacitor](https://capacitorjs.com) 8 (Android 10 et plus, aucune dépendance aux services Google). Sur une machine avec le SDK Android et un JDK 21, ou via GitHub Actions :
```bash
npm run build
npx cap sync android          # copie dist/ dans android/app/src/main/assets/public
cd android && ./gradlew assembleDebug lintDebug
```
Ne jamais modifier `android/app/src/main/assets/public/` à la main : il est régénéré par `cap sync`. La sauvegarde SQLite de la tablette (`window.InsertechStockage`, `StorageBridge.java`) est branchée dans `MainActivity.java`.

**Signature de l'APK.** L'APK debug est signé avec `android/app/debug.keystore`, commité pour que chaque APK puisse mettre à jour le précédent sans désinstallation. Quand les secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD` sont définis dans le dépôt, la CI produit à la place un APK release (`org.insertech.evenements`, sans suffixe `.debug`) signé avec cette clé. Passer de l'un à l'autre installe une autre application : exporter les données avant.

Pour compiler simultanément l'ensemble des versions **Web + Windows + Linux Debian + Mobile Android** :
```bash
npm run build:all
```

#### Option E : Intégration Continue & Déploiement Continu (CI / CD)
Trois workflows GitHub Actions : `build.yml` (partagé) construit le bundle web une seule fois, le vérifie, puis en tire l'exe, le binaire Linux et l'APK ; `pr-check.yml` le lance sur chaque **Pull Request** (artefacts gardés 7 jours, run annulé si un nouveau push arrive) ; `ci-cd.yml` le lance sur `main` et sur les tags, puis déploie la PWA et publie la release :
- **CI** : `npm run lint` (types, design system, versions synchronisées), `npm run build`, puis `npm run test:ui` (Playwright) qui ouvre le bundle en `file://` (exe, APK) et en `http` (PWA) sur 3 tailles d'écran et vérifie en-tête, onglets, images, polices et absence de débordement.
- **Artifacts de PR & Releases** : Téléchargement automatique pour chaque PR :
  - 📱 **Android Mobile** : `InsertechEvenements-Android.apk` (exécutable installable sur smartphones et tablettes Android).
  - 🪟 **Windows x64** : `InsertechEvenements.exe` (exécutable portable sans installation).
  - 🐧 **Linux Debian x64** : `InsertechEvenements-linux-x64` (exécutable portable ELF).
  - 📦 **Installeurs** : `InsertechEvenements-Setup-<version>.exe` (Windows) et `insertech-evenements_<version>_amd64.deb` (Debian/Ubuntu).
  - 🌐 **PWA Web & Mobile** : `InsertechEvenements-PWA-Android.zip` et `InsertechEvenements-Mobile.html`.
- **CD / Releases** : Publication automatique des exécutables et de l'APK dès qu'un tag `v*` est poussé, avec `SHA256SUMS.txt`. La release échoue s'il manque un fichier au lieu de partir incomplète.

**Publier une nouvelle version.** La version de `package.json` est la seule source de vérité : `npm version patch` (ou `minor`, `major`) la monte et la recopie dans le lanceur .NET, `app.manifest` et l'APK (`versionCode` = majeur×10000 + mineur×100 + correctif) via `scripts/sync-version.js`. Fusionner, puis pousser le tag `v<version>` ou lancer le workflow avec `release_tag`. Le pipeline refuse un tag qui ne correspond pas à `package.json`, et `npm run lint` refuse des versions désynchronisées. La version s'affiche dans le pied de page de l'application.

> [!TIP]
> Sur smartphone ou tablette (Android / iOS), l'application peut également être installée directement depuis le navigateur via le bouton **« App Mobile (PWA & APK) »** et le QR Code interactif généré sur l'écran d'accueil !
> La version PWA ne se synchronise pas avec le PC : pour les tablettes de l'événement, installer l'APK ([section 22](#22-application-android)).


### Étape 2 : PC Hôte — Créer la session

1. Lancer **InsertechEvenements** (installeur ou exe portable) sur le PC de l'animateur. C'est le lanceur qui
   trouve les tablettes ; il n'écoute pas sur le réseau et ne demande aucun droit administrateur.
2. Brancher le PC sur le hotspot du cellulaire (données mobiles coupées).
3. Créer ou ouvrir l'activité.
4. Cliquer sur **Réseau LAN** dans l'en-tête, puis **Créer la session hôte**.
5. La fenêtre affiche le code, la clé et un QR. Régler au besoin le code à 4 chiffres des tablettes.

> [!IMPORTANT]
> Le PC hôte doit rester **allumé et l'application ouverte** pendant tout l'événement. Il est la source de vérité. Si le PC se ferme, les tablettes gardent leurs saisies dans leur file d'envoi et les transmettent quand le PC revient.

### Étape 3 : Tablettes — Rejoindre l'événement

1. Installer l'APK sur chaque tablette (voir la [section 22](#22-application-android)) et la brancher sur le même hotspot.
2. Ouvrir l'application, puis **Scanner le QR du PC** (ou viser le QR avec l'appareil photo Samsung).
3. La tablette apparaît dans la liste du PC, qui l'appelle ; elle reçoit toutes les données de l'activité.
4. Choisir le mode de la tablette (**Animateur**, **Écran public** ou **Kiosque formulaire**), puis **Verrouiller ce mode**.

> [!NOTE]
> Tablettes et PC doivent être sur le **même Wi-Fi**, et le hotspot ne doit pas isoler les appareils. Aucun accès à internet n'est nécessaire. Liste à cocher la veille : [docs/android-verification-tablette.md](docs/android-verification-tablette.md).

### Étape 4 : Pendant l'événement

- Les **tablettes en kiosque formulaire** inscrivent les visiteurs ; les inscriptions arrivent sur le PC en moins d'une seconde
- L'**écran public** passe sur un téléviseur par câble HDMI depuis le PC (**Plus** > **Ouvrir le projecteur**), ou par une tablette en mode Écran public et Smart View : voir [docs/ecran-public-chromecast.md](docs/ecran-public-chromecast.md)
- Une tablette qui perd le Wi-Fi est rappelée seule par le PC, et ses saisies en attente arrivent
- Les nouvelles versions de l'APK passent par le PC : **Mettre à jour les tablettes** dans la fenêtre Réseau local

### Étape 5 : Export final

À la fin de l'événement :
1. Sur le **PC hôte**, cliquer sur **"Exporter"** dans l'en-tête
2. Choisir le format : **Excel** pour un tableau, **JSON** pour une sauvegarde complète
3. Conserver le fichier : sur le PC il est téléchargé comme d'habitude ; sur une tablette il arrive dans **Documents/Insertech**, avec un bouton **Partager**

---

## 19. Référence complète des champs de formulaire

### 19.1 Formulaire de création d'événement

| Champ | Obligatoire | Valeurs / Format |
|---|---|---|
| Nom de l'événement | ✅ | Texte libre |
| Type | ✅ | Voir EventType (8 valeurs) |
| Date | ✅ | Format YYYY-MM-DD |
| Lieu (ville) | ❌ | Texte libre |
| Partenaire | ❌ | Texte libre |
| Lieu précis | ❌ | Texte libre |
| Logos partenaires | ❌ | Fichiers image (JPG, PNG, SVG, GIF) |

### 19.2 Formulaire de ticket (Réparothon)

| Champ | Obligatoire | Valeurs / Format |
|---|---|---|
| Nom du visiteur | ✅ | Texte libre |
| Courriel du visiteur | ❌ | Format courriel |
| Nom de l'appareil | ✅ | Texte libre (ex: "ThinkPad T480") |
| Catégorie | ✅ | `pc_tour`, `laptop`, `cellulaire`, `tablette`, `autre` |
| Système d'exploitation | ✅ | `windows`, `mac`, `linux`, `autre`, `aucun` |
| Diagnostic initial | ❌ | Texte libre |
| Poids (kg) | ✅ | Nombre décimal (ex: `1.6`) |

### 19.3 Formulaire de technicien (Réparothon)

| Champ | Obligatoire | Valeurs / Format |
|---|---|---|
| Nom du technicien | ✅ | Texte libre |
| Spécialités matérielles | ❌ | Cases à cocher multiples : `laptop`, `pc_tour`, `cellulaire`, `tablette`, `autre` |
| Spécialités logicielles | ❌ | Cases à cocher multiples : `windows`, `mac`, `linux`, `autre` |
| Numéro de table | ❌ | Nombre entier (ex: `3`) |

### 19.4 Formulaire de participant (Kiosque-Concours)

| Champ | Obligatoire | Valeurs / Format |
|---|---|---|
| Nom complet | ✅ | Texte libre |
| Courriel | ✅ | Format courriel |
| Code postal | ❌ | Ex: `H2W 1Y4` |

### 19.5 Formulaire d'inscrit générique

| Champ | Obligatoire | Valeurs / Format |
|---|---|---|
| Nom complet | ✅ | Texte libre |
| Courriel | ❌ | Format courriel |
| Présence confirmée | ❌ | Booléen (coché par défaut) |
| Notes | ❌ | Texte libre |

---

## 20. Dépendances

### 20.1 Dépendances de production

| Bibliothèque | Version | Rôle dans le projet |
|---|---|---|
| `react` | ^19.0.1 | Framework UI principal |
| `react-dom` | ^19.0.1 | Rendu React dans le DOM du navigateur |
| `dexie` | ^4.0.10 | ORM pour IndexedDB (base de données locale) |
| `@capacitor/core`, `@capacitor/android` | ^8.6.0 | Application Android (Capacitor) |
| `@capacitor/app` | ^8.1.2 | Bouton Retour et liens `insertech://` sur Android |
| `@capacitor/filesystem`, `@capacitor/share` | ^8.1.5, ^8.0.3 | Exports dans Documents/Insertech et partage sur Android |
| `@capacitor/screen-orientation` | ^8.0.2 | Paysage verrouillé en mode écran public |
| `@capacitor-community/keep-awake` | ^8.0.1 | Écran toujours allumé en kiosque et en écran public |
| `qrcode` | ^1.5.4 | QR de la session affiché par le PC |
| `jsqr` | ^1.4.0 | Lecture du QR par l'appareil photo de la tablette |
| `chart.js` | ^4.4.1 | Moteur de graphiques (Doughnut, Bar) |
| `react-chartjs-2` | ^5.3.0 | Composants React pour Chart.js |
| `canvas-confetti` | ^1.9.4 | Animation de confettis lors des célébrations |
| `lucide-react` | ^0.546.0 | Bibliothèque d'icônes SVG |
| `motion` | ^12.23.24 | Animations fluides (Framer Motion v12) |
| `xlsx` | ^0.18.5 | Lecture et écriture de fichiers Excel (.xlsx) |

### 20.2 Dépendances de développement

| Bibliothèque | Version | Rôle |
|---|---|---|
| `typescript` | ~5.8.2 | Langage TypeScript avec vérification de types |
| `@types/react` | ^19.0.10 | Types TypeScript pour React |
| `@types/react-dom` | ^19.0.4 | Types TypeScript pour ReactDOM |
| `@types/canvas-confetti` | ^1.9.0 | Types TypeScript pour canvas-confetti |
| `@types/node` | ^22.14.0 | Types TypeScript pour les APIs Node.js |
| `@vitejs/plugin-react` | ^5.2.0 | Plugin Vite pour le JSX React (Fast Refresh) |
| `vite` | ^6.4.4 | Bundler et serveur de développement |
| `@tailwindcss/vite` | ^4.3.3 | Plugin Tailwind CSS pour Vite |
| `@capacitor/cli` | ^8.6.0 | `npx cap sync android` |
| `@playwright/test` | ^1.56.1 | Tests de l'interface et du réseau local |
| `ws`, `@types/ws` | ^8.18.3 | Tablette simulée en Node dans les tests |
| `tailwindcss` | ^4.1.14 | Framework CSS utilitaire |
| `vite-plugin-singlefile` | ^2.3.3 | **Clé** : compile tout en un seul fichier HTML autonome |

---

## 21. FAQ

### ❓ L'application fonctionne-t-elle sans Internet ?

**Oui, totalement.** Une fois le fichier `dist/index.html` ouvert dans Chrome, aucune connexion Internet n'est requise pour utiliser les fonctionnalités de base (créer des tickets, gérer des techniciens, voir les statistiques). La synchronisation entre le PC et les tablettes passe **uniquement par le réseau local** (le hotspot du cellulaire, données mobiles coupées), jamais par internet.

> [!NOTE]
> Les seuls boutons qui utilisent internet sont sur le PC : chercher une nouvelle version sur GitHub et « Télécharger depuis GitHub » l'APK des tablettes. On peut s'en passer en apportant les fichiers sur une clé USB.

---

### ❓ Qu'est-ce qui se passe si je recharge la page accidentellement ?

Pas de panique ! L'application mémorise dans le `localStorage` :
- L'ID de l'événement actif (`insertech_active_event_id`)
- Le rôle réseau (`insertech_net_role`)
- Le code de session (`insertech_net_session_code`) et sa clé
- Sur une tablette : les saisies pas encore reçues par le PC (`insertech_net_outbox`)

Au rechargement, l'application restaure automatiquement l'état : le PC relance sa session et rappelle les tablettes, sans rien retaper.

---

### ❓ Les données sont-elles perdues si je ferme Chrome ?

**Non.** Les données sont stockées dans IndexedDB, une base de données persistante du navigateur. Elles survivent aux fermetures de navigateur, aux redémarrages de l'ordinateur, et même aux mises à jour de Chrome.

> [!WARNING]
> Attention : si tu utilises le mode **Navigation privée** (incognito) de Chrome, les données IndexedDB sont effacées dès que tu fermes la fenêtre privée.

---

### ❓ Combien de tablettes peut-on connecter simultanément ?

Il n'y a pas de limite fixe : le PC appelle chaque tablette de la session. En pratique, nous recommandons un maximum de **10 tablettes** pour maintenir de bonnes performances de synchronisation. Plus il y a de tablettes, plus l'hôte doit diffuser de messages.

---

### ❓ Peut-on utiliser l'application sur un iPad ou un téléphone Android ?

**Android : oui, avec l'APK** (Android 10 ou plus, [section 22](#22-application-android)). C'est la seule façon de se synchroniser avec le PC, car la tablette doit écouter sur le réseau local.

**iPad ou navigateur seul : en autonome seulement.** La page s'ouvre dans un navigateur récent (Chrome, Edge, Safari ou Firefox de 2023 ou plus), mais sans synchronisation avec le PC.

Il faut un navigateur interne récent (Chrome 111 ou plus) : sinon l'application affiche « Navigateur interne trop ancien » et dit quoi mettre à jour.

---

### ❓ Comment exporter les données à la fin d'un événement ?

1. Dans l'en-tête du tableau de bord, cliquer sur le bouton **"Exporter"** (sur une tablette, le fichier arrive dans **Documents/Insertech**, avec **Partager**)
2. Choisir le format désiré :
   - **JSON** : sauvegarde complète de toutes les données (pour réimporter plus tard)
   - **Excel** : tableau avec toutes les colonnes (pour analyser dans Excel)
   - **CSV** : format texte simple (pour n'importe quel tableur)
   - **Markdown** : rapport formaté (pour documentation)
   - **LaTeX** : rapport compilable (pour publications académiques)

---

### ❓ La célébration (confettis + son) ne fonctionne pas sur ma tablette, pourquoi ?

Les navigateurs bloquent le son si l'utilisateur n'a pas interagi avec la page. Pour déclencher la célébration sonore :
1. Assure-toi qu'au moins un clic a été fait dans l'application depuis le dernier chargement
2. Vérifie que le volume du haut-parleur de la tablette n'est pas à zéro
3. Sur certains appareils iOS, le son peut être bloqué par le bouton "Mode silencieux"

Les confettis ne requièrent pas d'interaction préalable et fonctionnent toujours.

---

### ❓ Comment importer une liste de participants préparée à l'avance ?

1. Créer un fichier Excel ou CSV avec les bonnes colonnes (voir la section 17)
2. Dans le tableau de bord, cliquer sur **"Importer"** (bouton dans l'en-tête ou dans l'onglet correspondant)
3. Sélectionner le fichier
4. Si des conflits sont détectés (IDs déjà existants), un modal apparaît pour choisir comment les gérer
5. Confirmer l'import

**Conseil** : utiliser la fonction **"Télécharger le gabarit"** pour obtenir un fichier exemple avec les bonnes colonnes.

---

### ❓ Peut-on modifier l'application pour ajouter un nouveau type d'événement ?

Oui ! Voici les étapes :

1. **Ajouter le type dans `types.ts`** :
   ```typescript
   export type EventType = ... | 'mon_nouveau_type';
   ```

2. **Ajouter l'entrée dans `MATRICES_LIST` dans `MatrixSelector.tsx`** :
   ```typescript
   { type: 'mon_nouveau_type', label: 'Mon Nouveau Type', color: '#ff6b6b', icon: Star }
   ```

3. **Choisir quel module de tableau de bord utiliser** : si c'est similaire aux conférences/ateliers, `GenericMatrix` est suffisant. Sinon, créer un nouveau fichier dans `src/components/matrices/`.

4. **Ajouter la logique de routing dans `DashboardShell.tsx`** pour que le bon module s'affiche selon le type.

---

### ❓ Qu'arrive-t-il si le PC hôte perd sa connexion Wi-Fi pendant l'événement ?

Les tablettes continuent de fonctionner : elles affichent les données reçues et gardent leurs nouvelles saisies dans leur **file d'envoi**. Un bandeau indique que le PC est injoignable.

Quand le Wi-Fi revient, le PC rappelle chaque tablette : elle envoie ses saisies en attente (le PC confirme chacune), puis reçoit un `INITIAL_SYNC` avec les données les plus récentes. Rien n'est perdu, même si l'application de la tablette a été fermée entre-temps.

---

## 22. Application Android

L'application Android (Capacitor 8, Android 10 et plus) embarque la même page que le PC. Elle n'utilise
jamais internet ni les services Google : la tablette écoute sur le réseau local (port 47630) et c'est le PC
qui l'appelle. Liste à cocher avant un événement : [docs/android-verification-tablette.md](docs/android-verification-tablette.md).

### Installer l'APK

1. Télécharger `InsertechEvenements-Android.apk` depuis la page **Releases** de GitHub (ou l'artefact
   `InsertechEvenements-Android-APK` d'une exécution de la CI).
2. Le copier sur la tablette (câble USB, ou carte SD), l'ouvrir depuis **Mes fichiers**, autoriser
   l'installation d'applications inconnues pour **Mes fichiers**, puis **Installer**.
3. Ensuite, les nouvelles versions passent par le PC : **Mettre à jour les tablettes** dans la fenêtre
   Réseau local envoie l'APK par le réseau local, sans internet sur la tablette.

Toutes les versions doivent être signées avec la **même clé** : sinon Android refuse la mise à jour, et il
faut désinstaller (exporter les données avant).

### Rejoindre un événement

1. Sur le PC : ouvrir l'activité, puis la fenêtre **Réseau local**. Elle affiche un QR (`insertech://rejoindre?code=…&cle=…`).
2. Sur la tablette : **Scanner le QR du PC** dans l'application, ou viser le QR avec l'appareil photo Samsung.
   Sans appareil photo, taper le code et la clé à la main.
3. Choisir le mode de la tablette (kiosque, écran public…) et, si besoin, **Verrouiller ce mode** avec le code
   à 4 chiffres réglé sur le PC.

### Déboguer

- Compiler un APK debug : `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`.
- Brancher la tablette en USB (options de développement > débogage USB), puis ouvrir `chrome://inspect` (ou
  `edge://inspect`) sur le PC : la page de l'application apparaît sous la tablette, avec sa console et son
  onglet Réseau. L'APK release ne se laisse pas inspecter.
- Journaux Java : `adb logcat | grep -i insertech`.

### Tests

| Commande | Où | Ce qu'elle vérifie |
| --- | --- | --- |
| `./gradlew :app:testDebugUnitTest` | Dossier `android/`, CI de chaque PR | Vérification des mises à jour en Java pur (`VerificationMaj` : SHA-256, certificats, reprise d'envoi) |
| `./gradlew :app:connectedDebugAndroidTest` | Émulateur ou tablette branchée ; CI `android-emulateur.yml` si `android/` change | L'application démarre, la page se charge depuis l'APK, les plugins répondent, la sauvegarde SQLite relit ce qu'elle a écrit, le lien du QR ouvre l'application |
| `npm run test:ui` | PC, CI de chaque PR | Interface, synchro avec une tablette simulée, envoi de mise à jour simulé |

L'émulateur de la CI utilise une image Android 10 **sans services Google** (`target: default`), pour prouver
que l'application n'en dépend pas.

### Méthodes natives

Plugin `InsertechNatif` (`InsertechNatifPlugin.java`, appelé depuis `src/native/android.ts`) :

| Méthode | Rôle |
| --- | --- |
| `pleinEcran({ actif })` | Cache ou montre les barres d'état et de navigation |
| `epingler()` / `desepingler()` | Épingle l'application (Retour et Accueil ne sortent plus) |
| `etat()` | Dit si l'application est épinglée |
| `quitter()` | Ferme l'application |
| `ouvrirFichierMaj({ sha256, taille })` | Prépare le fichier de la mise à jour reçue du PC, et dit d'où reprendre |
| `ecrireMorceau({ index, donnees })` | Écrit un morceau de 64 Ko de l'APK (base64) |
| `verifierMaj({ sha256, versionCode })` | Vérifie l'APK reçu : SHA-256, nom du paquet, version plus récente, même certificat |
| `installerMaj()` | Lance l'installation (PackageInstaller ; Android demande confirmation) |

Plugin `ServeurLocal` (`ServeurLocalPlugin.java`, appelé depuis `src/net/tabletteLocale.ts`) : `demarrer`,
`infos`, `majFiche`, `envoyer`, `fermer`, `arreter` (serveur WebSocket local sur le port 47630, que le PC appelle).

Pont `window.InsertechStockage` (`StorageBridge.java`) : `save(json)` et `load()`, la sauvegarde SQLite hors
du navigateur. L'écran allumé et le paysage passent par `@capacitor-community/keep-awake` et
`@capacitor/screen-orientation`.

---

*Tableau de bords événementiel — Insertech · Documentation à jour pour la version 1.4.0 et l'application Android native · Novembre 2026*
