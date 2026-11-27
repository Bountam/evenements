import React, { useMemo } from 'react';
import {
  Check,
  HelpCircle,
  ShieldAlert,
  Wrench,
  Cpu,
  BookOpenCheck,
  ClipboardList
} from 'lucide-react';
import type { DeviceCategory, OperatingSystem, RepairTicket } from '../../../types';
import { getDiagnosticSuggestions, type DiagnosticQuickCheck } from '../../../utils/repairLexicon';

interface TicketDiagnosticPanelProps {
  ticket: RepairTicket;
  checkedIds: string[];
  onToggleCheck: (id: string) => void | Promise<void>;
  onOpenIfixit?: () => void;
}

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  laptop: 'Portable',
  pc_tour: 'PC tour',
  cellulaire: 'Cellulaire',
  tablette: 'Tablette',
  autre: 'Autre appareil'
};

const OS_LABELS: Record<OperatingSystem, string> = {
  windows: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
  autre: 'Autre OS',
  aucun: 'Aucun OS'
};

const CHECK_CATEGORY_BADGE: Record<DiagnosticQuickCheck['category'], { label: string; cls: string }> = {
  securite: {
    label: 'Sécurité',
    cls: 'bg-warning/15 border-warning/40 text-warning'
  },
  materiel: {
    label: 'Matériel',
    cls: 'bg-info/15 border-info/40 text-info'
  },
  logiciel: {
    label: 'Logiciel',
    cls: 'bg-success/15 border-success/40 text-success'
  }
};

