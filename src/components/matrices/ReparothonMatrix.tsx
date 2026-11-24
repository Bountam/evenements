import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { EventSettings, RepairTicket, Technician, TicketStatus, DeviceCategory, OperatingSystem, PartnerLogo } from '../../types';
import { db, registerSyncListener } from '../../db';
import { networkManager } from '../../network';
import { DoughnutChart } from '../shared/LazyCharts';
import {
  Plus, Users, Wrench, CheckCircle, AlertTriangle, Trash2, Check, Award, Search,
  Laptop, Monitor, Smartphone, Tablet, HardDrive, Cpu, Terminal, ArrowRight, ArrowLeft,
  PackagePlus, UserCheck, Upload, Edit3, RotateCcw, HandHeart,
  Zap, Fan, Gauge, RefreshCw, Wifi, ChevronRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { showToast } from '../shared/Toast';
import { confirmDialog } from '../shared/ConfirmDialog';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import ContactForm from '../shared/ContactForm';
import {
  CONTACT_IMPORT_IGNORED,
  COORDINATE_ERROR_KEYS,
  ContactErrors,
  buildContactInfo,
  emptyContactDraft,
  firstContactError,
  fullName,
  validateContact,
  validateContactStep
} from '../../utils/contact';
import type { WorkRole } from '../../types';
import { formatPublicShortName, readSavedWorkRole, saveWorkRole } from '../../utils/modeLock';
import WorkRoleBar from '../tablette/WorkRoleBar';
import ReparateurCockpit from './reparothon/ReparateurCockpit';
import AssistantCockpit from './reparothon/AssistantCockpit';
import AdminMapAndGodMode from './reparothon/AdminMapAndGodMode';
import AccueilQueueView from './reparothon/AccueilQueueView';
import { fileAccept, isAndroidApp } from '../../native/android';
import { clampNumber } from '../../utils/security';

interface ReparothonMatrixProps {
  event: EventSettings;
  activeTab: 'accueil' | 'techniciens' | 'public' | 'formulaire';
}

interface StatKpiCardProps {
  label: string;
  value: React.ReactNode;
  labelColorClass?: string;
  valueColorClass?: string;
}

function StatKpiCard({
  label,
  value,
  labelColorClass = 'text-app-text-muted',
  valueColorClass = 'text-app-text'
}: StatKpiCardProps) {
  return (
    <div className="bg-app-card border border-app-card-border p-3.5 sm:p-5 rounded-2xl text-center shadow-lg transition-colors">
      <span className={`text-micro uppercase font-black tracking-widest ${labelColorClass} font-sans block mb-1`}>
        {label}
      </span>
      <div className={`text-2xl sm:text-3xl md:text-4xl font-display font-bold tabular-nums ${valueColorClass}`}>
        {value}
      </div>
    </div>
  );
}

// ============================================================================
// CATALOGUE TACTILE DES APPAREILS, MARQUES, MODÈLES ET PANNES (ASSISTANT 1-2-3)
// ============================================================================

interface CategoryConfig {
  id: DeviceCategory;
  label: string;
  shortLabel: string;
  defaultWeightKg: number;
  defaultOS: OperatingSystem;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  brands: string[];
}

const DEVICE_CATEGORIES: CategoryConfig[] = [
  {
    id: 'laptop',
    label: 'Portable',
    shortLabel: 'Portable',
    defaultWeightKg: 1.8,
    defaultOS: 'windows',
    icon: Laptop,
    brands: ['Apple', 'Lenovo', 'Dell', 'HP', 'Asus', 'Acer', 'Microsoft', 'MSI', 'Toshiba', 'Samsung', 'LG', 'Autre']
  },
  {
    id: 'pc_tour',
    label: 'Ordinateur Tour',
    shortLabel: 'Tour / Fixe',
    defaultWeightKg: 7.0,
    defaultOS: 'windows',
    icon: Monitor,
    brands: ['Apple', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'MSI', 'Sur mesure', 'Autre']
  },
  {
    id: 'cellulaire',
    label: 'Cellulaire',
    shortLabel: 'Cellulaire',
    defaultWeightKg: 0.2,
    defaultOS: 'aucun',
    icon: Smartphone,
    brands: ['Apple', 'Samsung', 'Google', 'Motorola', 'Xiaomi', 'OnePlus', 'Huawei', 'LG', 'Autre']
  },
  {
    id: 'tablette',
    label: 'Tablette',
    shortLabel: 'Tablette',
    defaultWeightKg: 0.5,
    defaultOS: 'aucun',
    icon: Tablet,
    brands: ['Apple', 'Samsung', 'Lenovo', 'Microsoft', 'Amazon', 'Huawei', 'Autre']
  },
  {
    id: 'autre',
    label: 'Autre appareil',
    shortLabel: 'Autre',
    defaultWeightKg: 1.5,
    defaultOS: 'autre',
    icon: HardDrive,
    brands: ['Console de jeu', 'Imprimante', 'Écran / Moniteur', 'Disque / Stockage', 'Audio / Casque', 'Petit électro', 'Autre']
  }
];

const BRAND_MODELS_BY_CATEGORY: Record<DeviceCategory, Record<string, string[]>> = {
  laptop: {
    Apple: ['MacBook Air', 'MacBook Pro', 'MacBook (Ancien)', 'Modèle inconnu'],
    Lenovo: ['ThinkPad', 'IdeaPad', 'Yoga', 'Legion', 'ThinkBook', 'Chromebook', 'Modèle inconnu'],
    Dell: ['Inspiron', 'Latitude', 'XPS', 'Vostro', 'Alienware / G-Series', 'Chromebook', 'Modèle inconnu'],
    HP: ['Pavilion', 'EliteBook', 'ProBook', 'Envy', 'Spectre', 'OMEN / Victus', 'Chromebook', 'Modèle inconnu'],
    Asus: ['ZenBook', 'VivoBook', 'ROG / TUF', 'ExpertBook', 'Chromebook', 'Modèle inconnu'],
    Acer: ['Aspire', 'Swift', 'Spin', 'Nitro / Predator', 'Chromebook', 'Modèle inconnu'],
    Microsoft: ['Surface Pro', 'Surface Laptop', 'Surface Book / Go', 'Modèle inconnu'],
    MSI: ['Katana / GF', 'Prestige / Modern', 'Stealth / Raider', 'Modèle inconnu'],
    Toshiba: ['Satellite', 'Portégé / Tecra', 'Dynabook', 'Modèle inconnu'],
    Samsung: ['Galaxy Book', 'Chromebook', 'Notebook', 'Modèle inconnu'],
    LG: ['LG Gram', 'UltraPC', 'Modèle inconnu'],
    Autre: ['Portable standard', 'Chromebook', 'Portable gaming', 'Modèle inconnu']
  },
  pc_tour: {
    Apple: ['iMac', 'Mac mini', 'Mac Studio / Pro', 'Modèle inconnu'],
    Dell: ['OptiPlex', 'Inspiron Desktop', 'XPS Desktop', 'Precision', 'Alienware', 'Modèle inconnu'],
    HP: ['Pavilion Desktop', 'EliteDesk / ProDesk', 'Envy Desktop', 'OMEN', 'Tout-en-un (All-in-One)', 'Modèle inconnu'],
    Lenovo: ['ThinkCentre', 'IdeaCentre', 'Legion Tower', 'Tout-en-un (All-in-One)', 'Modèle inconnu'],
    Asus: ['ROG / TUF Desktop', 'ExpertCenter', 'Tout-en-un', 'Modèle inconnu'],
    Acer: ['Aspire Desktop', 'Veriton', 'Nitro / Predator', 'Modèle inconnu'],
    MSI: ['MAG / Codex', 'Trident / Infinite', 'PRO Desktop', 'Modèle inconnu'],
    'Sur mesure': ['Tour assemblée (Gaming)', 'Tour assemblée (Bureautique)', 'Mini-PC / NUC', 'Modèle inconnu'],
    Autre: ['Tour standard', 'Tout-en-un (All-in-One)', 'Mini-PC', 'Modèle inconnu']
  },
  cellulaire: {
    Apple: ['iPhone (Récent Face ID)', 'iPhone SE / Touch ID', 'iPhone (Ancien)', 'Modèle inconnu'],
    Samsung: ['Galaxy S', 'Galaxy A', 'Galaxy Z (Pliable)', 'Galaxy Note', 'Modèle inconnu'],
    Google: ['Pixel (Standard / Pro)', 'Pixel (Série a)', 'Modèle inconnu'],
    Motorola: ['Moto G', 'Moto Edge', 'Moto E', 'Modèle inconnu'],
    Xiaomi: ['Redmi / Note', 'Xiaomi Série T / Mi', 'POCO', 'Modèle inconnu'],
    OnePlus: ['OnePlus Série N / Nord', 'OnePlus Pro / Standard', 'Modèle inconnu'],
    Huawei: ['Série P', 'Série Mate / Nova', 'Modèle inconnu'],
    LG: ['Velvet / G-Series', 'Série K / Q', 'Modèle inconnu'],
    Autre: ['Cellulaire Android', 'Téléphone à clapet / Basique', 'Modèle inconnu']
  },
  tablette: {
    Apple: ['iPad (Standard)', 'iPad Air', 'iPad Pro', 'iPad mini', 'Modèle inconnu'],
    Samsung: ['Galaxy Tab S', 'Galaxy Tab A', 'Modèle inconnu'],
    Lenovo: ['Tab M / Tab P', 'Yoga Tab', 'Modèle inconnu'],
    Microsoft: ['Surface Pro', 'Surface Go', 'Modèle inconnu'],
    Amazon: ['Fire HD', 'Kindle / Liseuse', 'Modèle inconnu'],
    Huawei: ['MatePad', 'MediaPad', 'Modèle inconnu'],
    Autre: ['Tablette Android', 'Liseuse électronique', 'Modèle inconnu']
  },
  autre: {
    'Console de jeu': ['Nintendo Switch', 'PlayStation (PS4 / PS5)', 'Xbox', 'Console rétro', 'Autre console'],
    Imprimante: ['HP', 'Canon', 'Epson', 'Brother', 'Modèle inconnu'],
    'Écran / Moniteur': ['Moniteur PC', 'Téléviseur', 'Modèle inconnu'],
    'Disque / Stockage': ['Disque dur externe', 'SSD / Clé USB', 'NAS / Boîtier', 'Modèle inconnu'],
    'Audio / Casque': ['Casque / Écouteurs', 'Enceinte Bluetooth', 'Amplificateur / Radio', 'Modèle inconnu'],
    'Petit électro': ['Appareil de cuisine', 'Lampe / Ventilateur', 'Aspirateur / Entretien', 'Autre électro'],
    Autre: ['Périphérique (Clavier / Souris)', 'Routeur / Réseau', 'Câble / Chargeur', 'Autre objet']
  }
};

interface ProblemCardOption {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const HARDWARE_PROBLEMS: ProblemCardOption[] = [
  { id: 'Alimentation / Batterie', label: 'Alimentation / Batterie', subtitle: "Ne s'allume plus, batterie, chargeur", icon: Zap },
  { id: 'Écran / Clavier / Boîtier', label: 'Écran / Clavier / Boîtier', subtitle: 'Écran brisé, clavier, pavé, charnière', icon: Monitor },
  { id: 'Surchauffe / Nettoyage', label: 'Surchauffe / Nettoyage', subtitle: 'Ventilateur bruyant, chauffe, poussière', icon: Fan },
  { id: 'Composantes / Ports', label: 'Composantes / Ports', subtitle: 'Ajout SSD/RAM, prise USB, son, caméra', icon: Cpu }
];

const SOFTWARE_PROBLEMS: ProblemCardOption[] = [
  { id: 'Lent / Virus / Nettoyage', label: 'Lent / Virus / Nettoyage', subtitle: 'Ralentissements, disque plein, publicités', icon: Gauge },
  { id: 'Installer Linux', label: 'Installer Linux', subtitle: 'Passage à Linux / système libre', icon: Terminal },
  { id: 'Démarrage / Réinstallation', label: 'Démarrage / Réinstallation', subtitle: 'Écran bleu, mise à jour, Windows/macOS', icon: RefreshCw },
  { id: 'Internet / Compte / Données', label: 'Internet / Compte / Données', subtitle: 'Wi-Fi, mot de passe, sauvegarde', icon: Wifi }
];

type WizardScreen =
  | 'category'
  | 'brand'
  | 'model'
  | 'domain'
  | 'symptoms'
  | 'cart'
  | 'participant'
  | 'volunteer';

const OS_BUTTONS: { id: OperatingSystem; label: string }[] = [
  { id: 'windows', label: 'Windows' },
  { id: 'mac', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
  { id: 'aucun', label: 'Mobile / ChromeOS / Aucun' },
  { id: 'autre', label: 'Autre OS' }
];

function deduceOperatingSystem(category: DeviceCategory, brand: string, model: string): OperatingSystem {
  const lowerBrand = brand.toLowerCase();
  const lowerModel = model.toLowerCase();
  if (lowerModel.includes('chromebook')) return 'aucun';
  if (category === 'cellulaire' || category === 'tablette') return 'aucun';
  if (category === 'autre') return 'aucun';
  if (lowerBrand === 'apple') return 'mac';
  return 'windows';
}

function deduceWeightKg(category: DeviceCategory): number {
  const found = DEVICE_CATEGORIES.find((c) => c.id === category);
  return found ? found.defaultWeightKg : 1.5;
}

function formatDeviceName(category: DeviceCategory, brand: string, model: string, customNote: string): string {
  const catLabel = DEVICE_CATEGORIES.find((c) => c.id === category)?.shortLabel || 'Appareil';
  const cleanBrand = brand && brand !== 'Autre' ? brand : '';
  const cleanModel = model && model !== 'Modèle inconnu' && model !== 'Portable standard' && model !== 'Tour standard' ? model : '';
  const base = [cleanBrand, cleanModel].filter(Boolean).join(' ').trim() || catLabel;
  return customNote.trim() ? `${base} (${customNote.trim()})` : base;
}

interface DraftDeviceItem {
  id: string;
  category: DeviceCategory;
  brand: string;
  model: string;
  customModelNote: string;
  os: OperatingSystem;
  weightKg: number;
  problemDomain: 'materiel' | 'logiciel';
  symptoms: string[];
  customDiagnosisNote: string;
}

export default function ReparothonMatrix({ event, activeTab }: ReparothonMatrixProps) {
  // 1. États de base (Rôle terrain, Tickets & Techniciens)
  const [workRole, setWorkRole] = useState<WorkRole>(() => readSavedWorkRole('admin'));
  const [lastRegistrationReceipt, setLastRegistrationReceipt] = useState<{
    visitorName: string;
    deviceNames: string[];
    queueNumber: number;
    estimatedWaitMinutes: number;
  } | null>(null);
  const handleSelectWorkRole = (nextRole: WorkRole) => {
    setWorkRole(nextRole);
    saveWorkRole(nextRole);
  };
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  // États de recherche et filtrage des fiches (dans l'onglet Techniciens & File)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // ==========================================================================
  // ÉTATS DE L'ASSISTANT D'ACCUEIL 1-2-3-(4) (1 QUESTION PAR ÉCRAN)
  // ==========================================================================
  const [wizardScreen, setWizardScreen] = useState<WizardScreen>('category');
  const wizardStep: 1 | 2 | 3 | 4 =
    wizardScreen === 'category' || wizardScreen === 'brand' || wizardScreen === 'model'
      ? 1
      : wizardScreen === 'domain' || wizardScreen === 'symptoms' || wizardScreen === 'cart'
        ? 2
        : wizardScreen === 'participant'
          ? 3
          : 4;
  const [draftCategory, setDraftCategory] = useState<DeviceCategory>('laptop');
  const [draftBrand, setDraftBrand] = useState<string>('Lenovo');
  const [draftModel, setDraftModel] = useState<string>('ThinkPad');
  const [draftCustomModelNote, setDraftCustomModelNote] = useState<string>('');
  const [showCustomModelInput, setShowCustomModelInput] = useState<boolean>(false);
  const [draftOS, setDraftOS] = useState<OperatingSystem>('windows');
  const [draftProblemDomain, setDraftProblemDomain] = useState<'materiel' | 'logiciel'>('materiel');
  const [draftSymptoms, setDraftSymptoms] = useState<string[]>([]);
  const [draftCustomDiagnosis, setDraftCustomDiagnosis] = useState<string>('');
  const [showCustomDiagnosisInput, setShowCustomDiagnosisInput] = useState<boolean>(false);

  // Panier d'appareils empilés pour le visiteur courant
  const [queuedDevices, setQueuedDevices] = useState<DraftDeviceItem[]>([]);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);

  // Formulaire de contact commun conforme Loi 25 (saisi une seule fois à l'Étape 3 pour tous ses appareils)
  const [contactDraft, setContactDraft] = useState(() => emptyContactDraft('activity'));
  const [contactErrors, setContactErrors] = useState<ContactErrors>({});

  // ==========================================================================
  // ÉTATS DE GESTION DES TECHNICIENS (MODALE + LISTE)
  // ==========================================================================
  const [isAddTechModalOpen, setIsAddTechModalOpen] = useState(false);
  const [newTechName, setNewTechName] = useState('');
  const [newTechSpecs, setNewTechSpecs] = useState<string[]>([]);
  const [newTechTable, setNewTechTable] = useState('');
  const [newTechSoftwareSpecs, setNewTechSoftwareSpecs] = useState<string[]>([]);
  const [activeLogoIndex, setActiveLogoIndex] = useState(0);

  // Célébration locale
  const [activeCelebration, setActiveCelebration] = useState<{
    visitorName: string;
    objectName: string;
    techName: string;
    weightKg: number;
  } | null>(null);
  const [pendingResolution, setPendingResolution] = useState<{
    ticketId: string;
    status: TicketStatus;
    visitorName: string;
    objectName: string;
  } | null>(null);
  const [resolutionRemarks, setResolutionRemarks] = useState('');

  // Charger les données de Dexie
  const loadData = async () => {
    try {
      const dbTickets = await db.tickets.where('eventId').equals(event.id).toArray();
      const dbTechs = await db.technicians.where('eventId').equals(event.id).toArray();

      setTickets(dbTickets.sort((a, b) => b.createdAt - a.createdAt));
      setTechnicians(dbTechs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();

    const unsubscribe = registerSyncListener(() => {
      loadData();
    });

    return () => unsubscribe();
  }, [event.id]);

  const playCelebrationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      const notes = [261.63, 329.63, 392.0, 523.25];
      const durations = [0.15, 0.15, 0.15, 0.45];
      const startTimes = [0, 0.15, 0.3, 0.45];

      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + startTimes[index]);

        gainNode.gain.setValueAtTime(0, now + startTimes[index]);
        gainNode.gain.linearRampToValueAtTime(0.25, now + startTimes[index] + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + startTimes[index] + durations[index]);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + startTimes[index]);
        osc.stop(now + startTimes[index] + durations[index]);
      });
    } catch (err) {
      console.warn('Erreur fanfare audio :', err);
    }
  };

  useEffect(() => {
    const channel = new BroadcastChannel(`insertech_reparothon_sync_${event.id}`);

    channel.onmessage = (e) => {
      if (e.data && e.data.type === 'CELEBRATION') {
        const payload = e.data.payload;
        setActiveCelebration(payload);
        playCelebrationSound();

        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#9ecd33', '#480A94', '#ffffff']
        });

        setTimeout(() => {
          setActiveCelebration(null);
        }, 8000);
      }
    };

    return () => channel.close();
  }, [event.id]);

  useEffect(() => {
    networkManager.onCelebration = (payload) => {
      setActiveCelebration(payload);
      playCelebrationSound();
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#9ecd33', '#480A94', '#ffffff']
      });
      setTimeout(() => {
        setActiveCelebration(null);
      }, 8000);
    };
    return () => {
      networkManager.onCelebration = null;
    };
  }, []);

  const partnerLogos = event.extraData?.partnerLogos || [];

  useEffect(() => {
    if (activeTab === 'public' && partnerLogos.length > 1) {
      const interval = setInterval(() => {
        setActiveLogoIndex((prev) => (prev + 1) % partnerLogos.length);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [activeTab, partnerLogos.length]);

  // ==========================================================================
  // LOGIQUE DE L'ASSISTANT 1-2-3 (1 QUESTION PAR ÉCRAN & PANIER D'APPAREILS)
  // ==========================================================================

  const handleSelectCategory = (catId: DeviceCategory) => {
    setDraftCategory(catId);
    const catConfig = DEVICE_CATEGORIES.find((c) => c.id === catId) || DEVICE_CATEGORIES[0];
    const firstBrand = catConfig.brands[0];
    setDraftBrand(firstBrand);
    const modelsForBrand = BRAND_MODELS_BY_CATEGORY[catId]?.[firstBrand] || ['Modèle inconnu'];
    const firstModel = modelsForBrand[0];
    setDraftModel(firstModel);
    setDraftCustomModelNote('');
    setShowCustomModelInput(false);
    setDraftOS(deduceOperatingSystem(catId, firstBrand, firstModel));
    setWizardScreen('brand');
  };

  const handleSelectBrand = (brand: string) => {
    setDraftBrand(brand);
    const modelsForBrand = BRAND_MODELS_BY_CATEGORY[draftCategory]?.[brand] || ['Modèle inconnu'];
    const firstModel = modelsForBrand[0];
    setDraftModel(firstModel);
    setDraftOS(deduceOperatingSystem(draftCategory, brand, firstModel));
    setWizardScreen('model');
  };

  const handleSelectModel = (model: string) => {
    setDraftModel(model);
    setDraftOS(deduceOperatingSystem(draftCategory, draftBrand, model));
    setWizardScreen('domain');
  };

  const handleSelectDomain = (domain: 'materiel' | 'logiciel') => {
    setDraftProblemDomain(domain);
    setWizardScreen('symptoms');
  };

  const toggleSymptom = (symptom: string) => {
    setDraftSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]
    );
  };

  const resetCurrentDeviceDraft = () => {
    setDraftCategory('laptop');
    setDraftBrand('Lenovo');
    setDraftModel('ThinkPad');
    setDraftCustomModelNote('');
    setShowCustomModelInput(false);
    setDraftOS('windows');
    setDraftProblemDomain('materiel');
    setDraftSymptoms([]);
    setDraftCustomDiagnosis('');
    setShowCustomDiagnosisInput(false);
    setEditingDeviceId(null);
  };

  const buildCurrentDraftDevice = (): DraftDeviceItem => {
    return {
      id: editingDeviceId || 'dev-' + Math.random().toString(36).substring(2, 9),
      category: draftCategory,
      brand: draftBrand,
      model: draftModel,
      customModelNote: draftCustomModelNote.trim(),
      os: draftOS,
      weightKg: deduceWeightKg(draftCategory),
      problemDomain: draftProblemDomain,
      symptoms: draftSymptoms,
      customDiagnosisNote: draftCustomDiagnosis.trim()
    };
  };

  const commitDraftDeviceToQueue = (): DraftDeviceItem[] => {
    const item = buildCurrentDraftDevice();
    let updated: DraftDeviceItem[];
    if (editingDeviceId && queuedDevices.some((d) => d.id === editingDeviceId)) {
      updated = queuedDevices.map((d) => (d.id === editingDeviceId ? item : d));
    } else {
      updated = [...queuedDevices, item];
    }
    setQueuedDevices(updated);
    setEditingDeviceId(null);
    return updated;
  };

  // Depuis les symptômes : valider l'appareil courant dans le panier et demander s'il y en a un autre
  const handleProceedToCart = () => {
    commitDraftDeviceToQueue();
    setWizardScreen('cart');
  };

  // Depuis l'écran panier : ajouter un appareil supplémentaire en repartant à la première question
  const handleStartNewDeviceFromCart = () => {
    resetCurrentDeviceDraft();
    setWizardScreen('category');
  };

  // Modifier discrètement l'OS d'un appareil directement dans le panier
  const handleUpdateQueuedDeviceOS = (deviceId: string, nextOS: OperatingSystem) => {
    setQueuedDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, os: nextOS } : d))
    );
  };

  // Depuis le panier : modifier un appareil déjà saisi
  const handleEditQueuedDevice = (device: DraftDeviceItem) => {
    setDraftCategory(device.category);
    setDraftBrand(device.brand);
    setDraftModel(device.model);
    setDraftCustomModelNote(device.customModelNote);
    setShowCustomModelInput(Boolean(device.customModelNote));
    setDraftOS(device.os);
    setDraftProblemDomain(device.problemDomain);
    setDraftSymptoms(device.symptoms);
    setDraftCustomDiagnosis(device.customDiagnosisNote);
    setShowCustomDiagnosisInput(Boolean(device.customDiagnosisNote));
    setEditingDeviceId(device.id);
    setWizardScreen('category');
  };

  const handleRemoveQueuedDevice = (deviceId: string) => {
    const updated = queuedDevices.filter((d) => d.id !== deviceId);
    setQueuedDevices(updated);
    if (updated.length === 0) {
      resetCurrentDeviceDraft();
      setWizardScreen('category');
    }
  };

  // Depuis le panier, Participant ou Bénévolat : revenir éditer un appareil sans créer de doublon
  const handleReturnToDeviceScreen = (targetScreen: 'category' | 'domain' | 'cart') => {
    if ((wizardScreen === 'cart' || wizardStep >= 3) && targetScreen !== 'cart' && !editingDeviceId && queuedDevices.length > 0) {
      const lastDevice = queuedDevices[queuedDevices.length - 1];
      setDraftCategory(lastDevice.category);
      setDraftBrand(lastDevice.brand);
      setDraftModel(lastDevice.model);
      setDraftCustomModelNote(lastDevice.customModelNote);
      setShowCustomModelInput(Boolean(lastDevice.customModelNote));
      setDraftOS(lastDevice.os);
      setDraftProblemDomain(lastDevice.problemDomain);
      setDraftSymptoms(lastDevice.symptoms);
      setDraftCustomDiagnosis(lastDevice.customDiagnosisNote);
      setShowCustomDiagnosisInput(Boolean(lastDevice.customDiagnosisNote));
      setEditingDeviceId(lastDevice.id);
    }
    setWizardScreen(targetScreen);
  };

  // Aller directement à l'Étape 3 (Inscription d'un participant)
  const handleProceedToParticipant = () => {
    if (wizardStep < 3 && wizardScreen !== 'cart') {
      commitDraftDeviceToQueue();
    }
    setWizardScreen('participant');
  };

  // Depuis l'Étape 3 (ou barre d'étapes) : valider les coordonnées et passer à l'Étape 4 Bénévolat
  const handleProceedToVolunteer = () => {
    if (wizardStep < 3 && wizardScreen !== 'cart') {
      commitDraftDeviceToQueue();
    }
    const errors = validateContactStep(contactDraft, 'activity', 'coordinates');
    const firstError = firstContactError(errors);
    if (firstError) {
      setContactErrors(errors);
      if (wizardScreen !== 'participant') {
        setWizardScreen('participant');
      }
      requestAnimationFrame(() => {
        document.getElementById(`rp-${firstError === 'contact' ? 'email' : firstError}`)?.focus();
      });
      return;
    }
    setContactErrors({});
    setWizardScreen('volunteer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Soumission du formulaire de l'Étape 3 : vers l'Étape 4 si bénévolat coché, sinon validation finale
  const handleStep3Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (contactDraft.wantsToVolunteer) {
      handleProceedToVolunteer();
      return;
    }
    await handleFinalizeVisitorFiche(e);
  };

  // Validation finale de la fiche avec ContactForm conforme Loi 25
  const handleFinalizeVisitorFiche = async (e: React.FormEvent) => {
    e.preventDefault();

    // Loi 25 : pas de coordonnées ni de bénévolat sans validation et consentements explicites
    const errors = validateContact(contactDraft, 'activity');
    setContactErrors(errors);
    const firstError = firstContactError(errors);
    if (firstError) {
      if (COORDINATE_ERROR_KEYS.has(firstError)) {
        if (wizardScreen !== 'participant') setWizardScreen('participant');
        requestAnimationFrame(() => {
          document.getElementById(`rp-${firstError === 'contact' ? 'email' : firstError}`)?.focus();
        });
      } else {
        if (wizardScreen !== 'volunteer') setWizardScreen('volunteer');
        requestAnimationFrame(() => {
          const targetId = firstError === 'roles' ? 'rp-role-accueil' : `rp-${firstError}`;
          document.getElementById(targetId)?.focus();
        });
      }
      return;
    }

    const now = Date.now();
    const contact = buildContactInfo(contactDraft, 'activity', 'reparothon', now);
    const visitorDisplayName = fullName(contact);

    const devicesToSave = queuedDevices.length > 0 ? queuedDevices : [buildCurrentDraftDevice()];
    const batchId = 'lot-' + Math.random().toString(36).substring(2, 10);

    const createdTickets: RepairTicket[] = devicesToSave.map((dev, idx) => {
      const objectName = formatDeviceName(dev.category, dev.brand, dev.model, dev.customModelNote);
      const diagnosisParts = [
        ...dev.symptoms,
        dev.customDiagnosisNote ? dev.customDiagnosisNote : ''
      ].filter(Boolean);
      const initialDiagnosis =
        diagnosisParts.length > 0 ? diagnosisParts.join(' • ') : 'Diagnostic général demandé';

      return {
        id: 'tkt-' + Math.random().toString(36).substring(2, 11) + '-' + idx,
        eventId: event.id,
        visitorName: visitorDisplayName,
        visitorEmail: contact.email || undefined,
        objectName,
        objectCategory: dev.category,
        operatingSystem: dev.os,
        initialDiagnosis,
        status: 'en_attente',
        assignedTechId: null,
        assignedTechName: null,
        resultRemarks: '',
        weightKg: dev.weightKg,
        createdAt: now + idx,
        updatedAt: now + idx,
        extraData: {
          contact,
          ...(contact.consent.activity ? { consentContact: true, consentAt: contact.consent.activity } : {}),
          batchId,
          deviceIndex: idx + 1,
          deviceTotal: devicesToSave.length,
          brand: dev.brand,
          model: dev.model,
          symptoms: dev.symptoms
        }
      };
    });

    try {
      if (createdTickets.length === 1) {
        await networkManager.writeToDatabase('tickets', 'put', createdTickets[0]);
      } else {
        await networkManager.writeBatchToDatabase('tickets', createdTickets);
      }

      showToast(
        createdTickets.length > 1
          ? `${createdTickets.length} appareils enregistrés pour ${visitorDisplayName} !`
          : `Appareil enregistré pour ${visitorDisplayName} !`,
        'success'
      );

      const waitingAhead = tickets.filter((t) => t.status === 'en_attente').length;
      const freeTechs = Math.max(1, technicians.filter((t) => t.status === 'libre').length);
      const estWait = Math.max(5, Math.round(((waitingAhead + 1) / freeTechs) * 15));
      setLastRegistrationReceipt({
        visitorName: visitorDisplayName,
        deviceNames: createdTickets.map((t) => t.objectName),
        queueNumber: waitingAhead + 1,
        estimatedWaitMinutes: estWait
      });

      // Réinitialiser toute la fiche pour le visiteur suivant
      setQueuedDevices([]);
      setContactDraft(emptyContactDraft('activity'));
      setContactErrors({});
      resetCurrentDeviceDraft();
      setWizardScreen('category');
      await loadData();
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'enregistrement de la fiche.", 'error');
    }
  };

  // ==========================================================================
  // ACTIONS SUR LES TICKETS ET TECHNICIENS
  // ==========================================================================

  const handleAssignTicket = async (ticketId: string, techId: string) => {
    if (!techId) return;
    try {
      const ticket = await db.tickets.get(ticketId);
      const tech = await db.technicians.get(techId);

      if (ticket && tech) {
        ticket.status = 'assigne';
        ticket.assignedTechId = tech.id;
        ticket.assignedTechName = tech.name;
        ticket.updatedAt = Date.now();
        await networkManager.writeToDatabase('tickets', 'put', ticket);

        tech.status = 'occupe';
        tech.currentTicketId = ticket.id;
        await networkManager.writeToDatabase('technicians', 'put', tech);

        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (ticketId: string, status: TicketStatus, remarks: string = '') => {
    try {
      const ticket = await db.tickets.get(ticketId);
      if (!ticket) return;

      ticket.status = status;
      ticket.resultRemarks = remarks;
      ticket.updatedAt = Date.now();

      const isResolved = ['repare', 'semi_repare', 'non_reparable', 'abandonne'].includes(status);
      if (isResolved && ticket.assignedTechId) {
        const tech = await db.technicians.get(ticket.assignedTechId);
        if (tech) {
          tech.status = 'libre';
          tech.currentTicketId = null;
          await networkManager.writeToDatabase('technicians', 'put', tech);
        }

        if (['repare', 'semi_repare'].includes(status)) {
          const celebrationPayload = {
            visitorName: ticket.visitorName,
            objectName: ticket.objectName,
            techName: ticket.assignedTechName || 'un bénévole',
            weightKg: ticket.weightKg
          };

          networkManager.sendChronoAction({
            type: 'PEER_CELEBRATION',
            payload: celebrationPayload
          });

          const channel = new BroadcastChannel(`insertech_reparothon_sync_${event.id}`);
          channel.postMessage({ type: 'CELEBRATION', payload: celebrationPayload });
          channel.close();

          playCelebrationSound();
          setActiveCelebration(celebrationPayload);
          setTimeout(() => setActiveCelebration(null), 8000);
        }

        ticket.assignedTechId = null;
        ticket.assignedTechName = null;
      }

      await networkManager.writeToDatabase('tickets', 'put', ticket);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTicket = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Supprimer ce ticket ?',
      message: 'Cette suppression est définitive.',
      confirmLabel: 'Supprimer',
      tone: 'destructive'
    });
    if (!confirmed) return;
    try {
      const ticketToDelete = await db.tickets.get(id);
      if (ticketToDelete && ticketToDelete.assignedTechId) {
        const tech = await db.technicians.get(ticketToDelete.assignedTechId);
        if (tech) {
          tech.status = 'libre';
          tech.currentTicketId = null;
          await networkManager.writeToDatabase('technicians', 'put', tech);
        }
      }
      await networkManager.writeToDatabase('tickets', 'delete', id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTechName.trim()) return;

    const newTech: Technician = {
      id: 'tech-' + Math.random().toString(36).substring(2, 11),
      eventId: event.id,
      name: newTechName.trim(),
      specialties: newTechSpecs,
      softwareSpecialties: newTechSoftwareSpecs,
      tableNumber: newTechTable.trim() ? parseInt(newTechTable) : null,
      status: 'libre',
      currentTicketId: null,
      createdAt: Date.now()
    };

    try {
      await networkManager.writeToDatabase('technicians', 'put', newTech);
      setNewTechName('');
      setNewTechSpecs([]);
      setNewTechTable('');
      setNewTechSoftwareSpecs([]);
      setIsAddTechModalOpen(false);
      await loadData();
      showToast(`Technicien ${newTech.name} ajouté !`, 'success');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTech = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Supprimer ce technicien ?',
      message: 'Cette suppression est définitive.',
      confirmLabel: 'Supprimer',
      tone: 'destructive'
    });
    if (!confirmed) return;
    try {
      const tech = await db.technicians.get(id);
      if (tech && tech.currentTicketId) {
        const ticket = await db.tickets.get(tech.currentTicketId);
        if (ticket) {
          ticket.status = 'en_attente';
          ticket.assignedTechId = null;
          ticket.assignedTechName = null;
          await networkManager.writeToDatabase('tickets', 'put', ticket);
        }
      }
      await networkManager.writeToDatabase('technicians', 'delete', id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleTechStatus = async (id: string, currentStatus: string) => {
    try {
      const tech = await db.technicians.get(id);
      if (tech) {
        tech.status = currentStatus === 'libre' ? 'en_pause' : 'libre';
        await networkManager.writeToDatabase('technicians', 'put', tech);
        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const parseCSVLine = (line: string, delimiter: string): string[] => {
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
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length < 2) {
        showToast('Fichier CSV invalide (doit contenir des en-têtes et au moins une ligne de données).', 'error');
        return;
      }

      const firstLine = lines[0];
      const delimiter = firstLine.includes(';') ? ';' : ',';
      const headers = parseCSVLine(firstLine, delimiter).map((h) => h.toLowerCase().trim());
      const findCol = (pred: (h: string) => boolean) => headers.findIndex((h) => !CONTACT_IMPORT_IGNORED.has(h) && pred(h));

      const idxFirstName = headers.indexOf('prénom');
      const idxLastName = headers.indexOf('nom');
      const idxVisitor = findCol((h) => h.includes('visiteur') || h.includes('nom') || h.includes('client') || h.includes('visitor') || h.includes('name'));
      const idxVisitorEmail = findCol((h) => h.includes('courriel') || h.includes('email') || h.includes('mail'));
      const idxObject = findCol((h) => h.includes('appareil') || h.includes('objet') || h.includes('modèle') || h.includes('device') || h.includes('object') || h.includes('modele'));
      const idxCategory = findCol((h) => h.includes('catégorie') || h.includes('type') || h.includes('category') || h.includes('categorie'));
      const idxOS = findCol((h) => h.includes('os') || h.includes('système') || h.includes('system') || h.includes('operating'));
      const idxDiagnosis = findCol((h) => h.includes('diagnostic') || h.includes('panne') || h.includes('symptome') || h.includes('symptôme') || h.includes('description') || h.includes('diagnosis'));
      const idxTech = findCol((h) => h.includes('technicien') || h.includes('bénévole') || h.includes('tech') || h.includes('assigné') || h.includes('assigned') || h.includes('volunteer') || h.includes('benevole'));
      const idxTableNumber = findCol((h) => h.includes('table'));
      const idxWeight = findCol((h) => h.includes('poids') || h.includes('masse') || h.includes('kg') || h.includes('weight'));
      const idxStatus = findCol((h) => h.includes('statut') || h.includes('status') || h.includes('résultat') || h.includes('result') || h.includes('resultat'));
      const idxRemarks = findCol((h) => h.includes('remarque') || h.includes('note') || h.includes('remarks') || h.includes('resolution'));

      if (idxVisitor === -1 || idxObject === -1) {
        showToast("Les en-têtes de colonnes obligatoires (Nom du visiteur, Nom de l'appareil) sont introuvables dans le fichier CSV.", 'error');
        return;
      }

      const existingTechs = await db.technicians.where('eventId').equals(event.id).toArray();
      const techNameMap = new Map(existingTechs.map((t) => [t.name.toLowerCase().trim(), t]));

      const importedTickets: RepairTicket[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i], delimiter);
        if (cols.length < headers.length) continue;

        const visitorName =
          idxFirstName !== -1 && idxLastName !== -1
            ? `${cols[idxFirstName] || ''} ${cols[idxLastName] || ''}`.trim()
            : cols[idxVisitor];
        const objectName = cols[idxObject];
        if (!visitorName || !objectName) continue;

        let category: DeviceCategory = 'laptop';
        if (idxCategory !== -1 && cols[idxCategory]) {
          const rawCat = cols[idxCategory].toLowerCase();
          if (rawCat.includes('tour') || rawCat.includes('fixe') || rawCat.includes('desktop')) category = 'pc_tour';
          else if (rawCat.includes('cellulaire') || rawCat.includes('téléphone') || rawCat.includes('phone') || rawCat.includes('mobile')) category = 'cellulaire';
          else if (rawCat.includes('tablette') || rawCat.includes('ipad') || rawCat.includes('tablet')) category = 'tablette';
          else if (rawCat.includes('portable') || rawCat.includes('laptop') || rawCat.includes('macbook')) category = 'laptop';
          else category = 'autre';
        }

        let os: OperatingSystem = 'windows';
        if (idxOS !== -1 && cols[idxOS]) {
          const rawOS = cols[idxOS].toLowerCase();
          if (rawOS.includes('mac') || rawOS.includes('ios') || rawOS.includes('apple')) os = 'mac';
          else if (rawOS.includes('linux') || rawOS.includes('ubuntu') || rawOS.includes('debian')) os = 'linux';
          else if (rawOS.includes('windows')) os = 'windows';
          else if (rawOS.includes('aucun') || rawOS.includes('android') || rawOS.includes('chromebook') || rawOS.includes('chrome')) os = 'aucun';
          else os = 'autre';
        }

        let status: TicketStatus = 'en_attente';
        if (idxStatus !== -1 && cols[idxStatus]) {
          const rawStat = cols[idxStatus].toLowerCase();
          if (rawStat.includes('repare') || rawStat.includes('réparé') || rawStat.includes('succes') || rawStat.includes('succès')) status = 'repare';
          else if (rawStat.includes('partiel') || rawStat.includes('semi')) status = 'semi_repare';
          else if (rawStat.includes('non') || rawStat.includes('echec') || rawStat.includes('échec') || rawStat.includes('impossible')) status = 'non_reparable';
          else if (rawStat.includes('abandon') || rawStat.includes('parti')) status = 'abandonne';
          else if (rawStat.includes('cours') || rawStat.includes('progress')) status = 'en_cours';
          else if (rawStat.includes('assign')) status = 'assigne';
        }

        let assignedTechId: string | null = null;
        let assignedTechName: string | null = null;

        if (idxTech !== -1 && cols[idxTech]) {
          const techName = cols[idxTech].trim();
          if (techName) {
            const normalizedName = techName.toLowerCase();
            if (techNameMap.has(normalizedName)) {
              const tech = techNameMap.get(normalizedName)!;
              assignedTechId = tech.id;
              assignedTechName = tech.name;
            } else {
              const newTechId = 'tech-' + Math.random().toString(36).substring(2, 11);
              const newTech: Technician = {
                id: newTechId,
                eventId: event.id,
                name: techName,
                specialties: [category],
                softwareSpecialties: os !== 'aucun' && os !== 'autre' ? [os] : [],
                status: status === 'assigne' || status === 'en_cours' ? 'occupe' : 'libre',
                currentTicketId: status === 'assigne' || status === 'en_cours' ? 'temp' : null,
                tableNumber: (() => {
                  if (idxTableNumber === -1) return null;
                  const rawTable = cols[idxTableNumber];
                  if (!rawTable) return null;
                  const match = rawTable.match(/\d+/);
                  return match ? parseInt(match[0]) : null;
                })(),
                createdAt: Date.now()
              };
              await networkManager.writeToDatabase('technicians', 'put', newTech);
              existingTechs.push(newTech);
              techNameMap.set(normalizedName, newTech);
              assignedTechId = newTechId;
              assignedTechName = techName;
            }
          }
        }

        const ticketId = 'tkt-' + Math.random().toString(36).substring(2, 11);
        if (assignedTechId && (status === 'assigne' || status === 'en_cours')) {
          const tech = techNameMap.get(assignedTechName!.toLowerCase())!;
          tech.currentTicketId = ticketId;
          await networkManager.writeToDatabase('technicians', 'put', tech);
        }

        const ticket: RepairTicket = {
          id: ticketId,
          eventId: event.id,
          visitorName,
          visitorEmail:
            idxVisitorEmail !== -1
              ? cols[idxVisitorEmail] || undefined
              : idxVisitor !== -1 && cols[idxVisitor + 1]?.includes('@')
                ? cols[idxVisitor + 1]
                : undefined,
          objectName,
          objectCategory: category,
          operatingSystem: os,
          initialDiagnosis: idxDiagnosis !== -1 ? cols[idxDiagnosis] || '' : '',
          status,
          assignedTechId,
          assignedTechName,
          resultRemarks: idxRemarks !== -1 ? cols[idxRemarks] || '' : '',
          weightKg: idxWeight !== -1 ? clampNumber(cols[idxWeight], 0.05, 50, 1.5) : deduceWeightKg(category),
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        importedTickets.push(ticket);
      }

      if (importedTickets.length > 0) {
        await networkManager.writeBatchToDatabase('tickets', importedTickets);
      }

      await loadData();
      showToast(`${importedTickets.length} tickets importés avec succès et synchronisés !`, 'success');
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  // CALCULS STATISTIQUES
  const totalRegistered = tickets.length;
  const repairedCount = tickets.filter((t) => t.status === 'repare').length;
  const semiRepairedCount = tickets.filter((t) => t.status === 'semi_repare').length;
  const successCount = repairedCount + semiRepairedCount;
  const unreparableCount = tickets.filter((t) => t.status === 'non_reparable').length;
  const inProgressCount = tickets.filter((t) => t.status === 'en_cours' || t.status === 'assigne').length;
  const waitingCount = tickets.filter((t) => t.status === 'en_attente').length;

  const totalWeightSaved = tickets
    .filter((t) => ['repare', 'semi_repare'].includes(t.status))
    .reduce((sum, t) => sum + (t.weightKg || 0), 0);

  // ==========================================================================
  // VUE 3 : ÉCRAN PUBLIC DE PROJECTION (ANONYMISÉ LOI 25 + APPELS DE TABLE)
  // ==========================================================================
  if (activeTab === 'public') {
    const now = Date.now();
    const recentTableCall = [...tickets]
      .filter((t) => typeof t.extraData?.tableCallAt === 'number' && now - t.extraData.tableCallAt < 120_000)
      .sort((a, b) => (b.extraData?.tableCallAt || 0) - (a.extraData?.tableCallAt || 0))[0];
    const activeFlash =
      event.extraData?.publicFlash?.text &&
      now - (event.extraData.publicFlash.timestamp || 0) < 300_000
        ? String(event.extraData.publicFlash.text)
        : null;
    const doughnutData = {
      labels: ['Réparés', 'Partiels', 'Non Réparables', 'En cours', 'En attente'],
      datasets: [
        {
          data: [repairedCount, semiRepairedCount, unreparableCount, inProgressCount, waitingCount],
          backgroundColor: ['#9ecd33', '#a3e635', '#ef4444', '#f59e0b', '#64748b'],
          borderColor: 'rgba(24, 10, 43, 0.8)',
          borderWidth: 2
        }
      ]
    };

    return (
      <div className="space-y-8 relative">
        {activeFlash && (
          <div role="status" className="bg-primary text-secondary p-4 rounded-2xl text-center font-display font-black uppercase tracking-wider text-base sm:text-lg shadow-lg">
            {activeFlash}
          </div>
        )}
        {recentTableCall && (
          <div role="status" className="bg-app-card border-2 border-primary p-5 rounded-3xl text-center shadow-xl space-y-1">
            <span className="text-micro uppercase font-black tracking-widest text-primary block">
              Appel à la table
            </span>
            <p className="text-2xl sm:text-3xl font-display font-black uppercase text-app-text">
              Au tour de {formatPublicShortName(recentTableCall.visitorName)} → Table{' '}
              {recentTableCall.extraData?.tableNumber || '?'}
            </p>
            <p className="text-xs text-app-text-muted">{recentTableCall.objectName}</p>
          </div>
        )}
        <AnimatePresence>
          {activeCelebration && (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Victoire écologique : appareil réparé"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/90 backdrop-blur-md p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="bg-app-card border-4 border-primary p-8 sm:p-10 rounded-3xl max-w-2xl text-center space-y-6 shadow-2xl"
              >
                <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center text-primary mx-auto">
                  <Award size={64} />
                </div>
                <span className="text-xs font-black uppercase text-primary tracking-widest font-sans block">
                  Victoire Écologique !
                </span>
                <h2 className="text-4xl sm:text-5xl font-display font-bold text-app-text uppercase tracking-wider">
                  Appareil Réparé !
                </h2>
                <p className="text-lg text-app-text-muted font-sans leading-relaxed">
                  Le <span className="text-primary font-bold">{activeCelebration.objectName}</span> de{' '}
                  <span className="font-semibold text-app-text">{activeCelebration.visitorName}</span> a été sauvé par{' '}
                  <span className="font-semibold text-app-text">{activeCelebration.techName}</span> !
                </p>
                <div className="inline-block bg-primary/10 border border-primary/30 px-6 py-2.5 rounded-2xl text-primary font-mono text-xl font-bold">
                  +{activeCelebration.weightKg} kg détournés de la pollution numérique
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          <StatKpiCard
            label="Appareils apportés"
            value={totalRegistered}
            labelColorClass="text-app-text-muted"
            valueColorClass="text-app-text"
          />
          <StatKpiCard
            label="Taux de succès"
            value={`${totalRegistered > 0 ? Math.round((successCount / totalRegistered) * 100) : 0}%`}
            labelColorClass="text-primary font-bold"
            valueColorClass="text-primary"
          />
          <StatKpiCard
            label="En cours de réparation"
            value={inProgressCount}
            labelColorClass="text-app-text-muted"
            valueColorClass="text-amber-500"
          />
          <StatKpiCard
            label="Poids Sauvé"
            value={`${totalWeightSaved.toFixed(1)} kg`}
            labelColorClass="text-primary font-bold"
            valueColorClass="text-primary"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
          <div className="lg:col-span-8 bg-app-card border border-app-card-border p-6 rounded-3xl shadow-lg">
            <h3 className="text-lg font-bold font-display text-app-text uppercase tracking-wider mb-4 pb-2 border-b border-app-card-border">
              Suivi des Réparations en cours
            </h3>

            {tickets.filter((t) => ['assigne', 'en_cours', 'en_attente'].includes(t.status)).length === 0 ? (
              <p className="text-sm text-app-text-muted text-center py-12 font-sans">
                Aucun appareil en cours de réparation actuellement.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AnimatePresence initial={false} mode="popLayout">
                  {tickets
                    .filter((t) => ['assigne', 'en_cours', 'en_attente'].includes(t.status))
                    .slice(0, 8)
                    .map((t) => (
                      <motion.div
                        key={t.id}
                        layout
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="p-4 rounded-xl bg-app-input border border-app-card-border flex items-center justify-between"
                      >
                        <div>
                          <h4 className="font-bold text-app-text text-sm">{t.objectName}</h4>
                          <p className="text-xs text-app-text-muted mt-0.5">
                            {formatPublicShortName(t.visitorName)} ({t.objectCategory.replace('_', ' ')})
                          </p>
                        </div>

                        <span
                          className={`text-micro px-2.5 py-1 rounded-full font-bold uppercase ${
                            t.status === 'en_attente'
                              ? 'bg-app-text-muted/15 text-app-text-muted border border-app-text-muted/30 animate-pulse'
                              : 'bg-warning/15 text-warning border border-warning/30'
                          }`}
                        >
                          {t.status === 'en_attente' ? 'Attente' : `Banc : ${t.assignedTechName}`}
                        </span>
                      </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 bg-app-card border border-app-card-border p-6 rounded-3xl shadow-lg flex flex-col justify-center">
            <div className="max-h-72 aspect-square mx-auto w-full flex items-center justify-center">
              <DoughnutChart data={doughnutData} title="Statut des diagnostics" />
            </div>
          </div>
        </div>

        {partnerLogos.length > 0 &&
          (() => {
            const safeIndex = activeLogoIndex % partnerLogos.length;
            const activeLogo: PartnerLogo = partnerLogos[safeIndex];
            return (
              <div
                tabIndex={0}
                role="region"
                aria-label="Partenaires de l'événement"
                className="bg-app-card border border-app-card-border p-4 rounded-2xl flex items-center justify-between gap-4 mt-8 focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <span className="text-micro uppercase font-black tracking-widest text-app-text-muted font-sans shrink-0">
                  Nos précieux partenaires
                </span>

                <div className="flex-1 overflow-hidden relative h-12 max-w-md mx-auto flex items-center justify-center">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeLogo.id}
                      initial={{ opacity: 0, x: 16, scale: 0.96 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -16, scale: 0.96 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 flex items-center justify-center p-1"
                    >
                      <img
                        src={activeLogo.data}
                        alt={activeLogo.name}
                        className="max-h-10 max-w-full object-contain filter drop-shadow"
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>

                <span className="text-micro font-sans text-app-text-muted shrink-0 font-bold">
                  {safeIndex + 1} / {partnerLogos.length}
                </span>
              </div>
            );
          })()}
      </div>
    );
  }

  // ==========================================================================
  // VUE 1 : CONSOLE D'ACCUEIL & MODE KIOSQUE FORMULAIRE (1 QUESTION PAR ÉCRAN)
  // ==========================================================================
  if (activeTab === 'accueil' || activeTab === 'formulaire') {
    const kioskForm = activeTab === 'formulaire';

    if (!kioskForm && workRole === 'reparateur') {
      return (
        <div className="max-w-4xl mx-auto space-y-5">
          <WorkRoleBar event={event} activeRole={workRole} onSelectRole={handleSelectWorkRole} isTablet={isAndroidApp()} />
          <ReparateurCockpit
            event={event}
            tickets={tickets}
            technicians={technicians}
            onReload={loadData}
            onCelebrate={(payload) => {
              setActiveCelebration(payload);
              playCelebrationSound();
              confetti({ particleCount: 80, spread: 80, origin: { y: 0.6 }, colors: ['#9ecd33', '#480A94', '#ffffff'] });
              setTimeout(() => setActiveCelebration(null), 8000);
            }}
          />
        </div>
      );
    }

    if (!kioskForm && workRole === 'assistant') {
      return (
        <div className="max-w-4xl mx-auto space-y-5">
          <WorkRoleBar event={event} activeRole={workRole} onSelectRole={handleSelectWorkRole} isTablet={isAndroidApp()} />
          <AssistantCockpit tickets={tickets} onReload={loadData} />
        </div>
      );
    }
    const activeCatConfig = DEVICE_CATEGORIES.find((c) => c.id === draftCategory) || DEVICE_CATEGORIES[0];
    const availableBrands = activeCatConfig.brands;
    const availableModels = BRAND_MODELS_BY_CATEGORY[draftCategory]?.[draftBrand] || ['Modèle inconnu'];

    const activeProblemList = draftProblemDomain === 'materiel' ? HARDWARE_PROBLEMS : SOFTWARE_PROBLEMS;
    const hardwareSelectedCount = draftSymptoms.filter((s) =>
      HARDWARE_PROBLEMS.some((p) => p.id === s)
    ).length;
    const softwareSelectedCount = draftSymptoms.filter((s) =>
      SOFTWARE_PROBLEMS.some((p) => p.id === s)
    ).length;
    const showVolunteerStep = contactDraft.wantsToVolunteer;
    const showDeviceBreadcrumb =
      wizardScreen === 'brand' ||
      wizardScreen === 'model' ||
      wizardScreen === 'domain' ||
      wizardScreen === 'symptoms';

    return (
      <div className={`max-w-4xl mx-auto space-y-5 ${kioskForm ? 'kiosk-form-only' : ''}`}>
        {!kioskForm && (
          <WorkRoleBar event={event} activeRole={workRole} onSelectRole={handleSelectWorkRole} isTablet={isAndroidApp()} />
        )}
        {lastRegistrationReceipt && (
          <div
            role="status"
            className="bg-app-card border-2 border-primary p-5 rounded-3xl shadow-xl space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-micro font-black uppercase tracking-widest text-primary block">
                  Billet de Confirmation • File #{lastRegistrationReceipt.queueNumber}
                </span>
                <h3 className="text-xl font-display font-bold uppercase text-app-text">
                  Bienvenue {lastRegistrationReceipt.visitorName} !
                </h3>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-xs font-bold">
                Attente estimée : ~{lastRegistrationReceipt.estimatedWaitMinutes} min
              </span>
            </div>
            <p className="text-xs text-app-text-muted">
              Appareil(s) enregistré(s) : <strong className="text-app-text">{lastRegistrationReceipt.deviceNames.join(', ')}</strong>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLastRegistrationReceipt(null)}
                className="min-h-11 px-4 py-2 rounded-xl bg-primary text-secondary text-xs font-bold font-display uppercase cursor-pointer"
              >
                Inscrire le prochain visiteur →
              </button>
            </div>
          </div>
        )}
        <div className="kiosk-keep space-y-5">
          {/* Barre d'étapes 1 - 2 - 3 (- 4 conditionnelle) + fil d'Ariane cliquable */}
          <div className="bg-app-card border border-app-card-border p-4 sm:p-5 rounded-3xl shadow-lg space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <span className="text-micro font-black uppercase tracking-widest text-primary block">
                  Accueil Réparothon • 1 question à la fois
                </span>
                <h2 className="text-lg sm:text-xl font-display font-bold uppercase text-app-text tracking-wide">
                  {editingDeviceId
                    ? "Modification d'un appareil de la fiche"
                    : queuedDevices.length > 0 && wizardStep < 3 && wizardScreen !== 'cart'
                      ? `Appareil #${queuedDevices.length + 1} pour ce visiteur`
                      : showVolunteerStep
                        ? 'Inscription en 4 étapes'
                        : 'Inscription en 3 étapes'}
                </h2>
              </div>

              {queuedDevices.length > 0 && wizardScreen !== 'cart' && (
                <button
                  type="button"
                  onClick={() => setWizardScreen('cart')}
                  className="min-h-11 px-3.5 py-2 rounded-2xl bg-primary/15 border-2 border-primary text-primary font-display font-bold uppercase text-xs flex items-center gap-2 cursor-pointer hover:bg-primary/25 transition-colors"
                >
                  <PackagePlus size={16} aria-hidden="true" />
                  <span>
                    Fiche : {queuedDevices.length} appareil{queuedDevices.length > 1 ? 's' : ''}
                  </span>
                </button>
              )}
            </div>

            {/* Étapes principales 1 - 2 - 3 (- 4) */}
            <div
              className={
                showVolunteerStep
                  ? 'grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3'
                  : 'grid grid-cols-3 gap-2 sm:gap-3'
              }
              role="navigation"
              aria-label="Étapes d'inscription de l'appareil"
            >
              <button
                type="button"
                onClick={() =>
                  wizardScreen === 'cart' || wizardStep >= 3
                    ? handleReturnToDeviceScreen('category')
                    : setWizardScreen('category')
                }
                aria-current={wizardStep === 1 ? 'step' : undefined}
                className={`min-h-12 p-2.5 sm:p-3 rounded-2xl border-2 text-left transition-colors cursor-pointer flex items-center gap-2 sm:gap-3 ${
                  wizardStep === 1
                    ? 'bg-primary text-secondary border-primary font-black shadow-md'
                    : wizardStep > 1
                      ? 'bg-primary/15 text-app-text border-primary/40 hover:bg-primary/20'
                      : 'bg-app-input text-app-text-muted border-app-card-border'
                }`}
              >
                <span
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-display font-black text-sm sm:text-base shrink-0 ${
                    wizardStep === 1
                      ? 'bg-secondary text-primary'
                      : wizardStep > 1
                        ? 'bg-primary text-secondary'
                        : 'bg-app-card text-app-text-muted'
                  }`}
                >
                  {wizardStep > 1 ? <Check size={15} /> : '1'}
                </span>
                <div className="min-w-0">
                  <span className="text-micro uppercase font-black tracking-wider block opacity-80">Étape 1</span>
                  <span className="text-xs sm:text-sm font-display font-bold uppercase truncate block">
                    Appareil
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  wizardScreen === 'cart' || wizardStep >= 3
                    ? handleReturnToDeviceScreen('domain')
                    : setWizardScreen('domain')
                }
                aria-current={wizardStep === 2 ? 'step' : undefined}
                className={`min-h-12 p-2.5 sm:p-3 rounded-2xl border-2 text-left transition-colors cursor-pointer flex items-center gap-2 sm:gap-3 ${
                  wizardStep === 2
                    ? 'bg-primary text-secondary border-primary font-black shadow-md'
                    : wizardStep > 2
                      ? 'bg-primary/15 text-app-text border-primary/40 hover:bg-primary/20'
                      : 'bg-app-input text-app-text-muted border-app-card-border hover:text-app-text'
                }`}
              >
                <span
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-display font-black text-sm sm:text-base shrink-0 ${
                    wizardStep === 2
                      ? 'bg-secondary text-primary'
                      : wizardStep > 2
                        ? 'bg-primary text-secondary'
                        : 'bg-app-card text-app-text-muted'
                  }`}
                >
                  {wizardStep > 2 ? <Check size={15} /> : '2'}
                </span>
                <div className="min-w-0">
                  <span className="text-micro uppercase font-black tracking-wider block opacity-80">Étape 2</span>
                  <span className="text-xs sm:text-sm font-display font-bold uppercase truncate block">
                    Problème
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={handleProceedToParticipant}
                aria-current={wizardStep === 3 ? 'step' : undefined}
                className={`min-h-12 p-2.5 sm:p-3 rounded-2xl border-2 text-left transition-colors cursor-pointer flex items-center gap-2 sm:gap-3 ${
                  wizardStep === 3
                    ? 'bg-primary text-secondary border-primary font-black shadow-md'
                    : wizardStep > 3
                      ? 'bg-primary/15 text-app-text border-primary/40 hover:bg-primary/20'
                      : 'bg-app-input text-app-text-muted border-app-card-border hover:text-app-text'
                }`}
              >
                <span
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-display font-black text-sm sm:text-base shrink-0 ${
                    wizardStep === 3
                      ? 'bg-secondary text-primary'
                      : wizardStep > 3
                        ? 'bg-primary text-secondary'
                        : 'bg-app-card text-app-text-muted'
                  }`}
                >
                  {wizardStep > 3 ? <Check size={15} /> : '3'}
                </span>
                <div className="min-w-0">
                  <span className="text-micro uppercase font-black tracking-wider block opacity-80">Étape 3</span>
                  <span className="text-xs sm:text-sm font-display font-bold uppercase truncate block">
                    Participant
                  </span>
                </div>
              </button>

              {showVolunteerStep && (
                <button
                  type="button"
                  onClick={handleProceedToVolunteer}
                  aria-current={wizardStep === 4 ? 'step' : undefined}
                  className={`min-h-12 p-2.5 sm:p-3 rounded-2xl border-2 text-left transition-colors cursor-pointer flex items-center gap-2 sm:gap-3 ${
                    wizardStep === 4
                      ? 'bg-primary text-secondary border-primary font-black shadow-md'
                      : 'bg-app-input text-app-text-muted border-app-card-border hover:text-app-text'
                  }`}
                >
                  <span
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-display font-black text-sm sm:text-base shrink-0 ${
                      wizardStep === 4 ? 'bg-secondary text-primary' : 'bg-app-card text-app-text-muted'
                    }`}
                  >
                    4
                  </span>
                  <div className="min-w-0">
                    <span className="text-micro uppercase font-black tracking-wider block opacity-80">Étape 4</span>
                    <span className="text-xs sm:text-sm font-display font-bold uppercase truncate block">
                      Bénévolat
                    </span>
                  </div>
                </button>
              )}
            </div>

            {/* Fil d'Ariane cliquable pour corriger une sélection précédente en 1 tap */}
            {showDeviceBreadcrumb && (
              <nav
                aria-label="Sélections précédentes"
                className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-app-card-border text-xs"
              >
                <button
                  type="button"
                  onClick={() => setWizardScreen('category')}
                  className="min-h-9 px-2.5 py-1 rounded-lg bg-app-input border border-app-card-border font-bold text-primary hover:border-primary/60 cursor-pointer transition-colors"
                >
                  {activeCatConfig.shortLabel}
                </button>

                {(wizardScreen === 'model' || wizardScreen === 'domain' || wizardScreen === 'symptoms') && (
                  <>
                    <ChevronRight size={14} className="text-app-text-muted shrink-0" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => setWizardScreen('brand')}
                      className="min-h-9 px-2.5 py-1 rounded-lg bg-app-input border border-app-card-border font-bold text-primary hover:border-primary/60 cursor-pointer transition-colors"
                    >
                      {draftBrand}
                    </button>
                  </>
                )}

                {(wizardScreen === 'domain' || wizardScreen === 'symptoms') && (
                  <>
                    <ChevronRight size={14} className="text-app-text-muted shrink-0" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => setWizardScreen('model')}
                      className="min-h-9 px-2.5 py-1 rounded-lg bg-app-input border border-app-card-border font-bold text-primary hover:border-primary/60 cursor-pointer transition-colors"
                    >
                      {draftModel}
                      {draftCustomModelNote.trim() ? ` (${draftCustomModelNote.trim()})` : ''}
                    </button>
                  </>
                )}

                {wizardScreen === 'symptoms' && (
                  <>
                    <ChevronRight size={14} className="text-app-text-muted shrink-0" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => setWizardScreen('domain')}
                      className="min-h-9 px-2.5 py-1 rounded-lg bg-app-input border border-app-card-border font-bold text-primary hover:border-primary/60 cursor-pointer transition-colors"
                    >
                      {draftProblemDomain === 'materiel' ? 'Matériel' : 'Logiciel'}
                    </button>
                  </>
                )}
              </nav>
            )}
          </div>

          {/* ================================================================== */}
          {/* ÉCRAN 1A : TYPE D'APPAREIL (1 QUESTION, PASSAGE AUTO)               */}
          {/* ================================================================== */}
          {wizardScreen === 'category' && (
            <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
              <div>
                <span className="text-micro font-black uppercase tracking-widest text-primary block mb-1">
                  Question 1 sur 3 • Appareil
                </span>
                <h3 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-wide text-app-text">
                  Quel type d'appareil est apporté ?
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" role="group" aria-label="Catégorie d'appareil">
                {DEVICE_CATEGORIES.map((cat) => {
                  const IconComp = cat.icon;
                  const isSelected = draftCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelectCategory(cat.id)}
                      className={`min-h-24 p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-2.5 text-center transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-primary text-secondary border-primary font-black shadow-lg'
                          : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                      }`}
                    >
                      <IconComp size={30} className={isSelected ? 'text-secondary' : 'text-primary'} />
                      <span className="text-xs sm:text-sm font-display font-bold uppercase tracking-wide leading-tight">
                        {cat.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {queuedDevices.length > 0 && (
                <div className="pt-3 border-t border-app-card-border flex justify-start">
                  <button
                    type="button"
                    onClick={() => setWizardScreen('cart')}
                    className="min-h-12 px-4 py-2.5 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs sm:text-sm hover:border-primary/50 transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    <span>
                      Retour au panier ({queuedDevices.length} appareil{queuedDevices.length > 1 ? 's' : ''})
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ================================================================== */}
          {/* ÉCRAN 1B : MARQUE (1 QUESTION, PASSAGE AUTO)                       */}
          {/* ================================================================== */}
          {wizardScreen === 'brand' && (
            <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
              <div>
                <span className="text-micro font-black uppercase tracking-widest text-primary block mb-1">
                  Question 2 sur 3 • Appareil
                </span>
                <h3 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-wide text-app-text">
                  Quelle est la marque ?
                </h3>
              </div>

              <div
                className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3"
                role="group"
                aria-label="Marque de l'appareil"
              >
                {availableBrands.map((brand) => {
                  const isSelected = draftBrand === brand;
                  return (
                    <button
                      key={brand}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelectBrand(brand)}
                      className={`min-h-16 px-3.5 py-3 rounded-2xl border-2 font-display font-bold uppercase text-xs sm:text-sm transition-colors cursor-pointer flex items-center justify-center text-center ${
                        isSelected
                          ? 'bg-primary text-secondary border-primary font-black shadow-md'
                          : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                      }`}
                    >
                      {brand}
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-app-card-border flex justify-start">
                <button
                  type="button"
                  onClick={() => setWizardScreen('category')}
                  className="min-h-12 px-4 py-2.5 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs sm:text-sm hover:border-primary/50 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Retour</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* ÉCRAN 1C : MODÈLE (1 QUESTION, PASSAGE AUTO AU TAP)                */}
          {/* ================================================================== */}
          {wizardScreen === 'model' && (
            <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="text-micro font-black uppercase tracking-widest text-primary block mb-1">
                    Question 3 sur 3 • Appareil
                  </span>
                  <h3 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-wide text-app-text">
                    Quel modèle ({draftBrand}) ?
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCustomModelInput((prev) => !prev)}
                  className="min-h-9 px-3 py-1 rounded-xl bg-app-input border border-app-card-border text-xs font-bold text-primary hover:border-primary/50 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Edit3 size={13} aria-hidden="true" />
                  <span>
                    {showCustomModelInput ? 'Masquer le numéro exact' : 'Préciser un numéro exact (optionnel)'}
                  </span>
                </button>
              </div>

              <div
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
                role="group"
                aria-label="Gamme ou modèle"
              >
                {availableModels.map((model) => {
                  const isSelected = draftModel === model;
                  return (
                    <button
                      key={model}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelectModel(model)}
                      className={`min-h-16 px-4 py-3 rounded-2xl border-2 font-display font-bold uppercase text-xs sm:text-sm transition-colors cursor-pointer flex items-center justify-center text-center ${
                        isSelected
                          ? 'bg-primary text-secondary border-primary font-black shadow-md'
                          : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                      }`}
                    >
                      {model}
                    </button>
                  );
                })}
              </div>

              {showCustomModelInput && (
                <div className="pt-2 space-y-2">
                  <label
                    htmlFor="reparo-custom-model-note"
                    className="text-micro font-bold uppercase tracking-wider text-app-text-muted block"
                  >
                    Précision sur le modèle (facultatif)
                  </label>
                  <input
                    id="reparo-custom-model-note"
                    type="text"
                    value={draftCustomModelNote}
                    onChange={(e) => setDraftCustomModelNote(e.target.value)}
                    placeholder="Ex. T480, A2337, S21 FE..."
                    className="w-full bg-app-input border border-app-input-border rounded-xl px-3.5 py-2.5 min-h-11 text-app-text text-sm placeholder:text-app-text-muted/60 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-app-card-border flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setWizardScreen('brand')}
                  className="min-h-12 px-4 py-2.5 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs sm:text-sm hover:border-primary/50 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Retour</span>
                </button>

                {showCustomModelInput && (
                  <button
                    type="button"
                    onClick={() => setWizardScreen('domain')}
                    className="min-h-14 px-6 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase tracking-wider text-sm sm:text-base hover:opacity-95 active:scale-95 transition cursor-pointer flex items-center gap-2 shadow-lg"
                  >
                    <span>Continuer</span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* ÉCRAN 2A : MATÉRIEL VS LOGICIEL (1 QUESTION, PASSAGE AUTO)         */}
          {/* ================================================================== */}
          {wizardScreen === 'domain' && (
            <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
              <div>
                <span className="text-micro font-black uppercase tracking-widest text-primary block mb-1">
                  Question 1 sur 2 • Problème
                </span>
                <h3 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-wide text-app-text">
                  Problème Matériel ou Logiciel ?
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" role="group" aria-label="Domaine du problème">
                <button
                  type="button"
                  aria-pressed={draftProblemDomain === 'materiel'}
                  onClick={() => handleSelectDomain('materiel')}
                  className={`min-h-28 p-5 rounded-2xl border-2 flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                    draftProblemDomain === 'materiel'
                      ? 'bg-primary text-secondary border-primary font-black shadow-lg'
                      : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                  }`}
                >
                  <div className="flex items-center gap-4 text-left">
                    <Cpu
                      size={36}
                      className={draftProblemDomain === 'materiel' ? 'text-secondary shrink-0' : 'text-primary shrink-0'}
                    />
                    <div>
                      <span className="text-lg sm:text-xl font-display font-bold uppercase block">
                        Problème Matériel
                      </span>
                      <span className="text-xs sm:text-sm font-sans opacity-80 block mt-0.5">
                        Batterie, écran, clavier, surchauffe, ports...
                      </span>
                    </div>
                  </div>
                  {hardwareSelectedCount > 0 && (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-black shrink-0 ${
                        draftProblemDomain === 'materiel'
                          ? 'bg-secondary text-primary'
                          : 'bg-primary text-secondary'
                      }`}
                    >
                      {hardwareSelectedCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  aria-pressed={draftProblemDomain === 'logiciel'}
                  onClick={() => handleSelectDomain('logiciel')}
                  className={`min-h-28 p-5 rounded-2xl border-2 flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                    draftProblemDomain === 'logiciel'
                      ? 'bg-primary text-secondary border-primary font-black shadow-lg'
                      : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                  }`}
                >
                  <div className="flex items-center gap-4 text-left">
                    <Terminal
                      size={36}
                      className={draftProblemDomain === 'logiciel' ? 'text-secondary shrink-0' : 'text-primary shrink-0'}
                    />
                    <div>
                      <span className="text-lg sm:text-xl font-display font-bold uppercase block">
                        Problème Logiciel
                      </span>
                      <span className="text-xs sm:text-sm font-sans opacity-80 block mt-0.5">
                        Lenteur, virus, installer Linux, démarrage, Wi-Fi...
                      </span>
                    </div>
                  </div>
                  {softwareSelectedCount > 0 && (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-black shrink-0 ${
                        draftProblemDomain === 'logiciel'
                          ? 'bg-secondary text-primary'
                          : 'bg-primary text-secondary'
                      }`}
                    >
                      {softwareSelectedCount}
                    </span>
                  )}
                </button>
              </div>

              <div className="pt-3 border-t border-app-card-border flex justify-start">
                <button
                  type="button"
                  onClick={() => setWizardScreen('model')}
                  className="min-h-12 px-4 py-2.5 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs sm:text-sm hover:border-primary/50 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Retour</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* ÉCRAN 2B : 4 CARTES DE PROBLÈMES AVEC ICÔNES (MULTI-SÉLECTION)     */}
          {/* ================================================================== */}
          {wizardScreen === 'symptoms' && (
            <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="text-micro font-black uppercase tracking-widest text-primary block mb-1">
                    Question 2 sur 2 • Touchez 1 ou plusieurs cartes
                  </span>
                  <h3 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-wide text-app-text">
                    Quel est le problème ? ({draftProblemDomain === 'materiel' ? 'Matériel' : 'Logiciel'})
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftProblemDomain(draftProblemDomain === 'materiel' ? 'logiciel' : 'materiel')
                    }
                    className="min-h-9 px-3 py-1 rounded-xl bg-app-input border border-app-card-border text-xs font-bold text-app-text-muted hover:text-primary hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    {draftProblemDomain === 'materiel'
                      ? '+ Aussi un problème Logiciel'
                      : '+ Aussi un problème Matériel'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCustomDiagnosisInput((prev) => !prev)}
                    className="min-h-9 px-3 py-1 rounded-xl bg-app-input border border-app-card-border text-xs font-bold text-primary hover:border-primary/50 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Edit3 size={13} aria-hidden="true" />
                    <span>{showCustomDiagnosisInput ? 'Masquer la note libre' : '+ Note libre'}</span>
                  </button>
                </div>
              </div>

              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-3.5"
                role="group"
                aria-label="Symptômes de l'appareil"
              >
                {activeProblemList.map((problem) => {
                  const IconComp = problem.icon;
                  const isSelected = draftSymptoms.includes(problem.id);
                  return (
                    <button
                      key={problem.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleSymptom(problem.id)}
                      className={`min-h-24 p-4 rounded-2xl border-2 transition-colors cursor-pointer flex items-center justify-between gap-3 text-left ${
                        isSelected
                          ? 'bg-primary text-secondary border-primary font-black shadow-lg'
                          : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-secondary/20 text-secondary' : 'bg-primary/10 text-primary'
                          }`}
                        >
                          <IconComp size={28} />
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm sm:text-base font-display font-bold uppercase block leading-snug">
                            {problem.label}
                          </span>
                          <span className="text-xs font-sans opacity-80 block mt-0.5 leading-snug">
                            {problem.subtitle}
                          </span>
                        </div>
                      </div>
                      {isSelected && <Check size={20} className="shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>

              {draftSymptoms.length > 0 && (
                <div className="bg-app-input border border-app-card-border rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-micro uppercase font-black text-app-text-muted mr-1">
                      Sélection ({draftSymptoms.length}) :
                    </span>
                    {draftSymptoms.map((s) => (
                      <span
                        key={s}
                        className="text-xs bg-primary/15 text-primary border border-primary/30 px-2.5 py-1 rounded-lg font-bold"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraftSymptoms([])}
                    className="text-micro text-app-text-muted hover:text-danger font-bold uppercase px-2 py-1 cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw size={12} aria-hidden="true" />
                    <span>Réinitialiser</span>
                  </button>
                </div>
              )}

              {showCustomDiagnosisInput && (
                <div>
                  <label
                    htmlFor="reparo-custom-diagnosis"
                    className="text-micro font-bold uppercase tracking-wider text-app-text-muted block mb-1"
                  >
                    Note complémentaire sur la panne (facultatif)
                  </label>
                  <input
                    id="reparo-custom-diagnosis"
                    type="text"
                    value={draftCustomDiagnosis}
                    onChange={(e) => setDraftCustomDiagnosis(e.target.value)}
                    placeholder="Ex. Le chargeur est fourni avec l'appareil..."
                    className="w-full bg-app-input border border-app-input-border rounded-xl px-3.5 py-2.5 min-h-11 text-app-text text-sm placeholder:text-app-text-muted/60 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-app-card-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setWizardScreen('domain')}
                  className="min-h-12 px-4 py-2.5 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs sm:text-sm hover:border-primary/50 transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Retour</span>
                </button>

                <button
                  type="button"
                  onClick={handleProceedToCart}
                  className="min-h-14 px-8 py-3.5 rounded-2xl bg-primary text-secondary font-display font-black uppercase tracking-wider text-base hover:opacity-95 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2 shadow-lg"
                >
                  <span>Continuer</span>
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* ÉCRAN 2C : PANIER DÉDIÉ « AVEZ-VOUS UN AUTRE APPAREIL ? »          */}
          {/* ================================================================== */}
          {wizardScreen === 'cart' && (
            <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
              <div>
                <span className="text-micro font-black uppercase tracking-widest text-primary block mb-1">
                  Appareils de ce visiteur ({queuedDevices.length})
                </span>
                <h3 className="text-xl sm:text-2xl font-display font-bold uppercase tracking-wide text-app-text">
                  Avez-vous un autre appareil à inscrire ?
                </h3>
                <p className="text-xs text-app-text-muted font-sans mt-1">
                  Chaque appareil créera automatiquement un ticket indépendant pour les techniciens.
                </p>
              </div>

              <div className="space-y-2.5">
                {queuedDevices.map((dev, index) => {
                  const devName = formatDeviceName(dev.category, dev.brand, dev.model, dev.customModelNote);
                  const catInfo = DEVICE_CATEGORIES.find((c) => c.id === dev.category) || DEVICE_CATEGORIES[0];
                  const diagSummary =
                    [...dev.symptoms, dev.customDiagnosisNote].filter(Boolean).join(' • ') ||
                    'Diagnostic général demandé';

                  return (
                    <div
                      key={dev.id}
                      className="p-4 rounded-2xl bg-app-input border border-app-card-border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-micro bg-primary text-secondary px-2.5 py-0.5 rounded-full font-display font-black uppercase">
                            Appareil #{index + 1}
                          </span>
                          <h4 className="font-display font-bold text-base text-app-text uppercase">
                            {devName}
                          </h4>
                          <span className="text-micro bg-secondary/20 text-app-text border border-secondary/30 px-2 py-0.5 rounded font-mono font-bold uppercase">
                            {catInfo.shortLabel} • {dev.weightKg} kg
                          </span>
                        </div>
                        <p className="text-xs text-app-text-muted font-sans">
                          <strong className="text-app-text">Panne :</strong> {diagSummary}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                        <select
                          aria-label={`Système d'exploitation de ${devName}`}
                          value={dev.os}
                          onChange={(e) => handleUpdateQueuedDeviceOS(dev.id, e.target.value as OperatingSystem)}
                          className="min-h-11 px-2.5 py-2 rounded-xl bg-app-card border border-app-card-border text-xs font-mono font-bold text-app-text focus:outline-none focus:border-primary cursor-pointer"
                        >
                          {OS_BUTTONS.map((osOpt) => (
                            <option key={osOpt.id} value={osOpt.id}>
                              {osOpt.label}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => handleEditQueuedDevice(dev)}
                          className="min-h-11 px-3.5 py-2 rounded-xl bg-app-card border border-app-card-border text-xs font-display font-bold uppercase text-app-text hover:border-primary/50 transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <Edit3 size={14} className="text-primary" aria-hidden="true" />
                          <span>Modifier</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveQueuedDevice(dev.id)}
                          aria-label={`Retirer l'appareil ${devName}`}
                          className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-app-card border border-app-card-border text-app-text-muted hover:text-danger hover:border-danger/40 transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-app-card-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleStartNewDeviceFromCart}
                  className="min-h-14 px-5 py-3.5 rounded-2xl bg-primary/15 border-2 border-primary text-primary font-display font-black uppercase tracking-wider text-sm hover:bg-primary/25 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Plus size={18} aria-hidden="true" />
                  <span>+ Ajouter un autre appareil</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWizardScreen('participant')}
                  className="min-h-14 px-8 py-3.5 rounded-2xl bg-primary text-secondary font-display font-black uppercase tracking-wider text-base hover:opacity-95 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2 shadow-xl"
                >
                  <span>Inscrire le participant</span>
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* ÉTAPE 3 : INSCRIPTION D'UN PARTICIPANT (FORMULAIRE SEUL À L'ÉCRAN) */}
          {/* ================================================================== */}
          {wizardScreen === 'participant' && (
            <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
              {/* Barre compacte 1 ligne indiquant les appareils prêts */}
              <div className="bg-app-input border border-app-card-border rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-micro bg-primary text-secondary px-2.5 py-0.5 rounded-full font-display font-black uppercase shrink-0">
                    {queuedDevices.length} appareil{queuedDevices.length > 1 ? 's' : ''} prêt{queuedDevices.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-xs font-sans text-app-text-muted truncate">
                    {queuedDevices
                      .map((d) => formatDeviceName(d.category, d.brand, d.model, d.customModelNote))
                      .join(' • ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setWizardScreen('cart')}
                  className="min-h-9 px-3 py-1 rounded-xl bg-app-card border border-app-card-border text-xs font-bold text-primary hover:border-primary/50 cursor-pointer shrink-0"
                >
                  Modifier les appareils
                </button>
              </div>

              <form onSubmit={handleStep3Submit} className="space-y-5" noValidate>
                <h3 className="text-base sm:text-lg font-display font-bold uppercase tracking-wider text-app-text flex items-center gap-2">
                  <UserCheck size={18} className="text-primary" aria-hidden="true" />
                  <span>3. Inscription d'un participant</span>
                </h3>

                <ContactForm
                  idPrefix="rp"
                  mode="activity"
                  section="coordinates"
                  value={contactDraft}
                  onChange={(next) => {
                    setContactDraft(next);
                    setContactErrors({});
                  }}
                  errors={contactErrors}
                />

                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setWizardScreen('cart')}
                    className="min-h-14 px-5 py-3 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs sm:text-sm hover:border-primary/50 transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    <span>Retour aux appareils</span>
                  </button>

                  <button
                    type="submit"
                    className="min-h-14 px-8 py-3.5 rounded-2xl bg-primary text-secondary font-display font-black uppercase tracking-wider text-base hover:opacity-95 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2.5 shadow-xl"
                  >
                    {showVolunteerStep ? (
                      <>
                        <span>Étape 4 : Questions bénévolat</span>
                        <ArrowRight size={18} aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <CheckCircle size={20} aria-hidden="true" />
                        <span>
                          {kioskForm
                            ? "M'inscrire"
                            : `Valider et enregistrer ${queuedDevices.length} appareil${queuedDevices.length > 1 ? 's' : ''}`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ================================================================== */}
          {/* ÉTAPE 4 : QUESTIONS DE BÉNÉVOLAT INSERTECH (CONDITIONNEL)          */}
          {/* ================================================================== */}
          {wizardScreen === 'volunteer' && showVolunteerStep && (
            <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-6">
              <div className="space-y-1 pb-4 border-b border-app-card-border">
                <h3 className="text-base sm:text-lg font-display font-bold uppercase tracking-wider text-app-text flex items-center gap-2">
                  <HandHeart size={20} className="text-primary shrink-0" aria-hidden="true" />
                  <span>4. Questions de bénévolat Insertech</span>
                </h3>
                <p className="text-xs text-app-text-muted font-sans">
                  Fiche de{' '}
                  <strong className="text-app-text">
                    {[contactDraft.firstName.trim(), contactDraft.lastName.trim()].filter(Boolean).join(' ') || 'Participant'}
                    {(() => {
                      const activePronouns =
                        contactDraft.pronouns === 'Autre'
                          ? contactDraft.pronounsCustom.trim()
                          : contactDraft.pronouns.trim();
                      return activePronouns ? ` (${activePronouns})` : '';
                    })()}
                  </strong>{' '}
                  • {queuedDevices.length} appareil{queuedDevices.length > 1 ? 's' : ''}
                </p>
              </div>

              <form onSubmit={handleFinalizeVisitorFiche} className="space-y-5" noValidate>
                <ContactForm
                  idPrefix="rp"
                  mode="activity"
                  section="volunteer"
                  value={contactDraft}
                  onChange={(next) => {
                    setContactDraft(next);
                    setContactErrors({});
                  }}
                  errors={contactErrors}
                />

                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setWizardScreen('participant')}
                    className="min-h-14 px-5 py-3 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs sm:text-sm hover:border-primary/50 transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    <span>Retour à l'Étape 3</span>
                  </button>

                  <button
                    type="submit"
                    className="min-h-14 px-8 py-3.5 rounded-2xl bg-primary text-secondary font-display font-black uppercase tracking-wider text-base hover:opacity-95 active:scale-95 transition cursor-pointer flex items-center justify-center gap-2.5 shadow-xl"
                  >
                    <CheckCircle size={20} aria-hidden="true" />
                    <span>
                      {kioskForm
                        ? "M'inscrire"
                        : `Valider et enregistrer ${queuedDevices.length} appareil${queuedDevices.length > 1 ? 's' : ''}`}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // VUE 2 : GESTION TECHNICIENS & FILE D'ATTENTE DES APPAREILS
  // ==========================================================================
  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      !searchQuery.trim() ||
      t.visitorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.objectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.initialDiagnosis && t.initialDiagnosis.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.assignedTechName && t.assignedTechName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const visitorTicketCounts = new Map<string, number>();
  tickets.forEach((t) => {
    const key = t.visitorName.trim().toLowerCase();
    visitorTicketCounts.set(key, (visitorTicketCounts.get(key) || 0) + 1);
  });

  if (workRole === 'reparateur') {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <WorkRoleBar event={event} activeRole={workRole} onSelectRole={handleSelectWorkRole} isTablet={isAndroidApp()} />
        <ReparateurCockpit
          event={event}
          tickets={tickets}
          technicians={technicians}
          onReload={loadData}
          onCelebrate={(payload) => {
            setActiveCelebration(payload);
            playCelebrationSound();
            confetti({ particleCount: 80, spread: 80, origin: { y: 0.6 }, colors: ['#9ecd33', '#480A94', '#ffffff'] });
            setTimeout(() => setActiveCelebration(null), 8000);
          }}
        />
      </div>
    );
  }

  if (workRole === 'assistant') {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <WorkRoleBar event={event} activeRole={workRole} onSelectRole={handleSelectWorkRole} isTablet={isAndroidApp()} />
        <AssistantCockpit tickets={tickets} onReload={loadData} />
      </div>
    );
  }

  if (workRole === 'accueil') {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <WorkRoleBar event={event} activeRole={workRole} onSelectRole={handleSelectWorkRole} isTablet={isAndroidApp()} />
        <AccueilQueueView
          event={event}
          tickets={tickets}
          technicians={technicians}
          onReload={loadData}
          onAddDeviceForVisitor={(t) => {
            const c = t.extraData?.contact;
            if (c) {
              setContactDraft({
                ...emptyContactDraft('activity'),
                firstName: c.firstName || '',
                lastName: c.lastName || '',
                pronouns: c.pronouns || '',
                email: c.email || '',
                phone: c.phone || '',
                consentActivity: Boolean(c.consent?.activity),
                consentNewsletter: Boolean(c.consent?.newsletter)
              });
            }
            setLastRegistrationReceipt(null);
            setWizardScreen('category');
            showToast(`Coordonnées de ${t.visitorName} pré-remplies pour un nouvel appareil.`, 'info');
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WorkRoleBar event={event} activeRole={workRole} onSelectRole={handleSelectWorkRole} isTablet={isAndroidApp()} />
      {workRole === 'admin' && (
        <AdminMapAndGodMode event={event} tickets={tickets} technicians={technicians} onReload={loadData} />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Colonne Gauche (4 cols) : Équipe Techniciens disponibles */}
      <div className="lg:col-span-4 bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-4">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-app-card-border">
          <h3 className="text-base font-bold font-display text-app-text uppercase tracking-wider flex items-center gap-2">
            <Users size={18} className="text-primary" />
            <span>Techniciens ({technicians.length})</span>
          </h3>

          <button
            type="button"
            onClick={() => setIsAddTechModalOpen(true)}
            className="min-h-10 px-3.5 py-1.5 rounded-xl bg-primary text-secondary font-display font-bold uppercase text-xs hover:opacity-90 active:scale-95 transition cursor-pointer flex items-center gap-1.5"
          >
            <Plus size={14} aria-hidden="true" />
            <span>Ajouter</span>
          </button>
        </div>

        {technicians.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-xs text-app-text-muted font-sans">
              Aucun technicien enregistré. Ajoutez des bénévoles pour leur assigner les appareils en attente.
            </p>
            <button
              type="button"
              onClick={() => setIsAddTechModalOpen(true)}
              className="min-h-11 px-4 py-2 rounded-xl bg-primary/15 border border-primary text-primary font-display font-bold uppercase text-xs hover:bg-primary/25 transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus size={14} aria-hidden="true" />
              <span>Ajouter un premier technicien</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {technicians.map((t) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className="p-3.5 rounded-2xl bg-app-input/70 border border-app-card-border flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-app-text text-sm flex items-center gap-1.5 flex-wrap">
                        <span>{t.name}</span>
                        {t.tableNumber && (
                          <span className="text-micro text-primary bg-primary/10 border border-primary/25 px-1.5 py-0.5 rounded font-mono font-bold">
                            Table {t.tableNumber}
                          </span>
                        )}
                      </h4>
                      <button
                        type="button"
                        onClick={() => toggleTechStatus(t.id, t.status)}
                        aria-label={`Changer le statut de ${t.name} (actuellement ${t.status})`}
                        className={`text-micro min-h-7 px-2.5 py-0.5 rounded-full font-bold uppercase transition-colors cursor-pointer ${
                          t.status === 'libre'
                            ? 'bg-primary/20 text-primary border border-primary/30'
                            : t.status === 'occupe'
                              ? 'bg-warning/15 text-warning border border-warning/30'
                              : 'bg-danger/15 text-danger border border-danger/30'
                        }`}
                      >
                        {t.status}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {t.specialties.map((spec) => (
                        <span
                          key={spec}
                          className="text-micro bg-secondary/20 text-app-text border border-secondary/30 px-1.5 py-0.5 rounded uppercase"
                        >
                          {spec.replace('_', ' ')}
                        </span>
                      ))}
                      {t.softwareSpecialties?.map((spec) => (
                        <span
                          key={spec}
                          className="text-micro bg-primary/10 text-primary border border-primary/25 px-1.5 py-0.5 rounded uppercase"
                        >
                          {spec.replace('_', '/')}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-app-card-border">
                    <span className="text-xs text-app-text-muted font-sans">
                      {t.status === 'occupe' ? 'Sur un appareil' : 'Disponible'}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleDeleteTech(t.id)}
                      aria-label={`Retirer le technicien ${t.name}`}
                      className="min-h-9 min-w-9 flex items-center justify-center rounded-lg text-app-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Colonne Centrale/Droite (8 cols) : File d'attente des appareils & Diagnostics */}
      <div className="lg:col-span-8 space-y-6">
        <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-app-card-border">
            <h3 className="text-base font-bold font-display text-app-text uppercase tracking-wider flex items-center gap-2">
              <Wrench size={18} className="text-primary" />
              <span>
                File des Appareils ({filteredTickets.length}
                {filteredTickets.length !== tickets.length ? ` / ${tickets.length}` : ''})
              </span>
            </h3>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-3 text-app-text-muted" aria-hidden="true" />
                <input
                  type="text"
                  aria-label="Rechercher un appareil ou visiteur"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher (appareil, visiteur, panne)..."
                  className="w-full bg-app-input border border-app-input-border rounded-xl pl-8 pr-3 py-2 min-h-10 text-app-text text-xs placeholder:text-app-text-muted/60 focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <label
                htmlFor="csvImport"
                className="min-h-10 px-3 py-2 rounded-xl bg-app-input border border-app-input-border text-app-text font-bold font-display uppercase tracking-wider text-xs hover:border-primary/60 transition-colors cursor-pointer inline-flex items-center gap-1.5 shrink-0"
              >
                <Upload size={13} className="text-primary" aria-hidden="true" />
                <span>Importer CSV</span>
              </label>
              <input
                id="csvImport"
                type="file"
                accept={fileAccept('.csv')}
                onChange={handleImportCSV}
                className="hidden"
              />
            </div>
          </div>

          {/* Puces de filtrage par statut */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {[
              { id: 'all', label: 'Tous' },
              { id: 'en_attente', label: 'En attente' },
              { id: 'assigne', label: 'Assigné' },
              { id: 'en_cours', label: 'En cours' },
              { id: 'repare', label: 'Réparé' },
              { id: 'semi_repare', label: 'Semi-réparé' },
              { id: 'non_reparable', label: 'Non réparable' }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`text-micro min-h-9 px-3 py-1 rounded-full font-bold uppercase transition-colors cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-primary text-secondary font-black shadow-sm'
                    : 'bg-app-input text-app-text-muted border border-app-input-border hover:text-app-text'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredTickets.length === 0 ? (
            <p className="text-xs text-app-text-muted text-center py-8 font-sans">
              {tickets.length === 0
                ? "Aucun appareil inscrit pour cet événement. Utilisez l'onglet Console d'accueil pour inscrire les appareils en 3 étapes."
                : 'Aucun appareil ne correspond à vos critères de recherche.'}
            </p>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {filteredTickets.map((t) => {
                  const freeTechs = technicians.filter((tech) => tech.status === 'libre');
                  const batchIndex = t.extraData?.deviceIndex;
                  const batchTotal = t.extraData?.deviceTotal;
                  const visitorTotal = visitorTicketCounts.get(t.visitorName.trim().toLowerCase()) || 1;
                  const isVolunteerCandidate = Boolean(t.extraData?.contact?.wantsToVolunteer);
                  const visitorPronouns =
                    typeof t.extraData?.contact?.pronouns === 'string'
                      ? t.extraData.contact.pronouns.trim()
                      : '';

                  return (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className="p-4 rounded-2xl bg-app-input/70 border border-app-card-border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold font-display text-app-text text-base uppercase">
                            {t.objectName}
                          </h4>
                          <span
                            className={`text-micro px-2.5 py-0.5 rounded-full font-bold uppercase ${
                              t.status === 'en_attente'
                                ? 'bg-app-text-muted/15 text-app-text-muted border border-app-text-muted/30'
                                : t.status === 'assigne' || t.status === 'en_cours'
                                  ? 'bg-warning/15 text-warning border border-warning/30'
                                  : t.status === 'repare'
                                    ? 'bg-primary/20 text-primary border border-primary/30'
                                    : 'bg-danger/15 text-danger border border-danger/30'
                            }`}
                          >
                            {t.status.replace('_', ' ')}
                          </span>

                          {batchTotal && batchTotal > 1 ? (
                            <span className="text-micro bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-mono font-bold uppercase">
                              Appareil {batchIndex}/{batchTotal}
                            </span>
                          ) : visitorTotal > 1 ? (
                            <span className="text-micro bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-mono font-bold uppercase">
                              Multi-appareils ({visitorTotal})
                            </span>
                          ) : null}

                          {isVolunteerCandidate && (
                            <span className="text-micro bg-primary/20 text-primary border border-primary/40 px-2 py-0.5 rounded-full font-bold uppercase inline-flex items-center gap-1">
                              <HandHeart size={11} aria-hidden="true" />
                              <span>Futur bénévole</span>
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-app-text font-medium font-sans">
                          Participant : <strong className="text-app-text">{t.visitorName}</strong>
                          {visitorPronouns ? (
                            <span className="text-app-text-muted"> ({visitorPronouns})</span>
                          ) : null}
                          {t.assignedTechName ? (
                            <span className="text-primary font-bold"> • Assigné à {t.assignedTechName}</span>
                          ) : null}
                        </p>

                        <div className="text-xs text-app-text-muted font-sans bg-app-card p-3 rounded-xl mt-2 space-y-2 border border-app-card-border">
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-micro bg-secondary/20 text-app-text border border-secondary/30 px-2 py-0.5 rounded font-mono font-bold uppercase">
                              Catégorie: {t.objectCategory.replace('_', ' ')}
                            </span>
                            <span className="text-micro bg-primary/10 text-primary border border-primary/25 px-2 py-0.5 rounded font-mono font-bold uppercase">
                              OS: {t.operatingSystem}
                            </span>
                            <span className="text-micro bg-app-input text-app-text-muted border border-app-card-border px-2 py-0.5 rounded font-mono font-bold">
                              {t.weightKg} kg
                            </span>
                          </div>
                          {t.initialDiagnosis && (
                            <p className="italic text-app-text border-t border-app-card-border pt-1.5 mt-1.5">
                              « {t.initialDiagnosis} »
                            </p>
                          )}
                        </div>
                        {t.resultRemarks && (
                          <p className="text-xs text-primary font-sans bg-primary/10 border border-primary/20 p-2 rounded-lg mt-1">
                            <strong>Note de résolution:</strong> {t.resultRemarks}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {t.status === 'en_attente' && freeTechs.length > 0 && (
                          <select
                            aria-label={`Assigner un technicien pour ${t.objectName}`}
                            onChange={(e) => handleAssignTicket(t.id, e.target.value)}
                            defaultValue=""
                            className="bg-app-input border border-app-input-border rounded-xl px-3 py-2 min-h-10 text-app-text text-xs focus:outline-none focus:border-primary transition-colors"
                          >
                            <option value="" disabled>
                              Assigner à...
                            </option>
                            {freeTechs.map((tech) => (
                              <option key={tech.id} value={tech.id}>
                                {tech.name}
                                {tech.tableNumber ? ` (Table ${tech.tableNumber})` : ''}
                              </option>
                            ))}
                          </select>
                        )}

                        {(t.status === 'assigne' || t.status === 'en_cours') && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setResolutionRemarks('');
                                setPendingResolution({
                                  ticketId: t.id,
                                  status: 'repare',
                                  visitorName: t.visitorName,
                                  objectName: t.objectName
                                });
                              }}
                              className="min-h-10 px-3.5 py-1.5 rounded-xl bg-primary text-secondary text-micro font-bold font-display uppercase hover:opacity-90 active:scale-95 transition-opacity cursor-pointer"
                            >
                              Réparé
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResolutionRemarks('');
                                setPendingResolution({
                                  ticketId: t.id,
                                  status: 'semi_repare',
                                  visitorName: t.visitorName,
                                  objectName: t.objectName
                                });
                              }}
                              className="min-h-10 px-3.5 py-1.5 rounded-xl bg-success/15 text-success border border-success/30 text-micro font-bold font-display uppercase hover:bg-success/25 active:scale-95 transition-colors cursor-pointer"
                            >
                              Partiel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResolutionRemarks('');
                                setPendingResolution({
                                  ticketId: t.id,
                                  status: 'non_reparable',
                                  visitorName: t.visitorName,
                                  objectName: t.objectName
                                });
                              }}
                              className="min-h-10 px-3.5 py-1.5 rounded-xl bg-danger/15 text-danger border border-danger/30 text-micro font-bold font-display uppercase hover:bg-danger/25 active:scale-95 transition-colors cursor-pointer"
                            >
                              Échec
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteTicket(t.id)}
                          aria-label={`Supprimer le diagnostic de ${t.visitorName}`}
                          className="min-h-10 min-w-10 flex items-center justify-center rounded-xl text-app-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Modale d'ajout d'un technicien */}
      <Modal
        isOpen={isAddTechModalOpen}
        onClose={() => setIsAddTechModalOpen(false)}
        title="Ajouter un Technicien Bénévole"
        icon={Users}
      >
        <form onSubmit={handleAddTech} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="tech-name"
              className="text-micro font-bold uppercase tracking-wider text-app-text-muted block"
            >
              Nom complet
            </label>
            <input
              id="tech-name"
              type="text"
              required
              value={newTechName}
              onChange={(e) => setNewTechName(e.target.value)}
              placeholder="Ex. Gabriel Roy"
              className="w-full bg-app-input border border-app-input-border rounded-xl px-3 py-2.5 min-h-11 text-app-text text-xs placeholder:text-app-text-muted/60 focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="tech-table"
              className="text-micro font-bold uppercase tracking-wider text-app-text-muted block"
            >
              Numéro de table physique
            </label>
            <select
              id="tech-table"
              value={newTechTable}
              onChange={(e) => setNewTechTable(e.target.value)}
              className="w-full bg-app-input border border-app-input-border rounded-xl px-3 py-2.5 min-h-11 text-app-text text-xs focus:outline-none focus:border-primary transition-colors cursor-pointer"
            >
              <option value="">Aucune table (Mobile)</option>
              <option value="1">Table 1</option>
              <option value="2">Table 2</option>
              <option value="3">Table 3</option>
              <option value="4">Table 4</option>
              <option value="5">Table 5</option>
              <option value="6">Table 6</option>
              <option value="7">Table 7</option>
              <option value="8">Table 8</option>
              <option value="9">Table 9</option>
              <option value="10">Table 10</option>
            </select>
          </div>

          <div className="space-y-1">
            <span className="text-micro font-bold uppercase tracking-wider text-app-text-muted block">
              Spécialités Matérielles (sélectionnez)
            </span>
            <div role="group" aria-label="Spécialités Matérielles" className="flex flex-wrap gap-1.5 mt-1.5">
              {['laptop', 'pc_tour', 'cellulaire', 'tablette', 'autre'].map((spec) => {
                const isChecked = newTechSpecs.includes(spec);
                return (
                  <button
                    key={spec}
                    type="button"
                    aria-pressed={isChecked}
                    onClick={() => {
                      if (isChecked) {
                        setNewTechSpecs(newTechSpecs.filter((s) => s !== spec));
                      } else {
                        setNewTechSpecs([...newTechSpecs, spec]);
                      }
                    }}
                    className={`min-h-9 px-3 py-1.5 rounded-lg text-micro font-bold uppercase border transition-colors cursor-pointer ${
                      isChecked
                        ? 'bg-primary text-secondary border-primary'
                        : 'bg-app-input text-app-text-muted border-app-input-border hover:border-primary/50 hover:text-app-text'
                    }`}
                  >
                    {spec.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-micro font-bold uppercase tracking-wider text-app-text-muted block">
              Spécialités Logicielles / OS (sélectionnez)
            </span>
            <div role="group" aria-label="Spécialités Logicielles" className="flex flex-wrap gap-1.5 mt-1.5">
              {['windows', 'mac', 'linux', 'android_ios'].map((spec) => {
                const isChecked = newTechSoftwareSpecs.includes(spec);
                return (
                  <button
                    key={spec}
                    type="button"
                    aria-pressed={isChecked}
                    onClick={() => {
                      if (isChecked) {
                        setNewTechSoftwareSpecs(newTechSoftwareSpecs.filter((s) => s !== spec));
                      } else {
                        setNewTechSoftwareSpecs([...newTechSoftwareSpecs, spec]);
                      }
                    }}
                    className={`min-h-9 px-3 py-1.5 rounded-lg text-micro font-bold uppercase border transition-colors cursor-pointer ${
                      isChecked
                        ? 'bg-primary text-secondary border-primary'
                        : 'bg-app-input text-app-text-muted border-app-input-border hover:border-primary/50 hover:text-app-text'
                    }`}
                  >
                    {spec.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-app-card-border">
            <Button variant="secondary" type="button" onClick={() => setIsAddTechModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" type="submit">
              <Plus size={14} />
              <span>Ajouter le technicien</span>
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale de résolution de réparation */}
      <Modal
        isOpen={Boolean(pendingResolution)}
        onClose={() => setPendingResolution(null)}
        title={
          pendingResolution?.status === 'repare'
            ? 'Confirmer la réparation'
            : pendingResolution?.status === 'semi_repare'
              ? 'Réparation partielle'
              : 'Signaler un échec de réparation'
        }
        icon={pendingResolution?.status === 'non_reparable' ? AlertTriangle : CheckCircle}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingResolution(null)}>
              Annuler
            </Button>
            <Button
              variant={pendingResolution?.status === 'non_reparable' ? 'danger' : 'primary'}
              onClick={() => {
                if (!pendingResolution) return;
                handleUpdateStatus(pendingResolution.ticketId, pendingResolution.status, resolutionRemarks);
                setPendingResolution(null);
              }}
            >
              Enregistrer la résolution
            </Button>
          </>
        }
      >
        {pendingResolution && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-app-input border border-app-card-border">
              <p className="text-xs font-bold text-app-text">{pendingResolution.objectName}</p>
              <p className="text-micro text-app-text-muted mt-0.5">Visiteur : {pendingResolution.visitorName}</p>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="resolution-remarks-input"
                className="text-micro font-bold uppercase tracking-wider text-app-text-muted block"
              >
                {pendingResolution.status === 'non_reparable'
                  ? 'Pourquoi cet appareil est-il non-réparable ?'
                  : pendingResolution.status === 'semi_repare'
                    ? 'Remarques de réparation partielle (optionnel)'
                    : 'Remarques de réparation (optionnel)'}
              </label>
              <textarea
                id="resolution-remarks-input"
                value={resolutionRemarks}
                onChange={(e) => setResolutionRemarks(e.target.value)}
                placeholder="Ex. Nettoyage complet effectué, batterie remplacée..."
                rows={3}
                className="w-full bg-app-input border border-app-input-border rounded-xl px-3 py-2 text-app-text text-xs placeholder:text-app-text-muted/60 focus:outline-none focus:border-primary transition-colors resize-none"
              />
            </div>
          </div>
        )}
      </Modal>
      </div>
    </div>
  );
}
