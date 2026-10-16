import React, { useState, useEffect } from 'react';
import { EventSettings, EventType } from './types';
import { db, notifySync, registerSyncListener, clearAllData, seedDemoData, saveAutoSnapshot } from './db';
import { SqliteBackupStatus, getSqliteBackupStatus, onSqliteBackupStatus, restoreFromSqliteIfEmpty, startSqliteBackup } from './utils/sqliteBackup';
import { FileBackupState, buildEventBackup, enableFileBackup, getFileBackupName, getFileBackupState, requestPersistentStorage, writeFileBackup } from './utils/backupFile';
import { networkManager } from './network';
import MatrixSelector from './components/MatrixSelector';
import DashboardShell from './components/DashboardShell';
import ReparothonMatrix from './components/matrices/ReparothonMatrix';
import TeardownMatrix from './components/matrices/TeardownMatrix';
import GenericMatrix from './components/matrices/GenericMatrix';
import { showToast } from './components/shared/Toast';
import MobileInstallModal from './components/shared/MobileInstallModal';
import Modal from './components/shared/Modal';
import SessionQrPanel from './components/shared/SessionQrPanel';
import { readJoinCodeFromUrl, clearJoinCodeFromUrl } from './utils/joinLink';
import ThemeToggle from './components/shared/ThemeToggle';
import { escapeCsvCell, escapeLatex, sanitizeFileName, clampNumber } from './utils/security';
import { 
  History, Calendar, MapPin, ArrowRight, Trash2, Upload, AlertCircle, FileJson, Sparkles, Wifi, X, Share2, Copy, AlertTriangle, Download, Smartphone
} from 'lucide-react';
import logoImage from './assets/logo.png';
import { formatTime } from './components/shared/Stopwatch';
import { getRaffleDraws } from './utils/raffle';

// Fenêtre dédiée à l'écran public (ouverte avec ?vue=public) : toujours verrouillée sur l'onglet public
const IS_PUBLIC_WINDOW =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('vue') === 'public';

// Onglet courant mémorisé par fenêtre, pour survivre à un rechargement
const TAB_STORAGE_KEY = 'insertech_current_tab';

function readSavedTab(): string {
  if (IS_PUBLIC_WINDOW) return 'public';
  try {
    return sessionStorage.getItem(TAB_STORAGE_KEY) || 'accueil';
  } catch (e) {
    return 'accueil';
  }
}

