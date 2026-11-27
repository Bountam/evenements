import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Gauge,
  Wrench,
  Package,
  AlertTriangle,
  Info,
  BellRing,
  ImageOff,
  Database,
  ZoomIn,
  X,
  Loader2
} from 'lucide-react';
import type { IfixitGuideDetail } from '../../../services/ifixitService';

interface IfixitGuideViewerProps {
  guide: IfixitGuideDetail;
  onBack: () => void;
}

interface BulletStyle {
  label: string;
  containerCls: string;
  badgeCls: string;
  kind: 'caution' | 'reminder' | 'note' | 'default';
}

const BULLET_STYLES: Record<string, BulletStyle> = {
  icon_caution: {
    label: 'Attention',
    containerCls: 'bg-danger/15 border-danger/40 text-app-text',
    badgeCls: 'text-danger',
    kind: 'caution'
  },
  red: {
    label: 'Attention',
    containerCls: 'bg-danger/15 border-danger/40 text-app-text',
    badgeCls: 'text-danger',
    kind: 'caution'
  },
  icon_reminder: {
    label: 'Rappel',
    containerCls: 'bg-warning/15 border-warning/40 text-app-text',
    badgeCls: 'text-warning',
    kind: 'reminder'
  },
  orange: {
    label: 'Rappel',
    containerCls: 'bg-warning/15 border-warning/40 text-app-text',
    badgeCls: 'text-warning',
    kind: 'reminder'
  },
  yellow: {
    label: 'Rappel',
    containerCls: 'bg-warning/15 border-warning/40 text-app-text',
    badgeCls: 'text-warning',
    kind: 'reminder'
  },
  icon_note: {
    label: 'Note',
    containerCls: 'bg-info/15 border-info/40 text-app-text',
    badgeCls: 'text-info',
    kind: 'note'
  },
  blue: {
    label: 'Note',
    containerCls: 'bg-info/15 border-info/40 text-app-text',
    badgeCls: 'text-info',
    kind: 'note'
  }
};

