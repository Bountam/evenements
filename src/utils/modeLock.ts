import type { EventSettings, WorkRole } from '../types';
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
  // true quand l'administrateur a choisi son propre code (absent = code par défaut)
  custom?: boolean;
}

export const MODE_STORAGE_KEY = 'insertech_mode_usage';
export const LOCK_STORAGE_KEY = 'insertech_mode_verrouille';
export const PIN_COPY_STORAGE_KEY = 'insertech_mode_code_copie';
export const ATTEMPTS_STORAGE_KEY = 'insertech_mode_essais';
export const LANDSCAPE_STORAGE_KEY = 'insertech_bloquer_paysage';

export const MODES: ModeUsage[] = ['animateur', 'ecran_public', 'kiosque_formulaire'];

export const MODE_LABELS: Record<ModeUsage, string> = {
  animateur: 'Animateur',
  ecran_public: 'Écran public',
  kiosque_formulaire: 'Kiosque formulaire'
};

export const DEFAULT_PIN_CODE = '0000';
// Le code par défaut n'est jamais affiché sur une tablette ni sur un écran public
export const NO_PIN_MESSAGE = 'Demandez le code à un administrateur.';

export async function createDefaultPinLock(): Promise<PinLock> {
  return createPinLock(DEFAULT_PIN_CODE, false);
}

export function isCustomPinLock(lock: PinLock | null | undefined): boolean {
  return Boolean(lock?.custom);
}

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

export function readLandscapeLock(): boolean {
  return readStorage(LANDSCAPE_STORAGE_KEY) === 'true';
}

export function saveLandscapeLock(locked: boolean) {
  writeStorage(LANDSCAPE_STORAGE_KEY, locked ? 'true' : null);
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

export async function createPinLock(code: string, custom = true): Promise<PinLock> {
  if (!isValidPin(code)) throw new Error('Le code doit compter exactement 4 chiffres.');
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const sel = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const lock: PinLock = { sel, empreinte: await sha256Hex(sel + code) };
  if (custom) lock.custom = true;
  return lock;
}

// Vérifie le code contre un verrou ; sans verrou, seul le code par défaut est accepté
export async function matchesPin(code: string, lock: PinLock | null): Promise<boolean> {
  return lock ? verifyPin(code, lock) : code === DEFAULT_PIN_CODE;
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

// Compteur d'essais tenu en mémoire (le PC hôte en garde un par tablette), mêmes délais que la tablette
export class PinAttemptTracker {
  private state = new Map<string, AttemptsState>();

  remainingMs(key: string, now = Date.now()): number {
    return Math.max(0, (this.state.get(key)?.blockedUntil ?? 0) - now);
  }

  fail(key: string, now = Date.now()): { blockedMs: number; attemptsLeft: number } {
    const s = this.state.get(key) ?? { fails: 0, series: 0, blockedUntil: 0 };
    s.fails += 1;
    if (s.fails >= MAX_ATTEMPTS_PER_SERIES) {
      const blockedMs = blockDurationMs(s.series);
      this.state.set(key, { fails: 0, series: s.series + 1, blockedUntil: now + blockedMs });
      return { blockedMs, attemptsLeft: 0 };
    }
    this.state.set(key, s);
    return { blockedMs: 0, attemptsLeft: MAX_ATTEMPTS_PER_SERIES - s.fails };
  }

  reset(key: string) {
    this.state.delete(key);
  }
}

// Enregistre localement l'état du blocage annoncé par le PC, pour que le compte à rebours s'affiche
export function applyRemoteBlock(remainingMs: number, now = Date.now()) {
  const state = readAttempts();
  saveAttempts({ fails: 0, series: state.series, blockedUntil: now + Math.max(0, remainingMs) });
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
  const remainingMs = getBlockRemainingMs(now);
  if (remainingMs > 0) return { status: 'blocked', remainingMs };
  const ok = await matchesPin(code, lock);
  if (ok) {
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

// --- Rôles terrain & anonymisation Loi 25 ---

export const WORK_ROLE_STORAGE_KEY = 'insertech_work_role';
export const MOBILE_ONBOARDED_KEY = 'insertech_mobile_onboarded';
export const MOBILE_VOLUNTEER_NAME_KEY = 'insertech_mobile_volunteer_name';
export const MOBILE_TECH_ID_KEY = 'insertech_mobile_tech_id';
export const JUDGE_DEVICE_ID_KEY = 'insertech_judge_device_id';

export const WORK_ROLES: WorkRole[] = [
  'admin',
  'accueil',
  'reparateur',
  'assistant',
  'formateur',
  'juge',
  'kiosque_formulaire',
  'ecran_public'
];

export const WORK_ROLE_LABELS: Record<WorkRole, string> = {
  admin: 'Administrateur',
  accueil: "Animateur d'Accueil",
  reparateur: 'Animateur Réparateur',
  assistant: 'Animateur Assistant',
  formateur: 'Formateur',
  juge: 'Animateur Juge',
  kiosque_formulaire: "Kiosque d'inscription",
  ecran_public: 'Écran Public'
};

// Seul le Kiosque d'inscription peut être verrouillé sur mobile/tablette
export function canLockWorkRole(role: WorkRole): boolean {
  return role === 'kiosque_formulaire';
}

export function getOrCreateJudgeDeviceId(): string {
  const existing = readStorage(JUDGE_DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `juge-${Math.random().toString(36).substring(2, 10)}`;
  writeStorage(JUDGE_DEVICE_ID_KEY, created);
  return created;
}

export function readMobileVolunteerName(): string {
  return readStorage(MOBILE_VOLUNTEER_NAME_KEY) || '';
}

export function saveMobileVolunteerName(name: string) {
  writeStorage(MOBILE_VOLUNTEER_NAME_KEY, name.trim() || null);
}

export function readMobileTechId(): string {
  return readStorage(MOBILE_TECH_ID_KEY) || '';
}

export function saveMobileTechId(techId: string) {
  writeStorage(MOBILE_TECH_ID_KEY, techId.trim() || null);
}

export function readMobileOnboarded(): boolean {
  return readStorage(MOBILE_ONBOARDED_KEY) === 'true';
}

export function saveMobileOnboarded(done: boolean) {
  writeStorage(MOBILE_ONBOARDED_KEY, done ? 'true' : null);
}

export function readSavedWorkRole(defaultRole: WorkRole = 'admin'): WorkRole {
  const saved = readStorage(WORK_ROLE_STORAGE_KEY);
  return WORK_ROLES.includes(saved as WorkRole) ? (saved as WorkRole) : defaultRole;
}

export function saveWorkRole(role: WorkRole) {
  writeStorage(WORK_ROLE_STORAGE_KEY, role);
}

// Loi 25 : sur l'Écran Public, n'afficher que le prénom et l'initiale du nom de famille (« Sophie C. »)
export function formatPublicShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Visiteur';
  if (parts.length === 1) return parts[0];
  const initial = parts[parts.length - 1].charAt(0).toUpperCase();
  return initial ? `${parts[0]} ${initial}.` : parts[0];
}
