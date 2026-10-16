import React from 'react';
import { Download, ExternalLink, Sparkles, AlertTriangle, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import type { ReleaseUpdateInfo } from '../../utils/updateCheck';
import type { LauncherUpdateStatus } from '../../utils/sqliteBackup';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  release: ReleaseUpdateInfo | null;
  currentVersion: string;
  isBlocked: boolean;
  canLauncherUpdate?: boolean;
  updateProgress?: LauncherUpdateStatus | null;
  onPostpone: () => void;
  onIgnore: () => void;
  onTriggerUpdate: () => void;
}

function formatBytes(bytes = 0): string {
  if (!bytes || bytes <= 0) return '0 Mo';
  const mb = bytes / (1024 * 1024);
  if (mb >= 0.1) return `${mb.toFixed(1).replace('.', ',')} Mo`;
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} Ko`;
}

export default function UpdateModal({
  isOpen,
  onClose,
  release,
  currentVersion,
  isBlocked,
  canLauncherUpdate = false,
  updateProgress = null,
  onPostpone,
  onIgnore,
  onTriggerUpdate
}: UpdateModalProps) {
  if (!release) return null;

  const state = updateProgress?.state ?? 'idle';
  const isBusy = state === 'downloading' || state === 'verifying' || state === 'installing';
  const percent = Math.min(100, Math.max(0, updateProgress?.percent ?? 0));

  return (
    <Modal
      isOpen={isOpen}
      onClose={isBusy ? () => {} : onClose}
      title={`Version ${release.version} disponible`}
      icon={Sparkles}
      maxWidth="max-w-lg"
      id="update-modal-title"
      footer={
        <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <Button variant="ghost" size="sm" disabled={isBusy} onClick={onIgnore}>
            Ignorer cette version
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={isBusy} onClick={onPostpone}>
              Plus tard
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isBlocked || isBusy}
              onClick={onTriggerUpdate}
              title={
                isBlocked
                  ? 'Termine la session pour mettre à jour'
                  : canLauncherUpdate
                    ? `Télécharger et installer la version ${release.version}`
                    : `Ouvrir la version ${release.version}`
              }
            >
              {isBusy ? (
                <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Download size={14} aria-hidden="true" />
              )}
              <span>{isBusy ? 'Mise à jour en cours…' : 'Mettre à jour'}</span>
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

        {isBusy && (
          <div
            role="status"
            aria-live="polite"
            className="space-y-2.5 p-3.5 rounded-2xl bg-app-input border border-primary/40 text-xs"
          >
            <div className="flex items-center justify-between gap-2 font-bold text-app-text">
              <span className="inline-flex items-center gap-2">
                {state === 'installing' ? (
                  <CheckCircle2 size={15} className="text-success shrink-0" aria-hidden="true" />
                ) : (
                  <RefreshCw size={15} className="text-primary animate-spin shrink-0" aria-hidden="true" />
                )}
                <span>
                  {state === 'downloading' && `Téléchargement en cours… ${percent} %`}
                  {state === 'verifying' && "Vérification de l'empreinte SHA-256…"}
                  {state === 'installing' && "Installation en cours… L'application va redémarrer."}
                </span>
              </span>
              {state === 'downloading' && (updateProgress?.totalBytes ?? 0) > 0 && (
                <span className="font-mono text-micro text-app-text-muted">
                  {formatBytes(updateProgress?.downloadedBytes)} / {formatBytes(updateProgress?.totalBytes)}
                </span>
              )}
            </div>
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-full h-2 rounded-full bg-app-card overflow-hidden border border-app-card-border"
            >
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}

        {state === 'error' && updateProgress?.message && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-2xl bg-danger/15 border border-danger/50 text-danger text-xs font-bold"
          >
            <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{updateProgress.message}</span>
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
