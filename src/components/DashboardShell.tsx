import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { EventSettings, PartnerLogo } from '../types';
import { MATRICES_LIST } from './MatrixSelector';
import { 
  House, Download, Database, Wifi,
  Maximize, Minimize, Settings2, MonitorUp, HardDriveDownload, AlertTriangle
} from 'lucide-react';
import type { FileBackupState } from '../utils/backupFile';
import type { SqliteBackupStatus } from '../utils/sqliteBackup';
import { motion, AnimatePresence } from 'motion/react';
import ThemeToggle from './shared/ThemeToggle';
import EventMetaBadges from './shared/EventMetaBadges';
import TabSwitcher, { type TabItem } from './shared/TabSwitcher';
import BrandLogo from './shared/BrandLogo';
import Button from './shared/Button';

interface DashboardShellProps {
  event: EventSettings;
  currentTab: string;
  onTabChange: (tab: string) => void;
  onLeaveEvent: () => void;
  onExportData: () => void;
  netStatus: string;
  sessionCode: string;
  onOpenNetModal: () => void;
  onOpenPublicWindow: () => void;
  // Sauvegarde SQLite hors du navigateur (exe PC, APK) ; 'unavailable' ailleurs
  sqliteStatus?: SqliteBackupStatus;
  sqliteSavedAt?: number | null;
  // Fichier de secours sur le disque (absent quand le navigateur ne le permet pas, ex. tablette)
  fileBackupState?: FileBackupState;
  fileBackupName?: string | null;
  onFileBackupClick?: () => void;
  mismatchedClientVersions?: string[];
  currentVersion?: string;
  isPublicWindow: boolean; // Fenêtre dédiée au projecteur : pas de retour vers la régie
  isLightTheme: boolean;
  onToggleTheme: () => void;
  children: React.ReactNode;
}

const PROJECTOR_IDLE_MS = 3000;

