import type { DeviceCategory, FollowUpType, OperatingSystem, RepairTicket } from '../types';

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

// ============================================================================
// Moteur de règles de diagnostic local 100 % hors-ligne + requêtes iFixit
// ============================================================================

export interface DiagnosticQuestion {
  id: string;
  label: string;
  tip: string;
}

export interface DiagnosticQuickCheck {
  id: string;
  label: string;
  category: 'materiel' | 'logiciel' | 'securite';
}

export interface DiagnosticChecklistRule {
  id: string;
  title: string;
  categories?: DeviceCategory[];
  operatingSystems?: OperatingSystem[];
  keywords: string[];
  questions: DiagnosticQuestion[];
  quickChecks: DiagnosticQuickCheck[];
  suggestedKeywordsFr: string[];
  suggestedKeywordsEn: string[];
}

export interface DiagnosticSuggestionsResult {
  matchedRuleIds: string[];
  questions: DiagnosticQuestion[];
  quickChecks: DiagnosticQuickCheck[];
  suggestedKeywords: {
    fr: string[];
    en: string[];
  };
}

/** Normalise un texte pour la correspondance sans accents et insensible à la casse. */
export function normalizeDiagnosticText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const DIAGNOSTIC_CHECKLIST_RULES: DiagnosticChecklistRule[] = [
  {
    id: 'power_no_boot',
    title: 'Alimentation & démarrage',
    keywords: [
      'demarre',
      'demarrage',
      'allume',
      'no boot',
      'boot',
      'alimentation',
      'secteur',
      'chargeur',
      'ne repond',
      'eteint',
      'bios',
      'uefi',
      'bleu'
    ],
    questions: [
      {
        id: 'q_power_ac_only',
        label: "L'appareil réagit-il sur secteur sans batterie ?",
        tip: 'Permet de distinguer une batterie en court-circuit d’un problème de carte mère ou de chargeur.'
      },
      {
        id: 'q_power_leds',
        label: 'Un voyant de charge, un ventilateur ou un bip s’active-t-il au bouton Power ?',
        tip: 'Une LED clignotante ou une séquence de bips indique souvent un code d’erreur RAM/alimentation.'
      },
      {
        id: 'q_power_incident',
        label: 'Y a-t-il eu une coupure de courant, une chute ou un liquide renversé récemment ?',
        tip: 'En cas de liquide, ne pas rallumer et inspecter d’abord toute trace d’oxydation interne.'
      }
    ],
    quickChecks: [
      {
        id: 'chk_power_outlet_charger',
        label: 'Tester la prise murale et mesurer/tester le chargeur avec un bloc sain',
        category: 'materiel'
      },
      {
        id: 'chk_power_drain_15s',
        label: 'Débrancher secteur + batterie, maintenir Power 15 secondes puis rebrancher le secteur seul',
        category: 'securite'
      },
      {
        id: 'chk_power_ram_cmos',
        label: 'Contrôler la pile CMOS et réinsérer les barrettes RAM (si accessibles)',
        category: 'materiel'
      }
    ],
    suggestedKeywordsFr: ['alimentation', 'demarrage'],
    suggestedKeywordsEn: ['power', 'dc jack']
  },
  {
    id: 'battery_charge',
    title: 'Batterie & circuit de charge',
    keywords: [
      'batterie',
      'battery',
      'charge',
      'autonomie',
      'decharge',
      'usb-c',
      'connecteur',
      'port de charge',
      'gonfle'
    ],
    questions: [
      {
        id: 'q_batt_original_charger',
        label: 'Le participant utilise-t-il le chargeur d’origine (puissance en Watts suffisante) ?',
        tip: 'Un chargeur USB-C de téléphone (15-20 W) ne suffit pas pour charger la plupart des portables (45-65 W).'
      },
      {
        id: 'q_batt_swollen',
        label: 'Le boîtier ou le pavé tactile semble-t-il soulevé par une batterie gonflée ?',
        tip: 'Une batterie gonflée présente un risque de sécurité : manipuler sans percer ni plier.'
      },
      {
        id: 'q_batt_loose_port',
        label: 'Faut-il bouger le câble pour que le voyant de charge s’allume ?',
        tip: 'Signale un port de charge encrassé, desserré ou une broche endommagée.'
      }
    ],
    quickChecks: [
      {
        id: 'chk_batt_safety_disconnect',
        label: 'Débrancher le chargeur et inspecter visuellement si la batterie est gonflée',
        category: 'securite'
      },
      {
        id: 'chk_batt_port_clean',
        label: 'Inspecter et nettoyer délicatement le port de charge (sans objet métallique)',
        category: 'materiel'
      },
      {
        id: 'chk_batt_cable_health',
        label: 'Tester avec un autre câble/chargeur et vérifier l’usure batterie dans l’OS ou le BIOS',
        category: 'materiel'
      }
    ],
    suggestedKeywordsFr: ['batterie'],
    suggestedKeywordsEn: ['battery']
  },
  {
    id: 'screen_display',
    title: 'Écran, affichage & charnière',
    keywords: [
      'ecran',
      'affichage',
      'noir',
      'fissure',
      'casse',
      'tactile',
      'retroeclairage',
      'charniere',
      'scintille',
      'screen',
      'display',
      'lcd'
    ],
    questions: [
      {
        id: 'q_screen_external',
        label: 'Un écran externe (HDMI / USB-C) affiche-t-il une image ?',
        tip: 'Si l’image est nette sur écran externe, le processeur graphique fonctionne et la panne vise la dalle ou sa nappe.'
      },
      {
        id: 'q_screen_flashlight',
        label: 'Voit-on faiblement le bureau en éclairant l’écran avec une lampe de poche ?',
        tip: 'Indique une panne du rétroéclairage ou du fusible backlight (pas nécessairement la dalle entière).'
      },
      {
        id: 'q_screen_hinge_drop',
        label: 'La perte d’affichage varie-t-elle selon l’angle d’ouverture ou suite à une chute ?',
        tip: 'Un changement selon l’angle pointe vers un câble vidéo (eDP/LVDS) pincé dans la charnière.'
      }
    ],
    quickChecks: [
      {
        id: 'chk_screen_battery_off',
        label: 'Toujours couper la batterie avant de manipuler la nappe vidéo (risque de griller le rétroéclairage)',
        category: 'securite'
      },
      {
        id: 'chk_screen_external_test',
        label: 'Brancher un moniteur externe pour isoler carte graphique vs dalle/câble interne',
        category: 'materiel'
      },
      {
        id: 'chk_screen_touch_flex',
        label: 'Vérifier la nappe eDP/LVDS, la visserie des charnières et la réponse tactile',
        category: 'materiel'
      }
    ],
    suggestedKeywordsFr: ['ecran'],
    suggestedKeywordsEn: ['screen', 'display']
  },
  {
    id: 'slow_os_disk',
    title: 'Lenteur, système d’exploitation & stockage',
    keywords: [
      'lent',
      'lenteur',
      'rame',
      'fige',
      'bloque',
      'virus',
      'malware',
      'disque',
      'ssd',
      'hdd',
      'linux',
      'windows',
      'macos',
      'mac',
      'mise a jour',
      'reinstallation',
      'demarrage'
    ],
    questions: [
      {
        id: 'q_os_backup',
        label: 'Les photos et documents importants du participant sont-ils déjà sauvegardés ?',
        tip: 'Indispensable avant toute réinstallation, installation Linux ou test destructif.'
      },
      {
        id: 'q_os_when_started',
        label: 'La lenteur est-elle apparue progressivement ou juste après une mise à jour ?',
        tip: 'Une chute soudaine après mise à jour oriente vers le pilote, Windows Update ou un disque saturé.'
      },
      {
        id: 'q_os_clicking_noise',
        label: 'L’appareil émet-il de petits cliquetis ou reste-t-il bloqué à 100 % disque ?',
        tip: 'Un cliquetis ou un disque à 100 % constant indique un disque dur mécanique vieillissant à cloner d’urgence.'
      }
    ],
    quickChecks: [
      {
        id: 'chk_os_backup_first',
        label: 'Confirmer avec le participant qu’aucune donnée critique n’est à risque avant modification',
        category: 'securite'
      },
      {
        id: 'chk_os_space_smart',
        label: 'Vérifier l’espace disque libre (> 15 %) et l’état SMART du SSD/HDD',
        category: 'logiciel'
      },
      {
        id: 'chk_os_startup_safe',
        label: 'Contrôler le Gestionnaire des tâches / programmes au démarrage (ou tester en Live USB)',
        category: 'logiciel'
      }
    ],
    suggestedKeywordsFr: ['disque', 'ssd', 'ram'],
    suggestedKeywordsEn: ['hard drive', 'ssd', 'ram']
  },
  {
    id: 'overheat_fan',
    title: 'Surchauffe, bruit & ventilation',
    keywords: [
      'chauffe',
      'surchauffe',
      'brulant',
      'ventilateur',
      'bruit',
      'souffle',
      'poussiere',
      'pate thermique',
      'nettoyage',
      'thermique',
      'eteint tout seul'
    ],
    questions: [
      {
        id: 'q_fan_shutdown',
        label: 'L’appareil s’éteint-il brusquement après quelques minutes d’usage intensif ?',
        tip: 'C’est la protection thermique du processeur lorsque l’air ne circule plus ou que la pâte est sèche.'
      },
      {
        id: 'q_fan_surface',
        label: 'Est-il souvent posé sur un lit, un coussin ou en présence d’animaux ?',
        tip: 'Explique une obstruction dense de peluches sur les ailettes du radiateur.'
      },
      {
        id: 'q_fan_rattling',
        label: 'Le bruit est-il un souffle fort continu ou un frottement/grincement ?',
        tip: 'Un grincement annonce un roulement de ventilateur grippé à nettoyer ou remplacer.'
      }
    ],
    quickChecks: [
      {
        id: 'chk_fan_hold_blades',
        label: 'Bloquer les pales du ventilateur avec le doigt avant d’utiliser l’air sec (évite la surtension)',
        category: 'securite'
      },
      {
        id: 'chk_fan_dust_vents',
        label: 'Dépoussiérer les grilles d’aération, ailettes du radiateur et pales au pinceau + air sec',
        category: 'materiel'
      },
      {
        id: 'chk_fan_thermal_paste',
        label: 'Vérifier la température CPU et l’état de la pâte thermique si le radiateur est démonté',
        category: 'materiel'
      }
    ],
    suggestedKeywordsFr: ['ventilateur', 'pate thermique'],
    suggestedKeywordsEn: ['fan', 'thermal paste']
  },
  {
    id: 'keyboard_ports',
    title: 'Clavier, pavé tactile & ports USB',
    keywords: [
      'clavier',
      'touche',
      'pave tactile',
      'trackpad',
      'souris',
      'port',
      'usb',
      'hdmi',
      'audio',
      'prise',
      'liquide'
    ],
    questions: [
      {
        id: 'q_kb_liquid',
        label: 'Du liquide (eau, café, jus) a-t-il touché le clavier ou les ports ?',
        tip: 'Le sucre ou l’oxydation nécessitent un nettoyage minutieux à l’alcool isopropylique (> 90 %).'
      },
      {
        id: 'q_kb_external_usb',
        label: 'Un clavier ou une souris USB externe fonctionne-t-il normalement ?',
        tip: 'Confirme que le système fonctionne et isole la panne sur le module clavier/pavé interne.'
      },
      {
        id: 'q_kb_which_keys',
        label: 'Est-ce une seule touche bloquée ou toute une rangée/le clavier entier ?',
        tip: 'Une rangée entière inopérante provient souvent d’une nappe partiellement déconnectée ou oxydée.'
      }
    ],
    quickChecks: [
      {
        id: 'chk_kb_external_test',
        label: 'Tester avec un clavier/souris USB externe et vérifier les ports sur d’autres périphériques',
        category: 'materiel'
      },
      {
        id: 'chk_kb_ribbon_debris',
        label: 'Retirer les débris sous les touches et vérifier le verrouillage de la nappe clavier/trackpad',
        category: 'materiel'
      },
      {
        id: 'chk_kb_driver_lock',
        label: 'Vérifier qu’une touche Fn / verrouillage pavé tactile ou filtre clavier n’est pas activé',
        category: 'logiciel'
      }
    ],
    suggestedKeywordsFr: ['clavier', 'port'],
    suggestedKeywordsEn: ['keyboard', 'trackpad']
  },
  {
    id: 'wifi_network',
    title: 'Wi-Fi, réseau & Bluetooth',
    keywords: [
      'wifi',
      'wi-fi',
      'internet',
      'reseau',
      'connexion',
      'ethernet',
      'bluetooth',
      'avion',
      'pilote'
    ],
    questions: [
      {
        id: 'q_wifi_other_networks',
        label: 'L’appareil voit-il d’autres réseaux Wi-Fi (ex. partage de connexion téléphone) ?',
        tip: 'Permet d’écarter un souci spécifique au routeur de la maison vs la carte sans-fil.'
      },
      {
        id: 'q_wifi_airplane',
        label: 'Un bouton physique Wi-Fi ou raccourci mode Avion a-t-il été activé par erreur ?',
        tip: 'Très fréquent sur les portables Lenovo/HP/Dell via une touche Fn dédiée ou un loquet latéral.'
      },
      {
        id: 'q_wifi_password_privacy',
        label: 'Le participant sait-il son mot de passe Wi-Fi/compte sans avoir à nous le confier ?',
        tip: 'Toujours laisser le participant saisir ses propres mots de passe (confidentialité Loi 25).'
      }
    ],
    quickChecks: [
      {
        id: 'chk_wifi_no_password_store',
        label: 'Ne jamais noter ni conserver les mots de passe personnels du participant',
        category: 'securite'
      },
      {
        id: 'chk_wifi_switch_driver',
        label: 'Vérifier le commutateur Wi-Fi/mode Avion et le statut de la carte réseau dans l’OS',
        category: 'logiciel'
      },
      {
        id: 'chk_wifi_antenna_usb',
        label: 'Tester avec une clé Wi-Fi USB ou vérifier les fils d’antenne si le châssis est ouvert',
        category: 'materiel'
      }
    ],
    suggestedKeywordsFr: ['wifi', 'carte reseau'],
    suggestedKeywordsEn: ['wifi', 'antenna']
  },
  {
    id: 'mobile_tablet_care',
    title: 'Spécificités cellulaire & tablette',
    categories: ['cellulaire', 'tablette'],
    keywords: [
      'cellulaire',
      'telephone',
      'iphone',
      'samsung',
      'galaxy',
      'pixel',
      'ipad',
      'tablette',
      'android',
      'tactile',
      'sim',
      'charge',
      'ecran',
      'batterie'
    ],
    questions: [
      {
        id: 'q_mob_unlock_backup',
        label: 'Le participant connaît-il son code PIN / verrouillage et a-t-il une sauvegarde cloud ou PC ?',
        tip: 'Utile pour tester le tactile, le son et éviter toute perte si une réinitialisation est envisagée.'
      },
      {
        id: 'q_mob_lint_port',
        label: 'Le câble de charge reste-t-il bien enclenché jusqu’au fond du port ?',
        tip: 'De la poussière tassée au fond du port USB-C/Lightning empêche le contact sans que le port soit cassé.'
      }
    ],
    quickChecks: [
      {
        id: 'chk_mob_nonmetal_pick',
        label: 'Retirer la poussière du port de charge avec un cure-dent en bois/plastique (jamais en métal)',
        category: 'securite'
      },
      {
        id: 'chk_mob_force_restart',
        label: 'Tenter un redémarrage matériel forcé avant d’ouvrir un châssis collé',
        category: 'logiciel'
      }
    ],
    suggestedKeywordsFr: ['ecran', 'batterie'],
    suggestedKeywordsEn: ['screen', 'battery']
  },
  {
    id: 'desktop_tower_care',
    title: 'Spécificités PC tour (bureau)',
    categories: ['pc_tour'],
    keywords: [
      'tour',
      'bureau',
      'desktop',
      'carte mere',
      'carte graphique',
      'alimentation',
      'psu',
      'demarre',
      'ram',
      'affichage'
    ],
    questions: [
      {
        id: 'q_tower_psu_switch',
        label: 'L’interrupteur I/O à l’arrière du bloc d’alimentation (PSU) est-il bien sur I ?',
        tip: 'Vérification simple qui évite un démontage inutile.'
      },
      {
        id: 'q_tower_gpu_port',
        label: 'Le câble écran est-il branché sur la carte graphique dédiée (et non sur la carte mère) ?',
        tip: 'Sur un PC tour avec carte graphique, les sorties de la carte mère sont souvent désactivées.'
      }
    ],
    quickChecks: [
      {
        id: 'chk_tower_unplug_static',
        label: 'Débrancher le cordon secteur et toucher une partie métallique du boîtier (ESD)',
        category: 'securite'
      },
      {
        id: 'chk_tower_cables_ram',
        label: 'Vérifier les connecteurs ATX 24/8 broches et tester les barrettes RAM une par une',
        category: 'materiel'
      }
    ],
    suggestedKeywordsFr: ['alimentation', 'ram'],
    suggestedKeywordsEn: ['power supply', 'ram']
  }
];

