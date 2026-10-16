import Dexie, { type Table } from 'dexie';
import { db } from '../db';

// Sauvegarde de secours dans un fichier choisi sur le disque (PC principal), en plus des
// instantanés internes : ceux-ci vivent dans la même base que les données et disparaîtraient avec elle.
// Repose sur l'API File System Access (Edge et Chrome sur ordinateur, sans droits administrateur).

export type FileBackupState = 'unsupported' | 'off' | 'needs-permission' | 'on';

type StoredHandle = { eventId: string; handle: any; fileName: string };

// Base séparée : les poignées de fichier ne passent ni par la synchro réseau ni par les exports
class BackupHandleDatabase extends Dexie {
  handles!: Table<StoredHandle>;
  constructor() {
    super('insertech_backup_file');
    this.version(1).stores({ handles: 'eventId' });
  }
}

const handleDb = new BackupHandleDatabase();

export function isFileBackupSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function';
}

// Contenu identique à « Sauvegarder » en JSON : le fichier se restaure avec « Restaurer une sauvegarde JSON »
export async function buildEventBackup(eventId: string) {
  const [event, tickets, technicians, participants, attendees] = await Promise.all([
    db.events.get(eventId),
    db.tickets.where('eventId').equals(eventId).toArray(),
    db.technicians.where('eventId').equals(eventId).toArray(),
    db.participants.where('eventId').equals(eventId).toArray(),
    db.attendees.where('eventId').equals(eventId).toArray()
  ]);
  return { exportVersion: '1.0', exportedAt: Date.now(), event, tickets, technicians, participants, attendees };
}

async function permissionOf(handle: any, request: boolean): Promise<boolean> {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  return request && (await handle.requestPermission?.(opts)) === 'granted';
}

export async function getFileBackupState(eventId: string): Promise<FileBackupState> {
  if (!isFileBackupSupported()) return 'unsupported';
  try {
    const stored = await handleDb.handles.get(eventId);
    if (!stored) return 'off';
    return (await permissionOf(stored.handle, false)) ? 'on' : 'needs-permission';
  } catch (e) {
    return 'off';
  }
}

export async function getFileBackupName(eventId: string): Promise<string | null> {
  try {
    return (await handleDb.handles.get(eventId))?.fileName ?? null;
  } catch (e) {
    return null;
  }
}

// À appeler depuis un clic : choisir le fichier (première fois) ou réautoriser l'écriture (après redémarrage)
export async function enableFileBackup(eventId: string, suggestedName: string): Promise<FileBackupState> {
  if (!isFileBackupSupported()) return 'unsupported';
  const stored = await handleDb.handles.get(eventId);
  if (stored && (await permissionOf(stored.handle, true))) return 'on';

  const handle = await (window as any).showSaveFilePicker({
    suggestedName,
    types: [{ description: 'Sauvegarde Insertech (JSON)', accept: { 'application/json': ['.json'] } }]
  });
  await handleDb.handles.put({ eventId, handle, fileName: handle.name });
  return 'on';
}

export async function disableFileBackup(eventId: string): Promise<void> {
  await handleDb.handles.delete(eventId);
}

// Réécrire le fichier avec l'état actuel de l'activité ; false si l'écriture n'est plus autorisée
export async function writeFileBackup(eventId: string): Promise<boolean> {
  const stored = await handleDb.handles.get(eventId);
  if (!stored || !(await permissionOf(stored.handle, false))) return false;
  const payload = await buildEventBackup(eventId);
  if (!payload.event) return false;
  const writable = await stored.handle.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
  return true;
}

// Demander au navigateur de ne pas effacer la base locale quand l'espace disque manque
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (e) {
    return false;
  }
}
