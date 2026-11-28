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
  Library,
  Type,
  Contrast,
  Check,
  ClipboardList,
  Wrench,
  Users,
  Monitor,
  Timer,
  Ticket,
  ClipboardCheck,
  BarChart3
} from 'lucide-react';
import type { FileBackupState } from '../utils/backupFile';
import type { SqliteBackupStatus } from '../utils/sqliteBackup';
import type { SyncIndicatorColor } from '../network';
import { WORK_ROLE_LABELS } from '../utils/modeLock';
import { readA11yPrefs, subscribeA11yPrefs, toggleA11yPref, type A11yPrefs } from '../utils/accessibility';
import { motion, AnimatePresence } from 'motion/react';
import ThemeToggle from './shared/ThemeToggle';
import EventMetaBadges from './shared/EventMetaBadges';
import MoreMenu from './shared/MoreMenu';
import VolunteerSurveyButton from './shared/VolunteerSurveyButton';
import TabSwitcher, { type TabBadge, type TabItem } from './shared/TabSwitcher';
import { MultiEventHeaderSelector } from './shared/MultiEventControlBar';
import BrandLogo from './shared/BrandLogo';
import ScrollZone from './shared/ScrollZone';
import Button from './shared/Button';

interface DashboardShellProps {
  event: EventSettings;
  onSelectEvent?: (evt: EventSettings) => void;
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
  onSelectEvent,
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
  // Mode « Kiosque formulaire » d'une tablette : en-tête permanent épuré
  const isKioskFormView = currentTab === 'formulaire';
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [a11yPrefs, setA11yPrefs] = useState<A11yPrefs>(readA11yPrefs);
  // Onglets en bas sur cellulaire en portrait (< 640 px), en colonne à gauche sur cellulaire en paysage (< 480 px de haut)
  const NARROW_QUERY = '(max-width: 639px), (max-height: 480px)';
  const [isNarrowScreen, setIsNarrowScreen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW_QUERY).matches : false
  );

  useEffect(() => subscribeA11yPrefs(setA11yPrefs), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(NARROW_QUERY);
    const sync = () => setIsNarrowScreen(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

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
        { id: 'accueil', label: "Console d'accueil", icon: ClipboardList },
        { id: 'techniciens', label: workRole === 'accueil' ? "File d'attente & Tables" : 'Gestion Techniciens', icon: Wrench },
        ...(!isMobileDevice ? [{ id: 'public', label: 'Écran Public', icon: Monitor }] : [])
      ];
    }
  } else if (event.type === 'install_fest_linux') {
    tabs = [
      { id: 'accueil', label: 'Accueil et suivi', icon: ClipboardList },
      { id: 'techniciens', label: 'Bénévoles', icon: Users },
      ...(!isMobileDevice ? [{ id: 'public', label: 'Écran public', icon: Monitor }] : [])
    ];
  } else if (event.type === 'kiosque_concours') {
    if (workRole === 'juge') {
      tabs = [];
    } else {
      tabs = [
        { id: 'pistes', label: 'Pistes', icon: Timer },
        { id: 'participants', label: 'Participants', icon: Users },
        ...(workRole === 'admin' ? [{ id: 'tirage', label: 'Tirage', icon: Ticket }] : []),
        ...(!isMobileDevice ? [{ id: 'public', label: 'Écran public', icon: Monitor }] : [])
      ];
    }
  } else {
    tabs = [
      { id: 'enregistrements', label: 'Présences & Inscriptions', icon: ClipboardCheck },
      { id: 'bilan', label: 'Bilan & Évaluation', icon: BarChart3 },
      ...(!isMobileDevice ? [{ id: 'public', label: 'Écran Public', icon: Monitor }] : [])
    ];
  }

  const tabsWithBadges = tabs.map((tab) => (tabBadges[tab.id] ? { ...tab, badge: tabBadges[tab.id] } : tab));

  const renderMoreMenu = () => (
    <MoreMenu
      iconOnly
      alert={sqliteStatus === 'error' || fileBackupState === 'needs-permission'}
      alertText={sqliteStatus === 'error' ? 'sauvegarde SQLite hors ligne' : 'fichier de secours à réactiver'}
    >
      {(close) => (
        <>
          <Button
            size="sm"
            aria-pressed={a11yPrefs.largeText}
            onClick={() => toggleA11yPref('largeText')}
            className={`w-full !justify-between ${a11yPrefs.largeText ? '!bg-primary/15 !border-primary text-primary' : ''}`}
          >
            <span className="inline-flex items-center gap-2">
              <Type size={13} aria-hidden="true" />
              <span>Texte agrandi</span>
            </span>
            {a11yPrefs.largeText && <Check size={13} aria-hidden="true" />}
          </Button>

          <Button
            size="sm"
            aria-pressed={a11yPrefs.highContrast}
            onClick={() => toggleA11yPref('highContrast')}
            className={`w-full !justify-between ${a11yPrefs.highContrast ? '!bg-primary/15 !border-primary text-primary' : ''}`}
          >
            <span className="inline-flex items-center gap-2">
              <Contrast size={13} aria-hidden="true" />
              <span>Contraste élevé</span>
            </span>
            {a11yPrefs.highContrast && <Check size={13} aria-hidden="true" />}
          </Button>

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

          {!isMobileDevice && onLockScreen && (
            <Button
              size="sm"
              onClick={() => {
                close();
                onLockScreen();
              }}
              title="Verrouiller l'écran administrateur du Laptop"
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

          <span className="block px-1 text-micro text-app-text-muted">
            Données gardées sur cet appareil (IndexedDB) • v{currentVersion}
          </span>

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
  );

  if (isKioskFormView) {
    return (
      <div className="h-dvh flex flex-col overflow-hidden bg-app-bg text-app-text transition-colors duration-300 relative z-10">
        <header className="z-40 shrink-0 h-14 min-h-14 court:h-11 court:min-h-11 bg-app-header border-b-2 border-primary px-2.5 sm:px-4 flex items-center justify-between gap-2 shadow-lg backdrop-blur-xl">
          {hideNavigation ? (
            <div className="flex items-center gap-2">
              <BrandLogo size="md" alt="Insertech" />
              <h1 className="text-app-text font-black tracking-tight uppercase font-display truncate text-sm sm:text-base max-w-[160px] sm:max-w-[280px] max-sm:hidden" title={event.name}>
                {event.name}
              </h1>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLeaveEvent}
              title="Menu principal"
              aria-label="Menu principal"
              className="flex items-center gap-2 text-left cursor-pointer hover:opacity-90 transition rounded-xl"
            >
              <BrandLogo size="md" alt="Insertech" />
              <h1 className="text-app-text font-black tracking-tight uppercase font-display truncate text-sm sm:text-base max-w-[160px] sm:max-w-[280px] max-sm:hidden" title={event.name}>
                {event.name}
              </h1>
            </button>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            {!hideNavigation && isMobileDevice && onOpenRolePicker && (
              <Button
                size="sm"
                onClick={onOpenRolePicker}
                title={`Changer de rôle (${WORK_ROLE_LABELS[workRole]})`}
                aria-label={`Changer de rôle (${WORK_ROLE_LABELS[workRole]})`}
              >
                <UserCheck size={14} className="text-primary" aria-hidden="true" />
                <span className="hidden md:inline">{WORK_ROLE_LABELS[workRole]}</span>
              </Button>
            )}
            <VolunteerSurveyButton eventId={event.id} iconOnly />
            {modeControls}
            {!hideNavigation && renderMoreMenu()}
          </div>
        </header>
        <ScrollZone as="main" kind="page" className="flex-1 w-full px-3 sm:px-6 py-3 sm:py-6 court:py-2">
          {children}
        </ScrollZone>
      </div>
    );
  }

  return (
    <div className={`h-dvh flex flex-col overflow-hidden bg-app-bg text-app-text transition-colors duration-300 relative z-10 ${
      isPublicView && isPointerIdle ? 'cursor-none' : ''
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
        /* EN-TÊTE PERMANENT COMPACT SUR UNE LIGNE (Icônes + zéro chevauchement) */
        /* ==================================================================== */
        <header
          ref={adminHeaderRef}
          className="z-40 shrink-0 h-14 min-h-14 court:h-11 court:min-h-11 bg-app-header border-b-2 border-primary px-2.5 sm:px-4 flex items-center justify-between gap-2 shadow-lg backdrop-blur-xl transition-colors duration-300"
        >
          {/* Logo Insertech (Menu principal) + Titre court cliquable sur Laptop */}
          <div className="flex items-center gap-2 shrink">
            {hideNavigation ? (
              <div className="shrink-0">
                <BrandLogo size="md" alt="Insertech Événements" />
              </div>
            ) : (
              <button
                type="button"
                onClick={onLeaveEvent}
                title="Menu principal (l'activité reste enregistrée)"
                aria-label="Menu principal"
                className="shrink-0 text-left cursor-pointer hover:opacity-90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
              >
                <BrandLogo size="md" alt="Insertech Événements" />
              </button>
            )}

            <Icon size={15} className="text-primary shrink-0 hidden sm:block" aria-hidden="true" />
            {!isMobileDevice && !isPublicWindow && onSelectEvent ? (
              <MultiEventHeaderSelector activeEvent={event} onSelectEvent={onSelectEvent} />
            ) : (
              <h1
                className="text-sm sm:text-base font-black text-app-text truncate uppercase font-display max-w-[130px] sm:max-w-[240px] md:max-w-[300px]"
                title={event.name}
              >
                {event.name}
              </h1>
            )}
          </div>

          {/* Onglets compacts dans l'en-tête sur >= 640px (sur mobile, barre fixe en bas) */}
          {!isNarrowScreen && tabsWithBadges.length > 0 && (
            <TabSwitcher
              tabs={tabsWithBadges}
              currentTab={currentTab}
              onTabChange={onTabChange}
              ariaLabel="Navigation des vues de l'événement"
              compact
            />
          )}

          {/* Actions icônes seules & commandes par rôle */}
          <div className="flex items-center justify-end gap-1.5 shrink-0">
            {isMobileDevice && !hideNavigation && onOpenRolePicker && (
              <Button
                size="sm"
                onClick={onOpenRolePicker}
                title={`Changer de rôle (${WORK_ROLE_LABELS[workRole]})`}
                aria-label={`Changer de rôle (${WORK_ROLE_LABELS[workRole]})`}
              >
                <UserCheck size={14} className="text-primary" aria-hidden="true" />
                <span className="hidden md:inline">{WORK_ROLE_LABELS[workRole]}</span>
              </Button>
            )}

            {workRole === 'kiosque_formulaire' && modeControls}

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
                title={`Version différente : tablette en ${clientVer}, PC en ${currentVersion}`}
                className="hidden sm:inline-flex items-center gap-1 min-h-8 px-2 rounded-lg border bg-warning/15 border-warning/50 text-warning text-micro font-bold font-display shrink-0"
              >
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{`Tablette en ${clientVer}, PC en ${currentVersion}`}</span>
              </span>
            ))}

            {workRole !== 'reparateur' && <VolunteerSurveyButton eventId={event.id} iconOnly />}

            {workRole === 'admin' && (
              <Button
                size="icon-sm"
                onClick={onExportData}
                data-testid="btn-open-impact-report"
                aria-label="Rapport d'Impact"
                title="Rapport d'Impact (Excel, Markdown, LaTeX, CSV, JSON)"
                className="!bg-primary/15 text-primary !border-primary/40 shrink-0"
              >
                <BarChart3 size={16} aria-hidden="true" />
              </Button>
            )}

            {renderMoreMenu()}
          </div>
        </header>
      )}

      {/* Contenu : prend toute la hauteur restante ; la barre d'onglets est en bas (portrait)
          ou en colonne à gauche (cellulaire en paysage). La page elle-même ne défile jamais. */}
      <div className="flex-1 min-h-0 flex flex-col court:flex-row">
        <ScrollZone
          as="main"
          kind="page"
          className={`flex-1 w-full transition-all duration-300 ${
            isPublicView
              ? 'p-2 sm:p-4 flex flex-col'
              : event.type === 'kiosque_concours'
                ? 'px-3 sm:px-6 py-2.5 sm:py-3.5 court:py-2 flex flex-col'
                : 'px-3 md:px-6 py-3 md:py-5 court:py-2'
          }`}
        >
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
              className={`w-full max-w-[1850px] mx-auto ${isPublicView || event.type === 'kiosque_concours' ? 'flex-1 min-h-0 flex flex-col' : 'h-full'}`}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </ScrollZone>

        {/* Barre d'onglets du bas sur cellulaire — un seul tablist monté à la fois */}
        {!isPublicView && isNarrowScreen && tabsWithBadges.length > 0 && (
          <TabSwitcher
            variant="bottom"
            tabs={tabsWithBadges}
            currentTab={currentTab}
            onTabChange={onTabChange}
            ariaLabel="Navigation des vues de l'événement"
            className="court:order-first"
          />
        )}
      </div>
    </div>
  );
}


