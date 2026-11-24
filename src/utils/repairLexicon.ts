import type { FollowUpType } from '../types';

export interface LexiconEntry {
  problemId: string;
  domain: 'materiel' | 'logiciel';
  plainExplanation: string;
  safetyWarning: string;
  diagnosticSteps: string[];
  repairSteps: string[];
  recommendedActions: string[];
  whenToReferShopOrPart: string;
}

export const REPLACEMENT_PARTS_OPTIONS = [
  'Batterie de remplacement',
  "Bloc d'alimentation / Chargeur",
  'Disque SSD / NVMe',
  'Barrette mémoire RAM',
  "Dalle d'écran / Câble vidéo",
  'Clavier / Pavé tactile',
  'Pâte thermique / Ventilateur',
  'Autre pièce spécifique'
] as const;

export const REPAIR_ACTIONS_CATALOG = [
  'Nettoyage poussière interne',
  'Remplacement pâte thermique',
  'Ajout / remplacement SSD ou RAM',
  'Réinitialisation batterie / CMOS',
  'Installation Linux',
  'Nettoyage logiciels / mises à jour',
  'Sauvegarde / transfert de données',
  'Test chargeur / connectique',
  'Diagnostic partagé avec le visiteur'
] as const;

export const FOLLOW_UP_LABELS: Record<FollowUpType, string> = {
  aucune: 'Aucune suite requise',
  piece_rechange: 'Pièce de rechange à commander',
  boutique_insertech: 'Passage en boutique / atelier Insertech',
  recyclage: 'Recyclage écologique responsable'
};

