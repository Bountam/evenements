import React, { useState } from 'react';
import { GraduationCap, Check, HandHeart } from 'lucide-react';
import type { GenericAttendee, LearnerCoachStatus, LearnerProgression, ProgressionLevel } from '../../../types';
import { networkManager } from '../../../network';

interface FormateurEvaluationPanelProps {
  attendees: GenericAttendee[];
  onReload: () => Promise<void>;
}

const LEVELS: { level: ProgressionLevel; label: string }[] = [
  { level: 1, label: '1 · Débutant' },
  { level: 2, label: '2 · Bases' },
  { level: 3, label: "3 · À l'aise" },
  { level: 4, label: '4 · Autonome' }
];

const MILESTONES: { id: string; label: string }[] = [
  { id: 'securite_diagnostic', label: 'Sécurité & Diagnostic' },
  { id: 'manipulation', label: 'Manipulation' },
  { id: 'pratique_reussie', label: 'Pratique réussie' },
  { id: 'posture_entraide', label: 'Posture & Entraide' }
];

const COACH_STATUSES: { id: LearnerCoachStatus; label: string }[] = [
  { id: 'a_aider', label: 'À aider' },
  { id: 'en_bonne_voie', label: 'En bonne voie' },
  { id: 'maitrise', label: 'Maîtrisé' }
];

export default function FormateurEvaluationPanel({ attendees, onReload }: FormateurEvaluationPanelProps) {
  const [phase, setPhase] = useState<'avant' | 'pendant' | 'apres'>('avant');

  const updateProgression = async (attendee: GenericAttendee, patch: Partial<LearnerProgression>) => {
    const prev: LearnerProgression = attendee.extraData?.progression || {};
    const next: LearnerProgression = { ...prev, ...patch };
    await networkManager.writeToDatabase('attendees', 'put', {
      ...attendee,
      extraData: { ...attendee.extraData, progression: next }
    });
    await onReload();
  };

  const gains = attendees
    .map((a) => {
      const p: LearnerProgression | undefined = a.extraData?.progression;
      if (typeof p?.levelBefore === 'number' && typeof p?.levelAfter === 'number') {
        return p.levelAfter - p.levelBefore;
      }
      return null;
    })
    .filter((g): g is number => g !== null);

  const avgGain = gains.length > 0 ? (gains.reduce((s, g) => s + g, 0) / gains.length).toFixed(1) : '—';
  const readyCount = attendees.filter((a) => a.extraData?.progression?.readyForReparothon).length;

  return (
    <section className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-app-card-border">
        <div>
          <h3 className="text-base sm:text-lg font-display font-bold uppercase tracking-wider text-app-text flex items-center gap-2">
            <GraduationCap size={20} className="text-primary" aria-hidden="true" />
            <span>Évaluation Formateur (Avant / Pendant / Après)</span>
          </h3>
          <p className="text-xs text-app-text-muted mt-0.5">
            Gain moyen : <strong className="text-primary">{avgGain !== '—' ? `+${avgGain} niveaux` : '—'}</strong> •{' '}
            Prêts Réparothon : <strong className="text-primary">{readyCount}</strong>
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Phase d'évaluation">
          {[
            { id: 'avant' as const, label: '1. Avant' },
            { id: 'pendant' as const, label: '2. Pendant' },
            { id: 'apres' as const, label: '3. Après' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={phase === tab.id}
              onClick={() => setPhase(tab.id)}
              className={`min-h-11 px-4 py-2 rounded-xl font-display font-bold uppercase text-xs cursor-pointer border-2 ${
                phase === tab.id
                  ? 'bg-primary text-secondary border-primary'
                  : 'bg-app-input text-app-text border-app-card-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {attendees.length === 0 ? (
        <p className="text-xs text-app-text-muted text-center py-6">
          Aucun formé inscrit pour le moment.
        </p>
      ) : (
        <div className="space-y-3">
          {attendees.map((a) => {
            const prog: LearnerProgression = a.extraData?.progression || {};
            const milestones = Array.isArray(prog.milestonesDuring) ? prog.milestonesDuring : [];
            const gain =
              typeof prog.levelBefore === 'number' && typeof prog.levelAfter === 'number'
                ? prog.levelAfter - prog.levelBefore
                : null;

            return (
              <div key={a.id} className="p-4 rounded-2xl bg-app-input border border-app-card-border space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display font-bold text-sm uppercase text-app-text">{a.name}</span>
                  {gain !== null && (
                    <span className="text-micro bg-primary/15 text-primary border border-primary/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
                      {gain >= 0 ? `+${gain}` : gain} niveau{Math.abs(gain) > 1 ? 'x' : ''}
                    </span>
                  )}
                </div>

                {phase === 'avant' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {LEVELS.map((lv) => (
                      <button
                        key={lv.level}
                        type="button"
                        onClick={() =>
                          updateProgression(a, { levelBefore: lv.level, evaluatedBeforeAt: Date.now() })
                        }
                        className={`min-h-11 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                          prog.levelBefore === lv.level
                            ? 'bg-primary text-secondary border-primary'
                            : 'bg-app-card text-app-text border-app-card-border'
                        }`}
                      >
                        {lv.label}
                      </button>
                    ))}
                  </div>
                )}

                {phase === 'pendant' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {MILESTONES.map((m) => {
                        const checked = milestones.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              const next = checked ? milestones.filter((id) => id !== m.id) : [...milestones, m.id];
                              updateProgression(a, { milestonesDuring: next });
                            }}
                            className={`min-h-11 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer flex items-center justify-between gap-1 ${
                              checked
                                ? 'bg-primary text-secondary border-primary'
                                : 'bg-app-card text-app-text border-app-card-border'
                            }`}
                          >
                            <span>{m.label}</span>
                            {checked && <Check size={14} className="shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {COACH_STATUSES.map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => updateProgression(a, { coachStatus: st.id })}
                          className={`min-h-9 px-3 py-1 rounded-full border text-micro font-bold uppercase cursor-pointer ${
                            prog.coachStatus === st.id
                              ? 'bg-primary/20 text-primary border-primary'
                              : 'bg-app-card text-app-text-muted border-app-card-border'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {phase === 'apres' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {LEVELS.map((lv) => (
                        <button
                          key={lv.level}
                          type="button"
                          onClick={() =>
                            updateProgression(a, { levelAfter: lv.level, evaluatedAfterAt: Date.now() })
                          }
                          className={`min-h-11 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                            prog.levelAfter === lv.level
                              ? 'bg-primary text-secondary border-primary'
                              : 'bg-app-card text-app-text border-app-card-border'
                          }`}
                        >
                          {lv.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => updateProgression(a, { readyForReparothon: !prog.readyForReparothon })}
                      className={`min-h-11 px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer inline-flex items-center gap-2 ${
                        prog.readyForReparothon
                          ? 'bg-primary text-secondary border-primary'
                          : 'bg-app-card text-app-text border-app-card-border'
                      }`}
                    >
                      <HandHeart size={15} aria-hidden="true" />
                      <span>Prêt(e) à rejoindre un Réparothon</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
