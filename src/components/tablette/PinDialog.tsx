import React, { useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { checkPin, formatWait, getBlockRemainingMs, type PinLock } from '../../utils/modeLock';

interface PinDialogProps {
  isOpen: boolean;
  pinLock: PinLock | null;
  onClose: () => void;
  onUnlocked: () => void;
}

// Saisie du code à 4 chiffres pour sortir d'un mode verrouillé
export default function PinDialog({ isOpen, pinLock, onClose, onUnlocked }: PinDialogProps) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [remainingMs, setRemainingMs] = useState(() => getBlockRemainingMs());
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compte à rebours du blocage, recalculé depuis le stockage (survit à un redémarrage)
  useEffect(() => {
    if (!isOpen) return;
    setCode('');
    setMessage('');
    const tick = () => setRemainingMs(getBlockRemainingMs());
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  const blocked = remainingMs > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checking || blocked) return;
    setChecking(true);
    try {
      const result = await checkPin(code, pinLock);
      if (result.status === 'ok') {
        onUnlocked();
        return;
      }
      setCode('');
      if (result.status === 'no_pin') {
        setMessage("Aucun code reçu du PC hôte : reconnectez la tablette au PC.");
      } else if (result.status === 'blocked') {
        setRemainingMs(result.remainingMs);
        setMessage('Trop d’essais. Patientez avant de réessayer.');
      } else {
        setMessage(`Code incorrect. ${result.attemptsLeft} essai${result.attemptsLeft > 1 ? 's' : ''} avant un blocage.`);
        inputRef.current?.focus();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Vérification impossible.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Déverrouiller la tablette" icon={KeyRound} maxWidth="max-w-sm" initialFocusRef={inputRef}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label htmlFor="pin-code" className="block text-xs text-app-text-muted">
          Code à 4 chiffres défini sur le PC hôte
        </label>
        <input
          ref={inputRef}
          id="pin-code"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={4}
          value={code}
          disabled={blocked}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="w-full text-center font-mono text-3xl tracking-[0.5em] bg-app-input border border-app-input-border rounded-xl px-3 py-3 text-app-text focus:outline-none focus:border-primary disabled:opacity-50"
        />
        <p role="status" aria-live="polite" className="min-h-5 text-xs font-bold text-warning">
          {blocked ? `Saisie bloquée encore ${formatWait(remainingMs)}.` : message}
        </p>
        <div className="flex gap-2">
          <Button onClick={onClose} className="flex-1">Annuler</Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={blocked || checking || code.length !== 4}>
            Déverrouiller
          </Button>
        </div>
      </form>
    </Modal>
  );
}
