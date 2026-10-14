import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string; // e.g. 'max-w-md', 'max-w-2xl'
  id?: string;
  // Rôle alertdialog pour les confirmations destructives
  role?: 'dialog' | 'alertdialog';
  // Élément qui reçoit le focus à l'ouverture (sinon le premier champ, sinon le premier bouton du corps)
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

// Boîte de dialogue native : <dialog> en showModal() fournit le piège de focus,
// rend le reste de la page inerte et gère Échap ; le focus revient au déclencheur à la fermeture.
function ModalDialog({
  onClose,
  title,
  icon: Icon,
  children,
  footer,
  maxWidth = 'max-w-md',
  id = 'modal-title',
  role = 'dialog',
  initialFocusRef
}: Omit<ModalProps, 'isOpen'>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!dialog.open) dialog.showModal();

    const target =
      initialFocusRef?.current ??
      bodyRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="file"]), select, textarea') ??
      dialog.querySelector<HTMLElement>('[data-autofocus]') ??
      bodyRef.current?.querySelector<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    target?.focus();

    return () => {
      if (dialog.open) dialog.close();
      // Le déclencheur peut avoir disparu entre-temps (ligne supprimée, piste libérée)
      if (trigger && trigger.isConnected) trigger.focus();
    };
    // Ouverture unique par montage : le contenu change sans rouvrir la boîte
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Échap : on laisse le parent décider de la fermeture pour garder l'animation de sortie
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, []);

  return (
    <motion.dialog
      ref={dialogRef}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-labelledby={id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={(e) => {
        // Clic sur le fond (le <dialog> lui-même, hors du panneau)
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 m-0 w-full h-full max-w-none max-h-none p-4 border-0 bg-black/70 backdrop-blur-xs flex items-center justify-center backdrop:bg-transparent"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className={`w-full ${maxWidth} bg-app-card border border-app-card-border p-6 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] text-app-text overflow-hidden`}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between pb-3.5 border-b border-app-card-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            {Icon && <Icon size={20} className="text-primary shrink-0" />}
            <h2 id={id} className="text-base sm:text-lg font-bold font-display uppercase tracking-wider truncate text-app-text">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la boîte de dialogue"
            className="p-2 rounded-xl bg-app-input border border-app-card-border text-app-text-muted hover:text-app-text transition cursor-pointer shrink-0"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Corps défilable */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto py-4 space-y-4 font-sans text-xs sm:text-sm text-app-text">
          {children}
        </div>

        {/* Pied de page optionnel */}
        {footer && (
          <div className="pt-3.5 border-t border-app-card-border shrink-0 flex flex-wrap items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </motion.div>
    </motion.dialog>
  );
}

export default function Modal({ isOpen, ...props }: ModalProps) {
  return <AnimatePresence>{isOpen && <ModalDialog {...props} />}</AnimatePresence>;
}