export const REPAIR_LEXICON: Record<string, LexiconEntry> = {
  'Alimentation / Batterie': {
    problemId: 'Alimentation / Batterie',
    domain: 'materiel',
    plainExplanation: "Le courant n'arrive pas correctement à la carte mère ou la batterie ne retient plus sa charge.",
    safetyWarning: 'Toujours débrancher le chargeur et la batterie interne avant de toucher la carte mère.',
    diagnosticSteps: [
      'Tester la prise murale et le bloc chargeur au multimètre',
      'Retirer le chargeur + batterie, maintenir Power 15 s puis rebrancher',
      'Inspecter le port de charge (jeu mécanique ou broche pliée)'
    ],
    repairSteps: [
      'Désoxyder ou resserrer la nappe batterie',
      'Vérifier la tension de la pile CMOS si aucun voyant ne réagit',
      'Tester le démarrage sans batterie (secteur seul si possible)'
    ],
    recommendedActions: ['Test chargeur / connectique', 'Réinitialisation batterie / CMOS'],
    whenToReferShopOrPart: 'Batterie gonflée (< 40 % santé) ou connecteur soudé cassé : commander la pièce ou orienter vers l’atelier Insertech.'
  },
  'Écran / Clavier / Boîtier': {
    problemId: 'Écran / Clavier / Boîtier',
    domain: 'materiel',
    plainExplanation: "Une pièce mécanique ou un câble reliant l'écran ou le clavier a cédé à l'usage.",
    safetyWarning: 'Couper la batterie avant de débrancher une nappe vidéo (eDP/LVDS) pour éviter de griller le rétroéclairage.',
    diagnosticSteps: [
      'Brancher un écran ou clavier USB externe pour isoler la panne',
      'Vérifier sous une lampe si l’image s’affiche faiblement sans rétroéclairage',
      'Contrôler la tension des vis de charnière'
    ],
    repairSteps: [
      'Réinsérer délicatement la nappe clavier ou vidéo',
      'Consolidation mécanique des charnières desserrées',
      'Nettoyage des touches collées ou retrait de débris'
    ],
    recommendedActions: ['Diagnostic partagé avec le visiteur'],
    whenToReferShopOrPart: 'Dalle LCD fissurée ou nappe déchirée : proposer la pièce de rechange exacte ou un appareil reconditionné en boutique.'
  },
  'Surchauffe / Nettoyage': {
    problemId: 'Surchauffe / Nettoyage',
    domain: 'materiel',
    plainExplanation: 'La poussière accumulée empêche la chaleur de sortir et ralentit le processeur par sécurité.',
    safetyWarning: 'Bloquer les pales du ventilateur avec le doigt avant de souffler pour éviter une surtension sur la carte.',
    diagnosticSteps: [
      'Écouter le ventilateur et vérifier les grilles de sortie d’air',
      'Observer les températures CPU en charge légère',
      'Contrôler si la pâte thermique est sèche ou craquelée'
    ],
    repairSteps: [
      'Dépoussiérer radiateur et ventilateur avec pinceau et air sec',
      'Nettoyer l’ancienne pâte à l’alcool isopropylique (> 90 %)',
      'Appliquer un petit pois de pâte thermique neuve et revisser en croix'
    ],
    recommendedActions: ['Nettoyage poussière interne', 'Remplacement pâte thermique'],
    whenToReferShopOrPart: 'Ventilateur grippé ou roulement bruyant : recommander le remplacement du ventilateur.'
  },
  'Composantes / Ports': {
    problemId: 'Composantes / Ports',
    domain: 'materiel',
    plainExplanation: 'Un composant amovible (disque, mémoire vive) ou un port externe limite ou bloque l’appareil.',
    safetyWarning: 'Toucher une partie métallique du châssis (ESD) avant de manipuler la RAM ou le SSD.',
    diagnosticSteps: [
      'Tester le port avec un périphérique sain',
      'Réinsérer les barrettes RAM ou tester une par une',
      'Lire l’état SMART du disque dur / SSD'
    ],
    repairSteps: [
      'Nettoyer contacts dorés (RAM) et ports USB (sans objet métallique sous tension)',
      'Installer ou fixer le nouveau SSD / RAM avec le visiteur',
      'Vérifier la détection dans le BIOS / UEFI'
    ],
    recommendedActions: ['Ajout / remplacement SSD ou RAM', 'Test chargeur / connectique'],
    whenToReferShopOrPart: 'Disque HDD mécanique vieillissant ou 4 Go de RAM insuffisants : proposer un SSD ou barrette RAM.'
  },
  'Lent / Virus / Nettoyage': {
    problemId: 'Lent / Virus / Nettoyage',
    domain: 'logiciel',
    plainExplanation: "Trop de programmes au démarrage, un disque saturé ou des logiciels indésirables freinent l'appareil.",
    safetyWarning: 'Ne jamais supprimer de fichiers personnels sans confirmation écrite ou sauvegarde préalable du visiteur.',
    diagnosticSteps: [
      'Vérifier l’espace libre sur le disque principal (> 15 % idéal)',
      'Inspecter le Gestionnaire des tâches (CPU / Disque à 100 %)',
      'Repérer antivirus redondants et logiciels publicitaires'
    ],
    repairSteps: [
      'Désactiver les applications inutiles au démarrage',
      'Désinstaller les logiciels indésirables avec le visiteur',
      'Lancer une analyse antivirus intégrée (Windows Defender / ClamAV)'
    ],
    recommendedActions: ['Nettoyage logiciels / mises à jour', 'Diagnostic partagé avec le visiteur'],
    whenToReferShopOrPart: 'Si le PC reste lent sur disque dur mécanique : suggérer un passage à Linux ou l’ajout d’un SSD.'
  },
  'Installer Linux': {
    problemId: 'Installer Linux',
    domain: 'logiciel',
    plainExplanation: 'Linux offre un système rapide, sécurisé et libre qui redonne vie aux ordinateurs anciens.',
    safetyWarning: "OBLIGATOIRE : vérifier avec le visiteur que ses photos et documents sont sauvegardés avant d'effacer le disque.",
    diagnosticSteps: [
      'Identifier les logiciels indispensables (bureautique, navigateur, imprimante)',
      'Tester en session Live USB (Wi-Fi, son, pavé tactile)',
      'Choisir la distribution adaptée (Linux Mint, Ubuntu, Zorin OS)'
    ],
    repairSteps: [
      'Sauvegarder les dossiers importants sur clé/disque du visiteur',
      'Lancer l’installateur et vérifier le partitionnement',
      'Montrer au visiteur le navigateur, LibreOffice et les mises à jour'
    ],
    recommendedActions: ['Sauvegarde / transfert de données', 'Installation Linux'],
    whenToReferShopOrPart: 'Invitation à revenir à l’Install Fest ou en boutique Insertech si un besoin spécifique survient.'
  },
  'Démarrage / Réinstallation': {
    problemId: 'Démarrage / Réinstallation',
    domain: 'logiciel',
    plainExplanation: 'Le système d’exploitation est corrompu ou une mise à jour interrompue empêche le démarrage normal.',
    safetyWarning: 'Vérifier l’état physique du disque avant toute réinstallation pour éviter de perdre des données.',
    diagnosticSteps: [
      'Noter le code d’erreur affiché au démarrage ou écran bleu',
      'Vérifier l’ordre de démarrage et l’état SMART dans le BIOS',
      'Tester le démarrage en mode sans échec ou Live USB'
    ],
    repairSteps: [
      'Récupérer les fichiers critiques avant réparation système',
      'Réparer le chargeur de démarrage / SFC ou réinstaller proprement',
      'Appliquer les pilotes essentiels (Wi-Fi, vidéo)'
    ],
    recommendedActions: ['Sauvegarde / transfert de données', 'Nettoyage logiciels / mises à jour'],
    whenToReferShopOrPart: 'Disque en fin de vie : proposer remplacement par SSD en atelier Insertech.'
  },
  'Internet / Compte / Données': {
    problemId: 'Internet / Compte / Données',
    domain: 'logiciel',
    plainExplanation: 'Le problème vient de la connexion sans fil, d’un pilote réseau ou de la gestion d’un compte.',
    safetyWarning: 'Ne jamais noter ou conserver les mots de passe du visiteur après l’événement.',
    diagnosticSteps: [
      'Vérifier le bouton ou raccourci avion physique du PC',
      'Tester un autre réseau Wi-Fi ou partage de connexion',
      'Vérifier le pilote réseau dans le gestionnaire de périphériques'
    ],
    repairSteps: [
      'Oublier et reconnecter le réseau / réinitialiser la pile réseau',
      'Accompagner le visiteur pour réinitialiser son mot de passe sur son propre appareil',
      'Configurer une sauvegarde claire (clé USB ou dossier local)'
    ],
    recommendedActions: ['Nettoyage logiciels / mises à jour', 'Sauvegarde / transfert de données'],
    whenToReferShopOrPart: 'Carte Wi-Fi interne défaillante : adaptateur USB Wi-Fi disponible en boutique.'
  }
};

