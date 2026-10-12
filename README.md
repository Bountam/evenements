# 📋 Insertech — Tableau de bords événementiel

> **Documentation complète · Version 1.0.0 · Rédigée en français (Canada)**

---

## Table des matières

1. [Présentation du projet](#1-présentation-du-projet)
2. [Architecture complète](#2-architecture-complète)
3. [Démarrage développeur](#3-démarrage-développeur)
4. [Types TypeScript (types.ts)](#4-types-typescript-typests)
5. [Base de données IndexedDB (db.ts)](#5-base-de-données-indexeddb-dbts)
6. [Réseau P2P (network.ts)](#6-réseau-p2p-networkts)
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

Quand il y a une connexion, plusieurs tablettes ou ordinateurs peuvent se connecter ensemble en réseau local via **WebRTC** (technologie qui permet aux navigateurs de se parler directement, comme deux téléphones qui s'appellent).

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
├── index.html                    → Page HTML principale (point d'entrée)
├── package.json                  → Liste des dépendances et scripts npm
├── tsconfig.json                 → Configuration TypeScript
├── vite.config.ts                → Configuration du bundler Vite
│
├── dist/                         → Dossier généré par npm run build (NE PAS MODIFIER)
│
└── src/                          → Code source de l'application
    ├── main.tsx                  → Point d'entrée React (monte <App /> dans le DOM)
    ├── index.css                 → Styles globaux + variables CSS thème clair/foncé
    ├── types.ts                  → Tous les types TypeScript du projet
    ├── db.ts                     → Base de données IndexedDB (Dexie.js)
    ├── network.ts                → Gestionnaire réseau P2P (PeerJS + MQTT)
    ├── App.tsx                   → Composant racine : navigation, import/export, événements
    │
    └── components/
        ├── DashboardShell.tsx    → Coquille du tableau de bord (en-tête + onglets)
        ├── MatrixSelector.tsx    → Écran de création/sélection d'un événement
        │
        ├── matrices/             → Modules spécialisés par type d'événement
        │   ├── ReparothonMatrix.tsx  → Module Réparothon (tickets + techniciens)
        │   ├── TeardownMatrix.tsx    → Module Kiosque-Concours (chronos + tirage)
        │   └── GenericMatrix.tsx     → Module générique (présences + feedback)
        │
        └── shared/               → Composants réutilisables
            ├── Charts.tsx        → Graphiques DoughnutChart et BarChart
            ├── Stopwatch.tsx     → Chronomètre avec rendu temps réel
            ├── Leaderboard.tsx   → Classement animé avec médailles
            └── RaffleSpinner.tsx → Roue de tirage au sort animée
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
Le "cerveau réseau". Gère la communication entre le PC hôte et les tablettes clientes via WebRTC (PeerJS). Gère aussi la découverte automatique des sessions via MQTT.

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

Ce type union regroupe tous les messages qui peuvent être échangés entre onglets (BroadcastChannel) ou entre appareils en réseau (WebRTC).

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

## 6. Réseau P2P (network.ts)

### 🌐 C'est quoi le P2P ?

P2P signifie "Peer-to-Peer" (de pair à pair). Au lieu d'envoyer tes données vers un serveur sur Internet qui les redistribue, les appareils se parlent **directement** entre eux, comme deux téléphones qui s'appellent sans passer par une centrale téléphonique.

L'application utilise **PeerJS** (qui s'appuie sur la technologie WebRTC intégrée dans Chrome/Firefox) pour établir ces connexions directes.

### 6.1 PeerJS / WebRTC vs MQTT

| Technologie | Rôle dans le projet |
|---|---|
| **PeerJS / WebRTC** | Transfert réel des données entre les appareils (tickets, techniciens, chronos) |
| **MQTT (Paho)** | Découverte automatique : permet aux tablettes de trouver la session sans taper de code |

**Comment MQTT aide à la découverte ?** L'hôte publie régulièrement son code de session sur un canal MQTT public. Les tablettes qui cherchent des sessions écoutent ce canal et voient automatiquement les sessions disponibles. C'est comme un "GPS" qui dit "il y a une session INS-1234 par ici !".

### 6.2 Les 3 rôles réseau

```typescript
role: 'host' | 'client' | 'standalone'
```

| Rôle | Description | Qui ? |
|---|---|---|
| `standalone` | Mode par défaut. Pas de réseau. Données uniquement locales. | Tout le monde au départ |
| `host` | PC principal. Source de vérité. Reçoit toutes les modifications et les redistribue. | Le PC de l'animateur |
| `client` | Tablette connectée. Envoie ses modifications à l'hôte. Reçoit les mises à jour de l'hôte. | Les tablettes d'accueil |

### 6.3 `startHost(eventId, existingCode?)` — Démarrer la session hôte

```typescript
async startHost(eventId: string, existingCode?: string): Promise<string> {
  this.role = 'host';

  // Générer un code unique et lisible, ex: "INS-4287-A3F2"
  const randomCode = Math.floor(1000 + Math.random() * 9000);
  this.sessionId = `INS-${randomCode}-${eventId.substring(4, 8).toUpperCase()}`;

  // Sauvegarder pour la reconnexion automatique si la page se recharge
  localStorage.setItem('insertech_net_role', 'host');
  localStorage.setItem('insertech_net_session_code', this.sessionId);
  localStorage.setItem('insertech_net_event_id', eventId);

  // Créer le "Peer" PeerJS avec l'ID = le code de session
  this.peer = new Peer(this.sessionId, {
    host: '0.peerjs.com', // Serveur de signalement PeerJS gratuit
    port: 443,
    secure: true
  });

  // Quand connecté : commencer à annoncer la session via MQTT
  this.peer.on('open', () => {
    this.startMqttDiscoveryAnnounce(eventId);
  });

  // Quand une tablette se connecte : l'ajouter à la liste
  this.peer.on('connection', (conn) => {
    this.connections.push(conn);
    conn.on('data', (data) => this.handleIncomingData(conn, data, eventId));
  });
}
```

### 6.4 `joinSession(code, eventId)` — Rejoindre une session

```typescript
async joinSession(code: string, eventId: string): Promise<void> {
  this.role = 'client';

  // Sauvegarder pour la reconnexion automatique
  localStorage.setItem('insertech_net_role', 'client');
  localStorage.setItem('insertech_net_session_code', code);

  // Créer notre propre Peer sans ID fixe (ID généré automatiquement)
  this.peer = new Peer({ host: '0.peerjs.com', port: 443, secure: true });

  this.peer.on('open', () => {
    // Se connecter à l'hôte en utilisant son code de session comme ID
    const conn = this.peer!.connect(code);

    conn.on('open', () => {
      this.connections = [conn];
      // Demander immédiatement une copie complète de la base de données
      conn.send({ type: 'REQUEST_INITIAL_SYNC' });
    });
  });
}
```

### 6.5 `writeToDatabase(table, action, data)` — Logique de routage selon le rôle

C'est la fonction centrale que tous les composants appellent pour modifier des données. Elle s'adapte automatiquement selon le rôle de l'appareil :

```typescript
async writeToDatabase(table: string, action: 'put' | 'delete', data: any) {

  if (this.role === 'client') {
    // Mode CLIENT : envoyer la modification à l'hôte via WebRTC
    const conn = this.connections[0];
    if (conn && conn.open) {
      conn.send({ type: 'DB_WRITE', table, action, data });
    }
    // Note: le client n'écrit PAS localement ! Il attend que l'hôte
    // lui renvoie la mise à jour via DB_SYNC.

  } else {
    // Mode HÔTE ou STANDALONE : écrire directement dans IndexedDB local
    const t = db.table(table);
    if (action === 'put') await t.put(data);
    else if (action === 'delete') await t.delete(data);

    notifySync(); // Alerter les onglets locaux

    // Mode HÔTE seulement : diffuser la mise à jour à tous les clients
    if (this.role === 'host') {
      const allData = await t.where('eventId').equals(data.eventId).toArray();
      this.broadcast({ type: 'DB_SYNC', table, data: allData });
    }
  }
}
```

**Flux complet quand une tablette cliente ajoute un ticket :**
```
Tablette Cliente                    PC Hôte                    Autre Tablette
      |                                 |                              |
      |-- DB_WRITE (nouveau ticket) --->|                              |
      |                                 |-- écrit dans IndexedDB       |
      |                                 |-- DB_SYNC (tous les tickets) -->|
      |                            <-- DB_SYNC (tous les tickets) -----|
      |  (reçoit la mise à jour)        |                (reçoit aussi)|
```

### 6.6 `leaveSession()` — Quitter la session

```typescript
leaveSession() {
  // Fermer toutes les connexions
  this.connections.forEach(conn => conn.close());
  this.connections = [];

  // Détruire le Peer PeerJS
  if (this.peer) { this.peer.destroy(); this.peer = null; }

  // Retourner au mode autonome
  this.role = 'standalone';
  this.sessionId = '';

  // Supprimer les infos de reconnexion
  localStorage.removeItem('insertech_net_role');
  localStorage.removeItem('insertech_net_session_code');
  localStorage.removeItem('insertech_net_event_id');

  // Arrêter les annonces MQTT
  this.stopMqttDiscovery();
}
```

### 6.7 `startSessionsSearch()` / `stopSessionsSearch()` — Découverte de sessions

Ces fonctions utilisent MQTT pour trouver automatiquement les sessions actives sur le réseau. La tablette s'abonne à un topic MQTT et écoute les annonces de l'hôte.

```typescript
// L'hôte publie toutes les 5 secondes :
{
  "code": "INS-4287-A3F2",
  "name": "Réparothon Rosemont 2025",
  "type": "reparothon",
  "lastSeen": 1728950400000
}

// La tablette reçoit ces annonces et les affiche dans une liste
// cliquable pour rejoindre sans taper le code manuellement.
```

### 6.8 `sendChronoAction(action)` — Synchroniser les chronos

```typescript
sendChronoAction(action: SyncMessage) {
  if (this.role === 'standalone') {
    // En autonome : appliquer seulement en local
    this.applyChronoAction(action);
  } else {
    // En réseau : appliquer localement ET diffuser à tous
    this.applyChronoAction(action);
    this.broadcast({ type: 'CHRONO_ACTION', message: action });
  }
}
```

### 6.9 Auto-reconnexion au rechargement

Si la page se recharge accidentellement (F5 ou crash de navigateur), l'application relit le `localStorage` pour savoir si elle était en session réseau :

```typescript
// Dans App.tsx, lors du démarrage (initApp) :
const savedRole = localStorage.getItem('insertech_net_role');
const savedCode = localStorage.getItem('insertech_net_session_code');
const savedEventId = localStorage.getItem('insertech_net_event_id');

if (savedRole === 'host' && savedCode && savedEventId) {
  // Relancer la session hôte avec le même code
  await networkManager.startHost(savedEventId, savedCode);
} else if (savedRole === 'client' && savedCode && savedEventId) {
  // Se reconnecter automatiquement à la session
  await networkManager.joinSession(savedCode, savedEventId);
}
```

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

### 7.9 `handleStartHost()` / `handleJoinSession()` / `handleLeaveSession()`

Ces fonctions font le pont entre l'interface utilisateur et le `networkManager` :

```typescript
async function handleStartHost() {
  if (!activeEvent) return;
  const code = await networkManager.startHost(activeEvent.id);
  setSessionCode(code);
  setNetworkStatus('En ligne (Hôte)');
}

async function handleJoinSession(code: string) {
  if (!activeEvent) return;
  await networkManager.joinSession(code, activeEvent.id);
  setNetworkStatus('Connecté au PC Principal');
}

function handleLeaveSession() {
  networkManager.leaveSession();
  setSessionCode('');
  setNetworkStatus('Local uniquement');
}
```

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
3. **Connexion réseau** : boutons pour rejoindre une session existante ou en créer une nouvelle

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

#### Option B : Exécutable portable Windows x64 (.NET 7 avec icône et zéro permission)
```bash
npm run build:exe
```
Cela génère l'exécutable portable `InsertechEvenements.exe` à la racine, prêt à l'emploi avec icône intégrée, sans installation et sans alerte de sécurité.

#### Option C : Exécutable portable Linux Debian x64 (.NET 7 ELF autonome)
```bash
npm run build:linux
```
Cela génère le binaire portable `InsertechEvenements-linux-x64` à la racine (idéal pour les *Install Fest Linux* ou les postes sous Debian/Ubuntu/Mint). Au premier lancement (`./InsertechEvenements-linux-x64`), il extrait automatiquement le logo du chapiteau magique et enregistre un raccourci Freedesktop (`~/.local/share/applications/insertech-evenements.desktop`) sans demander de mot de passe administrateur (`sudo`).

Pour compiler simultanément les versions **Web + Windows + Linux Debian** :
```bash
npm run build:all
```

#### Option D : Intégration Continue & Déploiement Continu (CI / CD)
Un pipeline GitHub Actions (`.github/workflows/ci-cd.yml`) valide automatiquement chaque **Pull Request (PR)** et compile les exécutables Windows et Linux Debian à chaque `push` sur la branche principale :
- **CI** : Vérification des types TypeScript (`npm run lint`) et test du bundle.
- **Artifacts** : Téléchargement automatique de `InsertechEvenements.exe`, `InsertechEvenements-linux-x64.tar.gz` et `dist/index.html` depuis l'onglet Actions de GitHub.
- **CD / Releases** : Création automatique d'une release officielle dès qu'un tag `v*` est poussé.

> [!TIP]
> Les fichiers `InsertechEvenements.exe`, `InsertechEvenements-linux-x64` ou `dist/index.html` peuvent être copiés sur une clé USB et ouverts directement, sans installer quoi que ce soit.


### Étape 2 : PC Hôte — Créer la session

1. Ouvrir `dist/index.html` dans **Google Chrome** sur le PC principal de l'animateur
2. Créer un nouvel événement (choisir le type, entrer le nom, la date, le lieu)
3. Cliquer sur **"Réseau"** dans l'en-tête
4. Cliquer sur **"Créer la session"**
5. Un code s'affiche (ex: `INS-4287-A3F2`). Le noter ou le montrer aux tablettes.

> [!IMPORTANT]
> Le PC hôte doit rester **allumé et le navigateur ouvert** pendant tout l'événement. Il est la source de vérité. Si le PC hôte se ferme, les données sont préservées localement, mais les tablettes clientes ne peuvent plus synchroniser.

### Étape 3 : Tablettes clientes — Rejoindre la session

1. Ouvrir `dist/index.html` dans **Google Chrome** sur chaque tablette
2. Créer le même événement avec les mêmes infos OU utiliser "Rejoindre une session" depuis l'accueil
3. Cliquer sur **"Réseau"**
4. Entrer le code de session (ex: `INS-4287-A3F2`) ou cliquer sur la session détectée automatiquement
5. La tablette télécharge automatiquement toutes les données du PC hôte

> [!NOTE]
> Toutes les tablettes et le PC hôte doivent être sur le **même réseau Wi-Fi**. Ils n'ont pas besoin d'accès à Internet, mais ils ont besoin de se voir entre eux.

### Étape 4 : Pendant l'événement

- Les **tablettes d'accueil** ajoutent les tickets au fur et à mesure que les visiteurs arrivent
- Le **PC hôte** peut ouvrir l'onglet "Écran Public" sur un deuxième moniteur pour l'afficher aux visiteurs
- Les **techniciens** peuvent voir leur tableau de bord sur leur propre tablette
- Toutes les modifications sont synchronisées en temps réel sur tous les appareils

### Étape 5 : Export final

À la fin de l'événement :
1. Sur le **PC hôte**, cliquer sur **"Exporter"** dans l'en-tête
2. Choisir le format : **Excel** pour un tableau, **JSON** pour une sauvegarde complète
3. Télécharger et conserver le fichier

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
| `peerjs` | ^1.5.5 | Connexions WebRTC P2P entre appareils |
| `chart.js` | ^4.4.1 | Moteur de graphiques (Doughnut, Bar) |
| `react-chartjs-2` | ^5.3.0 | Composants React pour Chart.js |
| `canvas-confetti` | ^1.9.4 | Animation de confettis lors des célébrations |
| `lucide-react` | ^0.546.0 | Bibliothèque d'icônes SVG |
| `motion` | ^12.23.24 | Animations fluides (Framer Motion v12) |
| `xlsx` | ^0.18.5 | Lecture et écriture de fichiers Excel (.xlsx) |
| `vite` | ^6.2.3 | Bundler et serveur de développement |
| `@tailwindcss/vite` | ^4.1.14 | Plugin Tailwind CSS pour Vite |

### 20.2 Dépendances de développement

| Bibliothèque | Version | Rôle |
|---|---|---|
| `typescript` | ~5.8.2 | Langage TypeScript avec vérification de types |
| `@types/react` | ^19.0.10 | Types TypeScript pour React |
| `@types/react-dom` | ^19.0.4 | Types TypeScript pour ReactDOM |
| `@types/canvas-confetti` | ^1.9.0 | Types TypeScript pour canvas-confetti |
| `@types/node` | ^22.14.0 | Types TypeScript pour les APIs Node.js |
| `@vitejs/plugin-react` | ^5.0.4 | Plugin Vite pour le JSX React (Fast Refresh) |
| `autoprefixer` | ^10.4.21 | Ajoute les préfixes CSS cross-navigateurs automatiquement |
| `tailwindcss` | ^4.1.14 | Framework CSS utilitaire |
| `vite-plugin-singlefile` | ^2.3.3 | **Clé** : compile tout en un seul fichier HTML autonome |

---

## 21. FAQ

### ❓ L'application fonctionne-t-elle sans Internet ?

**Oui, totalement.** Une fois le fichier `dist/index.html` ouvert dans Chrome, aucune connexion Internet n'est requise pour utiliser les fonctionnalités de base (créer des tickets, gérer des techniciens, voir les statistiques). Seule la fonctionnalité réseau P2P (synchronisation entre appareils) nécessite une connexion réseau **locale** (Wi-Fi entre les appareils), mais pas Internet.

> [!NOTE]
> La découverte automatique de sessions via MQTT utilise un serveur public gratuit. Si vous êtes totalement hors ligne (pas de Wi-Fi du tout), entrez le code de session manuellement. Les deux PC doivent quand même se voir sur le réseau local.

---

### ❓ Qu'est-ce qui se passe si je recharge la page accidentellement ?

Pas de panique ! L'application mémorise dans le `localStorage` :
- L'ID de l'événement actif (`insertech_active_event_id`)
- Le rôle réseau (`insertech_net_role`)
- Le code de session (`insertech_net_session_code`)

Au rechargement, l'application restaure automatiquement l'état et se reconnecte à la session si possible.

---

### ❓ Les données sont-elles perdues si je ferme Chrome ?

**Non.** Les données sont stockées dans IndexedDB, une base de données persistante du navigateur. Elles survivent aux fermetures de navigateur, aux redémarrages de l'ordinateur, et même aux mises à jour de Chrome.

> [!WARNING]
> Attention : si tu utilises le mode **Navigation privée** (incognito) de Chrome, les données IndexedDB sont effacées dès que tu fermes la fenêtre privée.

---

### ❓ Combien de tablettes peut-on connecter simultanément ?

Techniquement, il n'y a pas de limite fixe. PeerJS supporte plusieurs connexions simultanées. En pratique, nous recommandons un maximum de **10 tablettes** pour maintenir de bonnes performances de synchronisation. Plus il y a de tablettes, plus l'hôte doit diffuser de messages.

---

### ❓ Peut-on utiliser l'application sur un iPad ou un téléphone Android ?

**Oui, avec Chrome ou Safari.** L'application est conçue pour les tablettes et les smartphones modernes. Cependant :
- Chrome est fortement recommandé pour la meilleure compatibilité WebRTC
- Safari sur iOS supporte aussi WebRTC depuis iOS 15
- Pour une expérience optimale sur tablette, utiliser l'orientation **paysage**

---

### ❓ Comment exporter les données à la fin d'un événement ?

1. Dans l'en-tête du tableau de bord, cliquer sur le bouton **"Exporter"**
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

Les tablettes clientes continuent de fonctionner en mode **standalone** : elles peuvent afficher les données qu'elles ont reçues, mais ne peuvent plus synchroniser les nouvelles modifications.

Quand la connexion est rétablie et que les tablettes se reconnectent au PC hôte, elles reçoivent automatiquement un `INITIAL_SYNC` qui les remet à jour avec les données les plus récentes du PC hôte. **Les modifications faites sur les tablettes pendant la déconnexion seront perdues** (elles ne peuvent pas être envoyées à l'hôte qui n'est plus là).

> [!CAUTION]
> Pour éviter la perte de données pendant une déconnexion réseau, il est recommandé de **centraliser les saisies sur le PC hôte** si un problème réseau est anticipated. Les tablettes servent principalement à l'affichage des informations dans ce cas.

---

*Tableau de bords événementiel — Insertech · Documentation v1.0.0 · Rédigée en juillet 2026*
