import { db, onDatabaseMutation } from '../db';

// Sauvegarde persistante SQLite, hors du navigateur :
// - PC (exe Windows, Linux) : le lanceur garde un petit serveur sur 127.0.0.1 qui écrit insertech.db dans le
//   profil de l'utilisateur ; il passe son port et sa clé dans l'adresse de la page (?stockage=…&cle=…) ;
// - tablette Android (APK) : l'application expose window.InsertechStockage, qui écrit dans sa base SQLite privée.
// La base du navigateur (IndexedDB) reste la copie de travail ; SQLite en garde un double que le navigateur ne
// peut pas effacer, recopié 1,5 s après chaque changement et relu au démarrage si la base du navigateur est vide.

export type SqliteBackupStatus = 'unavailable' | 'pending' | 'ok' | 'error';

const TABLES = ['events', 'tickets', 'technicians', 'participants', 'attendees'] as const;
const PARAMS_KEY = 'insertech_stockage';
const FLUSH_DELAY_MS = 1500;
const RETRY_MS = 10000;
const PING_MS = 30000;

type Snapshot = { savedAt?: number; tables: Partial<Record<(typeof TABLES)[number], any[]>> };

interface Backend {
  kind: 'pc' | 'android';
  save(body: string): Promise<{ ok: boolean; status: number }>;
  load(): Promise<Snapshot | null>;
  ping(): Promise<boolean>;
}

function httpBackend(port: string, key: string): Backend {
  const base = `http://127.0.0.1:${encodeURIComponent(port)}`;
  const q = `cle=${encodeURIComponent(key)}`;
  return {
    kind: 'pc',
    // text/plain : requête simple, sans prévol CORS
    async save(body) {
      const res = await fetch(`${base}/snapshot?${q}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
      return { ok: res.ok, status: res.status };
    },
    async load() {
      const res = await fetch(`${base}/snapshot?${q}`, { cache: 'no-store' });
      return res.ok ? res.json() : null;
    },
    async ping() {
      try {
        return (await fetch(`${base}/ping?${q}`, { cache: 'no-store' })).ok;
      } catch (e) {
        return false;
      }
    }
  };
}

function androidBackend(bridge: any): Backend {
  return {
    kind: 'android',
    async save(body) {
      const res = JSON.parse(bridge.save(body));
      return { ok: res.ok === true, status: res.ok ? 200 : res.error === 'vide' ? 409 : 500 };
    },
    async load() {
      return JSON.parse(bridge.load());
    },
    async ping() {
      return true;
    }
  };
}

function detectBackend(): Backend | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as any).InsertechStockage;
  if (bridge && typeof bridge.save === 'function') return androidBackend(bridge);
  try {
    const params = new URLSearchParams(window.location.search);
    let port = params.get('stockage');
    let key = params.get('cle');
    if (port && key) sessionStorage.setItem(PARAMS_KEY, JSON.stringify({ port, key }));
    else {
      const saved = JSON.parse(sessionStorage.getItem(PARAMS_KEY) || 'null');
      port = saved?.port ?? null;
      key = saved?.key ?? null;
    }
    if (port && key) return httpBackend(port, key);
  } catch (e) {
    // Paramètres illisibles : pas de sauvegarde SQLite
  }
  return null;
}

const backend = detectBackend();
let status: SqliteBackupStatus = backend ? 'pending' : 'unavailable';
let lastSavedAt: number | null = null;
const statusListeners = new Set<(s: SqliteBackupStatus, at: number | null) => void>();

function setStatus(next: SqliteBackupStatus) {
  status = next;
  statusListeners.forEach((cb) => cb(status, lastSavedAt));
}

export function getSqliteBackupStatus() {
  return { status, lastSavedAt, kind: backend?.kind ?? null };
}

export function onSqliteBackupStatus(cb: (s: SqliteBackupStatus, at: number | null) => void): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

// Démarrage : si la base du navigateur a été vidée (nettoyage, quota, réinstallation), la remplir depuis SQLite.
// Renvoie le nombre d'activités restaurées.
// Vrai seulement quand la comparaison avec SQLite a réussi : une base vide ne peut alors venir que d'une
// suppression voulue. Sinon (sauvegarde injoignable au démarrage), un envoi vide est refusé par SQLite.
let startupChecked = false;

export async function restoreFromSqliteIfEmpty(): Promise<number> {
  if (!backend) return 0;
  try {
    if ((await db.events.count()) > 0) {
      startupChecked = true;
      return 0;
    }
    const snapshot = await backend.load();
    if (!snapshot) return 0;
    const events = snapshot.tables?.events ?? [];
    if (events.length === 0) {
      startupChecked = true;
      return 0;
    }
    await db.transaction('rw', [db.events, db.tickets, db.technicians, db.participants, db.attendees], async () => {
      for (const name of TABLES) {
        const rows = snapshot!.tables[name];
        if (Array.isArray(rows) && rows.length > 0) await db.table(name).bulkPut(rows);
      }
    });
    startupChecked = true;
    return events.length;
  } catch (e) {
    console.warn('Lecture de la sauvegarde SQLite impossible :', e);
    return 0;
  }
}

let started = false;
let flushTimer: any = null;
let flushing = false;
let dirtyWhileFlushing = false;

async function flush() {
  flushTimer = null;
  if (!backend) return;
  if (flushing) {
    dirtyWhileFlushing = true;
    return;
  }
  flushing = true;
  dirtyWhileFlushing = false;
  try {
    const tables: Snapshot['tables'] = {};
    for (const name of TABLES) tables[name] = await db.table(name).toArray();
    const savedAt = Date.now();
    const res = await backend.save(JSON.stringify({ version: 1, savedAt, allowEmpty: startupChecked, tables }));
    if (res.ok) {
      lastSavedAt = savedAt;
      setStatus('ok');
    } else if (res.status === 409) {
      // SQLite refuse d'être vidée par une base du navigateur non vérifiée : relire au prochain démarrage
      setStatus('error');
    } else {
      setStatus('error');
      schedule(RETRY_MS);
    }
  } catch (e) {
    setStatus('error');
    schedule(RETRY_MS);
  } finally {
    flushing = false;
    if (dirtyWhileFlushing) schedule(FLUSH_DELAY_MS);
  }
}

function schedule(delay = FLUSH_DELAY_MS) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, delay);
}

// À appeler une fois la restauration de démarrage faite (jamais dans la fenêtre Projecteur)
export function startSqliteBackup() {
  if (!backend || started) return;
  started = true;
  onDatabaseMutation(() => schedule());
  schedule(0);
  // Tant que la page est ouverte, le PC garde le serveur de sauvegarde actif
  setInterval(async () => {
    if (!(await backend.ping()) && status === 'ok') setStatus('error');
    else if (status === 'error') schedule(0);
  }, PING_MS);
  window.addEventListener('pagehide', () => {
    if (flushTimer) flush();
  });
}