export default function IfixitGuideViewer({ guide, onBack }: IfixitGuideViewerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [fullResOverlayUrl, setFullResOverlayUrl] = useState<string | null>(null);
  const [loadingFullRes, setLoadingFullRes] = useState(false);

  useEffect(() => {
    setStepIndex(0);
    setSelectedImageIdx(0);
    setFullResOverlayUrl(null);
    setLoadingFullRes(false);
  }, [guide.guideid, guide.lang]);

  useEffect(() => {
    setSelectedImageIdx(0);
    setFullResOverlayUrl(null);
    setLoadingFullRes(false);
  }, [stepIndex]);

  useEffect(() => {
    if (!fullResOverlayUrl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullResOverlayUrl(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullResOverlayUrl]);

  const totalSteps = guide.steps.length;
  const activeStep = guide.steps[stepIndex] || null;
  const activeImage = activeStep?.images[selectedImageIdx] || activeStep?.images[0] || null;
  const activeImageUrl = activeImage
    ? activeImage.embeddedDataUrl || activeImage.medium || activeImage.standard || activeImage.thumbnail
    : '';
  const fullResUrl = activeImage
    ? activeImage.original || activeImage.standard || activeImage.medium || ''
    : '';
  const stepPct = totalSteps > 0 ? Math.round(((stepIndex + 1) / totalSteps) * 100) : 0;

  // Au clic sur la miniature : tenter le chargement pleine résolution depuis l'API si disponible ;
  // en cas d'échec ou hors-ligne, laisser l'image affichée telle quelle sans message d'erreur.
  const handleImageClick = () => {
    if (!fullResUrl || loadingFullRes) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (failedImages[fullResUrl]) return;

    setLoadingFullRes(true);
    const probe = new Image();
    probe.onload = () => {
      setLoadingFullRes(false);
      setFullResOverlayUrl(fullResUrl);
    };
    probe.onerror = () => {
      setLoadingFullRes(false);
    };
    probe.src = fullResUrl;
  };

  return (
    <div className="space-y-4">
      {/* En-tête du guide intégré */}
      <div className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 px-3.5 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-1.5 hover:border-primary/60"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Retour aux guides</span>
          </button>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-micro px-2.5 py-1 rounded-full bg-primary/15 border border-primary/40 text-primary font-display font-black uppercase">
              {guide.lang.toUpperCase()}
            </span>
            {guide.fromCache && (
              <span className="text-micro px-2.5 py-1 rounded-full bg-success/15 border border-success/40 text-success font-bold uppercase inline-flex items-center gap-1">
                <Database size={11} aria-hidden="true" />
                <span>En cache</span>
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          {guide.device && (
            <span className="text-micro uppercase font-bold text-primary block">{guide.device}</span>
          )}
          <h4 className="text-lg sm:text-xl font-display font-bold text-app-text leading-snug">
            {guide.title}
          </h4>
          {guide.introduction && (
            <p className="text-xs sm:text-sm text-app-text-muted leading-relaxed">{guide.introduction}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {guide.difficulty && (
            <span className="text-xs px-3 py-1 rounded-xl bg-app-input border border-app-card-border text-app-text font-semibold inline-flex items-center gap-1.5">
              <Gauge size={14} className="text-primary" aria-hidden="true" />
              <span>Difficulté : {guide.difficulty}</span>
            </span>
          )}
          {guide.timeRequired && (
            <span className="text-xs px-3 py-1 rounded-xl bg-app-input border border-app-card-border text-app-text font-semibold inline-flex items-center gap-1.5">
              <Clock size={14} className="text-primary" aria-hidden="true" />
              <span>Durée : {guide.timeRequired}</span>
            </span>
          )}
        </div>
      </div>

      {/* Outils & pièces */}
      {(guide.tools.length > 0 || guide.parts.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {guide.tools.length > 0 && (
            <div className="bg-app-card border border-app-card-border p-4 rounded-2xl shadow-sm space-y-2">
              <div className="text-xs font-display font-bold uppercase text-primary flex items-center gap-1.5">
                <Wrench size={14} aria-hidden="true" />
                <span>Outils requis ({guide.tools.length})</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-app-text">
                {guide.tools.map((tool, i) => (
                  <li key={`${tool}-${i}`}>{tool}</li>
                ))}
              </ul>
            </div>
          )}

          {guide.parts.length > 0 && (
            <div className="bg-app-card border border-app-card-border p-4 rounded-2xl shadow-sm space-y-2">
              <div className="text-xs font-display font-bold uppercase text-primary flex items-center gap-1.5">
                <Package size={14} aria-hidden="true" />
                <span>Pièces ({guide.parts.length})</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-app-text">
                {guide.parts.map((part, i) => (
                  <li key={`${part}-${i}`}>{part}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Navigation pas à pas */}
      {totalSteps === 0 ? (
        <div className="bg-app-card border border-app-card-border p-6 rounded-3xl text-center text-sm text-app-text-muted">
          Ce guide ne contient aucune étape détaillée.
        </div>
      ) : (
        <div className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-display font-black uppercase text-primary">
                Étape {stepIndex + 1} / {totalSteps}
              </span>
              <span className="text-xs font-bold text-app-text-muted">{activeStep?.title}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-app-input border border-app-card-border overflow-hidden">
              <div className="h-full bg-primary transition-all duration-200" style={{ width: `${stepPct}%` }} />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {guide.steps.map((st, idx) => (
                <button
                  key={st.stepid}
                  type="button"
                  onClick={() => setStepIndex(idx)}
                  aria-current={idx === stepIndex ? 'step' : undefined}
                  className={`min-h-9 min-w-9 px-2.5 py-1 rounded-xl border text-xs font-display font-bold cursor-pointer ${
                    idx === stepIndex
                      ? 'bg-primary text-secondary border-primary'
                      : 'bg-app-input text-app-text-muted border-app-card-border hover:border-primary/50'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          {activeStep && (
            <div className="space-y-4">
              {/* Photos de l'étape (clic pour charger l'image pleine résolution si disponible) */}
              {activeStep.images.length > 0 && (
                <div className="space-y-2">
                  <div className="relative rounded-2xl overflow-hidden bg-app-input border border-app-card-border aspect-video flex items-center justify-center">
                    {activeImageUrl && !failedImages[activeImageUrl] ? (
                      <button
                        type="button"
                        onClick={handleImageClick}
                        aria-label="Afficher l'image en pleine résolution"
                        title={fullResUrl ? 'Cliquer pour tenter l’affichage pleine résolution' : undefined}
                        className="relative w-full h-full flex items-center justify-center cursor-pointer group"
                      >
                        <img
                          src={activeImageUrl}
                          alt={`${guide.title} - Étape ${stepIndex + 1}`}
                          loading="lazy"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [activeImageUrl]: true }))
                          }
                          className="w-full h-full object-contain"
                        />
                        {fullResUrl && (
                          <span className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-app-header/90 border border-app-card-border text-micro font-display font-bold uppercase text-app-text inline-flex items-center gap-1 shadow-sm">
                            {loadingFullRes ? (
                              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                            ) : (
                              <ZoomIn size={12} className="text-primary" aria-hidden="true" />
                            )}
                            <span>HD</span>
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="p-6 text-center text-app-text-muted space-y-1.5">
                        <ImageOff size={24} className="mx-auto opacity-60" aria-hidden="true" />
                        <p className="text-xs">Image indisponible hors-ligne</p>
                      </div>
                    )}
                  </div>

                  {activeStep.images.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {activeStep.images.map((img, idx) => {
                        const thumbUrl = img.embeddedDataUrl || img.thumbnail || img.medium || img.standard;
                        return (
                          <button
                            key={`${thumbUrl}-${idx}`}
                            type="button"
                            onClick={() => setSelectedImageIdx(idx)}
                            aria-label={`Photo ${idx + 1} de l'étape ${stepIndex + 1}`}
                            className={`w-16 h-12 rounded-xl overflow-hidden border-2 cursor-pointer bg-app-input ${
                              idx === selectedImageIdx ? 'border-primary' : 'border-app-card-border opacity-75'
                            }`}
                          >
                            {!failedImages[thumbUrl] ? (
                              <img
                                src={thumbUrl}
                                alt=""
                                loading="lazy"
                                onError={() =>
                                  setFailedImages((prev) => ({ ...prev, [thumbUrl]: true }))
                                }
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-app-text-muted">
                                <ImageOff size={14} aria-hidden="true" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Instructions numérotées + alertes caution / reminder / note */}
              <ol className="space-y-2.5">
                {activeStep.lines.map((line, idx) => {
                  const style = BULLET_STYLES[line.bullet];
                  if (style) {
                    const IconComp =
                      style.kind === 'caution'
                        ? AlertTriangle
                        : style.kind === 'reminder'
                          ? BellRing
                          : Info;
                    return (
                      <li
                        key={`${idx}-${line.bullet}`}
                        className={`p-3.5 rounded-2xl border flex items-start gap-2.5 text-sm ${style.containerCls}`}
                      >
                        <IconComp size={17} className={`${style.badgeCls} shrink-0 mt-0.5`} aria-hidden="true" />
                        <div className="space-y-0.5 min-w-0">
                          <span className={`text-micro font-black uppercase tracking-wider block ${style.badgeCls}`}>
                            {style.label}
                          </span>
                          <span className="leading-snug">{line.text}</span>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={`${idx}-${line.bullet}`}
                      className="p-3.5 rounded-2xl bg-app-input border border-app-card-border flex items-start gap-3 text-sm text-app-text"
                    >
                      <span className="w-6 h-6 rounded-full bg-primary/15 border border-primary/40 text-primary font-display font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="leading-snug">{line.text}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Boutons Précédent / Suivant */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-app-card-border">
            <button
              type="button"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              className="min-h-12 px-4 py-2 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Précédent</span>
            </button>
            <button
              type="button"
              disabled={stepIndex >= totalSteps - 1}
              onClick={() => setStepIndex((prev) => Math.min(totalSteps - 1, prev + 1))}
              className="min-h-12 px-5 py-2.5 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <span>Suivant</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Visionneuse pleine résolution (ouverte uniquement si l'image HD s'est chargée avec succès) */}
      {fullResOverlayUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image étape en pleine résolution"
          onClick={() => setFullResOverlayUrl(null)}
          className="fixed inset-0 z-50 bg-app-bg/95 p-4 flex flex-col items-center justify-center gap-3"
        >
          <div className="w-full max-w-5xl flex justify-end">
            <button
              type="button"
              onClick={() => setFullResOverlayUrl(null)}
              className="min-h-11 px-4 py-2 rounded-xl bg-app-card border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <X size={16} aria-hidden="true" />
              <span>Fermer</span>
            </button>
          </div>
          <img
            src={fullResOverlayUrl}
            alt={`${guide.title} - Pleine résolution`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] max-w-full object-contain rounded-2xl border border-app-card-border bg-app-card shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
