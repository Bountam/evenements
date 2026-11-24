import React, { useEffect, useState } from 'react';
import { Clock, ArrowLeftRight, Plus, Zap, Megaphone, MapPin } from 'lucide-react';
import type { EventSettings, RepairTicket, Technician } from '../../../types';
import { networkManager } from '../../../network';
import { showToast } from '../../shared/Toast';

interface AdminMapAndGodModeProps {
  event: EventSettings;
  tickets: RepairTicket[];
  technicians: Technician[];
  onReload: () => Promise<void>;
}

const DELAY_BADGE_CLASSES = {
  ok: 'bg-primary/15 text-primary border-primary/30',
  warn: 'bg-warning/15 text-warning border-warning/40',
  late: 'bg-danger/15 text-danger border-danger/40 animate-pulse'
} as const;

export default function AdminMapAndGodMode({
  event,
  tickets,
  technicians,
  onReload
}: AdminMapAndGodModeProps) {
  const [now, setNow] = useState(Date.now());
  const [movingTicketId, setMovingTicketId] = useState<string | null>(null);
  const [flashText, setFlashText] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const waitingTickets = tickets.filter((t) => t.status === 'en_attente');
  const sortedTechs = [...technicians].sort((a, b) => (a.tableNumber ?? 999) - (b.tableNumber ?? 999));

  const assignTicketToTech = async (ticketId: string, tech: Technician) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    const ts = Date.now();
    await networkManager.writeToDatabase('tickets', 'put', {
      ...ticket,
      status: 'en_cours',
      assignedTechId: tech.id,
      assignedTechName: tech.name,
      updatedAt: ts,
      extraData: {
        ...ticket.extraData,
        assignedAt: ticket.extraData?.assignedAt || ts,
        serviceStartedAt: ticket.extraData?.serviceStartedAt || ts,
        tableNumber: tech.tableNumber ?? null,
        repairStage: ticket.extraData?.repairStage || 'accueil_table'
      }
    });
    await networkManager.writeToDatabase('technicians', 'put', {
      ...tech,
      status: 'occupe',
      currentTicketId: tech.currentTicketId || ticket.id
    });
    setMovingTicketId(null);
    showToast(`${ticket.objectName} assigné à ${tech.name}.`, 'success');
    await onReload();
  };

  const togglePriority = async (ticket: RepairTicket) => {
    await networkManager.writeToDatabase('tickets', 'put', {
      ...ticket,
      updatedAt: Date.now(),
      extraData: { ...ticket.extraData, priority: !ticket.extraData?.priority }
    });
    await onReload();
  };

  const sendFlash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flashText.trim()) return;
    await networkManager.writeToDatabase('events', 'put', {
      ...event,
      extraData: {
        ...event.extraData,
        publicFlash: { text: flashText.trim(), timestamp: Date.now() }
      }
    });
    setFlashText('');
    showToast('Message flash envoyé sur l’Écran Public.', 'success');
    await onReload();
  };

  return (
    <div className="space-y-5">
      <div className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-app-card-border">
          <h3 className="text-base font-display font-bold uppercase tracking-wider text-app-text flex items-center gap-2">
            <MapPin size={18} className="text-primary" aria-hidden="true" />
            <span>Vue « Map » des Tables & God Mode</span>
          </h3>
          <form onSubmit={sendFlash} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Message flash Écran Public..."
              value={flashText}
              onChange={(e) => setFlashText(e.target.value)}
              className="bg-app-input border border-app-input-border rounded-xl px-3 py-2 min-h-10 text-xs text-app-text"
            />
            <button
              type="submit"
              className="min-h-10 px-3.5 py-2 rounded-xl bg-primary text-secondary font-display font-bold uppercase text-xs cursor-pointer flex items-center gap-1.5"
            >
              <Megaphone size={14} aria-hidden="true" />
              <span>Diffuser</span>
            </button>
          </form>
        </div>

        {sortedTechs.length === 0 ? (
          <p className="text-xs text-app-text-muted py-4">Ajoutez des techniciens ci-dessous pour voir la carte des tables.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedTechs.map((tech) => {
              const activeForTech = tickets.filter(
                (t) => t.assignedTechId === tech.id && ['assigne', 'en_cours'].includes(t.status)
              );
              return (
                <div
                  key={tech.id}
                  className="p-4 rounded-2xl bg-app-input border border-app-card-border flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold text-sm uppercase text-app-text">
                        {tech.tableNumber ? `Table ${tech.tableNumber} • ` : ''}
                        {tech.name}
                      </span>
                      <span className="text-micro font-mono font-bold text-primary">
                        {activeForTech.length} appareil{activeForTech.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    {activeForTech.length === 0 ? (
                      <p className="text-xs text-app-text-muted italic">Table libre</p>
                    ) : (
                      <div className="space-y-2">
                        {activeForTech.map((t) => {
                          const startAt = t.extraData?.serviceStartedAt || t.updatedAt;
                          const elapsedMin = Math.max(0, Math.floor((now - startAt) / 60000));
                          const tone = elapsedMin > 45 ? 'late' : elapsedMin >= 25 ? 'warn' : 'ok';
                          return (
                            <div key={t.id} className="p-2.5 rounded-xl bg-app-card border border-app-card-border space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-app-text truncate">{t.objectName}</span>
                                <span
                                  className={`text-micro px-2 py-0.5 rounded-full border font-mono font-bold inline-flex items-center gap-1 shrink-0 ${DELAY_BADGE_CLASSES[tone]}`}
                                >
                                  <Clock size={10} aria-hidden="true" />
                                  <span>{elapsedMin} min</span>
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-micro text-app-text-muted truncate">{t.visitorName}</span>
                                <button
                                  type="button"
                                  onClick={() => setMovingTicketId(movingTicketId === t.id ? null : t.id)}
                                  className="text-micro text-primary font-bold uppercase cursor-pointer inline-flex items-center gap-1"
                                >
                                  <ArrowLeftRight size={11} aria-hidden="true" />
                                  <span>Déplacer</span>
                                </button>
                              </div>
                              {movingTicketId === t.id && (
                                <div className="flex flex-wrap gap-1 pt-1 border-t border-app-card-border">
                                  {sortedTechs
                                    .filter((other) => other.id !== tech.id)
                                    .map((other) => (
                                      <button
                                        key={other.id}
                                        type="button"
                                        onClick={() => assignTicketToTech(t.id, other)}
                                        className="text-micro px-2 py-1 rounded bg-primary/15 text-primary font-bold cursor-pointer"
                                      >
                                        → {other.tableNumber ? `T${other.tableNumber} ` : ''}
                                        {other.name}
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {waitingTickets.length > 0 && (
                    <select
                      aria-label={`Assigner un appareil supplémentaire à ${tech.name}`}
                      value=""
                      onChange={(e) => assignTicketToTech(e.target.value, tech)}
                      className="w-full bg-app-card border border-app-card-border rounded-xl px-3 py-2 min-h-10 text-xs text-app-text cursor-pointer"
                    >
                      <option value="" disabled>
                        {activeForTech.length > 0 ? '+ Assigner un 2e appareil...' : '+ Assigner un appareil...'}
                      </option>
                      {waitingTickets.map((wt) => (
                        <option key={wt.id} value={wt.id}>
                          {wt.extraData?.priority ? '⚡ ' : ''}
                          {wt.objectName} ({wt.visitorName})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {waitingTickets.length > 0 && (
          <div className="pt-3 border-t border-app-card-border flex flex-wrap items-center gap-2">
            <span className="text-micro uppercase font-black text-app-text-muted">Prioriser en file :</span>
            {waitingTickets.slice(0, 6).map((wt) => (
              <button
                key={wt.id}
                type="button"
                onClick={() => togglePriority(wt)}
                className={`min-h-9 px-3 py-1 rounded-xl border text-xs font-bold cursor-pointer inline-flex items-center gap-1 ${
                  wt.extraData?.priority
                    ? 'bg-warning text-secondary border-warning'
                    : 'bg-app-input text-app-text border-app-card-border'
                }`}
              >
                <Zap size={12} aria-hidden="true" />
                <span>{wt.objectName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
