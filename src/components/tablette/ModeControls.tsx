import React, { useRef } from 'react';
import { Lock, LockOpen, Repeat } from 'lucide-react';
import Button from '../shared/Button';
import { MODE_LABELS, type ModeUsage } from '../../utils/modeLock';

export const UNLOCK_HOLD_MS = 2000;

interface ModeControlsProps {
  mode: ModeUsage;
  locked: boolean;
  onChangeMode: () => void;
  onLock: () => void;
  onRequestUnlock: () => void;
}

// Commandes de la tablette dans l'en-tête : changer de mode, verrouiller, ou (verrouillée)
// une icône discrète à maintenir 2 secondes pour demander le code.
export default function ModeControls({ mode, locked, onChangeMode, onLock, onRequestUnlock }: ModeControlsProps) {
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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center min-h-9 px-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-bold font-display uppercase tracking-wide">
        {MODE_LABELS[mode]}
      </span>
      <Button size="sm" onClick={onChangeMode} title="Choisir un autre mode d'usage pour cette tablette">
        <Repeat size={13} aria-hidden="true" />
        <span>Changer de mode</span>
      </Button>
      <Button size="sm" onClick={onLock} title="Verrouiller la tablette dans ce mode (le code du PC sera demandé pour en sortir)">
        <LockOpen size={13} aria-hidden="true" />
        <span>Verrouiller ce mode</span>
      </Button>
    </div>
  );
}
