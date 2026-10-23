import React, { useEffect, useId, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import Button from './Button';

interface MoreMenuProps {
  label?: string;
  // Point d'alerte sur le bouton quand un élément du volet demande l'attention
  alert?: boolean;
  alertText?: string;
  children: (close: () => void) => React.ReactNode;
}

// Volet « Plus » (motif disclosure) : regroupe les commandes rares d'une barre d'outils.
// Se ferme sur Échap (le focus revient au bouton), sur un clic à l'extérieur ou après une action.
export default function MoreMenu({ label = 'Plus', alert = false, alertText, children }: MoreMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={triggerRef}
        size="sm"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="relative"
      >
        <Ellipsis size={14} aria-hidden="true" />
        <span>{label}</span>
        {alert && (
          <>
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-warning border-2 border-app-header" aria-hidden="true" />
            {alertText && <span className="sr-only">{`(${alertText})`}</span>}
          </>
        )}
      </Button>

      {isOpen && (
        <div
          id={panelId}
          className="absolute right-0 top-full mt-2 z-50 w-64 max-w-[calc(100vw-2rem)] p-2 rounded-2xl bg-app-bg border border-app-card-border shadow-xl flex flex-col gap-1.5"
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