const GENERAL_FALLBACK_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: 'q_gen_reproduce',
    label: 'Quand et comment le problème se produit-il exactement devant le participant ?',
    tip: 'Reproduire le symptôme ensemble accélère le diagnostic et rassure le visiteur.'
  },
  {
    id: 'q_gen_recent_change',
    label: 'Y a-t-il eu un changement récent (transport, mise à jour, nouveau câble) ?',
    tip: 'Aide à distinguer une panne matérielle d’un dérèglement logiciel.'
  }
];

const GENERAL_FALLBACK_CHECKS: DiagnosticQuickCheck[] = [
  {
    id: 'chk_gen_safety',
    label: 'Débrancher l’alimentation et vérifier qu’aucun liquide ou batterie gonflée n’est présent',
    category: 'securite'
  },
  {
    id: 'chk_gen_cables',
    label: 'Contrôler les câbles, le chargeur et faire un redémarrage complet',
    category: 'materiel'
  }
];

const SEARCH_STOPWORDS = new Set([
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'de',
  'du',
  'd',
  'et',
  'ou',
  'avec',
  'pour',
  'sur',
  'dans',
  'mon',
  'ma',
  'mes',
  'son',
  'sa',
  'ses',
  'est',
  'sont',
  'ne',
  'pas',
  'plus',
  'tres',
  'trop',
  'tout',
  'pc',
  'appareil'
]);

