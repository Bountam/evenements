import Dexie, { type Table } from 'dexie';
import { EventSettings, RepairTicket, Technician, Participant, GenericAttendee, BackupSnapshot } from './types';

// Nom du canal de communication inter-onglets
const SYNC_CHANNEL_NAME = 'insertech_db_sync_channel';
const channel = typeof window !== 'undefined' ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;

// Liste des callbacks locaux de l'onglet courant
const localListeners = new Set<() => void>();

// Régulation de synchronisation (Debounce 50ms) pour éliminer les tempêtes d'événements
let notifyDebounceTimer: any = null;

export function notifySync(immediate = false) {
  if (immediate) {
    if (notifyDebounceTimer) {
      clearTimeout(notifyDebounceTimer);
      notifyDebounceTimer = null;
    }
    dispatchSync();
    return;
  }

  if (notifyDebounceTimer) clearTimeout(notifyDebounceTimer);
  notifyDebounceTimer = setTimeout(() => {
    dispatchSync();
    notifyDebounceTimer = null;
  }, 50);
}

function dispatchSync() {
  localListeners.forEach(callback => {
    try {
      callback();
    } catch (e) {
      console.error('Erreur callback local sync:', e);
    }
  });

  if (channel) {
    channel.postMessage({ type: 'DB_UPDATE', timestamp: Date.now() });
  }
}

// Enregistrer un écouteur de synchronisation local et inter-onglets
export function registerSyncListener(callback: () => void): () => void {
  localListeners.add(callback);

  const handler = (event: MessageEvent) => {
    if (event.data && event.data.type === 'DB_UPDATE') {
      callback();
    }
  };

  if (channel) {
    channel.addEventListener('message', handler);
  }

  return () => {
    localListeners.delete(callback);
    if (channel) {
      channel.removeEventListener('message', handler);
    }
  };
}

class InsertechDatabase extends Dexie {
  events!: Table<EventSettings>;
  tickets!: Table<RepairTicket>;
  technicians!: Table<Technician>;
  participants!: Table<Participant>; // Pour le Kiosque-concours / Teardown
  attendees!: Table<GenericAttendee>; // Pour les autres types d'activités (fresque, ateliers, etc.)
  snapshots!: Table<BackupSnapshot>;  // Sauvegardes de secours automatiques

  constructor() {
    super('insertech_events_db');
    
    // Définition de la version 1 d'IndexedDB
    this.version(1).stores({
      events: 'id, name, type, date',
      tickets: 'id, eventId, status, visitorName, assignedTechId',
      technicians: 'id, eventId, name, status',
      participants: 'id, eventId, name, email, timeMs, registeredAt',
      attendees: 'id, eventId, name, presenceConfirmed, registeredAt',
      snapshots: 'id, eventId, timestamp'
    });
  }
}

export const db = new InsertechDatabase();

// Fonction pour vider complètement la base de données locale
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [db.events, db.tickets, db.technicians, db.participants, db.attendees, db.snapshots], async () => {
    await db.events.clear();
    await db.tickets.clear();
    await db.technicians.clear();
    await db.participants.clear();
    await db.attendees.clear();
    await db.snapshots.clear();
  });
  notifySync(true);
}