export default function TicketDiagnosticPanel({
  ticket,
  checkedIds,
  onToggleCheck,
  onOpenIfixit
}: TicketDiagnosticPanelProps) {
  const suggestions = useMemo(() => getDiagnosticSuggestions(ticket), [ticket]);
  const symptoms = Array.isArray(ticket.extraData?.symptoms) ? (ticket.extraData.symptoms as string[]) : [];

  const allItemIds = useMemo(
    () => [
      ...suggestions.questions.map((q) => q.id),
      ...suggestions.quickChecks.map((c) => c.id)
    ],
    [suggestions]
  );

  const doneCount = allItemIds.filter((id) => checkedIds.includes(id)).length;
  const totalCount = allItemIds.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Triage initial + Progression */}
      <div className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-micro uppercase font-black text-primary flex items-center gap-1.5">
              <ClipboardList size={13} aria-hidden="true" />
              <span>Triage d&apos;accueil • 100 % hors-ligne</span>
            </span>
            <h4 className="text-base sm:text-lg font-display font-bold uppercase text-app-text">
              {ticket.objectName}
            </h4>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span className="text-micro px-2.5 py-0.5 rounded-full bg-app-input border border-app-card-border text-app-text font-bold">
                {CATEGORY_LABELS[ticket.objectCategory] || ticket.objectCategory}
              </span>
              <span className="text-micro px-2.5 py-0.5 rounded-full bg-app-input border border-app-card-border text-app-text font-bold">
                {OS_LABELS[ticket.operatingSystem] || ticket.operatingSystem}
              </span>
              {symptoms.map((sym) => (
                <span
                  key={sym}
                  className="text-micro px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/40 text-primary font-bold"
                >
                  {sym}
                </span>
              ))}
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              data-testid="diag-progress-count"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/40 text-primary font-display font-black text-xs uppercase"
            >
              {doneCount} / {totalCount} vérifiés
            </span>
          </div>
        </div>

        <p className="text-sm text-app-text bg-app-input border border-app-card-border rounded-2xl px-4 py-3">
          <strong className="text-app-text-muted uppercase text-micro mr-1.5">Symptôme noté :</strong>
          {ticket.initialDiagnosis || 'Aucun détail supplémentaire saisi à l’accueil.'}
        </p>

        <div
          className="w-full h-2.5 rounded-full bg-app-input border border-app-card-border overflow-hidden"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression du diagnostic"
        >
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Questions à poser au participant */}
      <section
        aria-labelledby="diag-questions-title"
        className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-3"
      >
        <div className="flex items-center gap-2">
          <HelpCircle size={18} className="text-primary shrink-0" aria-hidden="true" />
          <h4 id="diag-questions-title" className="text-base font-display font-bold uppercase text-app-text">
            Questions à poser au participant
          </h4>
        </div>
        <div className="space-y-2.5">
          {suggestions.questions.map((question) => {
            const checked = checkedIds.includes(question.id);
            return (
              <button
                key={question.id}
                type="button"
                aria-pressed={checked}
                onClick={() => onToggleCheck(question.id)}
                className={`w-full min-h-14 p-3.5 rounded-2xl border-2 text-left cursor-pointer transition-colors flex items-start justify-between gap-3 ${
                  checked
                    ? 'bg-primary text-secondary border-primary'
                    : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-bold leading-snug">{question.label}</div>
                  <div
                    className={`text-xs leading-snug ${
                      checked ? 'text-secondary opacity-90' : 'text-app-text-muted'
                    }`}
                  >
                    {question.tip}
                  </div>
                </div>
                <span
                  className={`w-6 h-6 rounded-full border shrink-0 mt-0.5 flex items-center justify-center ${
                    checked
                      ? 'bg-secondary text-primary border-secondary'
                      : 'bg-app-card border-app-card-border text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  <Check size={14} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Points de contrôle matériels / logiciels prioritaires */}
      <section
        aria-labelledby="diag-checks-title"
        className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-3"
      >
        <div className="flex items-center gap-2">
          <Wrench size={18} className="text-primary shrink-0" aria-hidden="true" />
          <h4 id="diag-checks-title" className="text-base font-display font-bold uppercase text-app-text">
            Vérifications prioritaires
          </h4>
        </div>
        <div className="space-y-2.5">
          {suggestions.quickChecks.map((check) => {
            const checked = checkedIds.includes(check.id);
            const badge = CHECK_CATEGORY_BADGE[check.category];
            return (
              <button
                key={check.id}
                type="button"
                aria-pressed={checked}
                onClick={() => onToggleCheck(check.id)}
                className={`w-full min-h-14 p-3.5 rounded-2xl border-2 text-left cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                  checked
                    ? 'bg-primary text-secondary border-primary'
                    : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span
                    className={`text-micro px-2 py-0.5 rounded-full border font-bold uppercase inline-flex items-center gap-1 shrink-0 ${
                      checked
                        ? 'bg-secondary/15 border-secondary/30 text-secondary'
                        : badge.cls
                    }`}
                  >
                    {check.category === 'securite' ? (
                      <ShieldAlert size={11} aria-hidden="true" />
                    ) : (
                      <Cpu size={11} aria-hidden="true" />
                    )}
                    <span>{badge.label}</span>
                  </span>
                  <span className="text-sm font-bold leading-snug">{check.label}</span>
                </div>
                <span
                  className={`w-6 h-6 rounded-full border shrink-0 flex items-center justify-center ${
                    checked
                      ? 'bg-secondary text-primary border-secondary'
                      : 'bg-app-card border-app-card-border text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  <Check size={14} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Mots-clés détectés + accès rapide iFixit */}
      <div className="bg-app-card border border-app-card-border p-4 rounded-3xl shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <span className="text-micro uppercase font-bold text-app-text-muted block">
            Mots-clés de recherche détectés (FR / EN)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[...suggestions.suggestedKeywords.fr, ...suggestions.suggestedKeywords.en].length > 0 ? (
              [...suggestions.suggestedKeywords.fr, ...suggestions.suggestedKeywords.en].map((kw) => (
                <span
                  key={kw}
                  className="text-micro px-2.5 py-0.5 rounded-full bg-app-input border border-app-card-border text-app-text font-mono"
                >
                  {kw}
                </span>
              ))
            ) : (
              <span className="text-xs text-app-text-muted">Diagnostic général</span>
            )}
          </div>
        </div>
        {onOpenIfixit && (
          <button
            type="button"
            onClick={onOpenIfixit}
            className="min-h-11 px-4 py-2 rounded-xl bg-primary text-secondary font-display font-black uppercase text-xs cursor-pointer flex items-center gap-1.5"
          >
            <BookOpenCheck size={15} aria-hidden="true" />
            <span>Ouvrir les guides iFixit</span>
          </button>
        )}
      </div>
    </div>
  );
}
