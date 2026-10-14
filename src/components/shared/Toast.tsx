import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

type ToastListener = (toast: ToastMessage) => void;
const listeners = new Set<ToastListener>();

export function showToast(message: string, type: ToastType = 'info', action?: ToastAction) {
  const toast: ToastMessage = {
    id: 'toast-' + Math.random().toString(36).substring(2, 9),
    message,
    type,
    action
  };
  listeners.forEach(fn => fn(toast));
}

// Couleurs par type, basées sur les tokens sémantiques (lisibles dans les deux thèmes)
const TOAST_STYLES: Record<ToastType, { Icon: typeof Info; tone: { border: string; icon: string } }> = {
  info: { Icon: Info, tone: { border: 'border-primary/50', icon: 'text-primary' } },
  success: { Icon: CheckCircle2, tone: { border: 'border-success/60', icon: 'text-success' } },
  error: { Icon: AlertCircle, tone: { border: 'border-danger/60', icon: 'text-danger' } },
  warning: { Icon: AlertTriangle, tone: { border: 'border-warning/60', icon: 'text-warning' } }
};

const MAX_VISIBLE_TOASTS = 3;

// Fenêtre pendant laquelle « Annuler » reste proposé après une action réversible
export const UNDO_WINDOW_MS = 5000;

// Durée d'affichage : plus longue pour les avertissements et erreurs, qu'un animateur occupé doit pouvoir lire
const TOAST_DURATION_MS: Record<ToastType, number> = {
  success: 3500,
  info: 3500,
  warning: 6000,
  error: 8000
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const timers = useRef(new Map<string, number>());

  const dismiss = (id: string) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    const handler: ToastListener = (newToast) => {
      // Pile limitée aux plus récents pour ne pas recouvrir le formulaire d'inscription
      setToasts(prev => [...prev, newToast].slice(-MAX_VISIBLE_TOASTS));
    };

    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  // Minuterie de fermeture par toast, suspendue tant que le pointeur ou le focus est sur la pile (WCAG 2.2.1)
  useEffect(() => {
    if (isPaused) {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
      return;
    }
    toasts.forEach((toast) => {
      if (!timers.current.has(toast.id)) {
        const duration = toast.action ? UNDO_WINDOW_MS : TOAST_DURATION_MS[toast.type];
        timers.current.set(toast.id, window.setTimeout(() => dismiss(toast.id), duration));
      }
    });
  }, [toasts, isPaused]);

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  // La pile vit dans la couche supérieure (popover) pour rester visible au-dessus d'une boîte de dialogue
  // ouverte : chaque nouveau toast la replace au sommet de cette couche.
  const regionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const region = regionRef.current;
    if (!region || typeof region.showPopover !== 'function') return;
    if (region.matches(':popover-open')) region.hidePopover();
    region.showPopover();
  }, [toasts.length]);

  // Région toujours présente dans le DOM pour que les lecteurs d'écran annoncent les messages ajoutés
  return (
    <div
      ref={regionRef}
      popover="manual"
      role="region"
      aria-label="Notifications"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      className="fixed inset-auto bottom-5 left-0 sm:left-5 z-[9999] m-0 p-0 px-4 sm:px-0 border-0 bg-transparent overflow-visible flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => {
        const { Icon, tone } = TOAST_STYLES[toast.type];

        const isUrgent = toast.type === 'error' || toast.type === 'warning';

        return (
          <div
            key={toast.id}
            role={isUrgent ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border-2 shadow-xl bg-app-bg text-app-text transition-all duration-300 ${tone.border}`}
          >
            <Icon size={18} className={`shrink-0 mt-0.5 ${tone.icon}`} aria-hidden="true" />
            <div className="flex-1 text-sm font-sans font-medium leading-relaxed">
              {toast.message}
            </div>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  dismiss(toast.id);
                }}
                className="shrink-0 -my-1 min-h-9 px-3 rounded-lg bg-primary/15 border border-primary/40 text-primary text-xs font-black uppercase font-display tracking-wider hover:bg-primary/25 transition cursor-pointer"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 p-2 -mr-2 -mt-2 rounded-lg text-app-text-muted hover:text-app-text transition cursor-pointer"
              aria-label="Fermer la notification"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