export default function DashboardShell({
  event,
  currentTab,
  onTabChange,
  onLeaveEvent,
  onExportData,
  netStatus,
  sessionCode,
  onOpenNetModal,
  onOpenPublicWindow,
  sqliteStatus = 'unavailable',
  sqliteSavedAt = null,
  fileBackupState = 'unsupported',
  fileBackupName = null,
  onFileBackupClick,
  mismatchedClientVersions = [],
  currentVersion = __APP_VERSION__,
  isPublicWindow,
  isLightTheme,
  onToggleTheme,
  children
}: DashboardShellProps) {
  const matrixInfo = MATRICES_LIST.find((m) => m.type === event.type) || MATRICES_LIST[0];
  const Icon = matrixInfo.icon;
  const isPublicView = currentTab === 'public';
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Écran public : commandes et curseur masqués après quelques secondes sans pointeur ni clavier
  const [isPointerIdle, setIsPointerIdle] = useState(false);
  useEffect(() => {
    if (!isPublicView) {
      setIsPointerIdle(false);
      return;
    }
    let timer = window.setTimeout(() => setIsPointerIdle(true), PROJECTOR_IDLE_MS);
    const wake = () => {
      setIsPointerIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIsPointerIdle(true), PROJECTOR_IDLE_MS);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [isPublicView]);

  // Hauteur réelle de l'en-tête régie, exposée en variable CSS pour les colonnes collantes
  const adminHeaderRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = adminHeaderRef.current;
    const root = document.documentElement;
    if (!header) {
      root.style.removeProperty('--app-header-h');
      return;
    }
    const observer = new ResizeObserver(() => {
      root.style.setProperty('--app-header-h', `${header.offsetHeight}px`);
    });
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--app-header-h');
    };
  }, [isPublicView]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Logos des partenaires enregistrés dans extraData
  const partnerLogos: PartnerLogo[] = event.extraData?.partnerLogos || [];

  // Les onglets de régie du kiosque partagent un seul module : il reste monté (saisie, chronos, tirage)
  const panelKey = event.type === 'kiosque_concours' && !isPublicView ? 'regie' : currentTab;

  // Définir les onglets selon la matrice active
  let tabs: TabItem[] = [];
  if (event.type === 'reparothon') {
    tabs = [
      { id: 'accueil', label: 'Console d\'accueil' },
      { id: 'techniciens', label: 'Gestion Techniciens' },
      { id: 'public', label: 'Écran Public' }
    ];
  } else if (event.type === 'kiosque_concours') {
    tabs = [
      { id: 'pistes', label: 'Pistes' },
      { id: 'participants', label: 'Participants' },
      { id: 'tirage', label: 'Tirage' },
      { id: 'public', label: 'Écran public' }
    ];
  } else {
    tabs = [
      { id: 'enregistrements', label: 'Présences & Inscriptions' },
      { id: 'bilan', label: 'Bilan & Évaluation' },
      { id: 'public', label: 'Écran Public' }
    ];
  }

  return (
    <div className={`min-h-screen flex flex-col bg-app-bg text-app-text transition-colors duration-300 relative z-10 ${
      isPublicView ? `min-h-screen lg:h-screen lg:h-[100dvh] lg:overflow-hidden kiosk-auto-scroll ${isPointerIdle ? 'cursor-none' : ''}` : ''
    }`}>
      {/* ==================================================================== */}
      {/* EN-TÊTE ÉCRAN PUBLIC (Kiosque immersif et épuré) */}
      {/* ==================================================================== */}
      {isPublicView ? (
        <header className="shrink-0 bg-app-header border-b-2 border-primary/40 px-4 sm:px-6 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top,0px))] flex items-center justify-between gap-4 shadow-lg backdrop-blur-xl z-40">
          {/* Logo Insertech officiel & Titre adaptatif */}
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <BrandLogo size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-primary/20 text-primary border border-primary/40 text-kiosk-caption font-black uppercase font-display tracking-widest shrink-0">
                  Concours Insertech
                </span>
                <h1
                  className="text-app-text font-black tracking-tight uppercase font-display line-clamp-1 sm:line-clamp-2"
                  style={{ fontSize: 'clamp(1.1rem, 1.8vw, 1.55rem)', lineHeight: 1.15 }}
                  title={event.name}
                >
                  {event.name}
                </h1>
              </div>
              <EventMetaBadges date={event.date} location={event.location} partner={event.partner} className="mt-0.5" />
            </div>
          </div>

          {/* Zone droite : Dock Partenaires standardisé + Séparateur + Commandes discrètes */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Dock Partenaire Standardisé */}
            {(partnerLogos.length > 0 || event.partner) && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-app-text-muted hidden md:inline shrink-0 uppercase tracking-wider">
                  Propulsé avec
                </span>
                <div className="flex items-center gap-1.5">
                  {partnerLogos.length > 0 ? (
                    partnerLogos.map((pl) => (
                      <div
                        key={pl.id}
                        title={`Partenaire : ${pl.name}`}
                        className="h-[38px] px-3.5 py-1 rounded-full bg-white border border-slate-200/90 shadow-sm flex items-center justify-center shrink-0 max-w-[130px] overflow-hidden"
                      >
                        <img
                          src={pl.data}
                          alt={pl.name}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    ))
                  ) : (
                    <div
                      title={`Partenaire : ${event.partner}`}
                      className="h-[38px] px-3.5 py-1 rounded-full bg-white border border-slate-200/90 shadow-sm flex items-center justify-center shrink-0 max-w-[150px] text-xs font-bold text-slate-800"
                    >
                      <span className="truncate">{event.partner}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Séparateur vertical discret */}
            <div className={`h-6 w-px bg-app-card-border shrink-0 transition-opacity duration-500 ${isPointerIdle ? 'opacity-0' : ''}`} aria-hidden="true" />

            {/* Groupe des commandes d'administration (contraste accessible 75% au repos, 100% au survol) */}
            <div
              className={`flex items-center gap-1.5 transition-opacity duration-500 shrink-0 focus-within:opacity-100 ${
                isPointerIdle ? 'opacity-0 pointer-events-none' : 'opacity-75 hover:opacity-100'
              }`}
            >
              {/* Bouton bascule vers l'écran d'administration / chrono (absent de la fenêtre projecteur) */}
              {!isPublicWindow && (
              <Button
                size="sm"
                onClick={() => onTabChange(tabs[0].id)}
                title="Basculer vers la console de régie"
                aria-label="Basculer vers la console d'administration"
              >
                <Settings2 size={14} className="text-primary" aria-hidden="true" />
                <span className="hidden md:inline">Mode Régie</span>
              </Button>
              )}

              {/* Basculeur de thème partagé */}
              <ThemeToggle isLightTheme={isLightTheme} onToggle={onToggleTheme} />

              {/* Plein écran télé / moniteur */}
              <Button
                variant="primary"
                size="icon-sm"
                onClick={toggleFullscreen}
                title={isFullscreen ? "Quitter le plein écran" : "Passer en plein écran télé (Kiosque)"}
                aria-label={isFullscreen ? "Quitter le plein écran" : "Passer en plein écran télé"}
              >
                {isFullscreen ? <Minimize size={14} aria-hidden="true" /> : <Maximize size={14} aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </header>
      ) : (
        /* ==================================================================== */
        /* EN-TÊTE STANDARD RÉGIE (Admin, Réseau, Sauvegarder, Quitter)         */
        /* ==================================================================== */
        <header
          ref={adminHeaderRef}
          className="sticky top-0 z-40 bg-app-header border-b-4 border-primary px-4 sm:px-6 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 shadow-xl backdrop-blur-xl transition-colors duration-300"
        >
          {/* Identité visuelle */}
          <div className="flex items-center gap-3.5 shrink-0">
            <BrandLogo alt="Insertech Événements" />
            <div>
              <h1 className="text-app-text font-bold text-lg tracking-tight uppercase font-display flex items-center gap-1.5 leading-none whitespace-nowrap">
                Insertech <span className="text-primary font-black">Événements</span>
              </h1>
              <p className="text-micro text-app-text-muted font-semibold mt-1">
                Tableau de bord autonome et 100% hors-ligne
              </p>
            </div>
          </div>

          {/* Détails de l'événement actif (anti-doublon et largeur fluide) */}
          <div className="flex flex-wrap items-center gap-2.5 bg-app-input border border-app-card-border p-2 rounded-2xl flex-1 basis-[24rem] min-w-0 transition-colors duration-300 shadow-sm">
            {event.name.trim().toLowerCase() !== matrixInfo.title.trim().toLowerCase() ? (
              <>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/25 rounded-xl text-primary font-display font-bold text-xs uppercase tracking-wide shrink-0">
                  <Icon size={14} />
                  <span>{matrixInfo.title}</span>
                </div>
                <div className="w-px h-5 bg-app-card-border hidden md:block"></div>
                <div className="text-sm font-black text-app-text min-w-0 max-w-[340px] truncate uppercase font-display" title={event.name}>
                  {event.name}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 bg-primary/15 border border-primary/30 rounded-xl text-primary font-display font-black text-sm uppercase tracking-wide">
                <Icon size={15} />
                <span>{event.name}</span>
              </div>
            )}
            <div className="w-px h-5 bg-app-card-border hidden md:block"></div>
            <EventMetaBadges date={event.date} location={event.location} partner={event.partner} />
          </div>

          {/* Onglets de navigation et boutons d'actions */}
          <div className="flex flex-wrap items-center gap-2.5 ml-auto justify-end">
            <TabSwitcher
              tabs={tabs}
              currentTab={currentTab}
              onTabChange={onTabChange}
              ariaLabel="Navigation des vues de l'événement"
            />

            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={onOpenPublicWindow}
                title="Ouvrir l'écran public dans une nouvelle fenêtre, à glisser sur le projecteur ou la télé"
                className="!bg-primary/15 !border-primary/50 text-primary"
              >
                <MonitorUp size={13} aria-hidden="true" />
                <span>Projecteur</span>
              </Button>

              <Button
                size="sm"
                onClick={onOpenNetModal}
                title={`Statut réseau : ${netStatus}`}
                className={sessionCode ? '!bg-primary/20 text-primary !border-primary/50' : ''}
              >
                <Wifi size={13} aria-hidden="true" />
                <span>{sessionCode ? sessionCode : 'Réseau LAN'}</span>
              </Button>

              {mismatchedClientVersions.map((clientVer) => (
                <span
                  key={clientVer}
                  role="status"
                  title="Une tablette connectée n'utilise pas la même version que le PC principal. La synchronisation continue normalement."
                  className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-lg border bg-warning/15 border-warning/50 text-warning text-xs font-bold font-display"
                >
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>{`Tablette en ${clientVer}, PC en ${currentVersion}`}</span>
                </span>
              ))}

              <ThemeToggle isLightTheme={isLightTheme} onToggle={onToggleTheme} />

              <Button size="sm" onClick={onExportData} title="Exporter une sauvegarde JSON de cet événement">
                <Download size={13} aria-hidden="true" />
                <span>Sauvegarder</span>
              </Button>

              {sqliteStatus !== 'unavailable' && (
                <span
                  role="status"
                  title={
                    sqliteStatus === 'ok'
                      ? `Sauvegarde SQLite à jour${sqliteSavedAt ? ` (${new Date(sqliteSavedAt).toLocaleTimeString('fr-CA')})` : ''} : les données sont aussi gardées hors du navigateur`
                      : sqliteStatus === 'error'
                        ? 'Sauvegarde SQLite injoignable : les données restent dans le navigateur, nouvel essai automatique'
                        : 'Sauvegarde SQLite en cours'
                  }
                  className={`inline-flex items-center gap-1 min-h-[32px] px-2 rounded-lg border text-xs font-bold font-display uppercase tracking-wider ${
                    sqliteStatus === 'error'
                      ? 'bg-warning/15 border-warning/50 text-warning'
                      : 'bg-success/15 border-success/50 text-success'
                  }`}
                >
                  <Database size={13} aria-hidden="true" />
                  <span>{sqliteStatus === 'error' ? 'SQLite hors ligne' : 'SQLite'}</span>
                </span>
              )}

              {fileBackupState !== 'unsupported' && onFileBackupClick && (
                <Button
                  size="sm"
                  onClick={onFileBackupClick}
                  title={
                    fileBackupState === 'on'
                      ? `Fichier de secours actif${fileBackupName ? ` (${fileBackupName})` : ''}, mis à jour chaque minute. Cliquez pour en choisir un autre.`
                      : fileBackupState === 'needs-permission'
                        ? "Le fichier de secours n'est plus mis à jour depuis le redémarrage : cliquez pour l'autoriser à nouveau"
                        : 'Choisir un fichier sur le disque, mis à jour chaque minute avec les données de cette activité'
                  }
                  className={
                    fileBackupState === 'on'
                      ? '!bg-success/15 !border-success/50 text-success'
                      : fileBackupState === 'needs-permission'
                        ? '!bg-warning/15 !border-warning/50 text-warning'
                        : ''
                  }
                >
                  <HardDriveDownload size={13} aria-hidden="true" />
                  <span>
                    {fileBackupState === 'on' ? 'Secours actif' : fileBackupState === 'needs-permission' ? 'Réactiver le secours' : 'Fichier de secours'}
                  </span>
                </Button>
              )}

              {/* Séparateur pour isoler le retour au menu de Sauvegarder */}
              <div className="w-px h-5 bg-app-card-border mx-1 hidden sm:block" />

              {/* Les données restent enregistrées : l'activité se rouvre depuis l'historique du menu principal */}
              <Button size="sm" onClick={onLeaveEvent} title="Retourner au menu principal (l'activité reste enregistrée)">
                <House size={13} aria-hidden="true" />
                <span>Menu principal</span>
              </Button>
            </div>
          </div>
        </header>
      )}

      {/* Zone de contenu principale débridée en largeur (jusqu'à 1850px) */}
      <main className={`flex-1 w-full transition-all duration-300 ${
        isPublicView 
          ? 'flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-2 sm:p-4 flex flex-col kiosk-auto-scroll' 
          : event.type === 'kiosque_concours'
            ? 'max-w-[1850px] mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5 flex-1 flex flex-col min-h-0'
            : 'max-w-[1850px] mx-auto px-4 md:px-6 py-4 md:py-6'
      }`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${event.id}-${panelKey}`}
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role={isPublicView ? undefined : 'tabpanel'}
            id={isPublicView ? undefined : `panel-${currentTab}`}
            aria-labelledby={isPublicView ? undefined : `tab-${currentTab}`}
            className={isPublicView ? 'min-h-full lg:h-full flex flex-col kiosk-auto-scroll' : ''}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Pied de page informatif sur IndexedDB - MASQUÉ COMPLÈTEMENT SUR L'ÉCRAN PUBLIC */}
      {!isPublicView && (
        <footer className="py-4 border-t border-app-card-border bg-app-bg-footer text-center text-micro text-app-text-muted font-sans flex items-center justify-center gap-1.5 transition-colors duration-300">
          <Database size={11} className="text-primary animate-pulse" />
          <span>IndexedDB locale active • Les données restent stockées localement sur cet ordinateur • v{currentVersion}</span>
        </footer>
      )}
    </div>
  );
}


