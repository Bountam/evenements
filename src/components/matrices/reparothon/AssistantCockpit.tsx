import React from 'react';
import { HandHeart, CheckCircle, Megaphone, Store, Wrench } from 'lucide-react';
import type { RepairTicket } from '../../../types';
import { networkManager } from '../../../network';
import { FOLLOW_UP_LABELS } from '../../../utils/repairLexicon';
import { showToast } from '../../shared/Toast';

interface AssistantCockpitProps {
  tickets: RepairTicket[];
  onReload: () => Promise<void>;
}

export default function AssistantCockpit({ tickets, onReload }: AssistantCockpitProps) {
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
    await onReload();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* 1. Alertes d'aide des réparateurs */}
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
                  onClick={() => resolveHelp(t)}
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

      {/* 2. Visiteurs appelés à accompagner aux tables */}
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
                  onClick={() => confirmInstalled(t)}
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

      {/* 3. Orientation sortie & Boutique Insertech */}
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
    </div>
  );
}
