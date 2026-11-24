import React, { useRef } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import Button from '../shared/Button';

export const UNLOCK_HOLD_MS = 2000;

interface ModeControlsProps {
  locked: boolean;
  canLock?: boolean;
  onLock: () => void;
  onRequestUnlock: () => void;
}

// Commandes de verrouillage (réservées uniquement au mode Kiosque d'inscription) :
// - Non verrouillé : bouton « Verrouiller ce mode »
// - Verrouillé : icône cadenas discrète à maintenir 2 secondes pour demander le PIN (0000 par défaut)
export default function ModeControls({ locked, canLock = true, onLock, onRequestUnlock }: ModeControlsProps) {
  const timer = useRef<number | null>(null);

  const startHold = () => {
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onRequestUnlock();
    }, UNLOCK_HOLD_MS);
  };
  const cancelHold = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  if (locked) {
    return (
      <button
        type="button"
        aria-label="Déverrouiller (maintenir 2 secondes)"
        title="Maintenir 2 secondes pour déverrouiller"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            startHold();
          }
        }}
        onKeyUp={cancelHold}
        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-app-text-muted opacity-40 hover:opacity-80 focus-visible:opacity-100 select-none touch-none cursor-pointer transition"
      >
        <Lock size={16} aria-hidden="true" />
      </button>
    );
  }

  if (!canLock) return null;

  return (
    <Button
      size="sm"
      onClick={onLock}
      title="Verrouiller la tablette dans le Kiosque d'inscription (code 0000 par défaut pour en sortir)"
    >
      <LockOpen size={13} aria-hidden="true" />
      <span>Verrouiller le kiosque</span>
    </Button>
  );
}
