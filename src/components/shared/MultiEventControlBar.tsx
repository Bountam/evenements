import React, { useEffect, useRef, useState } from 'react';
import { Layers, LayoutGrid, Check, FileSpreadsheet, ChevronDown, Pin } from 'lucide-react';
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

function useMultiEventState(activeEvent: EventSettings) {
  const [allEvents, setAllEvents] = useState<EventSettings[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(PINNED_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [showTower, setShowTower] = useState(false);

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
          db.attendees.where('eventId').equals(evt.id).count(),
        ]);
        return [evt.id, tCount + pCount + aCount] as const;
      })
    ).then((entries) => setCounts(Object.fromEntries(entries)));
  }, [showTower, pinnedEvents.length]);

  const togglePin = (id: string) => {
    if (id === activeEvent.id) return;
    setPinnedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return { allEvents, effectiveIds, pinnedEvents, counts, showTower, setShowTower, togglePin };
}

// Sélecteur compact intégré directement dans le titre cliquable de l'en-tête Laptop
export function MultiEventHeaderSelector({ activeEvent, onSelectEvent }: MultiEventControlBarProps) {
  const { allEvents, effectiveIds, pinnedEvents, counts, showTower, setShowTower, togglePin } =
    useMultiEventState(activeEvent);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  if (allEvents.length <= 1) {
    return (
      <h1
        className="text-sm sm:text-base font-black text-app-text truncate uppercase font-display max-w-[140px] sm:max-w-[240px] md:max-w-[300px]"
        title={activeEvent.name}
      >
        {activeEvent.name}
      </h1>
    );
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        title={`${activeEvent.name} — Changer ou gérer plusieurs événements`}
        className="inline-flex items-center gap-1.5 min-h-9 max-w-[150px] sm:max-w-[240px] md:max-w-[300px] px-2.5 py-1 rounded-xl bg-app-input border border-app-card-border hover:border-primary/60 text-app-text font-black text-sm uppercase font-display cursor-pointer transition"
      >
        <span className="truncate">{activeEvent.name}</span>
        {pinnedEvents.length > 1 && (
          <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-micro font-mono font-black shrink-0">
            {pinnedEvents.length}
          </span>
        )}
        <ChevronDown size={14} className={`shrink-0 text-app-text-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 w-80 max-w-[90vw] p-2 rounded-2xl bg-app-card border border-app-card-border shadow-2xl z-50 space-y-1.5 backdrop-blur-xl"
        >
          <p className="px-2 py-1 text-micro font-bold uppercase text-app-text-muted">
            Activités récentes ({pinnedEvents.length} épinglées)
          </p>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {pinnedEvents.map((evt) => {
              const isCurrent = evt.id === activeEvent.id;
              return (
                <button
                  key={evt.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onSelectEvent(evt);
                  }}
                  className={`w-full min-h-10 px-3 py-1.5 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer text-xs font-display font-bold uppercase ${
                    isCurrent
                      ? 'bg-primary text-secondary border-primary'
                      : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                  }`}
                >
                  <span className="truncate">{evt.name}</span>
                  {isCurrent && <Check size={14} className="shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <div className="pt-1.5 border-t border-app-card-border flex flex-wrap gap-1.5">
            {pinnedEvents.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setShowTower(true);
                }}
                className="flex-1 min-h-9 px-2.5 py-1 rounded-xl bg-primary/15 border border-primary text-primary font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <LayoutGrid size={13} aria-hidden="true" />
                <span>Tour de contrôle</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setShowPicker(true);
              }}
              className="flex-1 min-h-9 px-2.5 py-1 rounded-xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <Pin size={13} className="text-primary" aria-hidden="true" />
              <span>Épingler</span>
            </button>
          </div>
        </div>
      )}

      <Modal isOpen={showTower} onClose={() => setShowTower(false)} title="Tour de contrôle multi-événements" icon={LayoutGrid}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pinnedEvents.map((evt) => (
              <div key={evt.id} className="p-4 rounded-2xl bg-app-input border border-app-card-border flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-micro uppercase font-black text-primary block">{evt.type.replace('_', ' ')}</span>
                  <span className="font-display font-bold text-sm text-app-text uppercase truncate block">{evt.name}</span>
                  <span className="text-xs text-app-text-muted">{counts[evt.id] ?? 0} fiches enregistrées</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowTower(false);
                    onSelectEvent(evt);
                  }}
                  className="min-h-10 px-3 py-1.5 rounded-xl bg-primary text-secondary font-display font-bold uppercase text-xs cursor-pointer shrink-0"
                >
                  Ouvrir
                </button>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-app-card-border flex justify-end">
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
              <FileSpreadsheet size={15} aria-hidden="true" />
              <span>Bilan Consolidé (.xlsx)</span>
            </button>
          </div>
        </div>
      </Modal>

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

export default function MultiEventControlBar({ activeEvent, onSelectEvent }: MultiEventControlBarProps) {
  const { allEvents, effectiveIds, pinnedEvents, counts, showTower, setShowTower, togglePin } =
    useMultiEventState(activeEvent);
  const [showPicker, setShowPicker] = useState(false);

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
