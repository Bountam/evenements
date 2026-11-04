import React from 'react';
import { ClipboardList, MonitorPlay, Settings2, House } from 'lucide-react';
import type { EventSettings } from '../../types';
import { MODE_LABELS, type ModeUsage } from '../../utils/modeLock';
import BrandLogo from '../shared/BrandLogo';
import Button from '../shared/Button';

interface ModePickerProps {
  event: EventSettings;
  onPick: (mode: ModeUsage) => void;
  onLeaveEvent: () => void;
}

const TILES: Array<{ mode: ModeUsage; icon: React.ComponentType<{ size?: number; className?: string }>; description: string }> = [
  {
    mode: 'animateur',
    icon: Settings2,
    description: "Les onglets de régie de l'activité : inscriptions, suivi, chronos, tirage."
  },
  {
    mode: 'ecran_public',
    icon: MonitorPlay,
    description: "L'affichage pour le public, à brancher ou à diffuser sur un téléviseur."
  },
  {
    mode: 'kiosque_formulaire',
    icon: ClipboardList,
    description: "Le formulaire d'inscription seul, en plein écran, à laisser aux visiteurs."
  }
];

// Choix du mode d'usage d'une tablette, après la connexion au PC hôte
export default function ModePicker({ event, onPick, onLeaveEvent }: ModePickerProps) {
  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col">
      <header className="flex items-center justify-between gap-4 px-4 sm:px-6 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] border-b-4 border-primary bg-app-header">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo />
          <div className="min-w-0">
            <p className="text-micro uppercase font-bold text-app-text-muted">Activité du PC hôte</p>
            <h1 className="font-display font-black uppercase text-lg truncate">{event.name}</h1>
          </div>
        </div>
        <Button size="sm" onClick={onLeaveEvent} title="Retourner à l'accueil de la tablette">
          <House size={13} aria-hidden="true" />
          <span>Accueil</span>
        </Button>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-8 flex flex-col justify-center gap-6">
        <h2 className="font-display font-black uppercase tracking-wider text-xl text-center">Comment utiliser cette tablette ?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TILES.map(({ mode, icon: Icon, description }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onPick(mode)}
              className="min-h-44 flex flex-col items-center justify-center gap-3 p-6 rounded-3xl bg-app-card border-2 border-app-card-border hover:border-primary focus-visible:border-primary text-center transition cursor-pointer shadow-sm"
            >
              <Icon size={40} className="text-primary" />
              <span className="font-display font-black uppercase tracking-wider text-lg">{MODE_LABELS[mode]}</span>
              <span className="text-xs text-app-text-muted">{description}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-app-text-muted text-center">
          Le choix est gardé au redémarrage. Une fois le mode verrouillé, seul le code défini sur le PC permet d'en sortir.
        </p>
      </main>
    </div>
  );
}