/**
 * Analyse un ticket hors-ligne et retourne les questions à poser, points de contrôle prioritaires
 * et mots-clés FR/EN adaptés pour iFixit.
 */
export function getDiagnosticSuggestions(ticket: RepairTicket): DiagnosticSuggestionsResult {
  const symptomsText = Array.isArray(ticket.extraData?.symptoms) ? ticket.extraData.symptoms.join(' ') : '';
  const diagText = normalizeDiagnosticText(`${ticket.initialDiagnosis || ''} ${symptomsText}`);
  const objectText = normalizeDiagnosticText(ticket.objectName || '');

  const scored = DIAGNOSTIC_CHECKLIST_RULES.map((rule) => {
    if (rule.categories && !rule.categories.includes(ticket.objectCategory)) {
      return { rule, score: -1 };
    }
    if (rule.operatingSystems && !rule.operatingSystems.includes(ticket.operatingSystem)) {
      return { rule, score: -1 };
    }

    let score = 0;
    for (const kw of rule.keywords) {
      const normalizedKw = normalizeDiagnosticText(kw);
      if (!normalizedKw) continue;
      if (diagText.includes(normalizedKw)) score += 3;
      if (objectText.includes(normalizedKw)) score += 1;
    }

    if (score > 0 && rule.categories?.includes(ticket.objectCategory)) {
      score += 2;
    }
    if (score === 0 && rule.categories?.includes(ticket.objectCategory)) {
      score = 1;
    }

    return { rule, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const questionsMap = new Map<string, DiagnosticQuestion>();
  const checksMap = new Map<string, DiagnosticQuickCheck>();
  const keywordsFr = new Set<string>();
  const keywordsEn = new Set<string>();
  const matchedRuleIds: string[] = [];

  for (const { rule } of scored) {
    matchedRuleIds.push(rule.id);
    for (const q of rule.questions) {
      if (!questionsMap.has(q.id)) questionsMap.set(q.id, q);
    }
    for (const c of rule.quickChecks) {
      if (!checksMap.has(c.id)) checksMap.set(c.id, c);
    }
    for (const kw of rule.suggestedKeywordsFr) keywordsFr.add(kw);
    for (const kw of rule.suggestedKeywordsEn) keywordsEn.add(kw);
  }

  if (questionsMap.size === 0) {
    for (const q of GENERAL_FALLBACK_QUESTIONS) questionsMap.set(q.id, q);
  }
  if (checksMap.size === 0) {
    for (const c of GENERAL_FALLBACK_CHECKS) checksMap.set(c.id, c);
  }

  return {
    matchedRuleIds,
    questions: Array.from(questionsMap.values()),
    quickChecks: Array.from(checksMap.values()),
    suggestedKeywords: {
      fr: Array.from(keywordsFr),
      en: Array.from(keywordsEn)
    }
  };
}

/**
 * Construit des requêtes propres pour l'API iFixit à partir du modèle et des symptômes détectés.
 */
export function buildIfixitQueries(ticket: RepairTicket): { frQuery: string; enQuery: string } {
  const cleanTokens = (ticket.objectName || '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !SEARCH_STOPWORDS.has(normalizeDiagnosticText(t)));

  const baseDevice = cleanTokens.join(' ').trim() || (ticket.objectName || '').trim();
  const suggestions = getDiagnosticSuggestions(ticket);
  const firstFr = suggestions.suggestedKeywords.fr[0] || '';
  const firstEn = suggestions.suggestedKeywords.en[0] || '';

  const baseNorm = normalizeDiagnosticText(baseDevice);
  const frPart = firstFr && !baseNorm.includes(normalizeDiagnosticText(firstFr)) ? firstFr : '';
  const enPart = firstEn && !baseNorm.includes(normalizeDiagnosticText(firstEn)) ? firstEn : '';

  const frQuery = [baseDevice, frPart].filter(Boolean).join(' ').trim() || 'laptop';
  const enQuery = [baseDevice, enPart].filter(Boolean).join(' ').trim() || 'laptop';

  return { frQuery, enQuery };
}