// Fonction pour ensemencer des données de test réalistes pour une matrice choisie
export async function seedDemoData(eventId: string, type: string): Promise<void> {
  const now = Date.now();

  await db.transaction('rw', [db.tickets, db.technicians, db.participants, db.attendees], async () => {
    if (type === 'reparothon') {
      // Insertion de techniciens
      const techs: Technician[] = [
        { id: 't1', eventId, name: 'Alexandre Tremblay', specialties: ['laptop', 'pc_tour'], status: 'libre', currentTicketId: null, createdAt: now },
        { id: 't2', eventId, name: 'Chloé Dubé', specialties: ['cellulaire', 'tablette'], status: 'occupe', currentTicketId: 'ticket-2', createdAt: now },
        { id: 't3', eventId, name: 'Gabriel Roy', specialties: ['laptop', 'linux'], status: 'libre', currentTicketId: null, createdAt: now }
      ];
      await db.technicians.bulkPut(techs);

      // Insertion de tickets de réparation
      const tickets: RepairTicket[] = [
        {
          id: 'ticket-1',
          eventId,
          visitorName: 'Sophie Girard',
          visitorEmail: 'sophie.g@email.com',
          objectName: 'ThinkPad T480',
          objectCategory: 'laptop',
          operatingSystem: 'windows',
          initialDiagnosis: 'Batterie se décharge trop rapidement et Windows est très lent.',
          status: 'repare',
          assignedTechId: 't1',
          assignedTechName: 'Alexandre Tremblay',
          resultRemarks: 'Nettoyage des ventilateurs, désinstallation des bloatwares et calibration de la batterie. Fonctionne à merveille !',
          weightKg: 1.6,
          createdAt: now - 3600000 * 2,
          updatedAt: now - 3600000
        },
        {
          id: 'ticket-2',
          eventId,
          visitorName: 'Marc-André Fortin',
          objectName: 'iPhone XR',
          objectCategory: 'cellulaire',
          operatingSystem: 'autre',
          initialDiagnosis: 'Écran fissuré et tactile capricieux.',
          status: 'en_cours',
          assignedTechId: 't2',
          assignedTechName: 'Chloé Dubé',
          resultRemarks: '',
          weightKg: 0.2,
          createdAt: now - 1800000,
          updatedAt: now
        },
        {
          id: 'ticket-3',
          eventId,
          visitorName: 'Léa Bouchard',
          objectName: 'PC Asus K53U',
          objectCategory: 'laptop',
          operatingSystem: 'windows',
          initialDiagnosis: 'Impossible de démarrer, écran bleu après mise à jour.',
          status: 'en_attente',
          assignedTechId: null,
          assignedTechName: null,
          resultRemarks: '',
          weightKg: 2.1,
          createdAt: now - 900000,
          updatedAt: now - 900000
        }
      ];
      await db.tickets.bulkPut(tickets);
    } else if (type === 'kiosque_concours') {
      // Insertion de participants au concours d'assemblage
      const participants: Participant[] = [
        { id: 'p1', eventId, name: 'Sébastien Lavoie', email: 'seb@lavoie.net', postalCode: 'H2W 1Y4', timeMs: 142350, registeredAt: now - 3600000 * 3 },
        { id: 'p2', eventId, name: 'Nadia Pelletier', email: 'nadia.p@gmail.com', postalCode: 'J3Y 2Z8', timeMs: 168900, registeredAt: now - 3600000 * 2.5 },
        { id: 'p3', eventId, name: 'Étienne Gagnon', email: 'etienne@gagnon.co', postalCode: 'G1K 7P4', timeMs: 118400, registeredAt: now - 3600000 * 2 },
        { id: 'p4', eventId, name: 'Camille Roy', email: 'camille.roy@videotron.ca', postalCode: 'H3C 1P8', timeMs: null, registeredAt: now - 1800000 }
      ];
      await db.participants.bulkPut(participants);
    } else {
      // Données génériques pour les autres types d'événements
      const attendees: GenericAttendee[] = [
        { id: 'a1', eventId, name: 'Jean-Pierre Côté', email: 'jp.cote@bureau.ca', presenceConfirmed: true, feedbackScore: 5, feedbackText: 'Excellent atelier, j\'ai appris beaucoup de choses concrètes.', registeredAt: now - 7200000 },
        { id: 'a2', eventId, name: 'Isabelle Tremblay', email: 'isabelle.t@sympatico.ca', presenceConfirmed: true, feedbackScore: 4, feedbackText: 'Très intéressant, explications très claires.', registeredAt: now - 5400000 },
        { id: 'a3', eventId, name: 'Mathieu Roy', email: 'mathieu.roy@outlook.com', presenceConfirmed: false, registeredAt: now - 3600000 },
        { id: 'a4', eventId, name: 'Valérie Dubé', email: 'valerie.dube@gmail.com', presenceConfirmed: true, feedbackScore: 5, registeredAt: now - 1800000 }
      ];
      await db.attendees.bulkPut(attendees);
    }
  });

  notifySync();
}

// Enregistrer un snapshot de sécurité automatique (garde les 3 plus récents pour cet événement)
export async function saveAutoSnapshot(eventId: string): Promise<BackupSnapshot | null> {
  try {
    const event = await db.events.get(eventId);
    if (!event) return null;

    const tickets = await db.tickets.where('eventId').equals(eventId).toArray();
    const technicians = await db.technicians.where('eventId').equals(eventId).toArray();
    const participants = await db.participants.where('eventId').equals(eventId).toArray();
    const attendees = await db.attendees.where('eventId').equals(eventId).toArray();

    const snapshotId = `snap-${eventId}-${Date.now()}`;
    const snapshot: BackupSnapshot = {
      id: snapshotId,
      eventId,
      timestamp: Date.now(),
      data: {
        event,
        tickets,
        technicians,
        participants,
        attendees
      }
    };

    await db.snapshots.put(snapshot);

    // Conserver strictement les 3 snapshots les plus récents
    const allSnaps = await db.snapshots.where('eventId').equals(eventId).toArray();
    if (allSnaps.length > 3) {
      allSnaps.sort((a, b) => b.timestamp - a.timestamp);
      const toDelete = allSnaps.slice(3);
      for (const s of toDelete) {
        await db.snapshots.delete(s.id);
      }
    }

    return snapshot;
  } catch (err) {
    console.warn("Échec de la sauvegarde automatique locale (snapshot) :", err);
    return null;
  }
}

// Récupérer les snapshots récents d'un événement
export async function getLatestSnapshots(eventId: string): Promise<BackupSnapshot[]> {
  try {
    const snaps = await db.snapshots.where('eventId').equals(eventId).toArray();
    return snaps.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.error("Erreur lecture snapshots :", err);
    return [];
  }
}
