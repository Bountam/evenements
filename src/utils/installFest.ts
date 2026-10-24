import { EventSettings, RepairTicket, OperatingSystem, TicketStatus } from '../types';

// Install Fest Linux : les fiches réutilisent la table « tickets » du réparothon.
// Champs propres à l'Install Fest rangés dans ticket.extraData :
// distro, previousOS, dualBoot, dataBackup, consentContact, consentAt.

export const DEFAULT_DISTROS = ['Linux Mint', 'Ubuntu', 'Kubuntu', 'Zorin OS', 'Fedora', 'Debian', 'elementary OS'];

export const PREVIOUS_OS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'windows_7', label: 'Windows 7' },
  { id: 'windows_8', label: 'Windows 8' },
  { id: 'windows_10', label: 'Windows 10' },
  { id: 'windows_11', label: 'Windows 11' },
  { id: 'macos', label: 'macOS' },
  { id: 'chromebook', label: 'Chromebook' },
  { id: 'linux', label: 'Autre Linux' },
  { id: 'aucun', label: 'Aucun / disque vide' }
];

export const DEVICE_OPTIONS: Array<{ id: RepairTicket['objectCategory']; label: string }> = [
  { id: 'laptop', label: 'Portable' },
  { id: 'pc_tour', label: 'Tour' },
  { id: 'autre', label: 'Autre' }
];

// Quatre étapes seulement : en attente → en installation → terminé ou échec
export const INSTALL_STATUS_LABELS: Partial<Record<TicketStatus, string>> = {
  en_attente: 'En attente',
  assigne: 'En installation',
  en_cours: 'En installation',
  repare: 'Terminé',
  semi_repare: 'Terminé',
  non_reparable: 'Échec',
  abandonne: 'Échec'
};

export const MAX_COMPUTERS_PER_VOLUNTEER = 2;

export const getEventDistros = (event: EventSettings): string[] => {
  const list = event.extraData?.installDistros;
  return Array.isArray(list) && list.length > 0 ? list : DEFAULT_DISTROS;
};

export const previousOSLabel = (id: string | undefined): string =>
  PREVIOUS_OS_OPTIONS.find(o => o.id === id)?.label || id || '';

export const deviceLabel = (id: string): string => DEVICE_OPTIONS.find(o => o.id === id)?.label || id;

export const toOperatingSystem = (previousOS: string): OperatingSystem => {
  if (previousOS.startsWith('windows')) return 'windows';
  if (previousOS === 'macos') return 'mac';
  if (previousOS === 'linux') return 'linux';
  if (previousOS === 'aucun') return 'aucun';
  return 'autre';
};

export const isInstallActive = (t: RepairTicket) => t.status === 'assigne' || t.status === 'en_cours';
export const isInstallDone = (t: RepairTicket) => t.status === 'repare' || t.status === 'semi_repare';
export const isInstallFailed = (t: RepairTicket) => t.status === 'non_reparable' || t.status === 'abandonne';

export const INSTALL_FEST_EXPORT_HEADER = [
  'Nom', 'Courriel', 'Consentement', 'Appareil', 'Marque et modèle', 'OS précédent', 'Distribution',
  'Double démarrage', 'Données sauvegardées', 'Bénévole', 'Statut', 'Notes', 'Remarques'
];

export const installFestExportRows = (tickets: RepairTicket[]): string[][] =>
  [...tickets]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(t => [
      t.visitorName,
      t.visitorEmail || '',
      t.extraData?.consentContact ? 'Oui' : '',
      deviceLabel(t.objectCategory),
      t.objectName,
      previousOSLabel(t.extraData?.previousOS),
      t.extraData?.distro || '',
      t.extraData?.dualBoot ? 'Oui' : 'Non',
      t.extraData?.dataBackup ? 'Oui' : 'Non',
      t.assignedTechName || t.extraData?.installedBy || '',
      INSTALL_STATUS_LABELS[t.status] || t.status,
      t.initialDiagnosis || '',
      t.resultRemarks || ''
    ]);
