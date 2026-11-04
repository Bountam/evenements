import type { EventSettings } from '../types';
import { isAndroidApp } from '../native/android';

// Rôle de l'appareil, modes d'usage des tablettes et code de déverrouillage à 4 chiffres.
// - Le PC est l'hôte : il crée les activités et règle le code.
// - Une tablette (application Android) rejoint l'activité du PC, choisit un mode et peut le verrouiller.

export type DeviceRole = 'hote' | 'tablette';
export type ModeUsage = 'animateur' | 'ecran_public' | 'kiosque_formulaire';

// Empreinte du code : jamais le code en clair, ni dans l'activité ni sur la tablette
export interface PinLock {
  sel: string;
  empreinte: string;
}

export const MODE_STORAGE_KEY = 'insertech_mode_usage';
export const LOCK_STORAGE_KEY = 'insertech_mode_verrouille';
export const PIN_COPY_STORAGE_KEY = 'insertech_mode_code_copie';
export const ATTEMPTS_STORAGE_KEY = 'insertech_mode_essais';

export const MODES: ModeUsage[] = ['animateur', 'ecran_public', 'kiosque_formulaire'];

export const MODE_LABELS: Record<ModeUsage, string> = {
  animateur: 'Animateur',
  ecran_public: 'Écran public',
  kiosque_formulaire: 'Kiosque formulaire'
};

export const NO_PIN_MESSAGE = "Définissez un code dans l'administration du PC";

export function getDeviceRole(): DeviceRole {
  return isAndroidApp() ? 'tablette' : 'hote';
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : le réglage ne survivra pas au redémarrage, sans bloquer l'appli
  }
}

export function readSavedMode(): ModeUsage | null {
  const saved = readStorage(MODE_STORAGE_KEY);
  return MODES.includes(saved as ModeUsage) ? (saved as ModeUsage) : null;
}

export function saveMode(mode: ModeUsage | null) {
  writeStorage(MODE_STORAGE_KEY, mode);
}

export function readLocked(): boolean {
  return readStorage(LOCK_STORAGE_KEY) === 'true';
}

export function saveLocked(locked: boolean) {
  writeStorage(LOCK_STORAGE_KEY, locked ? 'true' : null);
}

// Onglet affiché par chaque mode ; animateur garde les onglets de régie de l'activité
export function tabForMode(mode: ModeUsage): string | null {
  if (mode === 'ecran_public') return 'public';
  if (mode === 'kiosque_formulaire') return 'formulaire';
  return null;
}

// --- Code à 4 chiffres ---

export function isValidPin(code: string): boolean {
  return /^\d{4}$/.test(code);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Le chiffrement n'est pas disponible dans ce navigateur.");
  }
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export async function createPinLock(code: string): Promise<PinLock> {
  if (!isValidPin(code)) throw new Error('Le code doit compter exactement 4 chiffres.');
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const sel = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return { sel, empreinte: await sha256Hex(sel + code) };
}

export async function verifyPin(code: string, lock: PinLock): Promise<boolean> {
  if (!isValidPin(code)) return false;
  return (await sha256Hex(lock.sel + code)) === lock.empreinte;
}

function isPinLock(value: unknown): value is PinLock {
  return Boolean(
    value &&
      typeof (value as PinLock).sel === 'string' &&
      typeof (value as PinLock).empreinte === 'string' &&
      (value as PinLock).empreinte.length === 64
  );
}

export function readEventPinLock(event: EventSettings | null | undefined): PinLock | null {
  const lock = event?.extraData?.verrouillage;
  return isPinLock(lock) ? lock : null;
}

// Copie locale du dernier code reçu du PC : la tablette se déverrouille même si le PC n'est plus joignable
export function storePinCopy(lock: PinLock) {
  writeStorage(PIN_COPY_STORAGE_KEY, JSON.stringify(lock));
}

export function readPinCopy(): PinLock | null {
  try {
    const parsed = JSON.parse(readStorage(PIN_COPY_STORAGE_KEY) || 'null');
    return isPinLock(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Le code de l'activité ouverte prime ; sinon la dernière copie reçue
export function getEffectivePinLock(event: EventSettings | null | undefined): PinLock | null {
  return readEventPinLock(event) || readPinCopy();
}

// --- Délais après des erreurs : 3 essais, puis 30 s, doublé à chaque série, plafond 10 min ---

export const MAX_ATTEMPTS_PER_SERIES = 3;
export const FIRST_BLOCK_MS = 30_000;
export const MAX_BLOCK_MS = 10 * 60_000;

interface AttemptsState {
  fails: number; // erreurs dans la série en cours
  series: number; // séries déjà bloquées
  blockedUntil: number;
}

function readAttempts(): AttemptsState {
  try {
    const parsed = JSON.parse(readStorage(ATTEMPTS_STORAGE_KEY) || 'null');
    if (parsed && typeof parsed.fails === 'number' && typeof parsed.series === 'number' && typeof parsed.blockedUntil === 'number') {
      return parsed;
    }
  } catch {
    // Valeur illisible : repartir de zéro
  }
  return { fails: 0, series: 0, blockedUntil: 0 };
}

function saveAttempts(state: AttemptsState) {
  writeStorage(ATTEMPTS_STORAGE_KEY, JSON.stringify(state));
}

export function getBlockRemainingMs(now = Date.now()): number {
  return Math.max(0, readAttempts().blockedUntil - now);
}

export function blockDurationMs(series: number): number {
  return Math.min(MAX_BLOCK_MS, FIRST_BLOCK_MS * 2 ** series);
}

export function registerPinFailure(now = Date.now()): { blockedMs: number; attemptsLeft: number } {
  const state = readAttempts();
  state.fails += 1;
  if (state.fails >= MAX_ATTEMPTS_PER_SERIES) {
    const blockedMs = blockDurationMs(state.series);
    saveAttempts({ fails: 0, series: state.series + 1, blockedUntil: now + blockedMs });
    return { blockedMs, attemptsLeft: 0 };
  }
  saveAttempts(state);
  return { blockedMs: 0, attemptsLeft: MAX_ATTEMPTS_PER_SERIES - state.fails };
}

export function resetPinFailures() {
  writeStorage(ATTEMPTS_STORAGE_KEY, null);
}

export type PinCheckResult =
  | { status: 'ok' }
  | { status: 'wrong'; attemptsLeft: number }
  | { status: 'blocked'; remainingMs: number }
  | { status: 'no_pin' };

export async function checkPin(code: string, lock: PinLock | null, now = Date.now()): Promise<PinCheckResult> {
  if (!lock) return { status: 'no_pin' };
  const remainingMs = getBlockRemainingMs(now);
  if (remainingMs > 0) return { status: 'blocked', remainingMs };
  if (await verifyPin(code, lock)) {
    resetPinFailures();
    return { status: 'ok' };
  }
  const failure = registerPinFailure(now);
  return failure.blockedMs > 0
    ? { status: 'blocked', remainingMs: failure.blockedMs }
    : { status: 'wrong', attemptsLeft: failure.attemptsLeft };
}

export function formatWait(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes} min ${String(seconds).padStart(2, '0')} s` : `${seconds} s`;
}
