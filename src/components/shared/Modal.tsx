import React, { useEffect, useRef } from 'react';
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
}

export default function Modal({
  isOpen,
  onClose,
  title,
  icon: Icon,
  children,
  footer,
  maxWidth = 'max-w-md',
  id = 'modal-title'
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Fermeture automatique à l'appui sur Échap (Escape)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Piégeage et focus initial
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusable = modalRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        focusable.focus();
      }
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby={id}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          <motion.div
            ref={modalRef}
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
                <h3 id={id} className="text-base sm:text-lg font-bold font-display uppercase tracking-wider truncate text-app-text">
                  {title}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer la boîte de dialogue"
                className="p-1.5 rounded-xl bg-app-input border border-app-card-border text-app-text-muted hover:text-app-text transition cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corps défilable */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 font-sans text-xs sm:text-sm text-app-text">
              {children}
            </div>

            {/* Pied de page optionnel */}
            {footer && (
              <div className="pt-3.5 border-t border-app-card-border shrink-0 flex flex-wrap items-center justify-end gap-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
