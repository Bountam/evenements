import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { EventSettings, PartnerLogo, WorkRole } from '../types';
import { MATRICES_LIST } from './MatrixSelector';
import {
  Download,
  Database,
  Wifi,
  Maximize,
  Minimize,
  Settings2,
  MonitorUp,
  HardDriveDownload,
  AlertTriangle,
  Sun,
  Moon,
  Lock,
  UserCheck,
  Library
} from 'lucide-react';
import type { FileBackupState } from '../utils/backupFile';
import type { SqliteBackupStatus } from '../utils/sqliteBackup';
import type { SyncIndicatorColor } from '../network';
import { WORK_ROLE_LABELS } from '../utils/modeLock';
import { motion, AnimatePresence } from 'motion/react';
import ThemeToggle from './shared/ThemeToggle';
import EventMetaBadges from './shared/EventMetaBadges';
import MoreMenu from './shared/MoreMenu';
import VolunteerSurveyButton from './shared/VolunteerSurveyButton';
import TabSwitcher, { type TabBadge, type TabItem } from './shared/TabSwitcher';
import BrandLogo from './shared/BrandLogo';
import Button from './shared/Button';

interface DashboardShellProps {
  event: EventSettings;
  currentTab: string;
  onTabChange: (tab: string) => void;
  // Pastilles d'état fournies par le module actif, par id d'onglet
  tabBadges?: Record<string, TabBadge>;
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
  isNetworkClient?: boolean; // Tablette connectée au PC principal
  isLightTheme: boolean;
  onToggleTheme: () => void;
  workRole?: WorkRole;
  isMobileDevice?: boolean;
  syncColor?: SyncIndicatorColor;
  onOpenRolePicker?: () => void;
  onLockScreen?: () => void;
  onOpenGuidesLibrary?: () => void;
  // Tablette : commandes de mode (verrouiller/déverrouiller Kiosque uniquement) affichées dans l'en-tête
  modeControls?: React.ReactNode;
  // Kiosque verrouillé : pas de retour au menu principal ni de fenêtre réseau
  hideNavigation?: boolean;
  children: React.ReactNode;
}

const PROJECTOR_IDLE_MS = 3000;

const SYNC_INDICATOR_STYLES: Record<SyncIndicatorColor, string> = {
  blue: '!bg-info/15 !border-info/50 text-info',
  yellow: '!bg-warning/15 !border-warning/50 text-warning',
  red: '!bg-danger/15 !border-danger/50 text-danger'
};

const SYNC_INDICATOR_LABELS: Record<SyncIndicatorColor, string> = {
  blue: 'Synchronisé',
  yellow: 'Connexion ou envoi en cours',
  red: 'Hors ligne / déconnecté'
};

