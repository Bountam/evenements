import React from 'react';
import { Download, ExternalLink, Sparkles, AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import type { ReleaseUpdateInfo } from '../../utils/updateCheck';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  release: ReleaseUpdateInfo | null;
  currentVersion: string;
  isBlocked: boolean;
  onPostpone: () => void;
  onIgnore: () => void;
  onTriggerUpdate: () => void;
}

export default function UpdateModal({
  isOpen,
  onClose,
  release,
  currentVersion,
  isBlocked,
  onPostpone,
  onIgnore,
  onTriggerUpdate
}: UpdateModalProps) {
  if (!release) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Version ${release.version} disponible`}
      icon={Sparkles}
      maxWidth="max-w-lg"
      id="update-modal-title"
      footer={
        <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <Button variant="ghost" size="sm" onClick={onIgnore}>
            Ignorer cette version
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onPostpone}>
              Plus tard
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isBlocked}
              onClick={onTriggerUpdate}
              title={isBlocked ? 'Termine la session pour mettre à jour' : `Installer la version ${release.version}`}
            >
              <Download size={14} aria-hidden="true" />
              <span>Mettre à jour</span>
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-app-input border border-app-card-border text-xs">
          <span className="text-app-text-muted">
            Version installée : <strong className="text-app-text font-mono">v{currentVersion}</strong>
          </span>
          <span className="px-2.5 py-0.5 rounded-lg bg-primary/15 border border-primary/40 text-primary font-mono font-bold">
            Nouvelle : v{release.version}
          </span>
        </div>

        {isBlocked && (
          <div
            role="alert"
            className="flex items-center gap-2.5 p-3 rounded-2xl bg-warning/15 border border-warning/50 text-warning text-xs font-bold"
          >
            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
            <span>Termine la session pour mettre à jour</span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-micro font-bold uppercase tracking-wider text-app-text-muted font-display">
            Notes de la version
          </div>
          <div className="max-h-60 overflow-y-auto p-3.5 rounded-2xl bg-app-input border border-app-card-border text-xs text-app-text whitespace-pre-wrap leading-relaxed font-sans">
            {release.notes || 'Aucune note de version fournie pour cette publication.'}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <a
            href={release.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          >
            <ExternalLink size={13} aria-hidden="true" />
            <span>Voir la release sur GitHub</span>
          </a>
        </div>
      </div>
    </Modal>
  );
}
