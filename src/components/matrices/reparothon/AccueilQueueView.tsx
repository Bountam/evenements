import React, { useState } from 'react';
import { Megaphone, PackagePlus, Search, Clock } from 'lucide-react';
import type { EventSettings, RepairTicket, Technician } from '../../../types';
import { networkManager } from '../../../network';
import { showToast } from '../../shared/Toast';
import ScrollZone from '../../shared/ScrollZone';

interface AccueilQueueViewProps {
  event: EventSettings;
  tickets: RepairTicket[];
  technicians: Technician[];
  onReload: () => Promise<void>;
  onAddDeviceForVisitor: (ticket: RepairTicket) => void;
}

export default function AccueilQueueView({
  event,
  tickets,
  technicians,
  onReload,
  onAddDeviceForVisitor
}: AccueilQueueViewProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'waiting' | 'active' | 'done'>('all');

  const waitingCount = tickets.filter((t) => t.status === 'en_attente').length;
  const activeCount = tickets.filter((t) => t.status === 'assigne' || t.status === 'en_cours').length;
  const doneCount = tickets.filter((t) => ['repare', 'semi_repare', 'non_reparable', 'abandonne'].includes(t.status)).length;
  const freeTechsCount = Math.max(1, technicians.filter((t) => t.status === 'libre').length);
  const estimatedWaitMin = waitingCount === 0 ? 0 : Math.max(5, Math.round((waitingCount / freeTechsCount) * 15));

  const filtered = tickets.filter((t) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      t.visitorName.toLowerCase().includes(q) ||
      t.objectName.toLowerCase().includes(q) ||
      (t.assignedTechName || '').toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (filter === 'waiting') return t.status === 'en_attente';
    if (filter === 'active') return t.status === 'assigne' || t.status === 'en_cours';
    if (filter === 'done') return ['repare', 'semi_repare', 'non_reparable', 'abandonne'].includes(t.status);
    return true;
  });

  const handleCallToTable = async (ticket: RepairTicket) => {
    const tech = technicians.find((tc) => tc.id === ticket.assignedTechId);
    const tableNum = ticket.extraData?.tableNumber ?? tech?.tableNumber ?? '?';
    try {
      const updated: RepairTicket = {
        ...ticket,
        updatedAt: Date.now(),
        extraData: {
          ...(ticket.extraData || {}),
          tableNumber: tableNum,
          tableCallAt: Date.now()
        }
      };
      await networkManager.writeToDatabase('tickets', 'put', updated);
      const channel = new BroadcastChannel(`insertech_reparothon_sync_${event.id}`);
      channel.postMessage({ type: 'TABLE_CALL', ticketId: ticket.id, tableNumber: tableNum });
      channel.close();
      await onReload();
      showToast(`Appel envoyé sur l'Écran Public (Table ${tableNum}) !`, 'success');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-app-card-border">
        <div>
          <span className="text-micro font-black uppercase tracking-widest text-primary block">
            Vue Animateur d'Accueil
          </span>
          <h3 className="text-lg font-display font-bold uppercase text-app-text">
            File d'attente & Tables ({filtered.length})
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-app-input border border-app-card-border font-bold text-app-text">
            En attente : {waitingCount}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-warning/15 border border-warning/30 font-bold text-warning">
            Aux tables : {activeCount}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/30 font-bold text-primary">
            Terminés : {doneCount}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-app-input border border-app-card-border font-bold text-app-text-muted inline-flex items-center gap-1.5">
            <Clock size={14} className="text-primary" />
            <span>Attente estimée : ~{estimatedWaitMin} min</span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-3.5 text-app-text-muted" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un visiteur ou appareil..."
            className="w-full min-h-11 bg-app-input border border-app-input-border rounded-xl pl-9 pr-3 py-2 text-xs text-app-text focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Tous' },
            { id: 'waiting', label: 'En attente' },
            { id: 'active', label: 'À une table' },
            { id: 'done', label: 'Terminés' }
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id as any)}
              className={`min-h-11 px-4 py-2 rounded-xl text-xs font-bold font-display uppercase transition cursor-pointer ${
                filter === f.id
                  ? 'bg-primary text-secondary'
                  : 'bg-app-input text-app-text-muted border border-app-card-border hover:text-app-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-app-text-muted text-center py-8">Aucun visiteur dans cette vue.</p>
      ) : (
        <ScrollZone className="space-y-3 max-h-[600px] pr-1">
          {filtered.map((t) => {
            const waitMin = Math.max(0, Math.round((Date.now() - t.createdAt) / 60000));
            const tech = technicians.find((tc) => tc.id === t.assignedTechId);
            const tableNum = t.extraData?.tableNumber ?? tech?.tableNumber;
            return (
              <div
                key={t.id}
                className="p-4 rounded-2xl bg-app-input border border-app-card-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold font-display text-app-text text-base uppercase">{t.visitorName}</h4>
                    <span className="text-micro px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-bold uppercase">
                      {t.objectName}
                    </span>
                  </div>
                  <p className="text-xs text-app-text-muted">
                    {t.status === 'en_attente'
                      ? `En attente depuis ${waitMin} min`
                      : t.assignedTechName
                        ? `${tableNum ? `Table ${tableNum} • ` : ''}${t.assignedTechName}`
                        : `Statut : ${t.status.replace('_', ' ')}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {(t.status === 'assigne' || t.status === 'en_cours') && (
                    <button
                      type="button"
                      onClick={() => handleCallToTable(t)}
                      className="min-h-11 px-3.5 py-2 rounded-xl bg-primary text-secondary text-xs font-bold font-display uppercase cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Megaphone size={14} />
                      <span>Appeler à la Table {tableNum ?? '?'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onAddDeviceForVisitor(t)}
                    className="min-h-11 px-3.5 py-2 rounded-xl bg-app-card border border-app-card-border text-app-text text-xs font-bold font-display uppercase hover:border-primary/60 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <PackagePlus size={14} className="text-primary" />
                    <span>+ Ajouter un appareil à ce visiteur</span>
                  </button>
                </div>
              </div>
            );
          })}
        </ScrollZone>
      )}
    </div>
  );
}