export default function DashboardShell({
  event,
  currentTab,
  onTabChange,
  tabBadges = {},
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
  isNetworkClient = false,
  isLightTheme,
  onToggleTheme,
  workRole = 'admin',
  isMobileDevice = false,
  syncColor = 'red',
  onOpenRolePicker,
  onLockScreen,
  onOpenGuidesLibrary,
  modeControls = null,
  hideNavigation = false,
  children
}: DashboardShellProps) {
  const matrixInfo = MATRICES_LIST.find((m) => m.type === event.type) || MATRICES_LIST[0];
  const Icon = matrixInfo.icon;
  const isPublicView = currentTab === 'public';
  // Mode « Kiosque formulaire » d'une tablette : en-tête réduit, sans onglets ni menu
  const isKioskFormView = currentTab === 'formulaire';
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

  // Définir et filtrer les onglets selon la matrice active, le rôle et l'appareil
  // - Écran Public : uniquement sur Laptop (!isMobileDevice)
  // - Onglet Tirage : uniquement Admin
  // - Juge Concours : uniquement le cockpit Pistes
  // - Réparateur / Assistant : cockpit unique plein écran
  let tabs: TabItem[] = [];
  if (event.type === 'reparothon') {
    if (workRole === 'reparateur' || workRole === 'assistant') {
      tabs = [];
    } else {
      tabs = [
        { id: 'accueil', label: "Console d'accueil" },
        { id: 'techniciens', label: workRole === 'accueil' ? "File d'attente & Tables" : 'Gestion Techniciens' },
        ...(!isMobileDevice ? [{ id: 'public', label: 'Écran Public' }] : [])
      ];
    }
  } else if (event.type === 'install_fest_linux') {
    tabs = [
      { id: 'accueil', label: 'Accueil et suivi' },
      { id: 'techniciens', label: 'Bénévoles' },
      ...(!isMobileDevice ? [{ id: 'public', label: 'Écran public' }] : [])
    ];
  } else if (event.type === 'kiosque_concours') {
    if (workRole === 'juge') {
      tabs = [];
    } else {
      tabs = [
        { id: 'pistes', label: 'Pistes' },
        { id: 'participants', label: 'Participants' },
        ...(workRole === 'admin' ? [{ id: 'tirage', label: 'Tirage' }] : []),
        ...(!isMobileDevice ? [{ id: 'public', label: 'Écran public' }] : [])
      ];
    }
  } else {
    tabs = [
      { id: 'enregistrements', label: 'Présences & Inscriptions' },
      { id: 'bilan', label: 'Bilan & Évaluation' },
      ...(!isMobileDevice ? [{ id: 'public', label: 'Écran Public' }] : [])
    ];
  }

  if (isKioskFormView) {
    return (
      <div className="min-h-screen flex flex-col bg-app-bg text-app-text transition-colors duration-300 relative z-10">
        <header className="shrink-0 bg-app-header border-b-4 border-primary px-4 sm:px-6 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] flex items-center justify-between gap-4 shadow-lg">
          {hideNavigation ? (
            <div className="flex items-center gap-3.5 min-w-0">
              <BrandLogo size="lg" />
              <div className="min-w-0">
                <h1 className="text-app-text font-black tracking-tight uppercase font-display truncate text-xl" title={event.name}>
                  {event.name}
                </h1>
                <EventMetaBadges date={event.date} location={event.location} partner={event.partner} className="mt-0.5" />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLeaveEvent}
              title="Menu principal"
              aria-label="Menu principal"
              className="flex items-center gap-3.5 min-w-0 text-left cursor-pointer hover:opacity-90 transition"
            >
              <BrandLogo size="lg" />
              <div className="min-w-0">
                <h1 className="text-app-text font-black tracking-tight uppercase font-display truncate text-xl" title={event.name}>
                  {event.name}
                </h1>
                <EventMetaBadges date={event.date} location={event.location} partner={event.partner} className="mt-0.5" />
              </div>
            </button>
          )}
          <div className="flex items-center gap-2 shrink-0">
            {!hideNavigation && isMobileDevice && onOpenRolePicker && (
              <Button size="sm" onClick={onOpenRolePicker} title="Changer de rôle">
                <UserCheck size={14} className="text-primary" aria-hidden="true" />
                <span>{WORK_ROLE_LABELS[workRole]}</span>
              </Button>
            )}
            <VolunteerSurveyButton eventId={event.id} />
            {modeControls}
          </div>
        </header>
        <main className="flex-1 w-full px-3 sm:px-6 py-4 sm:py-8">{children}</main>
      </div>
    );
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
                  {matrixInfo.title}
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

            {/* Commandes de la tablette : effacées avec le reste au repos (rien de visible sur le téléviseur),
                mais toujours touchables : un appui les réveille et l'icône verrouillée se maintient encore */}
            {modeControls && (
              <div className={`shrink-0 transition-opacity duration-500 ${isPointerIdle ? 'opacity-0' : ''}`} data-testid="commandes-tablette">
                {modeControls}
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
              {!isPublicWindow && !hideNavigation && (
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
          {/* Identité visuelle (clic sur logo Insertech = Menu principal) */}
          {hideNavigation ? (
            <div className="flex items-center gap-3.5 shrink-0">
              <BrandLogo alt="Insertech Événements" />
              <div>
                <h1 className="text-app-text font-bold text-lg tracking-tight uppercase font-display flex items-center gap-1.5 leading-none whitespace-nowrap">
                  Insertech <span className="text-primary font-black">Événements</span>
                </h1>
                <p className="hidden lg:block text-micro text-app-text-muted font-semibold mt-1">
                  Tableau de bord autonome et 100% hors-ligne
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLeaveEvent}
              title="Menu principal (l'activité reste enregistrée)"
              aria-label="Menu principal"
              className="flex items-center gap-3.5 shrink-0 text-left cursor-pointer hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
            >
              <BrandLogo alt="Insertech Événements" />
              <div>
                <h1 className="text-app-text font-bold text-lg tracking-tight uppercase font-display flex items-center gap-1.5 leading-none whitespace-nowrap">
                  Insertech <span className="text-primary font-black">Événements</span>
                </h1>
                <p className="hidden lg:block text-micro text-app-text-muted font-semibold mt-1">
                  Tableau de bord autonome et 100% hors-ligne
                </p>
              </div>
            </button>
          )}

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

          {/* Onglets de navigation et boutons d'actions épurés selon le rôle */}
          <div className="flex flex-wrap items-center gap-2.5 ml-auto justify-end">
            {tabs.length > 0 && (
              <TabSwitcher
                tabs={tabs.map((tab) => (tabBadges[tab.id] ? { ...tab, badge: tabBadges[tab.id] } : tab))}
                currentTab={currentTab}
                onTabChange={onTabChange}
                ariaLabel="Navigation des vues de l'événement"
              />
            )}

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {/* Un seul bouton de rôle sur mobile/tablette (aucun bouton Changer de mode) */}
              {isMobileDevice && !hideNavigation && onOpenRolePicker && (
                <Button
                  size="sm"
                  onClick={onOpenRolePicker}
                  title="Changer de rôle ou d'activité"
                >
                  <UserCheck size={14} className="text-primary" aria-hidden="true" />
                  <span>{WORK_ROLE_LABELS[workRole]}</span>
                </Button>
              )}

              {/* Verrouillage PIN réservé uniquement au mode Kiosque d'inscription */}
              {workRole === 'kiosque_formulaire' && modeControls}

              {/* Icône de synchronisation seule (Bleu = synchronisé, Jaune = reconnexion/attente, Rouge = hors-ligne) */}
              {!hideNavigation && (
                <Button
                  size="icon-sm"
                  onClick={onOpenNetModal}
                  aria-label={`Synchronisation réseau : ${SYNC_INDICATOR_LABELS[syncColor]} (${netStatus})`}
                  title={`${SYNC_INDICATOR_LABELS[syncColor]} • ${sessionCode ? sessionCode : netStatus}`}
                  className={SYNC_INDICATOR_STYLES[syncColor]}
                >
                  <Wifi size={16} aria-hidden="true" />
                </Button>
              )}

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

              {/* Un réparateur ne doit jamais avoir de bouton de bénévolat dans l'en-tête */}
              {workRole !== 'reparateur' && <VolunteerSurveyButton eventId={event.id} />}

              {/* Le Rapport d'Impact est réservé à l'Administrateur */}
              {workRole === 'admin' && (
                <Button
                  size="sm"
                  onClick={onExportData}
                  data-testid="btn-open-impact-report"
                  title="Ouvrir le Centre de Rapport d'Impact (Excel, Markdown, LaTeX, CSV, JSON)"
                  className="!bg-primary/15 text-primary !border-primary/40"
                >
                  <Download size={13} aria-hidden="true" />
                  <span>Rapport d'Impact</span>
                </Button>
              )}

              {/* Commandes rares regroupées : projecteur (Laptop uniquement), verrouillage Laptop, thème, sauvegardes */}
              <MoreMenu
                alert={sqliteStatus === 'error' || fileBackupState === 'needs-permission'}
                alertText={sqliteStatus === 'error' ? 'sauvegarde SQLite hors ligne' : 'fichier de secours à réactiver'}
              >
                {(close) => (
                  <>
                    {/* Affichage secondaire / projecteur : offert uniquement sur le Laptop, jamais sur mobile */}
                    {!isMobileDevice && !isNetworkClient && (
                      <Button
                        size="sm"
                        onClick={() => {
                          close();
                          onOpenPublicWindow();
                        }}
                        title="Ouvrir l'écran public dans une nouvelle fenêtre, à glisser sur le projecteur ou la télé"
                        className="w-full !justify-start"
                      >
                        <MonitorUp size={13} className="text-primary" aria-hidden="true" />
                        <span>Ouvrir le projecteur</span>
                      </Button>
                    )}

                    {/* Verrouillage rapide du poste Laptop via code PIN (0000 par défaut) */}
                    {!isMobileDevice && onLockScreen && (
                      <Button
                        size="sm"
                        onClick={() => {
                          close();
                          onLockScreen();
                        }}
                        title="Verrouiller l'écran administrateur du Laptop (code 0000 par défaut)"
                        className="w-full !justify-start"
                      >
                        <Lock size={13} className="text-primary" aria-hidden="true" />
                        <span>Verrouiller le poste (PIN)</span>
                      </Button>
                    )}

                    <Button size="sm" onClick={onToggleTheme} className="w-full !justify-start">
                      {isLightTheme ? <Moon size={13} aria-hidden="true" /> : <Sun size={13} aria-hidden="true" />}
                      <span>{isLightTheme ? 'Passer au thème sombre' : 'Passer au thème clair'}</span>
                    </Button>

                    {workRole === 'admin' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          close();
                          onExportData();
                        }}
                        title="Ouvrir le Centre de Rapport d'Impact et Exports"
                        className="w-full !justify-start"
                      >
                        <Download size={13} aria-hidden="true" />
                        <span>Rapport d'Impact & Exports</span>
                      </Button>
                    )}

                    {!isMobileDevice && workRole === 'admin' && onOpenGuidesLibrary && (
                      <Button
                        size="sm"
                        onClick={() => {
                          close();
                          onOpenGuidesLibrary();
                        }}
                        title="Gérer et pré-télécharger les guides de réparation hors-ligne"
                        className="w-full !justify-start"
                      >
                        <Library size={13} className="text-primary" aria-hidden="true" />
                        <span>Bibliothèque de guides hors-ligne</span>
                      </Button>
                    )}

                    {fileBackupState !== 'unsupported' && onFileBackupClick && (
                      <Button
                        size="sm"
                        onClick={() => {
                          close();
                          onFileBackupClick();
                        }}
                        title={
                          fileBackupState === 'on'
                            ? `Fichier de secours actif${fileBackupName ? ` (${fileBackupName})` : ''}, mis à jour chaque minute. Cliquez pour en choisir un autre.`
                            : fileBackupState === 'needs-permission'
                              ? "Le fichier de secours n'est plus mis à jour depuis le redémarrage : cliquez pour l'autoriser à nouveau"
                              : 'Choisir un fichier sur le disque, mis à jour chaque minute avec les données de cette activité'
                        }
                        className={`w-full !justify-start ${
                          fileBackupState === 'on'
                            ? '!bg-success/15 !border-success/50 text-success'
                            : fileBackupState === 'needs-permission'
                              ? '!bg-warning/15 !border-warning/50 text-warning'
                              : ''
                        }`}
                      >
                        <HardDriveDownload size={13} aria-hidden="true" />
                        <span>
                          {fileBackupState === 'on' ? 'Secours actif' : fileBackupState === 'needs-permission' ? 'Réactiver le secours' : 'Fichier de secours'}
                        </span>
                      </Button>
                    )}

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
                        className={`inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl border text-xs font-bold ${
                          sqliteStatus === 'error'
                            ? 'bg-warning/15 border-warning/50 text-warning'
                            : 'bg-success/15 border-success/50 text-success'
                        }`}
                      >
                        <Database size={13} aria-hidden="true" />
                        <span>
                          {sqliteStatus === 'error'
                            ? 'SQLite hors ligne'
                            : `SQLite à jour${sqliteSavedAt ? ` (${new Date(sqliteSavedAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })})` : ''}`}
                        </span>
                      </span>
                    )}
                  </>
                )}
              </MoreMenu>

              {/* Fin des actions d'en-tête (retour au menu principal via le logo Insertech) */}
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


