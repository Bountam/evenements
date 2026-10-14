import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  // destructive : bouton de confirmation rouge et rôle alertdialog
  tone?: 'default' | 'destructive';
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

type ConfirmListener = (request: PendingConfirm) => void;
const listeners = new Set<ConfirmListener>();

// Remplace window.confirm() : même usage (await confirmDialog(...)) mais dans une boîte de dialogue accessible
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (listeners.size === 0) {
    return Promise.resolve(window.confirm(options.title));
  }
  return new Promise((resolve) => {
    listeners.forEach((fn) => fn({ ...options, resolve }));
  });
}

// Hôte unique, monté une fois à la racine de l'application
export function ConfirmDialogHost() {
  const [request, setRequest] = useState<PendingConfirm | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler: ConfirmListener = (next) => {
      setRequest((current) => {
        // Une demande déjà ouverte est refusée avant d'afficher la suivante
        current?.resolve(false);
        return next;
      });
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const settle = (confirmed: boolean) => {
    request?.resolve(confirmed);
    setRequest(null);
  };

  // Contenu conservé pendant l'animation de fermeture
  const lastRequest = useRef<PendingConfirm | null>(null);
  if (request) lastRequest.current = request;
  const view = request ?? lastRequest.current;
  const isDestructive = view?.tone === 'destructive';

  return (
    <Modal
      isOpen={request !== null}
      onClose={() => settle(false)}
      title={view?.title ?? ''}
      icon={isDestructive ? AlertTriangle : HelpCircle}
      id="confirm-dialog-title"
      role={isDestructive ? 'alertdialog' : 'dialog'}
      // Focus sur « Annuler » : une confirmation ne doit jamais se valider par un Entrée réflexe
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={() => settle(false)}>
            {view?.cancelLabel ?? 'Annuler'}
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={() => settle(true)}
            className={isDestructive ? 'bg-danger/10' : ''}
          >
            {view?.confirmLabel ?? 'Confirmer'}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-app-text whitespace-pre-line">{view?.message}</div>
    </Modal>
  );
}