export default function App() {
  const [activeEvent, setActiveEvent] = useState<EventSettings | null>(null);
  const [pastEvents, setPastEvents] = useState<EventSettings[]>([]);
  const [currentTab, setCurrentTab] = useState<string>(readSavedTab);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirmId, setShowDeleteConfirmId] = useState<string | null>(null);
  const [deferredPwaPrompt, setDeferredPwaPrompt] = useState<any>(null);
  const [isStandalonePwa, setIsStandalonePwa] = useState<boolean>(false);
  const [showMobileInstallModal, setShowMobileInstallModal] = useState<boolean>(false);

  // Gestion de l'installation PWA Android / Tablette
  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      window.location.protocol === 'file:';
    setIsStandalonePwa(isStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPwaPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPwaPrompt(null);
      setIsStandalonePwa(true);
      showToast('Application installée avec succès sur votre appareil !', 'success');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (deferredPwaPrompt) {
      deferredPwaPrompt.prompt();
      const { outcome } = await deferredPwaPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPwaPrompt(null);
        setShowMobileInstallModal(false);
      }
    } else {
      setShowMobileInstallModal(true);
    }
  };

  // Thème clair/foncé d'Insertech
  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    return localStorage.getItem('insertech_theme_light') === 'true';
  });

  useEffect(() => {
    if (isLightTheme) {
      document.documentElement.classList.add('light');
      document.body.classList.add('light');
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('insertech_theme_light', 'true');
    } else {
      document.documentElement.classList.remove('light');
      document.body.classList.remove('light');
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('insertech_theme_light', 'false');
    }
  }, [isLightTheme]);

  // Le navigateur garde la base locale même quand l'espace disque manque
  useEffect(() => {
    if (!IS_PUBLIC_WINDOW) requestPersistentStorage();
  }, []);

  // Sauvegarde SQLite (exe PC, APK) : état affiché dans l'en-tête
  const [sqliteStatus, setSqliteStatus] = useState<{ status: SqliteBackupStatus; at: number | null }>(() => {
    const s = getSqliteBackupStatus();
    return { status: s.status, at: s.lastSavedAt };
  });
  useEffect(() => onSqliteBackupStatus((status, at) => setSqliteStatus({ status, at })), []);

  // Fichier de secours sur le disque : réécrit chaque minute quand les données ont changé
  const [fileBackupState, setFileBackupState] = useState<FileBackupState>('unsupported');
  const [fileBackupName, setFileBackupName] = useState<string | null>(null);
  useEffect(() => {
    if (!activeEvent || IS_PUBLIC_WINDOW) return;
    const eventId = activeEvent.id;
    let cancelled = false;
    let dirty = true;
    getFileBackupState(eventId).then((state) => { if (!cancelled) setFileBackupState(state); });
    getFileBackupName(eventId).then((name) => { if (!cancelled) setFileBackupName(name); });
    const unsubscribe = registerSyncListener(() => { dirty = true; });
    const timer = setInterval(async () => {
      if (!dirty) return;
      try {
        if (await writeFileBackup(eventId)) {
          dirty = false;
        } else if ((await getFileBackupState(eventId)) === 'needs-permission' && !cancelled) {
          setFileBackupState('needs-permission');
        }
      } catch (e) {
        console.warn('Échec du fichier de secours :', e);
      }
    }, 60000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, [activeEvent?.id]);

  const handleFileBackupClick = async () => {
    if (!activeEvent) return;
    try {
      const state = await enableFileBackup(activeEvent.id, `insertech_secours_${activeEvent.name}_${activeEvent.date}.json`.replace(/[\\/:*?"<>|]+/g, '-'));
      setFileBackupState(state);
      setFileBackupName(await getFileBackupName(activeEvent.id));
      if (state === 'on' && (await writeFileBackup(activeEvent.id))) {
        showToast('Fichier de secours enregistré. Il sera mis à jour chaque minute.', 'success');
      }
    } catch (e) {
      // Fenêtre de choix fermée sans fichier : rien à signaler
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.error(e);
        showToast("Impossible d'écrire le fichier de secours.", 'error');
      }
    }
  };

  // Sauvegarde automatique locale toutes les 5 minutes (300 000 ms)
  useEffect(() => {
    if (!activeEvent) return;

    const initialTimer = setTimeout(() => {
      saveAutoSnapshot(activeEvent.id);
    }, 20000);

    const intervalTimer = setInterval(() => {
      saveAutoSnapshot(activeEvent.id).then((snap) => {
        if (snap) {
          showToast('Sauvegarde automatique locale effectuée', 'info');
        }
      });
    }, 300000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [activeEvent?.id]);

  // Mémoriser l'onglet courant de cette fenêtre
  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, currentTab);
    } catch (e) {
      // Ignorer si sessionStorage indisponible
    }
  }, [currentTab]);

  // Ouvrir l'écran public dans une fenêtre séparée (à glisser sur le projecteur)
  const handleOpenPublicWindow = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('vue', 'public');
    url.hash = '';
    const publicWindow = window.open(url.toString(), 'insertech_ecran_public', 'popup,width=1280,height=720');
    if (!publicWindow) {
      showToast("La fenêtre a été bloquée par le navigateur. Autorisez les fenêtres surgissantes pour cette page.", 'warning');
    }
  };

  // Sauvegarde de secours et alerte avant fermeture
  useEffect(() => {
    // La fenêtre d'écran public ne bloque pas sa fermeture (la console garde les données)
    if (IS_PUBLIC_WINDOW) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeEvent) {
        saveAutoSnapshot(activeEvent.id);
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeEvent?.id]);

  // États du réseau P2P local
  const [netStatus, setNetStatus] = useState<string>('Local uniquement');
  const [sessionCode, setSessionCode] = useState<string>('');
  const [showNetModal, setShowNetModal] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [discoveredSessions, setDiscoveredSessions] = useState<any[]>([]);
  const [importValidation, setImportValidation] = useState<{
    fileName: string;
    eventData: {
      name: string;
      type: 'reparothon' | 'kiosque_concours' | 'communaute_pratique';
      date: string;
      location: string;
      partner?: string;
      place?: string;
      extraData?: Record<string, any>;
      tickets: any[];
      participants: any[];
      attendees: any[];
      technicians: any[];
    };
    conflicts: Array<{
      row: number;
      cell: string;
      severity: 'error' | 'warning';
      message: string;
      actionTaken: string;
    }>;
  } | null>(null);

  useEffect(() => {
    // S'abonner aux changements de statut réseau
    networkManager.onStatusChange = (status) => {
      setNetStatus(status);
    };

    // Auto-reconnexion réseau au chargement (jamais dans la fenêtre d'écran public :
    // elle suit la console du même ordinateur et réutiliser le code de session entrerait en conflit)
    if (IS_PUBLIC_WINDOW) {
      return () => {
        networkManager.onStatusChange = null;
      };
    }
    const savedRole = localStorage.getItem('insertech_net_role');
    const savedCode = localStorage.getItem('insertech_net_session_code');
    const savedEventId = localStorage.getItem('insertech_net_event_id');

    // Lien d'invitation (code QR) : ?rejoindre=CODE connecte directement cet appareil à la session,
    // sauf s'il en est déjà l'hôte (le PC principal qui scannerait son propre code)
    const joinCode = readJoinCodeFromUrl();
    clearJoinCodeFromUrl();
    const isOwnHostCode = savedRole === 'host' && savedCode === joinCode;

    if (joinCode && !isOwnHostCode) {
      networkManager.joinSession(joinCode, 'temp')
        .then(() => {
          setSessionCode(joinCode);
          showToast(`Connecté à la session ${joinCode}`, 'success');
        })
        .catch(() => showToast(`Session ${joinCode} introuvable. Vérifiez que le PC principal est en ligne.`, 'error'));
    } else if (savedRole && savedCode) {
      // Reprendre la session sur l'activité ouverte (celle du démarrage a pu être quittée depuis)
      const hostEventId = localStorage.getItem('insertech_active_event_id') || savedEventId;
      if (savedRole === 'host' && hostEventId) {
        networkManager.startHost(hostEventId, savedCode, true)
          .then((code) => setSessionCode(code))
          .catch(() => console.warn("Échec de la reconnexion automatique hôte."));
      } else if (savedRole === 'client') {
        networkManager.joinSession(savedCode, savedEventId || 'temp', true)
          .then(() => setSessionCode(savedCode))
          .catch(() => console.warn("Échec de la reconnexion automatique client."));
      }
    } else if (networkManager.sessionId) {
      // Si une session est déjà active au montage par un autre moyen
      setSessionCode(networkManager.sessionId);
    }

    return () => {
      networkManager.onStatusChange = null;
    };
  }, []);

  // Découverte automatique des sessions actives (MQTT) lors de l'ouverture du modal
  useEffect(() => {
    if (showNetModal && !sessionCode) {
      networkManager.onSessionsDiscovered = (sessions) => {
        setDiscoveredSessions(sessions);
      };
      networkManager.startSessionsSearch();
    } else {
      networkManager.stopSessionsSearch();
      setDiscoveredSessions([]);
    }

    return () => {
      networkManager.stopSessionsSearch();
    };
  }, [showNetModal, sessionCode]);

  // Depuis le menu principal, l'activité choisie dans la fenêtre Réseau est ouverte puis partagée
  const handleStartHost = async (eventToHost: EventSettings | null = activeEvent) => {
    if (!eventToHost) return;
    if (eventToHost.id !== activeEvent?.id) handleSelectPastEvent(eventToHost);
    try {
      const code = await networkManager.startHost(eventToHost.id);
      setSessionCode(code);
    } catch (e) {
      alert("Impossible de démarrer la session hôte. Vérifiez votre connexion Internet.");
    }
  };

  const handleJoinSession = async () => {
    if (!inputCode.trim()) return;
    try {
      await networkManager.joinSession(inputCode.trim().toUpperCase(), 'temp');
      setSessionCode(inputCode.trim().toUpperCase());
      setShowNetModal(false);
    } catch (e) {
      alert("Session introuvable. Vérifiez le code saisi.");
    }
  };

  const handleLeaveSession = () => {
    networkManager.leaveSession();
    setSessionCode('');
    setShowNetModal(false);
  };

  // Le PC principal partage toujours l'activité qu'il affiche, même ouverte après le démarrage de la session
  useEffect(() => {
    if (activeEvent && !IS_PUBLIC_WINDOW) networkManager.setHostEvent(activeEvent.id);
  }, [activeEvent?.id]);

  // Synchronisation et validation automatique de currentTab selon le type de matrice active
  useEffect(() => {
    if (activeEvent) {
      if (IS_PUBLIC_WINDOW) {
        if (currentTab !== 'public') setCurrentTab('public');
      } else if (activeEvent.type === 'reparothon') {
        if (!['accueil', 'techniciens', 'public'].includes(currentTab)) {
          setCurrentTab('accueil');
        }
      } else if (activeEvent.type === 'kiosque_concours') {
        if (!['admin', 'public'].includes(currentTab)) {
          setCurrentTab('admin');
        }
      } else {
        if (!['enregistrements', 'bilan', 'public'].includes(currentTab)) {
          setCurrentTab('enregistrements');
        }
      }
    }
  }, [activeEvent?.id, activeEvent?.type, currentTab]);

  // Charger l'état depuis localStorage et Dexie au démarrage
  const loadPastEvents = async () => {
    try {
      const allEvents = await db.events.toArray();
      // Trier par date décroissante
      setPastEvents(allEvents.sort((a, b) => b.createdAt - a.createdAt));
    } catch (e) {
      console.error(e);
    }
  };

  const initApp = async () => {
    setIsLoading(true);
    if (!IS_PUBLIC_WINDOW) {
      // Base du navigateur effacée : la reprendre depuis la sauvegarde SQLite avant tout affichage
      const restored = await restoreFromSqliteIfEmpty();
      if (restored > 0) {
        showToast(`${restored} activité${restored > 1 ? 's' : ''} restaurée${restored > 1 ? 's' : ''} depuis la sauvegarde SQLite.`, 'success');
      }
      startSqliteBackup();
    }
    await loadPastEvents();
    
    // Vérifier s'il y a un événement actif sauvegardé dans localStorage
    const savedEventId = localStorage.getItem('insertech_active_event_id');
    if (savedEventId) {
      try {
        const event = await db.events.get(savedEventId);
        if (event) {
          // L'onglet mémorisé est conservé ; l'effet de validation le corrige s'il ne convient pas à la matrice
          setActiveEvent(event);
        }
      } catch (e) {
        console.error(e);
      }
    }
    setIsLoading(false);
  };

  // Chargement initial, une seule fois : le relancer à chaque changement d'activité affichait l'écran
  // de chargement et démontait toute l'interface, effaçant les formulaires en cours de saisie
  useEffect(() => {
    initApp();
  }, []);

  // Ouvrir ou quitter une activité affiche le haut de la nouvelle vue
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeEvent?.id]);

  useEffect(() => {
    const unsubscribe = registerSyncListener(() => {
      loadPastEvents();
      const savedId = localStorage.getItem('insertech_active_event_id');
      if (savedId) {
        db.events.get(savedId).then(evt => {
          if (evt) setActiveEvent(evt);
        });
      } else {
        setActiveEvent(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // CRÉATION D'UN ÉVÉNEMENT
  const handleCreateEvent = async (settings: Omit<EventSettings, 'id' | 'createdAt'>) => {
    const newEvent: EventSettings = {
      ...settings,
      id: 'evt-' + Math.random().toString(36).substring(2, 11),
      createdAt: Date.now()
    };

    try {
      // 1. Ajouter à Dexie
      await db.events.add(newEvent);
      
      // 2. Pré-remplir avec des données de démonstration pour montrer un état vivant.
      // Facultatif : un échec ici ne doit pas empêcher d'ouvrir l'activité qui vient d'être enregistrée.
      try {
        await seedDemoData(newEvent.id, newEvent.type);
      } catch (seedError) {
        console.warn('Données de démonstration non ajoutées :', seedError);
      }

      // 3. Définir comme actif
      localStorage.setItem('insertech_active_event_id', newEvent.id);
      setActiveEvent(newEvent);
      
      // 4. Définir l'onglet selon le type de matrice
      if (newEvent.type === 'reparothon') {
        setCurrentTab('accueil');
      } else if (newEvent.type === 'kiosque_concours') {
        setCurrentTab('admin');
      } else {
        setCurrentTab('enregistrements');
      }

      await loadPastEvents();
      notifySync();
    } catch (e) {
      console.error(e);
      const detail = e instanceof Error ? e.message : String(e);
      showToast(`Impossible de créer l'activité : ${detail}`, 'error');
    }
  };

  // CHARGER UN ÉVÉNEMENT EXISTANT
  const handleSelectPastEvent = (event: EventSettings) => {
    localStorage.setItem('insertech_active_event_id', event.id);
    setActiveEvent(event);
    if (event.type === 'reparothon') {
      setCurrentTab('accueil');
    } else if (event.type === 'kiosque_concours') {
      setCurrentTab('admin');
    } else {
      setCurrentTab('enregistrements');
    }
    notifySync();
  };

  // QUITTER L'ÉVÉNEMENT (retour au sélecteur)
  const handleLeaveEvent = () => {
    localStorage.removeItem('insertech_active_event_id');
    setActiveEvent(null);
    notifySync();
  };

  // SUPPRIMER UN ÉVÉNEMENT DE L'HISTORIQUE
  const handleDeleteEvent = async (id: string) => {
    try {
      await db.transaction('rw', [db.events, db.tickets, db.technicians, db.participants, db.attendees], async () => {
        await db.events.delete(id);
        await db.tickets.where('eventId').equals(id).delete();
        await db.technicians.where('eventId').equals(id).delete();
        await db.participants.where('eventId').equals(id).delete();
        await db.attendees.where('eventId').equals(id).delete();
      });

      if (activeEvent && activeEvent.id === id) {
        localStorage.removeItem('insertech_active_event_id');
        setActiveEvent(null);
      }

      setShowDeleteConfirmId(null);
      await loadPastEvents();
      notifySync();
    } catch (e) {
      console.error(e);
    }
  };

  // EXPORTER LES DONNÉES DANS DIFFÉRENTS FORMATS (JSON, CSV, MD, LaTeX, Excel)
  const handleExportData = async () => {
    if (!activeEvent) return;

    const format = prompt("Entrez le format d'exportation souhaité (json, csv, md, tex, xlsx) :", "json")?.toLowerCase().trim();
    if (!format) return;
    if (!['json', 'csv', 'md', 'tex', 'xlsx'].includes(format)) {
      showToast("Format non supporté. Veuillez choisir parmi : json, csv, md, tex, xlsx.", "warning");
      return;
    }

    try {
      const eventId = activeEvent.id;
      const tickets = await db.tickets.where('eventId').equals(eventId).toArray();
      const technicians = await db.technicians.where('eventId').equals(eventId).toArray();
      const participants = await db.participants.where('eventId').equals(eventId).toArray();
      const attendees = await db.attendees.where('eventId').equals(eventId).toArray();

      // Kiosque-concours : lignes triées par classement, temps lisible et résultat du tirage.
      // La colonne « Temps (ms) » est conservée pour la réimportation.
      const contestHeader = ['Rang', 'Nom participant', 'Courriel', 'Code postal', 'Meilleur chrono', 'Temps (ms)', 'Consentement', 'Tirage au sort'];
      const raffleDraws = getRaffleDraws((await db.events.get(eventId)) || activeEvent);
      const contestRows: Array<Array<string | number>> = [...participants]
        .sort((a, b) => {
          const aTime = a.timeMs && a.timeMs > 0 ? a.timeMs : Infinity;
          const bTime = b.timeMs && b.timeMs > 0 ? b.timeMs : Infinity;
          return aTime !== bTime ? aTime - bTime : a.registeredAt - b.registeredAt;
        })
        .map((p, idx) => {
          const hasTime = typeof p.timeMs === 'number' && p.timeMs > 0;
          const draw = [...raffleDraws].reverse().find(d => d.participantId === p.id);
          return [
            hasTime ? idx + 1 : '',
            p.name,
            p.email || '',
            p.postalCode || '',
            hasTime ? formatTime(p.timeMs!) : '',
            hasTime ? p.timeMs! : '',
            p.extraData?.consentContact ? 'Oui' : '',
            draw ? (draw.status === 'gagnant' ? 'Gagnant' : 'Absent') : ''
          ];
        });

      // Map technicien ID → numéro de table (pour l'export des tickets)
      const techTableMap = new Map(technicians.map(t => [t.id, t.tableNumber ?? '']));

      let content = '';
      let mimeType = 'text/plain';
      let fileName = `insertech_export_${activeEvent.type}_${activeEvent.date}.${format}`;

      if (format === 'json') {
        content = JSON.stringify(await buildEventBackup(eventId), null, 2);
        mimeType = 'application/json';
      } else if (format === 'csv') {
        mimeType = 'text/csv;charset=utf-8;';
        if (activeEvent.type === 'reparothon') {
          content = "Nom visiteur;Courriel visiteur;Nom de l'appareil;Catégorie;Système d'exploitation;Diagnostic;Technicien;Table Technicien;Statut;Remarques de résolution;Poids (kg)\n";
          content += tickets.map(t => [
            escapeCsvCell(t.visitorName),
            escapeCsvCell(t.visitorEmail || ''),
            escapeCsvCell(t.objectName),
            escapeCsvCell(t.objectCategory),
            escapeCsvCell(t.operatingSystem),
            escapeCsvCell(t.initialDiagnosis || ''),
            escapeCsvCell(t.assignedTechName || ''),
            escapeCsvCell(t.assignedTechId ? techTableMap.get(t.assignedTechId) ?? '' : ''),
            escapeCsvCell(t.status),
            escapeCsvCell(t.resultRemarks || ''),
            escapeCsvCell(t.weightKg || '')
          ].join(';')).join('\n');
        } else if (activeEvent.type === 'kiosque_concours') {
          content = contestHeader.join(';') + "\n";
          content += contestRows.map(row => row.map(cell => escapeCsvCell(cell)).join(';')).join('\n');
        } else {
          content = "Nom;Courriel;Présent;Notes;Note de satisfaction;Commentaire\n";
          content += attendees.map(a => [
            escapeCsvCell(a.name),
            escapeCsvCell(a.email || ''),
            escapeCsvCell(a.presenceConfirmed ? 'Oui' : 'Non'),
            escapeCsvCell(a.notes || ''),
            escapeCsvCell(a.feedbackScore || ''),
            escapeCsvCell(a.feedbackText || '')
          ].join(';')).join('\n');
        }
      } else if (format === 'md') {
        mimeType = 'text/markdown';
        content = `# Export Événement : ${activeEvent.name}\n`;
        content += `**Date :** ${activeEvent.date}\n`;
        content += `**Lieu :** ${activeEvent.location}\n`;
        content += `**Lieu spécifique :** ${activeEvent.place || ''}\n`;
        content += `**Partenaire :** ${activeEvent.partner || ''}\n`;
        content += `**Type :** ${activeEvent.type}\n\n`;

        if (activeEvent.type === 'reparothon') {
          content += "| Nom visiteur | Courriel visiteur | Nom de l'appareil | Catégorie | Système d'exploitation | Diagnostic | Technicien | Table Technicien | Statut | Remarques de résolution | Poids (kg) |\n";
          content += "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n";
          content += tickets.map(t => `| ${t.visitorName} | ${t.visitorEmail || ''} | ${t.objectName} | ${t.objectCategory} | ${t.operatingSystem} | ${t.initialDiagnosis || ''} | ${t.assignedTechName || ''} | ${t.assignedTechId ? techTableMap.get(t.assignedTechId) ?? '' : ''} | ${t.status} | ${t.resultRemarks || ''} | ${t.weightKg || ''} |`).join('\n');
        } else if (activeEvent.type === 'kiosque_concours') {
          content += `| ${contestHeader.join(' | ')} |\n`;
          content += `|${contestHeader.map(() => ' :--- ').join('|')}|\n`;
          content += contestRows.map(row => `| ${row.join(' | ')} |`).join('\n');
        } else {
          content += "| Nom | Courriel | Présent | Notes | Note de satisfaction | Commentaire |\n";
          content += "| :--- | :--- | :--- | :--- | :--- | :--- |\n";
          content += attendees.map(a => `| ${a.name} | ${a.email || ''} | ${a.presenceConfirmed ? 'Oui' : 'Non'} | ${a.notes || ''} | ${a.feedbackScore || ''} | ${a.feedbackText || ''} |`).join('\n');
        }
      } else if (format === 'tex') {
        mimeType = 'application/x-tex';
        content = `\\documentclass{article}\n\\begin{document}\n\\title{Export Événement : ${escapeLatex(activeEvent.name)}}\n\\date{${escapeLatex(activeEvent.date)}}\n`;
        content += `\\section{Lieu : ${escapeLatex(activeEvent.location)}, Lieu spécifique : ${escapeLatex(activeEvent.place || '')}, Partenaire : ${escapeLatex(activeEvent.partner || '')}}\n\n`;
        if (activeEvent.type === 'reparothon') {
          content += "\\begin{tabular}{l l l l l l l l l l l}\n";
          content += tickets.map(t => [
            escapeLatex(t.visitorName),
            escapeLatex(t.visitorEmail || ''),
            escapeLatex(t.objectName),
            escapeLatex(t.objectCategory),
            escapeLatex(t.operatingSystem),
            escapeLatex(t.initialDiagnosis || ''),
            escapeLatex(t.assignedTechName || ''),
            escapeLatex(t.assignedTechId ? techTableMap.get(t.assignedTechId) ?? '' : ''),
            escapeLatex(t.status),
            escapeLatex(t.resultRemarks || ''),
            escapeLatex(t.weightKg || '')
          ].join(' & ') + ' \\\\').join('\n');
          content += "\n\\end{tabular}\n";
        } else if (activeEvent.type === 'kiosque_concours') {
          content += "\\begin{tabular}{l l l l l l l l}\n";
          content += contestRows.map(row => row.map(cell => escapeLatex(cell)).join(' & ') + ' \\\\').join('\n');
          content += "\n\\end{tabular}\n";
        } else {
          content += "\\begin{tabular}{l l l l l l}\n";
          content += attendees.map(a => [
            escapeLatex(a.name),
            escapeLatex(a.email || ''),
            escapeLatex(a.presenceConfirmed ? 'Oui' : 'Non'),
            escapeLatex(a.notes || ''),
            escapeLatex(a.feedbackScore || ''),
            escapeLatex(a.feedbackText || '')
          ].join(' & ') + ' \\\\').join('\n');
          content += "\n\\end{tabular}\n";
        }
        content += "\n\\end{document}\n";
      } else if (format === 'xlsx') {
        try {
          const protectFormula = (val: any) => {
            if (typeof val === 'string' && ['=', '+', '-', '@'].some(c => val.startsWith(c))) {
              return "'" + val;
            }
            return val;
          };

          let ws_data: any[][] = [];
          if (activeEvent.type === 'reparothon') {
            ws_data = [
              ["Nom visiteur", "Courriel visiteur", "Nom de l'appareil", "Catégorie", "Système d'exploitation", "Diagnostic", "Technicien", "Table Technicien", "Statut", "Remarques de résolution", "Poids (kg)"],
              ...tickets.map(t => [
                protectFormula(t.visitorName),
                protectFormula(t.visitorEmail || ''),
                protectFormula(t.objectName),
                protectFormula(t.objectCategory),
                protectFormula(t.operatingSystem),
                protectFormula(t.initialDiagnosis || ''),
                protectFormula(t.assignedTechName || ''),
                protectFormula(t.assignedTechId ? techTableMap.get(t.assignedTechId) ?? '' : ''),
                protectFormula(t.status),
                protectFormula(t.resultRemarks || ''),
                t.weightKg || ''
              ])
            ];
          } else if (activeEvent.type === 'kiosque_concours') {
            ws_data = [
              contestHeader,
              ...contestRows.map(row => row.map(cell => protectFormula(cell)))
            ];
          } else {
            ws_data = [
              ["Nom", "Courriel", "Présent", "Notes", "Note de satisfaction", "Commentaire"],
              ...attendees.map(a => [
                protectFormula(a.name),
                protectFormula(a.email || ''),
                a.presenceConfirmed ? 'Oui' : 'Non',
                protectFormula(a.notes || ''),
                a.feedbackScore || '',
                protectFormula(a.feedbackText || '')
              ])
            ];
          }

          // Chargée à la demande : xlsx pèse près d'un tiers du JavaScript de l'application
          const XLSX = await import('xlsx');
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.aoa_to_sheet(ws_data);
          XLSX.utils.book_append_sheet(wb, ws, "Export");
          const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });

          const s2ab = (s: string) => {
            const buf = new ArrayBuffer(s.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
            return buf;
          };

          const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast(`Exportation Excel (${fileName}) terminée !`, "success");
          return;
        } catch (err) {
          console.error(err);
          showToast("Erreur lors de la génération du fichier Excel.", "error");
          return;
        }
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Exportation (${fileName}) terminée !`, "success");
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de la génération du fichier d'exportation.", "error");
    }
  };

  // IMPORTER LES DONNÉES DEPUIS UN FICHIER JSON
  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (eventReader) => {
      try {
        const data = JSON.parse(eventReader.target?.result as string);
        if (!data.event || !data.event.id || !data.event.type) {
          alert('Format de fichier de sauvegarde invalide.');
          return;
        }

        const importedEvent: EventSettings = data.event;

        await db.transaction('rw', [db.events, db.tickets, db.technicians, db.participants, db.attendees], async () => {
          // Écraser ou ajouter l'événement
          await db.events.put(importedEvent);

          // Nettoyer d'abord les anciennes données de cet eventId si existantes
          await db.tickets.where('eventId').equals(importedEvent.id).delete();
          await db.technicians.where('eventId').equals(importedEvent.id).delete();
          await db.participants.where('eventId').equals(importedEvent.id).delete();
          await db.attendees.where('eventId').equals(importedEvent.id).delete();

          // Insérer les listes importées
          if (data.tickets && data.tickets.length > 0) await db.tickets.bulkPut(data.tickets);
          if (data.technicians && data.technicians.length > 0) await db.technicians.bulkPut(data.technicians);
          if (data.participants && data.participants.length > 0) await db.participants.bulkPut(data.participants);
          if (data.attendees && data.attendees.length > 0) await db.attendees.bulkPut(data.attendees);
        });

        // Définir comme actif
        localStorage.setItem('insertech_active_event_id', importedEvent.id);
        setActiveEvent(importedEvent);
        
        if (importedEvent.type === 'reparothon') {
          setCurrentTab('accueil');
        } else if (importedEvent.type === 'kiosque_concours') {
          setCurrentTab('admin');
        } else {
          setCurrentTab('enregistrements');
        }

        await loadPastEvents();
        notifySync();
        alert('Événement importé avec succès !');
      } catch (err) {
        console.error(err);
        alert('Erreur lors de la lecture du fichier. Assurez-vous qu\'il s\'agit bien d\'un JSON valide.');
      }
    };
    reader.readAsText(file);
  };

  const handleUniversalImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    const reader = new FileReader();

    reader.onload = async (evt) => {
      let content = '';
      let excelRows: any[][] | null = null;

      if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        try {
          const arrayBuffer = evt.target?.result as ArrayBuffer;
          const data = new Uint8Array(arrayBuffer);
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          excelRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        } catch (err) {
          showToast("Erreur lors de la lecture du fichier Excel.", "error");
          return;
        }
      } else {
        content = evt.target?.result as string;
        if (!content) return;
      }

      let title = sanitizeFileName(file.name.replace(/\.[^/.]+$/, "")) || "Événement Importé";
      let type: 'reparothon' | 'kiosque_concours' | 'communaute_pratique' = 'communaute_pratique';
      let date = new Date().toISOString().split('T')[0];
      let location = "En ligne";
      let partner = "";
      let place = "";
      
      let tickets: any[] = [];
      let participants: any[] = [];
      let attendees: any[] = [];
      let technicians: any[] = [];
      const conflicts: Array<{ row: number; cell: string; severity: 'error' | 'warning'; message: string; actionTaken: string }> = [];

      const eventId = 'evt-' + Math.random().toString(36).substring(2, 11);

      let rawRows: string[][] = [];
      if (excelRows) {
        rawRows = excelRows.map(row => row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : ''));
      } else if (fileExtension === 'csv') {
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          const delimiter = lines[0].includes(';') ? ';' : ',';
          rawRows = lines.map(line => {
            const result: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            result.push(current.trim());
            return result;
          });
        }
      } else if (fileExtension === 'md') {
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.startsWith('# ')) {
            title = line.replace('# ', '').trim();
          } else if (line.toLowerCase().includes('**date :**') || line.toLowerCase().includes('**date:**')) {
            date = line.split(/:/i)[1]?.trim() || date;
          } else if (line.toLowerCase().includes('**lieu :**') || line.toLowerCase().includes('**lieu:**')) {
            location = line.split(/:/i)[1]?.trim() || location;
          } else if (line.toLowerCase().includes('**type :**') || line.toLowerCase().includes('**type:**')) {
            const rawType = line.split(/:/i)[1]?.toLowerCase() || '';
            if (rawType.includes('repar') || rawType.includes('répar')) type = 'reparothon';
            else if (rawType.includes('kiosque') || rawType.includes('concours')) type = 'kiosque_concours';
          } else if (line.toLowerCase().includes('**partenaire :**') || line.toLowerCase().includes('**partenaire:**')) {
            partner = line.split(/:/i)[1]?.trim() || '';
          } else if (line.toLowerCase().includes('**lieu spécifique :**') || line.toLowerCase().includes('**lieu spécifique:**') || line.toLowerCase().includes('**lieu specifique :**') || line.toLowerCase().includes('**lieu specifique:**')) {
            place = line.split(/:/i)[1]?.trim() || '';
          }
        }

        let inTable = false;
        for (const line of lines) {
          if (line.includes('|') && line.trim().startsWith('|')) {
            const cols = line.split('|').map(c => c.trim()).filter(c => c !== '');
            if (cols.length === 0) continue;
            if (cols[0].startsWith('---') || cols[0].startsWith(':---')) {
              inTable = true;
              continue;
            }
            if (!inTable) {
              const h = cols.map(item => item.toLowerCase());
              if (h.some(item => item.includes('diagnostic') || item.includes('visiteur'))) {
                type = 'reparothon';
              } else if (h.some(item => item.includes('postal') || item.includes('chrono') || item.includes('temps'))) {
                type = 'kiosque_concours';
              }
            } else {
              rawRows.push(cols);
            }
          } else {
            inTable = false;
          }
        }
      } else if (fileExtension === 'tex' || fileExtension === 'latex') {
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.includes('\\title')) {
            const match = line.match(/\\title\{([^}]+)\}/);
            if (match) title = match[1];
          } else if (line.includes('\\date')) {
            const match = line.match(/\\date\{([^}]+)\}/);
            if (match) date = match[1];
          } else if (line.includes('\\subsection') || line.includes('\\section')) {
            const raw = line.toLowerCase();
            if (raw.includes('repar') || raw.includes('répar')) type = 'reparothon';
            else if (raw.includes('kiosque') || raw.includes('teardown')) type = 'kiosque_concours';
            
            const matchLoc = line.match(/Lieu\s*:\s*([^,}]+)/i);
            if (matchLoc) location = matchLoc[1].trim();
            const matchPlace = line.match(/Lieu\s+spécifique\s*:\s*([^,}]+)/i) || line.match(/Lieu\s+specifique\s*:\s*([^,}]+)/i);
            if (matchPlace) place = matchPlace[1].trim();
            const matchPartner = line.match(/Partenaire\s*:\s*([^,}]+)/i);
            if (matchPartner) partner = matchPartner[1].trim();
          }
        }

        let inTabular = false;
        for (const line of lines) {
          if (line.includes('\\begin{tabular}')) {
            inTabular = true;
            continue;
          }
          if (line.includes('\\end{tabular}')) {
            inTabular = false;
            continue;
          }

          if (inTabular) {
            if (line.includes('&') && !line.trim().startsWith('%')) {
              const cols = line.replace(/\\\\$/, '').split('&').map(c => c.replace(/\\hline/, '').trim());
              if (cols[0].toLowerCase().includes('nom') || cols[0].toLowerCase().includes('visiteur') || cols[0].toLowerCase().includes('participant')) continue;
              rawRows.push(cols);
            }
          }
        }
      }

      // Détecteurs d'indices de colonnes dynamiques
      let idxVisitorName = 0;
      let idxVisitorEmail = -1;
      let idxObjectName = 1;
      let idxCategory = 2;
      let idxOS = 3;
      let idxDiagnosis = 4;
      let idxTechName = 5;
      let idxTableNumber = -1;
      let idxStatus = 6;
      let idxResultRemarks = -1;
      let idxWeight = -1;

      let idxPartName = 0;
      let idxPartEmail = 1;
      let idxPartPostal = 2;
      let idxPartTime = 3;

      let idxAttName = 0;
      let idxAttEmail = 1;
      let idxAttPresence = 2;
      let idxAttNotes = 3;
      let idxAttFeedbackScore = -1;
      let idxAttFeedbackText = -1;

      if (rawRows.length > 0 && fileExtension !== 'md' && fileExtension !== 'tex' && fileExtension !== 'latex') {
        const headersRaw = rawRows[0].map(h => h.toLowerCase().trim());
        
        const hasReparothon = headersRaw.some(h => h.includes('diagnostic') || h.includes('visiteur') || h.includes('panne') || h.includes('appareil'));
        const hasKiosque = headersRaw.some(h => h.includes('temps') || h.includes('chrono') || h.includes('postal') || h.includes('participant'));
        
        if (hasReparothon) {
          type = 'reparothon';
        } else if (hasKiosque) {
          type = 'kiosque_concours';
        } else {
          type = 'communaute_pratique';
        }

        headersRaw.forEach((h, index) => {
          if (h.includes('nom') && (h.includes('visiteur') || h.includes('client') || h.includes('personne'))) idxVisitorName = index;
          else if (h.includes('courriel') || h.includes('email') || h.includes('mail')) {
            idxVisitorEmail = index;
            idxPartEmail = index;
            idxAttEmail = index;
          }
          else if (h.includes('appareil') || h.includes('objet') || h.includes('nom de l') || h.includes('modèle') || h.includes('modele')) idxObjectName = index;
          else if (h.includes('catégorie') || h.includes('categorie') || h.includes('type d\'appareil')) idxCategory = index;
          else if (h.includes('système') || h.includes('systeme') || h.includes('os') || h.includes('exploitation')) idxOS = index;
          else if (h.includes('diagnostic') || h.includes('problème') || h.includes('probleme') || h.includes('panne') || h.includes('description')) idxDiagnosis = index;
          else if (h.includes('technicien') || h.includes('tech') || h.includes('réparateur') || h.includes('reparateur')) idxTechName = index;
          else if (h.includes('table')) idxTableNumber = index;
          else if (h.includes('statut') || h.includes('état') || h.includes('etat') || h.includes('status')) idxStatus = index;
          else if (h.includes('remarque') || h.includes('résolution') || h.includes('resolution') || h.includes('note de rés') || h.includes('note de res')) idxResultRemarks = index;
          else if (h.includes('poids') || h.includes('kg') || h.includes('masse')) idxWeight = index;

          if (h.includes('nom') && (h.includes('participant') || h.includes('joueur'))) idxPartName = index;
          else if (h.includes('postal') || h.includes('code postal')) idxPartPostal = index;
          else if (h.includes('temps') || h.includes('chrono') || h.includes('ms') || h.includes('score')) idxPartTime = index;

          if (h.includes('nom') && (h.includes('inscrit') || h.includes('membre') || h.includes('présent') || h.includes('present'))) idxAttName = index;
          else if (h.includes('présence') || h.includes('present') || h.includes('arriv') || h.includes('confirme')) idxAttPresence = index;
          else if (h.includes('notes') || h.includes('note') || h.includes('remarque')) idxAttNotes = index;
          else if (h.includes('satisfaction') || h.includes('evaluation') || h.includes('évaluation') || h.includes('score')) idxAttFeedbackScore = index;
          else if (h.includes('commentaire') || h.includes('avis') || h.includes('rétroaction') || h.includes('feedback')) idxAttFeedbackText = index;
        });
      }

      const startIdx = (fileExtension === 'md' || fileExtension === 'tex' || fileExtension === 'latex') ? 0 : 1;
      const colsLength = rawRows.length > startIdx ? rawRows[startIdx].length : 0;

      if (fileExtension === 'md' || fileExtension === 'tex' || fileExtension === 'latex') {
        if (type === 'reparothon') {
          if (colsLength >= 11) {
            idxVisitorName = 0;
            idxVisitorEmail = 1;
            idxObjectName = 2;
            idxCategory = 3;
            idxOS = 4;
            idxDiagnosis = 5;
            idxTechName = 6;
            idxTableNumber = 7;
            idxStatus = 8;
            idxResultRemarks = 9;
            idxWeight = 10;
          } else {
            idxVisitorName = 0;
            idxObjectName = 1;
            idxCategory = 2;
            idxOS = 3;
            idxDiagnosis = 4;
            idxTechName = 5;
            idxStatus = 6;
          }
        } else if (type === 'kiosque_concours') {
          idxPartName = 0;
          idxPartEmail = 1;
          idxPartPostal = 2;
          idxPartTime = 3;
        } else {
          idxAttName = 0;
          idxAttEmail = 1;
          idxAttPresence = 2;
          idxAttNotes = 3;
          idxAttFeedbackScore = 4;
          idxAttFeedbackText = 5;
        }
      }

      for (let i = startIdx; i < rawRows.length; i++) {
        const cols = rawRows[i];
        if (cols.length === 0 || !cols[0]) {
          conflicts.push({
            row: i + 1,
            cell: "Ligne",
            severity: "warning",
            message: "Ligne vide ou nom manquant détecté.",
            actionTaken: "Ligne ignorée"
          });
          continue;
        }

        if (type === 'reparothon') {
          const visitorName = cols[idxVisitorName];
          const visitorEmail = idxVisitorEmail !== -1 ? cols[idxVisitorEmail] || undefined : undefined;
          let objectName = cols[idxObjectName];
          let category = cols[idxCategory];
          let os = cols[idxOS];
          const diagnosis = cols[idxDiagnosis] || '';
          const techName = cols[idxTechName] || null;
          const tableNumber = idxTableNumber !== -1 ? cols[idxTableNumber] || null : null;
          let status = cols[idxStatus];
          const resultRemarks = idxResultRemarks !== -1 ? cols[idxResultRemarks] || '' : '';
          const weightKgRaw = idxWeight !== -1 ? cols[idxWeight] : null;
          
          let weightKg = 1.5;
          if (weightKgRaw) {
            weightKg = clampNumber(weightKgRaw, 0.05, 50, 1.5);
          }

          if (!visitorName) {
            conflicts.push({
              row: i + 1,
              cell: "Nom visiteur",
              severity: "error",
              message: "Le nom du visiteur est manquant dans cette entrée.",
              actionTaken: "Ligne rejetée"
            });
            continue;
          }

          if (!objectName) {
            objectName = "Appareil";
            conflicts.push({
              row: i + 1,
              cell: "Appareil",
              severity: "warning",
              message: "Le nom de l'appareil est manquant.",
              actionTaken: "Remplacé par 'Appareil'"
            });
          }

          const rawCat = (category || '').toLowerCase();
          if (rawCat.includes('tour') || rawCat.includes('fixe') || rawCat.includes('desktop')) category = 'pc_tour';
          else if (rawCat.includes('cellulaire') || rawCat.includes('téléphone') || rawCat.includes('phone') || rawCat.includes('mobile')) category = 'cellulaire';
          else if (rawCat.includes('tablette') || rawCat.includes('ipad') || rawCat.includes('tablet')) category = 'tablette';
          else if (rawCat.includes('portable') || rawCat.includes('laptop') || rawCat.includes('macbook') || !category) {
            if (category && category !== 'laptop') {
              conflicts.push({
                row: i + 1,
                cell: "Catégorie",
                severity: "warning",
                message: `Catégorie '${category}' invalide.`,
                actionTaken: "Remplacé par 'laptop'"
              });
            }
            category = 'laptop';
          } else {
            category = 'autre';
          }

          const rawOS = (os || '').toLowerCase();
          if (rawOS.includes('mac') || rawOS.includes('ios') || rawOS.includes('apple')) os = 'mac';
          else if (rawOS.includes('linux') || rawOS.includes('ubuntu') || rawOS.includes('debian')) os = 'linux';
          else if (rawOS.includes('windows') || !os) {
            if (os && os !== 'windows') {
              conflicts.push({
                row: i + 1,
                cell: "OS",
                severity: "warning",
                message: `OS '${os}' invalide.`,
                actionTaken: "Remplacé par 'windows'"
              });
            }
            os = 'windows';
          } else if (rawOS.includes('aucun') || rawOS.includes('android')) os = 'aucun';
          else os = 'autre';

          const rawStat = (status || '').toLowerCase();
          if (rawStat.includes('repare') || rawStat.includes('réparé') || rawStat.includes('succes') || rawStat.includes('succès')) status = 'repare';
          else if (rawStat.includes('partiel') || rawStat.includes('semi')) status = 'semi_repare';
          else if (rawStat.includes('non') || rawStat.includes('echec') || rawStat.includes('échec') || rawStat.includes('impossible')) status = 'non_reparable';
          else if (rawStat.includes('abandon') || rawStat.includes('parti')) status = 'abandonne';
          else if (rawStat.includes('cours') || rawStat.includes('progress')) status = 'en_cours';
          else if (rawStat.includes('assign')) status = 'assigne';
          else {
            if (status && status !== 'en_attente') {
              conflicts.push({
                row: i + 1,
                cell: "Statut",
                severity: "warning",
                message: `Statut '${status}' invalide.`,
                actionTaken: "Défini sur 'en_attente'"
              });
            }
            status = 'en_attente';
          }

          tickets.push({
            id: 'tkt-' + Math.random().toString(36).substring(2, 11),
            eventId,
            visitorName,
            visitorEmail,
            objectName,
            objectCategory: category,
            operatingSystem: os,
            initialDiagnosis: diagnosis,
            status,
            assignedTechId: null,
            assignedTechName: techName,
            resultRemarks,
            weightKg,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });

          if (techName && !technicians.some(t => t.name.toLowerCase() === techName.toLowerCase())) {
            technicians.push({
              id: 'tech-' + Math.random().toString(36).substring(2, 11),
              eventId,
              name: techName,
              specialties: [category],
              softwareSpecialties: os !== 'aucun' && os !== 'autre' ? [os] : [],
              status: 'libre',
              currentTicketId: null,
              tableNumber,
              createdAt: Date.now()
            });
          }
        } else if (type === 'kiosque_concours') {
          const name = cols[idxPartName];
          const email = idxPartEmail !== -1 ? cols[idxPartEmail] || '' : '';
          const postalCode = idxPartPostal !== -1 ? cols[idxPartPostal] || '' : '';
          const timeStr = idxPartTime !== -1 ? cols[idxPartTime] : null;
          let timeMs: number | null = null;

          if (!name) {
            conflicts.push({
              row: i + 1,
              cell: "Nom",
              severity: "error",
              message: "Le nom du participant est requis.",
              actionTaken: "Ligne rejetée"
            });
            continue;
          }

          if (email && !email.includes('@')) {
            conflicts.push({
              row: i + 1,
              cell: "Courriel",
              severity: "warning",
              message: `Courriel '${email}' invalide.`,
              actionTaken: "Courriel vidé"
            });
          }

          if (timeStr) {
            timeMs = parseInt(timeStr);
            if (isNaN(timeMs)) {
              timeMs = null;
              conflicts.push({
                row: i + 1,
                cell: "Temps",
                severity: "warning",
                message: `Temps '${timeStr}' non numérique.`,
                actionTaken: "Défini sur aucun"
              });
            }
          }

          participants.push({
            id: 'p-' + Math.random().toString(36).substring(2, 11),
            eventId,
            name,
            email: email.includes('@') ? email : '',
            postalCode,
            timeMs,
            registeredAt: Date.now()
          });
        } else {
          const name = cols[idxAttName];
          const email = idxAttEmail !== -1 ? cols[idxAttEmail] : undefined;
          const presenceStr = idxAttPresence !== -1 ? cols[idxAttPresence] : '';
          const notes = idxAttNotes !== -1 ? cols[idxAttNotes] : undefined;
          const feedbackScoreRaw = idxAttFeedbackScore !== -1 ? cols[idxAttFeedbackScore] : null;
          const feedbackText = idxAttFeedbackText !== -1 ? cols[idxAttFeedbackText] : undefined;

          let feedbackScore: number | undefined = undefined;
          if (feedbackScoreRaw) {
            feedbackScore = Math.round(clampNumber(feedbackScoreRaw, 1, 5, 5));
          }

          if (!name) {
            conflicts.push({
              row: i + 1,
              cell: "Nom",
              severity: "error",
              message: "Le nom de l'inscrit est requis.",
              actionTaken: "Ligne rejetée"
            });
            continue;
          }

          attendees.push({
            id: 'att-' + Math.random().toString(36).substring(2, 11),
            eventId,
            name,
            email: email || undefined,
            presenceConfirmed: presenceStr?.toLowerCase() === 'oui' || presenceStr?.toLowerCase() === 'true' || presenceStr === '1',
            notes: notes || undefined,
            feedbackScore,
            feedbackText,
            registeredAt: Date.now()
          });
        }
      }

      setImportValidation({
        fileName: file.name,
        eventData: {
          name: title,
          type,
          date,
          location,
          partner,
          place,
          tickets,
          participants,
          attendees,
          technicians
        },
        conflicts
      });
    };

    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const renderNetModal = () => {
    return (
      <Modal
        isOpen={showNetModal}
        onClose={() => setShowNetModal(false)}
        title="Réseau Local sans installation"
        icon={Wifi}
        maxWidth="max-w-md"
      >
        <div className="space-y-4 font-sans text-xs text-app-text-muted">
          <p className="leading-relaxed">
            Connectez plusieurs tablettes d'accueil, PC de chronométrage et écrans de projection en direct en utilisant le hotspot Wi-Fi de votre téléphone portable.
          </p>

          <div className="bg-app-input border border-app-card-border p-3.5 rounded-xl space-y-1">
            <div className="text-[10px] uppercase font-bold text-app-text-muted">Statut réseau actuel</div>
            <div className="font-mono font-bold text-app-text text-sm flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${sessionCode ? 'bg-primary animate-pulse' : 'bg-red-500'}`}></span>
              {netStatus}
            </div>
          </div>

          {sessionCode ? (
            // Session active
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-2">
                <span className="text-[10px] uppercase font-black text-primary tracking-widest block">Code de session active</span>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl font-display font-bold text-app-text tracking-widest">{sessionCode}</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(sessionCode);
                      showToast('Code de session copié dans le presse-papier !', 'success');
                    }}
                    title="Copier le code"
                    aria-label="Copier le code de session"
                    className="p-1.5 rounded-lg bg-primary/25 text-primary hover:text-white cursor-pointer transition"
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <span className="text-[10px] text-app-text-muted block mt-1">Saisissez ce code sur les tablettes d'accueil, ou faites-leur scanner le code QR ci-dessous.</span>
              </div>

              <SessionQrPanel sessionCode={sessionCode} />

              <button
                onClick={handleLeaveSession}
                className="w-full py-2.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-300 hover:bg-red-900/30 hover:text-white font-bold font-display uppercase tracking-wider text-xs cursor-pointer transition"
              >
                Déconnecter / Repasser en local
              </button>
            </div>
          ) : (
            // Pas de session active
            <div className="space-y-6 pt-2">
              {/* Créer session (Hôte) */}
              {activeEvent ? (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-app-text-muted">Créer une session</div>
                  <button
                    onClick={() => handleStartHost()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 transition cursor-pointer"
                  >
                    <Share2 size={14} />
                    <span>Créer la session hôte</span>
                  </button>
                  <span className="text-[10px] text-app-text-muted block">Désignera cet appareil comme le PC principal (Master) et fournira le code de partage.</span>
                </div>
              ) : (
                // Menu principal : la session partage une activité, il faut donc en choisir une
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-app-text-muted">Créer une session</div>
                  {pastEvents.length > 0 ? (
                    <>
                      <span className="text-[10px] text-app-text-muted block">Choisissez l'activité à partager : cet appareil devient le PC principal et fournit le code.</span>
                      {pastEvents.slice(0, 4).map((evt) => (
                        <button
                          key={evt.id}
                          onClick={() => handleStartHost(evt)}
                          className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-primary text-secondary text-left hover:scale-[1.02] active:scale-95 transition cursor-pointer"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Share2 size={14} className="shrink-0" />
                            <span className="font-bold font-display uppercase tracking-wider text-xs truncate">Partager « {evt.name} »</span>
                          </span>
                          <span className="text-[9px] uppercase font-bold shrink-0">{evt.type.replace('_', ' ')}</span>
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] text-app-text-muted block">Créez d'abord une activité dans le menu principal, puis revenez ici pour la partager.</span>
                      <button
                        onClick={() => setShowNetModal(false)}
                        className="w-full py-3 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 transition cursor-pointer"
                      >
                        Créer une activité
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-app-card-border"></div>
                <span className="flex-shrink mx-4 text-app-text-muted font-bold uppercase tracking-widest text-[9px]">OU</span>
                <div className="flex-grow border-t border-app-card-border"></div>
              </div>

              {/* Découverte automatique des sessions */}
              <div className="space-y-3">
                <div className="text-[10px] uppercase font-bold text-app-text-muted">Découverte automatique</div>
                
                {discoveredSessions.length === 0 ? (
                  <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-app-input border border-app-card-border text-app-text-muted">
                    <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0"></div>
                    <span className="text-[10.5px] font-sans">Recherche de consoles actives sur le réseau...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {discoveredSessions.map((session) => (
                      <button
                        key={session.code}
                        onClick={async () => {
                          try {
                            await networkManager.joinSession(session.code, 'temp');
                            setSessionCode(session.code);
                            setShowNetModal(false);
                            showToast(`Connecté à la session ${session.code}`, 'success');
                          } catch (e) {
                            showToast("Échec de la connexion à cette session.", 'error');
                          }
                        }}
                        className="w-full flex items-center justify-between p-3.5 rounded-xl bg-primary/5 border border-primary/20 hover:bg-primary/10 hover:border-primary text-left transition cursor-pointer"
                      >
                        <div className="min-w-0">
                          <span className="text-[9px] uppercase font-bold text-primary block leading-none">{session.type.replace('_', ' ')}</span>
                          <span className="font-bold text-app-text text-xs truncate block mt-1">{session.name}</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 shrink-0">
                          {session.code}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-app-card-border"></div>
                <span className="flex-shrink mx-4 text-app-text-muted font-bold uppercase tracking-widest text-[9px]">OU</span>
                <div className="flex-grow border-t border-app-card-border"></div>
              </div>

              {/* Rejoindre session (Client) */}
              <div className="space-y-3">
                <div className="text-[10px] uppercase font-bold text-app-text-muted">Rejoindre par code manuellement</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder="Ex. INS-4821"
                    className="flex-grow bg-app-input border border-app-input-border rounded-xl px-3 py-2 text-app-text text-xs font-mono focus:outline-none focus:border-primary transition uppercase placeholder:text-app-text-muted/60"
                  />
                  <button
                    onClick={handleJoinSession}
                    disabled={!inputCode.trim()}
                    className="px-4 py-2 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
                  >
                    Rejoindre
                  </button>
                </div>
                <span className="text-[10px] text-app-text-muted block">Saisissez le code si la détection automatique ne fonctionne pas.</span>
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  };

  const renderImportValidationModal = () => {
    if (!importValidation) return null;
    const { fileName, eventData, conflicts } = importValidation;
    const hasErrors = conflicts.some(c => c.severity === 'error');

    const handleConfirmImport = async () => {
      const eventId = 'evt-' + Math.random().toString(36).substring(2, 11);
      const newEvent: EventSettings = {
        id: eventId,
        name: eventData.name,
        type: eventData.type,
        date: eventData.date,
        location: eventData.location,
        partner: eventData.partner,
        place: eventData.place,
        extraData: eventData.extraData || undefined,
        createdAt: Date.now()
      };

      try {
        await db.events.add(newEvent);
        
        const ticketsWithCorrectId = eventData.tickets.map(t => ({ ...t, eventId }));
        const techniciansWithCorrectId = eventData.technicians.map(t => ({ ...t, eventId }));
        const participantsWithCorrectId = eventData.participants.map(p => ({ ...p, eventId }));
        const attendeesWithCorrectId = eventData.attendees.map(a => ({ ...a, eventId }));

        if (ticketsWithCorrectId.length > 0) await db.tickets.bulkPut(ticketsWithCorrectId);
        if (techniciansWithCorrectId.length > 0) await db.technicians.bulkPut(techniciansWithCorrectId);
        if (participantsWithCorrectId.length > 0) await db.participants.bulkPut(participantsWithCorrectId);
        if (attendeesWithCorrectId.length > 0) await db.attendees.bulkPut(attendeesWithCorrectId);

        await loadPastEvents();
        notifySync();
        handleSelectPastEvent(newEvent);
        setImportValidation(null);
        showToast(`Événement "${eventData.name}" importé avec succès !`, 'success');
      } catch (err) {
        console.error(err);
        showToast("Erreur lors de l'enregistrement de l'événement.", 'error');
      }
    };

    return (
      <Modal
        isOpen={Boolean(importValidation)}
        onClose={() => setImportValidation(null)}
        title={`Résolveur d'Importation : ${fileName}`}
        icon={AlertCircle}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-6">
          <p className="text-xs text-app-text-muted font-sans">
            Analyse de l'événement : <strong className="text-app-text">{eventData.name}</strong> ({eventData.type.replace('_', ' ')}). 
            Date : <strong className="text-app-text">{eventData.date}</strong>. Lieu : <strong className="text-app-text">{eventData.location}</strong>.
          </p>

          <div className="max-h-[50vh] overflow-y-auto pr-1 py-2 space-y-4">
            {conflicts.length === 0 ? (
              <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl text-center space-y-2">
                <Sparkles className="text-primary mx-auto" size={24} />
                <p className="text-xs font-bold text-app-text uppercase tracking-wider">Aucune anomalie détectée !</p>
                <p className="text-[11px] text-app-text-muted font-sans">Les données sont prêtes à être importées sans modification.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-app-text">Rapport de Validation ({conflicts.length})</h4>
                <div className="space-y-2">
                  {conflicts.map((conflict, idx) => (
                    <div key={idx} className={`p-3 rounded-xl border flex items-start gap-3 text-[11px] ${
                      conflict.severity === 'error' 
                        ? 'bg-red-500/10 border-red-500/20 text-red-300' 
                        : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
                    }`}>
                      <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${conflict.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`} />
                      <div className="space-y-1">
                        <p className="font-sans font-medium text-app-text">
                          <span className="font-bold font-mono bg-app-input px-1.5 py-0.5 rounded text-app-text mr-1.5 border border-app-card-border">Ligne {conflict.row}</span>
                          {conflict.message}
                        </p>
                        <p className="text-[10px] text-app-text-muted italic">Correction appliquée : {conflict.actionTaken}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-app-card-border pt-4 flex items-center justify-between gap-4">
            <button
              onClick={() => setImportValidation(null)}
              className="px-4 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text-muted hover:text-app-text font-bold font-display uppercase tracking-wider text-xs transition cursor-pointer"
            >
              Annuler
            </button>

            {hasErrors ? (
              <div className="text-right text-[11px] text-red-400 font-bold font-sans">
                Des erreurs critiques empêchent l'importation.
              </div>
            ) : (
              <button
                onClick={handleConfirmImport}
                className="px-5 py-2.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 transition cursor-pointer"
              >
                Appliquer et Importer ({eventData.tickets.length || eventData.participants.length || eventData.attendees.length} lignes)
              </button>
            )}
          </div>
        </div>
      </Modal>
    );
  };

  // Affichage du chargement
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#180A2b] flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        <p className="font-display uppercase tracking-widest text-xs text-slate-400">Chargement de l'environnement Insertech...</p>
      </div>
    );
  }

  // Rendu de la vue active
  if (activeEvent) {
    return (
      <>
        <DashboardShell
          event={activeEvent}
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          onLeaveEvent={handleLeaveEvent}
          onExportData={handleExportData}
          netStatus={netStatus}
          sessionCode={sessionCode}
          onOpenNetModal={() => setShowNetModal(true)}
          onOpenPublicWindow={handleOpenPublicWindow}
          sqliteStatus={sqliteStatus.status}
          sqliteSavedAt={sqliteStatus.at}
          fileBackupState={sqliteStatus.status === 'unavailable' ? fileBackupState : 'unsupported'}
          fileBackupName={fileBackupName}
          onFileBackupClick={handleFileBackupClick}
          isPublicWindow={IS_PUBLIC_WINDOW}
          isLightTheme={isLightTheme}
          onToggleTheme={() => setIsLightTheme(!isLightTheme)}
        >
          {activeEvent.type === 'reparothon' && (
            <ReparothonMatrix event={activeEvent} activeTab={currentTab as any} />
          )}
          {activeEvent.type === 'kiosque_concours' && (
            <TeardownMatrix key={activeEvent.id} event={activeEvent} activeTab={currentTab as any} />
          )}
          {activeEvent.type !== 'reparothon' && activeEvent.type !== 'kiosque_concours' && (
            <GenericMatrix event={activeEvent} activeTab={currentTab as any} />
          )}
        </DashboardShell>
        {renderNetModal()}
        {renderImportValidationModal()}
      </>
    );
  }

  // Rendu de la page d'accueil (Sélecteur de matrice et historique)
  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col justify-between">
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 lg:p-8 space-y-12">
        {/* En-tête de bienvenue */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-app-card-border">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl overflow-hidden border-2 border-primary shadow-lg shadow-primary/20 shrink-0 bg-[#180A2b] transition-transform duration-300 hover:rotate-6 hover:scale-105">
              <img
                src={logoImage}
                alt="Insertech Événements"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-app-text font-bold text-lg tracking-tight uppercase font-display flex items-center gap-1.5 leading-none">
                Insertech <span className="text-primary font-black">Événements</span>
              </h1>
              <p className="text-[10px] text-app-text-muted font-semibold mt-1">Plateforme autonome de suivi en direct</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Bouton Thème */}
            <ThemeToggle isLightTheme={isLightTheme} onToggle={() => setIsLightTheme(!isLightTheme)} />

            {/* Bouton Installation PWA / Mobile */}
            <button
              onClick={() => setShowMobileInstallModal(true)}
              title="Installer ou télécharger l'application sur smartphone ou tablette (Android / iOS / PWA)"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-secondary border border-primary/50 text-xs font-bold font-display uppercase tracking-wider hover:scale-[1.02] active:scale-95 transition cursor-pointer shadow-sm"
            >
              <Smartphone size={14} />
              <span>App Mobile (PWA & APK)</span>
            </button>

            {/* Bouton Réseau */}
            <button
              onClick={() => setShowNetModal(true)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition ${
                sessionCode
                  ? 'bg-primary/20 text-primary border-primary/50'
                  : 'bg-app-card border-app-card-border text-app-text hover:border-primary/50'
              }`}
            >
              <Wifi size={14} className={sessionCode ? 'animate-pulse' : ''} />
              <span>{sessionCode ? `Session active : ${sessionCode}` : 'Rejoindre une session réseau'}</span>
            </button>

            {/* Importation JSON */}
            <div className="relative">
              <label 
                htmlFor="jsonImport"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-app-card border border-app-card-border text-app-text hover:border-primary/50 text-xs font-bold cursor-pointer transition focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 shadow-sm"
              >
                <Upload size={14} className="text-primary" />
                <span>Restaurer une sauvegarde JSON</span>
                <input
                  id="jsonImport"
                  type="file"
                  accept=".json"
                  onChange={handleImportData}
                  className="sr-only"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Sélecteur de matrice */}
        <MatrixSelector onCreateEvent={handleCreateEvent} onImportEvent={handleUniversalImport} />

        {/* Historique des événements passés */}
        {pastEvents.length > 0 && (
          <div className="space-y-4 pt-6 border-t border-app-card-border">
            <h3 className="text-lg font-bold font-display text-app-text uppercase tracking-wider flex items-center gap-2">
              <History size={18} className="text-primary" />
              <span>Historique des Activités ({pastEvents.length})</span>
            </h3>

            <div className="matrix-grid grid grid-cols-1 md:grid-cols-2 gap-4">
              {pastEvents.map((evt) => (
                <div 
                  key={evt.id}
                  className="bg-app-card border border-app-card-border p-4 rounded-2xl flex flex-col justify-between gap-4 hover:border-primary/40 transition shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between">
                      <h4 className="font-bold text-app-text font-display text-sm uppercase truncate max-w-[80%]">{evt.name}</h4>
                      <span className="text-[8px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded uppercase font-bold shrink-0">
                        {evt.type.replace('_', ' ')}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3 text-[10px] text-app-text-muted font-sans mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} className="text-primary" />
                        {new Date(evt.date + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="flex items-center gap-1 truncate max-w-[120px]" title={evt.location}>
                        <MapPin size={10} className="text-primary" />
                        {evt.location}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-app-card-border pt-3">
                    <button
                      onClick={() => handleSelectPastEvent(evt)}
                      className="flex items-center gap-1 text-primary hover:text-white text-xs font-bold font-display uppercase tracking-wider cursor-pointer"
                    >
                      <span>Ouvrir la console</span>
                      <ArrowRight size={12} />
                    </button>

                    {showDeleteConfirmId === evt.id ? (
                      <div className="flex items-center gap-1.5 animate-fade-in">
                        <button
                          onClick={() => handleDeleteEvent(evt.id)}
                          className="px-2 py-1 rounded bg-red-600 text-white text-[9px] font-bold uppercase cursor-pointer"
                        >
                          Confirmer
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirmId(null)}
                          className="px-2 py-1 rounded bg-app-input text-app-text-muted text-[9px] font-bold uppercase cursor-pointer border border-app-card-border"
                        >
                          Non
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirmId(evt.id)}
                        className="p-1 rounded-lg text-app-text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition"
                        title="Supprimer définitivement l'événement"
                        aria-label={`Supprimer définitivement l'événement ${evt.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 border-t border-app-card-border bg-app-bg-footer text-center text-[10px] text-app-text-muted font-sans flex items-center justify-center gap-1.5 mt-12 transition-colors duration-300">
        <Sparkles size={11} className="text-primary animate-pulse" />
        <span>Insertech Éco-Concours & Réparothons • Outil hors-ligne autonome v{__APP_VERSION__}</span>
      </footer>

      {renderNetModal()}
      {renderImportValidationModal()}
      <MobileInstallModal
        isOpen={showMobileInstallModal}
        onClose={() => setShowMobileInstallModal(false)}
        deferredPrompt={deferredPwaPrompt}
        onInstallPwa={handleInstallPwa}
        isStandalone={isStandalonePwa}
      />
    </div>
  );
}
