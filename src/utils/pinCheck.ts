import { networkManager } from '../network';
import {
  applyRemoteBlock,
  checkPin,
  getBlockRemainingMs,
  registerPinFailure,
  resetPinFailures,
  type PinCheckResult,
  type PinLock
} from './modeLock';

// Vérification du code de déverrouillage (étape 1 du plan v1.9) :
// 1. une tablette reliée au PC hôte lui demande de vérifier le code (réponse attendue 2 s au plus) ;
// 2. sans réponse, ou hors session, la copie locale du verrou décide, comme avant.
// Le délai après 3 erreurs s'applique dans les deux cas.
export async function verifierCode(code: string, lock: PinLock | null, eventId?: string, now = Date.now()): Promise<PinCheckResult> {
  const remainingMs = getBlockRemainingMs(now);
  if (remainingMs > 0) return { status: 'blocked', remainingMs };

  const hote = networkManager.role === 'client' ? await networkManager.requestPinCheck(code, eventId) : null;
  if (!hote) return checkPin(code, lock, now);

  if (hote.status === 'ok') {
    resetPinFailures();
    return { status: 'ok' };
  }
  if (hote.status === 'blocked') {
    const ms = Math.max(0, hote.remainingMs ?? 0);
    applyRemoteBlock(ms);
    return { status: 'blocked', remainingMs: ms };
  }
  const local = registerPinFailure();
  if (local.blockedMs > 0) return { status: 'blocked', remainingMs: local.blockedMs };
  const attemptsLeft = Math.min(local.attemptsLeft, hote.attemptsLeft ?? local.attemptsLeft);
  return { status: 'wrong', attemptsLeft: Math.max(1, attemptsLeft) };
}
