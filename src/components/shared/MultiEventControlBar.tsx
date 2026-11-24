import React, { useEffect, useState } from 'react';
import { Layers, LayoutGrid, Check, FileSpreadsheet } from 'lucide-react';
import type { EventSettings } from '../../types';
import { db } from '../../db';
import Modal from '../shared/Modal';
import { exportConsolidatedMultiEventXlsx } from '../../utils/impactReport';
import { showToast } from '../shared/Toast';

interface MultiEventControlBarProps {
  activeEvent: EventSettings;
  onSelectEvent: (evt: EventSettings) => void;
}

const PINNED_KEY = 'insertech_pinned_event_ids';

export default function MultiEventControlBar({ activeEvent, onSelectEvent }: MultiEventControlBarProps) {
  const [allEvents, setAllEvents] = useState<EventSettings[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(PINNED_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [showPicker, setShowPicker] = useState(false);
  const [showTower, setShowTower] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    db.events.toArray().then((list) => setAllEvents(list.sort((a, b) => b.createdAt - a.createdAt)));
  }, [activeEvent.id]);

  useEffect(() => {
    const merged = Array.from(new Set([activeEvent.id, ...pinnedIds]));
    localStorage.setItem(PINNED_KEY, JSON.stringify(merged));
  }, [activeEvent.id, pinnedIds]);

  const effectiveIds = Array.from(new Set([activeEvent.id, ...pinnedIds]));
  const pinnedEvents = allEvents.filter((e) => effectiveIds.includes(e.id));

  useEffect(() => {
    if (!showTower) return;
    Promise.all(
      pinnedEvents.map(async (evt) => {
        const [tCount, pCount, aCount] = await Promise.all([
          db.tickets.where('eventId').equals(evt.id).count(),
          db.participants.where('eventId').equals(evt.id).count(),
          db.attendees.where('eventId').equals(evt.id).count()
        ]);
        return [evt.id, tCount + pCount + aCount] as const;
      })
    ).then((entries) => setCounts(Object.fromEntries(entries)));
  }, [showTower, pinnedEvents.length]);

  const togglePin = (id: string) => {
    if (id === activeEvent.id) return;
    setPinnedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (allEvents.length <= 1) return null;

  return (
    <div className="max-w-7xl mx-auto mb-4 space-y-3">
      <div className="bg-app-card border border-app-card-border rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {pinnedEvents.map((evt) => (
            <button
              key={evt.id}
              type="button"
              onClick={() => onSelectEvent(evt)}
              className={`min-h-10 px-3.5 py-1.5 rounded-xl font-display font-bold uppercase text-xs cursor-pointer border ${
                evt.id === activeEvent.id
                  ? 'bg-primary text-secondary border-primary'
                  : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
              }`}
            >
              {evt.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pinnedEvents.length > 1 && (
            <button
              type="button"
              onClick={() => setShowTower((v) => !v)}
              className="min-h-10 px-3 py-1.5 rounded-xl bg-primary/15 border border-primary text-primary font-display font-bold uppercase text-xs cursor-pointer flex items-center gap-1.5"
            >
              <LayoutGrid size={14} aria-hidden="true" />
              <span>Tour de contrôle</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="min-h-10 px-3 py-1.5 rounded-xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer flex items-center gap-1.5"
          >
            <Layers size={14} className="text-primary" aria-hidden="true" />
            <span>Multi-événements</span>
          </button>
        </div>
      </div>

      {showTower && pinnedEvents.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pinnedEvents.map((evt) => (
            <div key={evt.id} className="p-4 rounded-2xl bg-app-card border border-app-card-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-micro uppercase font-black text-primary block">{evt.type.replace('_', ' ')}</span>
                <span className="font-display font-bold text-sm text-app-text uppercase truncate block">{evt.name}</span>
                <span className="text-xs text-app-text-muted">{counts[evt.id] ?? 0} fiches enregistrées</span>
              </div>
              <button
                type="button"
                onClick={() => onSelectEvent(evt)}
                className="min-h-10 px-3 py-1.5 rounded-xl bg-primary text-secondary font-display font-bold uppercase text-xs cursor-pointer shrink-0"
              >
                Ouvrir
              </button>
            </div>
          ))}
          <div className="sm:col-span-2 pt-2 border-t border-app-card-border flex justify-end">
            <button
              type="button"
              onClick={async () => {
                try {
                  const file = await exportConsolidatedMultiEventXlsx(effectiveIds);
                  showToast(`Bilan consolidé exporté : ${file}`, 'success');
                } catch {
                  showToast("Erreur lors de l'export consolidé.", 'error');
                }
              }}
              className="min-h-11 px-4 py-2 rounded-xl bg-primary text-secondary font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-2"
            >
              <FileSpreadsheet size={15} />
              <span>Bilan Consolidé (.xlsx)</span>
            </button>
          </div>
        </div>
      )}

      <Modal isOpen={showPicker} onClose={() => setShowPicker(false)} title="Gérer plusieurs événements ensemble" icon={Layers}>
        <div className="space-y-2">
          {allEvents.map((evt) => {
            const pinned = effectiveIds.includes(evt.id);
            return (
              <button
                key={evt.id}
                type="button"
                onClick={() => togglePin(evt.id)}
                className={`w-full min-h-12 px-4 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer ${
                  pinned ? 'bg-primary/15 border-primary text-app-text' : 'bg-app-input border-app-card-border text-app-text-muted'
                }`}
              >
                <span className="text-sm font-display font-bold uppercase">{evt.name}</span>
                {pinned && <Check size={16} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
