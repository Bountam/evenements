import React from 'react';
import { EventSettings, EventType } from '../types';
import { MATRICES_LIST } from './MatrixSelector';
import { 
  LogOut, Download, Database, Calendar, MapPin, Sparkles, Building, Wifi, Sun, Moon
} from 'lucide-react';

interface DashboardShellProps {
  event: EventSettings;
  currentTab: string;
  onTabChange: (tab: string) => void;
  onLeaveEvent: () => void;
  onExportData: () => void;
  netStatus: string;
  sessionCode: string;
  onOpenNetModal: () => void;
  isLightTheme: boolean;
  onToggleTheme: () => void;
  children: React.ReactNode;
}

export default function DashboardShell({
  event,
  currentTab,
  onTabChange,
  onLeaveEvent,
  onExportData,
  netStatus,
  sessionCode,
  onOpenNetModal,
  isLightTheme,
  onToggleTheme,
  children
}: DashboardShellProps) {
  const matrixInfo = MATRICES_LIST.find((m) => m.type === event.type) || MATRICES_LIST[0];
  const Icon = matrixInfo.icon;

  // Définir les onglets selon la matrice active
  let tabs: { id: string; label: string }[] = [];
  if (event.type === 'reparothon') {
    tabs = [
      { id: 'accueil', label: 'Console d\'accueil' },
      { id: 'techniciens', label: 'Gestion Techniciens' },
      { id: 'public', label: 'Écran Public' }
    ];
  } else if (event.type === 'kiosque_concours') {
    tabs = [
      { id: 'admin', label: 'Chronomètre & Inscriptions' },
      { id: 'public', label: 'Classement Public' }
    ];
  } else {
    // Fresque, Ateliers, Conférences, etc.
    tabs = [
      { id: 'enregistrements', label: 'Présences & Inscriptions' },
      { id: 'bilan', label: 'Bilan & Évaluation' },
      { id: 'public', label: 'Écran Public' }
    ];
  }

  return (
    <div className="min-h-screen flex flex-col bg-app-bg text-app-text transition-colors duration-300">
      {/* En-tête principal premium avec thème lime et violet */}
      <header className="sticky top-0 z-40 bg-app-header border-b-4 border-primary px-6 py-4 flex flex-col xl:flex-row items-center justify-between gap-4 shadow-xl backdrop-blur-md transition-colors duration-300">
        {/* Identité visuelle */}
        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center rotate-3 shadow-md shrink-0">
            <span className="text-secondary font-black text-xl font-display">I</span>
          </div>
          <div>
            <h1 className="text-app-text font-bold text-lg tracking-tight uppercase font-display flex items-center gap-1.5 leading-none">
              Insertech <span className="text-primary font-black">Événements</span>
            </h1>
            <p className="text-[10px] text-app-text-muted font-semibold mt-1">Tableau de bord autonome et 100% hors-ligne</p>
          </div>
        </div>

        {/* Détails de l'événement actif */}
        <div className="flex flex-wrap items-center gap-3 bg-app-input border border-app-card-border p-2.5 rounded-2xl w-full xl:w-auto transition-colors duration-300">
          <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-xl text-primary font-display font-semibold text-xs uppercase">
            <Icon size={14} />
            <span>{matrixInfo.title}</span>
          </div>
          <div className="w-px h-6 bg-app-card-border hidden md:block"></div>
          <div className="text-sm font-bold text-app-text max-w-[200px] truncate" title={event.name}>
            {event.name}
          </div>
          <div className="w-px h-6 bg-app-card-border hidden md:block"></div>
          <div className="flex items-center gap-3 text-xs text-app-text-muted font-medium">
            <span className="flex items-center gap-1">
              <Calendar size={12} className="text-primary" />
              {new Date(event.date + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <span className="flex items-center gap-1 max-w-[150px] truncate" title={event.location}>
              <MapPin size={12} className="text-primary" />
              {event.location}
            </span>
            {event.partner && (
              <span className="flex items-center gap-1 max-w-[150px] truncate text-app-text-muted" title={event.partner}>
                <Building size={12} className="text-primary" />
                {event.partner}
              </span>
            )}
          </div>
        </div>

        {/* Onglets de navigation et boutons d'actions */}
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-between xl:justify-end">
          {/* Onglets */}
          <div className="flex items-center bg-app-input p-1 rounded-xl border border-app-card-border transition-colors duration-300">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-display uppercase transition cursor-pointer ${
                  currentTab === tab.id
                    ? 'bg-primary text-secondary font-extrabold shadow'
                    : 'text-app-text-muted hover:text-app-text'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Actions rapides */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenNetModal}
              title={`Statut réseau : ${netStatus}`}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                sessionCode 
                  ? 'bg-primary/20 text-primary border-primary/50' 
                  : 'bg-app-card border-app-card-border text-app-text hover:scale-[1.02] active:scale-95'
              }`}
            >
              <Wifi size={14} className={sessionCode ? 'animate-pulse' : ''} />
              <span>{sessionCode ? sessionCode : 'Réseau LAN'}</span>
            </button>

            <button
              onClick={onToggleTheme}
              title={isLightTheme ? "Passer au thème sombre" : "Passer au thème clair"}
              className="flex items-center justify-center p-2 rounded-xl bg-app-card border border-app-card-border text-app-text hover:scale-[1.02] active:scale-95 transition cursor-pointer"
            >
              {isLightTheme ? <Moon size={14} /> : <Sun size={14} />}
            </button>

            <button
              onClick={onExportData}
              title="Exporter les données de cet événement en JSON"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-app-card border border-app-card-border text-app-text hover:scale-[1.02] active:scale-95 text-xs font-bold cursor-pointer transition"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Sauvegarder</span>
            </button>

            <button
              onClick={onLeaveEvent}
              title="Quitter cet événement et retourner au menu principal"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-950/40 border border-red-900/40 text-red-300 hover:bg-red-900/30 hover:text-white text-xs font-bold cursor-pointer transition"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Quitter</span>
            </button>
          </div>
        </div>
      </header>

      {/* Zone de contenu principale de l'activité */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8">
        {children}
      </main>

      {/* Pied de page informatif sur IndexedDB */}
      <footer className="py-4 border-t border-app-card-border bg-app-bg-footer text-center text-[10px] text-app-text-muted font-sans flex items-center justify-center gap-1.5 transition-colors duration-300">
        <Database size={11} className="text-primary animate-pulse" />
        <span>IndexedDB locale active • Les données restent stockées localement sur cet ordinateur</span>
      </footer>
    </div>
  );
}
