import React, { useMemo, useState } from 'react';
import {
  HandHeart,
  CheckCircle,
  Megaphone,
  Store,
  Wrench,
  ArrowRight,
  List,
  Focus
} from 'lucide-react';
import type { RepairTicket } from '../../../types';
import { networkManager } from '../../../network';
import { FOLLOW_UP_LABELS } from '../../../utils/repairLexicon';
import { showToast } from '../../shared/Toast';

interface AssistantCockpitProps {
  tickets: RepairTicket[];
  onReload: () => Promise<void>;
}

type AssistantActionItem =
  | { kind: 'help'; id: string; ticket: RepairTicket }
  | { kind: 'call'; id: string; ticket: RepairTicket }
  | { kind: 'exit'; id: string; ticket: RepairTicket };

export default function AssistantCockpit({ tickets, onReload }: AssistantCockpitProps) {
  const [showFullQueue, setShowFullQueue] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [handledExitIds, setHandledExitIds] = useState<string[]>([]);

  const helpAlerts = tickets.filter((t) => t.extraData?.helpRequest?.active === true);
  const pendingCalls = tickets.filter(
    (t) =>
      Boolean(t.extraData?.tableCallAt) &&
      !t.extraData?.companionInstalledAt &&
      (t.status === 'assigne' || t.status === 'en_cours')
  );
  const exitOrientations = tickets
    .filter(
      (t) =>
        ['repare', 'semi_repare', 'non_reparable'].includes(t.status) &&
        t.extraData?.followUpType &&
        t.extraData.followUpType !== 'aucune'
    )
    .slice(0, 8);

  const priorityActions = useMemo<AssistantActionItem[]>(() => {
    const items: AssistantActionItem[] = [
      ...helpAlerts.map((ticket) => ({ kind: 'help' as const, id: `help-${ticket.id}`, ticket })),
      ...pendingCalls.map((ticket) => ({ kind: 'call' as const, id: `call-${ticket.id}`, ticket })),
      ...exitOrientations
        .filter((ticket) => !handledExitIds.includes(ticket.id))
        .map((ticket) => ({ kind: 'exit' as const, id: `exit-${ticket.id}`, ticket }))
    ];
    return items;
  }, [helpAlerts, pendingCalls, exitOrientations, handledExitIds]);

  const activeAction = priorityActions[cursor % Math.max(1, priorityActions.length)] || null;

  const resolveHelp = async (ticket: RepairTicket) => {
    const updated: RepairTicket = {
      ...ticket,
      updatedAt: Date.now(),
      extraData: {
        ...ticket.extraData,
        helpRequest: { ...(ticket.extraData?.helpRequest || { reason: '', requestedAt: Date.now() }), active: false }
      }
    };
    await networkManager.writeToDatabase('tickets', 'put', updated);
    showToast(`Aide notée comme prise en charge pour ${ticket.objectName}.`, 'success');
    setCursor(0);
    await onReload();
  };

  const confirmInstalled = async (ticket: RepairTicket) => {
    const updated: RepairTicket = {
      ...ticket,
      updatedAt: Date.now(),
      extraData: { ...ticket.extraData, companionInstalledAt: Date.now() }
    };
    await networkManager.writeToDatabase('tickets', 'put', updated);
    showToast(`${ticket.visitorName} installé(e) à la table.`, 'success');
    setCursor(0);
    await onReload();
  };

  const confirmExitHandled = (ticket: RepairTicket) => {
    setHandledExitIds((prev) => (prev.includes(ticket.id) ? prev : [...prev, ticket.id]));
    setCursor(0);
    showToast(`Orientation boutique notée pour ${ticket.visitorName}.`, 'success');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* En-tête de contrôle : bascule 1 action prioritaire vs file complète */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-display font-bold uppercase text-app-text-muted" aria-live="polite">
          {priorityActions.length > 0
            ? `${priorityActions.length} action${priorityActions.length > 1 ? 's' : ''} en attente`
            : 'Aucune action urgente'}
        </div>
        <button
          type="button"
          onClick={() => setShowFullQueue((v) => !v)}
          className="min-h-10 px-3.5 py-1.5 rounded-xl bg-app-card border border-app-card-border text-xs font-display font-bold uppercase text-app-text cursor-pointer inline-flex items-center gap-1.5"
        >
          {showFullQueue ? (
            <>
              <Focus size={14} className="text-primary" aria-hidden="true" />
              <span>Vue 1 action</span>
            </>
          ) : (
            <>
              <List size={14} className="text-primary" aria-hidden="true" />
              <span>Voir toute la file</span>
            </>
          )}
        </button>
      </div>

      {/* VUE GUIDÉE PAR DÉFAUT : 1 ACTION PRIORITAIRE À LA FOIS */}
      {!showFullQueue && (
        <section
          aria-label="Action prioritaire de l'assistant"
          className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-4"
        >
          {!activeAction ? (
            <div className="text-center py-8 space-y-2">
              <CheckCircle size={32} className="mx-auto text-success" aria-hidden="true" />
              <h3 className="text-base font-display font-bold uppercase text-app-text">
                Tout est calme pour le moment
              </h3>
              <p className="text-xs text-app-text-muted">
                Dès qu&apos;un réparateur demande de l&apos;aide ou appelle une table, l&apos;action apparaîtra ici.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-micro font-black uppercase tracking-wider text-primary" aria-live="polite">
                  Action {(cursor % priorityActions.length) + 1} sur {priorityActions.length} ·{' '}
                  {activeAction.kind === 'help'
                    ? 'Aide demandée'
                    : activeAction.kind === 'call'
                      ? 'Appel de table'
                      : 'Orientation sortie'}
                </span>
                {priorityActions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setCursor((c) => (c + 1) % priorityActions.length)}
                    className="min-h-9 px-3 py-1 rounded-xl bg-app-input border border-app-card-border text-xs font-display font-bold uppercase text-app-text cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>Action suivante</span>
                    <ArrowRight size={13} aria-hidden="true" />
                  </button>
                )}
              </div>

              {activeAction.kind === 'help' && (
                <div className="p-4 sm:p-5 rounded-2xl bg-warning/10 border-2 border-warning/40 space-y-4">
                  <div className="space-y-1">
                    <span className="text-micro bg-warning text-secondary px-2.5 py-0.5 rounded-full font-display font-black uppercase inline-block">
                      Table {activeAction.ticket.extraData?.tableNumber || '?'}
                    </span>
                    <h4 className="text-lg font-display font-bold uppercase text-app-text">
                      {activeAction.ticket.objectName}
                    </h4>
                    <p className="text-sm text-app-text">
                      Réparateur : <strong>{activeAction.ticket.assignedTechName || 'Technicien'}</strong> •{' '}
                      {activeAction.ticket.extraData?.helpRequest?.reason}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void resolveHelp(activeAction.ticket)}
                    className="w-full min-h-14 px-5 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={18} aria-hidden="true" />
                    <span>J'interviens / Résolu</span>
                  </button>
                </div>
              )}

              {activeAction.kind === 'call' && (
                <div className="p-4 sm:p-5 rounded-2xl bg-app-input border-2 border-primary/40 space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-lg font-display font-bold uppercase text-app-text">
                      {activeAction.ticket.visitorName} → Table {activeAction.ticket.extraData?.tableNumber || '?'}
                    </h4>
                    <p className="text-sm text-app-text-muted">
                      {activeAction.ticket.objectName} • Technicien :{' '}
                      <strong className="text-app-text">{activeAction.ticket.assignedTechName || '—'}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void confirmInstalled(activeAction.ticket)}
                    className="w-full min-h-14 px-5 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={18} aria-hidden="true" />
                    <span>Installé à la table</span>
                  </button>
                </div>
              )}

              {activeAction.kind === 'exit' && (
                <div className="p-4 sm:p-5 rounded-2xl bg-app-input border-2 border-app-card-border space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-lg font-display font-bold uppercase text-app-text">
                      {activeAction.ticket.visitorName} — {activeAction.ticket.objectName}
                    </h4>
                    <p className="text-sm font-bold text-primary">
                      {FOLLOW_UP_LABELS[activeAction.ticket.extraData?.followUpType as keyof typeof FOLLOW_UP_LABELS]}
                      {activeAction.ticket.extraData?.followUpPart ? ` : ${activeAction.ticket.extraData.followUpPart}` : ''}
                      {activeAction.ticket.extraData?.followUpDetail ? ` (${activeAction.ticket.extraData.followUpDetail})` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => confirmExitHandled(activeAction.ticket)}
                    className="w-full min-h-14 px-5 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={18} aria-hidden="true" />
                    <span>Orientation effectuée</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* VUE LISTE COMPLÈTE (TOGGLEABLE) */}
      {showFullQueue && (
        <>
          <section className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-3">
            <h3 className="text-base font-display font-bold uppercase tracking-wider text-app-text flex items-center gap-2">
              <HandHeart size={18} className="text-warning" aria-hidden="true" />
              <span>Demandes d'aide des réparateurs ({helpAlerts.length})</span>
            </h3>
            {helpAlerts.length === 0 ? (
              <p className="text-xs text-app-text-muted font-sans py-3">Aucune demande d'aide en cours.</p>
            ) : (
              <div className="space-y-2.5">
                {helpAlerts.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-warning/10 border-2 border-warning/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-micro bg-warning text-secondary px-2.5 py-0.5 rounded-full font-display font-black uppercase">
                          Table {t.extraData?.tableNumber || '?'}
                        </span>
                        <span className="font-display font-bold text-sm text-app-text uppercase">{t.objectName}</span>
                      </div>
                      <p className="text-xs text-app-text">
                        Réparateur : <strong>{t.assignedTechName || 'Technicien'}</strong> • {t.extraData?.helpRequest?.reason}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void resolveHelp(t)}
                      className="min-h-12 px-5 py-2.5 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-xs cursor-pointer flex items-center justify-center gap-2 shrink-0"
                    >
                      <CheckCircle size={16} aria-hidden="true" />
                      <span>J'interviens / Résolu</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-3">
            <h3 className="text-base font-display font-bold uppercase tracking-wider text-app-text flex items-center gap-2">
              <Megaphone size={18} className="text-primary" aria-hidden="true" />
              <span>Visiteurs appelés aux tables ({pendingCalls.length})</span>
            </h3>
            {pendingCalls.length === 0 ? (
              <p className="text-xs text-app-text-muted font-sans py-3">Aucun appel de table en attente d'accompagnement.</p>
            ) : (
              <div className="space-y-2.5">
                {pendingCalls.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-app-input border border-app-card-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <span className="text-sm font-display font-bold text-app-text uppercase block">
                        {t.visitorName} → Table {t.extraData?.tableNumber || '?'}
                      </span>
                      <span className="text-xs text-app-text-muted block">
                        {t.objectName} • Technicien : {t.assignedTechName || '—'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void confirmInstalled(t)}
                      className="min-h-12 px-5 py-2.5 rounded-2xl bg-primary/15 border-2 border-primary text-primary font-display font-black uppercase text-xs cursor-pointer flex items-center justify-center gap-2 shrink-0"
                    >
                      <CheckCircle size={16} aria-hidden="true" />
                      <span>Installé à la table</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-3">
            <h3 className="text-base font-display font-bold uppercase tracking-wider text-app-text flex items-center gap-2">
              <Store size={18} className="text-primary" aria-hidden="true" />
              <span>Orientations de sortie & Boutique ({exitOrientations.length})</span>
            </h3>
            {exitOrientations.length === 0 ? (
              <p className="text-xs text-app-text-muted font-sans py-3">Aucune orientation pièce ou boutique enregistrée.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {exitOrientations.map((t) => {
                  const followType = t.extraData?.followUpType as keyof typeof FOLLOW_UP_LABELS;
                  return (
                    <div key={t.id} className="p-3.5 rounded-2xl bg-app-input border border-app-card-border space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-bold text-sm text-app-text uppercase">{t.visitorName}</span>
                        <Wrench size={14} className="text-primary shrink-0" aria-hidden="true" />
                      </div>
                      <p className="text-xs text-app-text-muted">{t.objectName}</p>
                      <p className="text-xs font-bold text-primary">
                        {FOLLOW_UP_LABELS[followType]}
                        {t.extraData?.followUpPart ? ` : ${t.extraData.followUpPart}` : ''}
                        {t.extraData?.followUpDetail ? ` (${t.extraData.followUpDetail})` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