export const FALLBACK_LEXICON_ENTRY: LexiconEntry = {
  problemId: 'Diagnostic général',
  domain: 'materiel',
  plainExplanation: 'Vérification méthodique étape par étape avec le participant pour cerner l’origine de la panne.',
  safetyWarning: 'Débrancher l’appareil avant toute ouverture mécanique.',
  diagnosticSteps: [
    'Reproduire le problème devant le visiteur',
    'Isoler si la cause est matérielle (test externe) ou logicielle (session USB)',
    'Expliquer les options possibles avant d’intervenir'
  ],
  repairSteps: [
    'Effectuer les vérifications simples en premier (câbles, chargeur, espace disque)',
    'Impliquer le visiteur à chaque étape',
    'Valider le résultat final avant le départ'
  ],
  recommendedActions: ['Diagnostic partagé avec le visiteur'],
  whenToReferShopOrPart: 'Selon le constat, proposer une pièce de rechange ou un passage en boutique Insertech.'
};

export function getLexiconEntriesForSymptoms(symptoms: string[]): LexiconEntry[] {
  const entries = symptoms
    .map((s) => REPAIR_LEXICON[s])
    .filter((entry): entry is LexiconEntry => Boolean(entry));
  return entries.length > 0 ? entries : [FALLBACK_LEXICON_ENTRY];
}
