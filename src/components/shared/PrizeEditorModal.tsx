import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift, Trophy, Upload, RotateCcw, Undo2, ImageOff, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { UNDO_WINDOW_MS } from './Toast';
import { fieldInputClass, fieldLabelClass } from './TextField';
import { ContestPrize, ContestPrizes, DEFAULT_CONTEST_PRIZES, resizeImageFile } from '../../utils/prizes';

interface PrizeEditorModalProps {
  isOpen: boolean;
  prizes: ContestPrizes;
  onClose: () => void;
  onSave: (prizes: ContestPrizes) => Promise<void>;
}

// Image d'un prix, ou icône de repli lorsqu'aucune image n'est définie
export function PrizeImage({
  src,
  alt,
  kind,
  className = 'w-full h-full object-contain'
}: {
  src: string;
  alt: string;
  kind: keyof ContestPrizes;
  className?: string;
}) {
  if (src) {
    return <img src={src} alt={alt} className={className} />;
  }
  const Icon = kind === 'best' ? Trophy : Gift;
  return <Icon className={kind === 'best' ? 'w-1/2 h-1/2 text-warning' : 'w-1/2 h-1/2 text-accent'} />;
}


function PrizeFields({
  kind,
  prize,
  onChange,
  onError
}: {
  kind: keyof ContestPrizes;
  prize: ContestPrize;
  onChange: (prize: ContestPrize) => void;
  onError: (message: string) => void;
}) {
  const label = kind === 'best' ? '1er prix : meilleur chrono' : 'Tirage au sort parmi tous les participants';

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      onChange({ ...prize, image: await resizeImageFile(file) });
    } catch (err) {
      console.error(err);
      onError("Impossible de lire cette image.");
    }
  };

  return (
    <fieldset className="space-y-2 p-3 rounded-2xl border border-app-card-border bg-app-input/40">
      <legend className="px-1.5 text-micro font-black uppercase tracking-wider text-primary font-display">{label}</legend>

      <div className="flex items-start gap-3">
        <div className="w-20 h-20 rounded-xl bg-white p-1.5 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
          <PrizeImage src={prize.image} alt={prize.title} kind={kind} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-app-card border border-app-card-border hover:border-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary text-xs font-bold cursor-pointer transition">
            <Upload size={12} aria-hidden="true" />
            <span>Choisir une image</span>
            <input type="file" accept="image/*" className="sr-only" onChange={handleImage} />
          </label>
          {prize.image && (
            <button
              type="button"
              onClick={() => onChange({ ...prize, image: '' })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-app-card border border-app-card-border hover:border-danger text-xs font-bold text-app-text-muted cursor-pointer transition"
            >
              <ImageOff size={12} />
              <span>Retirer l'image</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="sm:col-span-2 space-y-0.5">
          <label htmlFor={`prize-${kind}-title`} className={fieldLabelClass}>Nom du prix *</label>
          <input
            id={`prize-${kind}-title`}
            required
            type="text"
            value={prize.title}
            onChange={(e) => onChange({ ...prize, title: e.target.value })}
            className={fieldInputClass}
          />
        </div>
        <div className="space-y-0.5">
          <label htmlFor={`prize-${kind}-value`} className={fieldLabelClass}>Valeur (optionnelle)</label>
          <input
            id={`prize-${kind}-value`}
            type="text"
            value={prize.value}
            onChange={(e) => onChange({ ...prize, value: e.target.value })}
            placeholder="500$"
            className={fieldInputClass}
          />
        </div>
      </div>
      <div className="space-y-0.5">
        <label htmlFor={`prize-${kind}-short`} className={fieldLabelClass}>Titre court (cartes compactes et ruban)</label>
        <input
          id={`prize-${kind}-short`}
          type="text"
          value={prize.shortTitle}
          onChange={(e) => onChange({ ...prize, shortTitle: e.target.value })}
          placeholder={prize.title}
          className={fieldInputClass}
        />
      </div>
      <div className="space-y-0.5">
        <label htmlFor={`prize-${kind}-description`} className={fieldLabelClass}>Description</label>
        <textarea
          id={`prize-${kind}-description`}
          value={prize.description}
          onChange={(e) => onChange({ ...prize, description: e.target.value })}
          rows={2}
          className={fieldInputClass}
        />
      </div>
    </fieldset>
  );
}

export default function PrizeEditorModal({ isOpen, prizes, onClose, onSave }: PrizeEditorModalProps) {
  const [draft, setDraft] = useState<ContestPrizes>(prizes);
  const [isSaving, setIsSaving] = useState(false);
  // Les toasts restent sous la boîte de dialogue : les erreurs s'affichent dans la modale
  const [error, setError] = useState<string | null>(null);
  // Brouillon avant « Prix par défaut », proposé en annulation pendant quelques secondes
  const [draftBeforeReset, setDraftBeforeReset] = useState<ContestPrizes | null>(null);

  // Repartir des prix enregistrés à chaque ouverture
  useEffect(() => {
    if (isOpen) {
      setDraft(prizes);
      setError(null);
      setDraftBeforeReset(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!draftBeforeReset) return;
    const timer = window.setTimeout(() => setDraftBeforeReset(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [draftBeforeReset]);

  const handleSave = async () => {
    if (!draft.best.title.trim() || !draft.raffle.title.trim()) {
      setError('Chaque prix doit avoir un nom.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await onSave({
        best: { ...draft.best, title: draft.best.title.trim(), shortTitle: draft.best.shortTitle.trim() },
        raffle: { ...draft.raffle, title: draft.raffle.title.trim(), shortTitle: draft.raffle.shortTitle.trim() }
      });
      onClose();
    } catch {
      setError("L'enregistrement des prix a échoué. Réessayez.");
    } finally {
      setIsSaving(false);
    }
  };

  // Rendu dans <body> : la console est dans un conteneur animé (transform) qui casserait le position: fixed
  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Prix du concours"
      icon={Gift}
      maxWidth="max-w-xl"
      id="prize-editor-title"
      footer={
        <>
          {draftBeforeReset ? (
            <button
              type="button"
              onClick={() => {
                setDraft(draftBeforeReset);
                setDraftBeforeReset(null);
              }}
              className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-primary bg-primary/10 border border-primary/40 cursor-pointer transition"
            >
              <Undo2 size={12} aria-hidden="true" />
              <span>Annuler la réinitialisation</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraftBeforeReset(draft);
                setDraft(DEFAULT_CONTEST_PRIZES);
              }}
              className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-app-text-muted hover:text-app-text cursor-pointer transition"
            >
              <RotateCcw size={12} aria-hidden="true" />
              <span>Prix par défaut</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-app-input border border-app-card-border text-xs font-bold cursor-pointer transition"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            aria-busy={isSaving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-secondary text-xs font-black uppercase font-display cursor-pointer transition disabled:opacity-50"
          >
            {isSaving && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
            {isSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <p className="text-xs text-app-text-muted">
        Les prix s'affichent sur l'écran public, dans le ruban défilant et pendant le tirage. Ils sont propres à cet événement.
      </p>
      {error && (
        <p role="alert" className="text-xs font-bold text-danger bg-danger/10 border border-danger/40 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      <PrizeFields kind="best" prize={draft.best} onChange={(best) => setDraft((d) => ({ ...d, best }))} onError={setError} />
      <PrizeFields kind="raffle" prize={draft.raffle} onChange={(raffle) => setDraft((d) => ({ ...d, raffle }))} onError={setError} />
    </Modal>,
    document.body
  );
}
