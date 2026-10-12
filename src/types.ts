export type EventType =
  | 'reparothon'
  | 'formation_reparothon'
  | 'fresque_numerique'
  | 'prolonger_vie_ordi'
  | 'kiosque_concours'
  | 'install_fest_linux'
  | 'conference_pollution'
  | 'communaute_pratique';

export interface EventSettings {
  id: string;
  name: string;
  type: EventType;
  date: string;
  location: string;
  partner?: string;
  place?: string;
  extraData?: Record<string, any>; // Pour la flexibilité sans mise à jour de schéma
  tags?: string[];
  createdAt: number;
}

// Types spécifiques au Réparothon
export type TicketStatus =
  | 'en_attente'
  | 'assigne'
  | 'en_cours'
  | 'repare'
  | 'semi_repare'
  | 'non_reparable'
  | 'abandonne';

export type DeviceCategory = 'pc_tour' | 'laptop' | 'cellulaire' | 'tablette' | 'autre';
export type OperatingSystem = 'mac' | 'windows' | 'linux' | 'autre' | 'aucun';

export interface RepairTicket {
  id: string;
  eventId: string;
  visitorName: string;
  visitorEmail?: string;
  objectName: string;
  objectCategory: DeviceCategory;
  operatingSystem: OperatingSystem;
  initialDiagnosis: string;
  status: TicketStatus;
  assignedTechId: string | null;
  assignedTechName: string | null;
  resultRemarks: string;
  weightKg: number; // Pour le bilan carbone / impact écologique
  createdAt: number;
  updatedAt: number;
  extraData?: Record<string, any>;
  tags?: string[];
}

export type TechStatus = 'libre' | 'occupe' | 'en_pause';

export interface Technician {
  id: string;
  eventId: string;
  name: string;
  specialties: string[];
  softwareSpecialties?: string[];
  status: TechStatus;
  currentTicketId: string | null;
  tableNumber?: number | null;
  createdAt: number;
}

export interface PartnerLogo {
  id: string;
  name: string;
  type: string;
  data: string; // Base64 image string
}

// Types spécifiques au Kiosque-concours / Teardown
export interface Participant {
  id: string;
  eventId: string;
  name: string;
  email: string;
  postalCode?: string;
  timeMs: number | null; // null si non terminé / en cours
  registeredAt: number;
  extraData?: Record<string, any>; // Par exemple pour stocker des notes spécifiques, matériel assemblé
  tags?: string[];
}

export interface StopwatchState {
  isRunning: boolean;
  startTime: number | null;
  elapsedBeforeStart: number;
}

// État d'une piste de chronométrage concurrent (jusqu'à 5 pistes)
export interface TrackState {
  trackId: number; // 1 à 5
  participantId: string | null;
  participantName: string | null;
  isRunning: boolean;
  startTime: number | null;
  elapsedBeforeStart: number;
}

export type RaffleStatus = 'idle' | 'spinning' | 'celebrating';

export interface RaffleState {
  status: RaffleStatus;
  winnerId: string | null;
  spinStartTime: number | null;
}

// Types génériques pour les autres activités (Fresque, Conférence, Ateliers, etc.)
export interface GenericAttendee {
  id: string;
  eventId: string;
  name: string;
  email?: string;
  presenceConfirmed: boolean;
  notes?: string;
  feedbackScore?: number; // Note de satisfaction de 1 à 5
  feedbackText?: string;
  registeredAt: number;
  extraData?: Record<string, any>; // Pour des métriques clé-valeur libres
  tags?: string[];
}

// Système de synchronisation local et réseau P2P
export type SyncMessage =
  | { type: 'EVENT_CHANGED'; eventId: string }
  | { type: 'STATE_SYNC'; payload: any }
  | { type: 'TIMER_START'; trackId: number; startTime: number; elapsedBeforeStart: number }
  | { type: 'TIMER_STOP'; trackId: number; elapsed: number }
  | { type: 'TIMER_RESET'; trackId: number }
  | { type: 'RAFFLE_START'; spinStartTime: number; winnerId: string }
  | { type: 'RAFFLE_RESET' }
  | { type: 'DB_UPDATE'; timestamp: number }
  | { type: 'PEER_CELEBRATION'; payload: any }
  | { type: 'TRACK_ASSIGN'; trackId: number; participantId: string | null; participantName: string | null }
  | { type: 'TRACKS_STATE_SYNC'; tracks: Record<number, TrackState> };

// Sauvegarde automatique locale (Snapshots d'urgence et périodiques)
export interface BackupSnapshot {
  id: string;
  eventId: string;
  timestamp: number;
  data: {
    event: EventSettings;
    tickets: RepairTicket[];
    technicians: Technician[];
    participants: Participant[];
    attendees: GenericAttendee[];
  };
}
