import { db } from '../db';
import type {
  DeviceCategory,
  OfflineGuideImage,
  OfflineGuideStep,
  OfflineRepairGuide,
  OperatingSystem,
  RepairSymptomDomain,
  RepairTicket
} from '../types';
import { getIfixitGuideDetail, type IfixitGuideDetail, type IfixitLang } from '../services/ifixitService';
import { getDiagnosticSuggestions, normalizeDiagnosticText } from './repairLexicon';
import { getCompanionEndpoint } from './sqliteBackup';

export const KNOWN_BRANDS: string[] = [
  'dell',
  'lenovo',
  'thinkpad',
  'hp',
  'apple',
  'macbook',
  'iphone',
  'ipad',
  'asus',
  'acer',
  'msi',
  'samsung',
  'galaxy',
  'google',
  'pixel',
  'surface',
  'toshiba',
  'sony',
  'lg',
  'huawei',
  'xiaomi',
  'motorola',
  'chromebook',
  'framework'
];

const BRAND_GROUPS: Record<string, string> = {
  thinkpad: 'lenovo',
  macbook: 'apple',
  iphone: 'apple',
  ipad: 'apple',
  galaxy: 'samsung',
  pixel: 'google',
  surface: 'microsoft'
};

const ALL_SYMPTOM_DOMAINS: RepairSymptomDomain[] = [
  'alimentation',
  'batterie',
  'ecran',
  'lenteur_os',
  'surchauffe',
  'clavier_ports',
  'wifi',
  'linux'
];

/**
 * 9 fiches pas à pas maison Insertech embarquées dès le démarrage (100 % hors-ligne).
 */
export const BUILTIN_REPAIR_GUIDES: OfflineRepairGuide[] = [
  {
    id: 'builtin-linux-slow-ssd',
    source: 'builtin',
    lang: 'fr',
    title: 'Linux lent ou disque saturé : diagnostic et optimisation pas à pas',
    device: 'Portable ou PC Linux',
    brands: [],
    models: [],
    categories: ['laptop', 'pc_tour'],
    operatingSystems: ['linux'],
    symptomDomains: ['lenteur_os', 'linux'],
    difficulty: 'Facile',
    timeRequired: '15 - 30 min',
    introduction:
      'Vérifier l’espace disque, les processus lourds, la santé SMART et l’état mémoire RAM sur un ordinateur sous Linux.',
    tools: ['Clé USB Live Linux (outil diagnostic)', 'Tournevis standard (si ouverture RAM/SSD)'],
    parts: ['SSD SATA ou NVMe (si disque mécanique vieillissant)', 'Barrette RAM (si ≤ 4 Go)'],
    updatedAt: 1700000001000,
    steps: [
      {
        stepid: 1,
        orderby: 1,
        title: 'Analyser l’espace disque et la mémoire vive',
        images: [],
        lines: [
          {
            text: 'Confirmer avec le participant qu’aucune donnée personnelle critique n’est menacée avant toute modification.',
            bullet: 'icon_caution',
            level: 0
          },
          {
            text: 'Ouvrir un terminal et lancer df -h pour vérifier que la partition racine conserve au moins 15 % d’espace libre.',
            bullet: 'black',
            level: 0
          },
          {
            text: 'Exécuter free -h et top (ou Moniteur système) pour repérer si la RAM sature et déclenche un swap intensif sur disque.',
            bullet: 'black',
            level: 0
          }
        ]
      },
      {
        stepid: 2,
        orderby: 2,
        title: 'Contrôler la santé SMART du disque et alléger le démarrage',
        images: [],
        lines: [
          {
            text: 'Dans l’utilitaire Disques (gnome-disks), lire les données SMART : un disque mécanique avec secteurs réalloués doit être remplacé par un SSD.',
            bullet: 'icon_note',
            level: 0
          },
          {
            text: 'Nettoyer les anciens noyaux/paquets inutiles (sudo apt autoremove --purge) et désactiver les applications lourdes lancées au démarrage.',
            bullet: 'black',
            level: 0
          }
        ]
      }
    ]
  },
  {
    id: 'builtin-windows-slow-cleanup',
    source: 'builtin',
    lang: 'fr',
    title: 'Windows lent : démarrage, stockage, virus et option SSD / Linux',
    device: 'PC ou portable Windows',
    brands: [],
    models: [],
    categories: ['laptop', 'pc_tour'],
    operatingSystems: ['windows'],
    symptomDomains: ['lenteur_os'],
    difficulty: 'Facile',
    timeRequired: '20 - 35 min',
    introduction:
      'Identifier si la lenteur sous Windows provient des programmes au démarrage, d’un disque à 100 % ou d’un manque de RAM.',
    tools: ['Clé USB sauvegarde / Live USB'],
    parts: ['SSD (si HDD à 100 % constant)', 'Barrette RAM DDR4/DDR3'],
    updatedAt: 1700000002000,
    steps: [
      {
        stepid: 1,
        orderby: 1,
        title: 'Inspecter le Gestionnaire des tâches (Ctrl + Maj + Échap)',
        images: [],
        lines: [
          {
            text: 'Ne jamais supprimer de fichiers personnels sans confirmation ni sauvegarde préalable du participant.',
            bullet: 'icon_caution',
            level: 0
          },
          {
            text: 'Onglet Performance : vérifier si Disque C: reste bloqué à 100 % (signe fréquent d’un disque HDD mécanique saturé).',
            bullet: 'black',
            level: 0
          },
          {
            text: 'Onglet Démarrage : désactiver les applications non essentielles (messageries, lanceurs de jeux, mises à jour tierces).',
            bullet: 'black',
            level: 0
          }
        ]
      },
      {
        stepid: 2,
        orderby: 2,
        title: 'Nettoyage logiciel et analyse Defender',
        images: [],
        lines: [
          {
            text: 'Désinstaller les antivirus en doublon ou logiciels indésirables avec le participant, puis lancer une analyse rapide Windows Defender.',
            bullet: 'black',
            level: 0
          },
          {
            text: 'Si la machine date de plus de 7 ans avec 4 Go de RAM, présenter l’option SSD ou une migration Linux Mint en atelier.',
            bullet: 'icon_note',
            level: 0
          }
        ]
      }
    ]
  },
  {
    id: 'builtin-laptop-battery-power',
    source: 'builtin',
    lang: 'fr',
    title: 'Portable : batterie, chargeur et réinitialisation d’alimentation',
    device: 'Ordinateur portable',
    brands: [],
    models: [],
    categories: ['laptop'],
    symptomDomains: ['batterie', 'alimentation'],
    difficulty: 'Moyen',
    timeRequired: '15 - 30 min',
    introduction:
      'Vérifier la chaîne d’alimentation complète du chargeur jusqu’à la batterie interne en toute sécurité.',
    tools: ['Multimètre', 'Tournevis de précision', 'Spatule en plastique (ESD)'],
    parts: ['Batterie de remplacement', 'Chargeur compatible / port de charge'],
    updatedAt: 1700000003000,
    steps: [
      {
        stepid: 1,
        orderby: 1,
        title: 'Tests externes chargeur & reset électrique 15 s',
        images: [],
        lines: [
          {
            text: 'Débrancher immédiatement le chargeur si le châssis est bombé ou déformé par une batterie gonflée.',
            bullet: 'icon_caution',
            level: 0
          },
          {
            text: 'Vérifier la tension du chargeur (ou tester avec un bloc sain de puissance en Watts équivalente) et inspecter le jeu dans le port DC/USB-C.',
            bullet: 'black',
            level: 0
          },
          {
            text: 'Débrancher secteur + batterie (si amovible), maintenir Power 15 secondes pour vider les condensateurs, puis tester secteur seul.',
            bullet: 'black',
            level: 0
          }
        ]
      },
      {
        stepid: 2,
        orderby: 2,
        title: 'Inspection interne de la nappe batterie et pile CMOS',
        images: [],
        lines: [
          {
            text: 'Ouvrir le capot inférieur avec une spatule plastique, débrancher la nappe batterie avant toute manipulation sur la carte mère.',
            bullet: 'icon_reminder',
            level: 0
          },
          {
            text: 'Tester le démarrage secteur sans la batterie interne : si le PC démarre sans elle, la batterie est en court-circuit et doit être remplacée.',
            bullet: 'black',
            level: 0
          }
        ]
      }
    ]
  },
  {
    id: 'builtin-laptop-overheat-fan',
    source: 'builtin',
    lang: 'fr',
    title: 'Surchauffe & ventilateur bruyant : dépoussiérage et pâte thermique',
    device: 'Portable ou PC tour',
    brands: [],
    models: [],
    categories: ['laptop', 'pc_tour'],
    symptomDomains: ['surchauffe'],
    difficulty: 'Moyen',
    timeRequired: '25 - 45 min',
    introduction:
      'Éliminer l’obstruction des ailettes de refroidissement et renouveler la pâte thermique sèche.',
    tools: ['Pinceau antistatique', 'Air sec / souffleur', 'Alcool isopropylique > 90 %', 'Tournevis Phillips #0 / #1'],
    parts: ['Pâte thermique', 'Ventilateur de remplacement (si roulement grippé)'],
    updatedAt: 1700000004000,
    steps: [
      {
        stepid: 1,
        orderby: 1,
        title: 'Ouvrir l’accès au ventilateur et dépoussiérer sans surtension',
        images: [],
        lines: [
          {
            text: 'Débrancher chargeur + batterie et BLOQUER les pales du ventilateur avec le doigt avant de souffler de l’air sec (évite une surtension sur la carte mère).',
            bullet: 'icon_caution',
            level: 0
          },
          {
            text: 'Retirer le tapis de poussière coincé entre la sortie du ventilateur et les ailettes en cuivre du caloduc.',
            bullet: 'black',
            level: 0
          }
        ]
      },
      {
        stepid: 2,
        orderby: 2,
        title: 'Renouveler la pâte thermique (si dissipateur démonté)',
        images: [],
        lines: [
          {
            text: 'Dévisser dans l’ordre inverse indiqué sur le radiateur, nettoyer CPU/GPU à l’alcool isopropylique > 90 % avec un chiffon non pelucheux.',
            bullet: 'black',
            level: 0
          },
          {
            text: 'Appliquer un petit pois de pâte neuve au centre de la puce et revisser en croix progressivement.',
            bullet: 'icon_note',
            level: 0
          }
        ]
      }
    ]
  },
  {
    id: 'builtin-laptop-screen-edp',
    source: 'builtin',
    lang: 'fr',
    title: 'Écran noir, scintillant ou charnière : test HDMI, lampe et nappe eDP',
    device: 'Ordinateur portable',
    brands: [],
    models: [],
    categories: ['laptop'],
    symptomDomains: ['ecran'],
    difficulty: 'Moyen',
    timeRequired: '15 - 30 min',
    introduction:
      'Isoler rapidement une panne de rétroéclairage, de nappe vidéo ou de dalle LCD.',
    tools: ['Câble HDMI + écran externe', 'Lampe de poche', 'Spatule plastique'],
    parts: ['Dalle LCD', 'Câble vidéo eDP / LVDS'],
    updatedAt: 1700000005000,
    steps: [
      {
        stepid: 1,
        orderby: 1,
        title: 'Test écran externe et test lampe de poche',
        images: [],
        lines: [
          {
            text: 'Brancher un écran externe en HDMI/USB-C : si l’affichage est normal, la carte mère et le GPU sont fonctionnels.',
            bullet: 'black',
            level: 0
          },
          {
            text: 'Éclairer l’écran interne avec une lampe de poche : si une image très sombre apparaît, le rétroéclairage (ou son fusible) est en cause.',
            bullet: 'icon_note',
            level: 0
          }
        ]
      },
      {
        stepid: 2,
        orderby: 2,
        title: 'Vérifier la nappe vidéo et les charnières',
        images: [],
        lines: [
          {
            text: 'IMPÉRATIF : toujours débrancher secteur ET batterie avant de toucher au connecteur vidéo eDP/LVDS sous peine de griller le fusible de rétroéclairage.',
            bullet: 'icon_caution',
            level: 0
          },
          {
            text: 'Réinsérer bien à plat la nappe vidéo côté carte mère et resserrer les vis de charnière si le capot force à l’ouverture.',
            bullet: 'black',
            level: 0
          }
        ]
      }
    ]
  },
  {
    id: 'builtin-laptop-keyboard-ports',
    source: 'builtin',
    lang: 'fr',
    title: 'Clavier, pavé tactile ou ports USB inopérants : isolation & nappes',
    device: 'Ordinateur portable / PC',
    brands: [],
    models: [],
    categories: ['laptop', 'pc_tour'],
    symptomDomains: ['clavier_ports'],
    difficulty: 'Moyen',
    timeRequired: '15 - 25 min',
    introduction:
      'Distinguer un blocage logiciel d’une nappe ZIF délogée ou d’une oxydation par liquide.',
    tools: ['Clavier / souris USB externe', 'Alcool isopropylique > 90 %', 'Pince brucelle plastique'],
    parts: ['Module clavier', 'Pavé tactile'],
    updatedAt: 1700000006000,
    steps: [
      {
        stepid: 1,
        orderby: 1,
        title: 'Isoler avec périphériques USB et vérifier raccourcis système',
        images: [],
        lines: [
          {
            text: 'Tester un clavier et une souris USB externes pour confirmer que le système répond et que les ports USB alimentent bien.',
            bullet: 'black',
            level: 0
          },
          {
            text: 'Vérifier qu’un raccourci Fn + Touchpad, le verrouillage numérique ou les touches filtres d’accessibilité ne bloquent pas la saisie.',
            bullet: 'icon_note',
            level: 0
          }
        ]
      },
      {
        stepid: 2,
        orderby: 2,
        title: 'Inspection des nappes ZIF et traces de liquide',
        images: [],
        lines: [
          {
            text: 'Batterie débranchée : ouvrir délicatement le loquet du connecteur ZIF de la nappe clavier/trackpad, nettoyer les contacts à l’alcool > 90 % et réinsérer bien droit.',
            bullet: 'icon_reminder',
            level: 0
          }
        ]
      }
    ]
  },
  {
    id: 'builtin-wifi-network-fix',
    source: 'builtin',
    lang: 'fr',
    title: 'Wi-Fi / Réseau absent : bouton matériel, pilote et antennes',
    device: 'Portable ou PC',
    brands: [],
    models: [],
    categories: ['laptop', 'pc_tour'],
    symptomDomains: ['wifi'],
    difficulty: 'Facile',
    timeRequired: '10 - 20 min',
    introduction:
      'Rétablir la détection Wi-Fi entre commutateur physique, pilote logiciel et carte réseau interne.',
    tools: ['Clé Wi-Fi USB de secours', 'Tournevis (si accès carte M.2 Wi-Fi)'],
    parts: ['Adaptateur Wi-Fi USB ou carte M.2 Wi-Fi'],
    updatedAt: 1700000007000,
    steps: [
      {
        stepid: 1,
        orderby: 1,
        title: 'Vérifier mode Avion, bouton matériel et confidentialité',
        images: [],
        lines: [
          {
            text: 'Ne jamais noter ni conserver les mots de passe Wi-Fi ou comptes personnels du participant.',
            bullet: 'icon_caution',
            level: 0
          },
          {
            text: 'Contrôler la touche Fn + icône sans-fil / interrupteur latéral, puis tester la détection du réseau sur un partage de connexion.',
            bullet: 'black',
            level: 0
          }
        ]
      },
      {
        stepid: 2,
        orderby: 2,
        title: 'Vérifier pilote et connexions d’antennes internes',
        images: [],
        lines: [
          {
            text: 'Si la carte Wi-Fi disparaît totalement de l’OS, tester une clé USB Wi-Fi ; en atelier, vérifier les deux mini-connecteurs d’antenne (Main / Aux) sur la carte sans fil.',
            bullet: 'icon_note',
            level: 0
          }
        ]
      }
    ]
  },
  {
    id: 'builtin-mobile-charge-screen',
    source: 'builtin',
    lang: 'fr',
    title: 'Cellulaire & Tablette : port de charge encrassé, redémarrage et écran',
    device: 'Cellulaire ou tablette',
    brands: [],
    models: [],
    categories: ['cellulaire', 'tablette'],
    symptomDomains: ['batterie', 'alimentation', 'ecran'],
    difficulty: 'Facile',
    timeRequired: '10 - 20 min',
    introduction:
      'Résoudre la majorité des pannes de charge et blocages sans ouvrir inutilement un écran collé.',
    tools: ['Cure-dent en bois ou plastique fin', 'Lampe de poche', 'Câble & bloc chargeur connus sains'],
    parts: ['Écran / vitre tactile', 'Batterie mobile'],
    updatedAt: 1700000008000,
    steps: [
      {
        stepid: 1,
        orderby: 1,
        title: 'Nettoyage sécuritaire du port USB-C / Lightning',
        images: [],
        lines: [
          {
            text: 'Ne JAMAIS utiliser d’aiguille ou trombone métallique dans le port de charge (risque de court-circuit sur les broches).',
            bullet: 'icon_caution',
            level: 0
          },
          {
            text: 'Éclairer le fond du port et retirer les peluches tassées avec un cure-dent taillé fin en bois ou plastique jusqu’à entendre le déclic franc du câble.',
            bullet: 'black',
            level: 0
          }
        ]
      },
      {
        stepid: 2,
        orderby: 2,
        title: 'Redémarrage matériel forcé avant démontage',
        images: [],
        lines: [
          {
            text: 'Sur écran noir avec vibrations/notifications, effectuer la combinaison de redémarrage forcé (ex. Volume Bas + Power 15 s) avant d’envisager un décollage d’écran.',
            bullet: 'icon_note',
            level: 0
          }
        ]
      }
    ]
  },
  {
    id: 'builtin-desktop-no-boot',
    source: 'builtin',
    lang: 'fr',
    title: 'PC Tour ne démarre pas ou écran noir : PSU, GPU, RAM et CMOS',
    device: 'PC tour (bureau)',
    brands: [],
    models: [],
    categories: ['pc_tour'],
    symptomDomains: ['alimentation', 'ecran'],
    difficulty: 'Moyen',
    timeRequired: '20 - 35 min',
    introduction:
      'Procédure méthodique pour relancer un ordinateur de bureau sans affichage ou sans mise sous tension.',
    tools: ['Tournevis Phillips #2', 'Pile CR2032 de test'],
    parts: ['Bloc d’alimentation ATX (PSU)', 'Pile CMOS CR2032', 'Barrette RAM'],
    updatedAt: 1700000009000,
    steps: [
      {
        stepid: 1,
        orderby: 1,
        title: 'Vérifications externes (PSU & sortie carte graphique)',
        images: [],
        lines: [
          {
            text: 'Vérifier l’interrupteur I/O à l’arrière du bloc d’alimentation et s’assurer que le câble écran est branché sur la carte graphique dédiée (et non sur la carte mère).',
            bullet: 'black',
            level: 0
          }
        ]
      },
      {
        stepid: 2,
        orderby: 2,
        title: 'Contrôle interne ESD : câbles ATX, RAM et pile CMOS',
        images: [],
        lines: [
          {
            text: 'Débrancher le cordon secteur et toucher une partie métallique du boîtier avant de manipuler les composants (ESD).',
            bullet: 'icon_caution',
            level: 0
          },
          {
            text: 'Réinsérer les connecteurs ATX 24 broches et CPU 4/8 broches, puis tester le démarrage avec une seule barrette RAM à la fois.',
            bullet: 'black',
            level: 0
          }
        ]
      }
    ]
  }
];

function dedupeStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((s) => s.trim()).filter(Boolean)));
}

export function extractBrandTags(text: string): string[] {
  const norm = normalizeDiagnosticText(text);
  const found = new Set<string>();
  for (const brand of KNOWN_BRANDS) {
    if (new RegExp(`(^|[^a-z0-9])${brand}([^a-z0-9]|$)`).test(norm)) {
      found.add(BRAND_GROUPS[brand] || brand);
    }
  }
  return Array.from(found);
}

export function extractModelTokens(text: string): string[] {
  const norm = normalizeDiagnosticText(text);
  const tokens = norm.split(/[^a-z0-9]+/).filter((t) => {
    if (t.length < 3) return false;
    if (KNOWN_BRANDS.includes(t)) return false;
    return /\d/.test(t) || ['inspiron', 'latitude', 'xps', 'precision', 'vostro', 'thinkpad', 'ideapad', 'yoga', 'probook', 'elitebook', 'pavilion', 'envy', 'zenbook', 'vivobook', 'swift', 'aspire', 'macbook'].includes(t);
  });
  return dedupeStrings(tokens);
}

const RULE_TO_DOMAIN: Record<string, RepairSymptomDomain[]> = {
  power_no_boot: ['alimentation'],
  battery_charge: ['batterie'],
  screen_display: ['ecran'],
  slow_os_disk: ['lenteur_os'],
  overheat_fan: ['surchauffe'],
  keyboard_ports: ['clavier_ports'],
  wifi_network: ['wifi'],
  mobile_tablet_care: ['batterie', 'ecran'],
  desktop_tower_care: ['alimentation']
};

/**
 * Extrait les domaines de panne réels à partir de l'inscription du participant.
 */
export function extractTicketSymptomDomains(ticket: RepairTicket): RepairSymptomDomain[] {
  const domains = new Set<RepairSymptomDomain>();
  const suggestions = getDiagnosticSuggestions(ticket);

  for (const ruleId of suggestions.matchedRuleIds) {
    for (const dom of RULE_TO_DOMAIN[ruleId] || []) {
      domains.add(dom);
    }
  }

  const rawText = normalizeDiagnosticText(
    `${ticket.initialDiagnosis || ''} ${Array.isArray(ticket.extraData?.symptoms) ? ticket.extraData.symptoms.join(' ') : ''}`
  );

  if (rawText.includes('linux') || ticket.operatingSystem === 'linux') domains.add('linux');
  if (rawText.includes('lent') || rawText.includes('slow') || rawText.includes('disque') || rawText.includes('ssd') || rawText.includes('virus')) {
    domains.add('lenteur_os');
  }
  if (rawText.includes('batterie') || rawText.includes('battery') || rawText.includes('charge')) domains.add('batterie');
  if (rawText.includes('alimentation') || rawText.includes('demarre') || rawText.includes('boot') || rawText.includes('power')) {
    domains.add('alimentation');
  }
  if (rawText.includes('ecran') || rawText.includes('screen') || rawText.includes('display') || rawText.includes('tactile')) {
    domains.add('ecran');
  }
  if (rawText.includes('chauffe') || rawText.includes('ventilateur') || rawText.includes('fan') || rawText.includes('therm')) {
    domains.add('surchauffe');
  }
  if (rawText.includes('clavier') || rawText.includes('keyboard') || rawText.includes('usb') || rawText.includes('port') || rawText.includes('trackpad')) {
    domains.add('clavier_ports');
  }
  if (rawText.includes('wifi') || rawText.includes('wi-fi') || rawText.includes('reseau') || rawText.includes('internet')) {
    domains.add('wifi');
  }

  return Array.from(domains);
}

/**
 * Infère marques, modèles, catégories, OS et symptômes d'un guide téléchargé.
 */
export function inferGuideMetadata(
  title: string,
  device: string,
  categoryHint?: DeviceCategory
): {
  brands: string[];
  models: string[];
  categories: DeviceCategory[];
  operatingSystems?: OperatingSystem[];
  symptomDomains: RepairSymptomDomain[];
} {
  const combined = `${title} ${device}`;
  const norm = normalizeDiagnosticText(combined);
  const brands = extractBrandTags(combined);
  const models = extractModelTokens(combined);

  const categories = new Set<DeviceCategory>();
  if (categoryHint) categories.add(categoryHint);
  if (/\b(iphone|samsung galaxy|galaxy s|galaxy a|pixel|smartphone|cellulaire|phone|android)\b/.test(norm)) {
    categories.add('cellulaire');
  }
  if (/\b(ipad|tablet|tablette|galaxy tab|surface)\b/.test(norm)) {
    categories.add('tablette');
  }
  if (/\b(desktop|tower|tour|imac|optiplex|pc de bureau)\b/.test(norm)) {
    categories.add('pc_tour');
  }
  if (/\b(laptop|portable|macbook|thinkpad|latitude|inspiron|xps|elitebook|probook|zenbook|vivobook|chromebook|notebook)\b/.test(norm)) {
    categories.add('laptop');
  }
  if (categories.size === 0) {
    categories.add('laptop');
  }

  const osSet = new Set<OperatingSystem>();
  if (/\b(windows|win10|win11)\b/.test(norm)) osSet.add('windows');
  if (/\b(linux|ubuntu|mint|fedora|debian)\b/.test(norm)) osSet.add('linux');
  if (/\b(mac|macos|macbook|imac)\b/.test(norm)) osSet.add('mac');

  const domains = new Set<RepairSymptomDomain>();
  if (/\b(batterie|battery)\b/.test(norm)) domains.add('batterie');
  if (/\b(alimentation|power|demarre|boot|psu|dc jack|chargeur|charger)\b/.test(norm)) domains.add('alimentation');
  if (/\b(ecran|screen|display|lcd|oled|retroeclairage|charniere|hinge|tactile)\b/.test(norm)) domains.add('ecran');
  if (/\b(ventilateur|fan|thermal|pate thermique|surchauffe|heatsink|cooling)\b/.test(norm)) domains.add('surchauffe');
  if (/\b(clavier|keyboard|trackpad|touchpad|port|usb|hdmi)\b/.test(norm)) domains.add('clavier_ports');
  if (/\b(wifi|wi-fi|antenna|antenne|wireless|bluetooth|network|reseau)\b/.test(norm)) domains.add('wifi');
  if (/\b(ssd|hdd|hard drive|disque|ram|memory|memoire|lent|slow|os|reinstall|linux)\b/.test(norm)) domains.add('lenteur_os');
  if (/\b(linux|ubuntu|mint)\b/.test(norm)) domains.add('linux');

  return {
    brands,
    models,
    categories: Array.from(categories),
    operatingSystems: osSet.size > 0 ? Array.from(osSet) : undefined,
    symptomDomains: domains.size > 0 ? Array.from(domains) : ALL_SYMPTOM_DOMAINS
  };
}

/**
 * Filtrage STRICT basé sur les informations d'inscription du participant :
 * - marque incompatible -> exclu
 * - catégorie incompatible -> exclu
 * - OS incompatible -> exclu
 * - symptôme sans recoupement -> exclu
 */
export function matchOfflineGuidesForTicket(
  ticket: RepairTicket,
  guides: OfflineRepairGuide[],
  maxResults = 6
): OfflineRepairGuide[] {
  const ticketBrandText = `${ticket.extraData?.brand || ''} ${ticket.objectName || ''}`;
  const ticketBrands = extractBrandTags(ticketBrandText);
  const ticketModels = extractModelTokens(ticketBrandText);
  const ticketDomains = extractTicketSymptomDomains(ticket);

  const scored: { guide: OfflineRepairGuide; score: number }[] = [];

  for (const guide of guides) {
    // 1. Marque stricte : si le guide vise une marque précise (ex. Dell), le ticket DOIT correspondre à cette marque
    if (guide.brands.length > 0) {
      if (ticketBrands.length === 0) continue;
      const brandMatch = guide.brands.some((b) => ticketBrands.includes(b));
      if (!brandMatch) continue;
    }

    // 2. Catégorie stricte
    if (guide.categories.length > 0 && !guide.categories.includes(ticket.objectCategory)) {
      continue;
    }

    // 3. Système d'exploitation strict (si le guide vise un OS précis et que le ticket précise un OS)
    if (
      guide.operatingSystems &&
      guide.operatingSystems.length > 0 &&
      ticket.operatingSystem &&
      ticket.operatingSystem !== 'autre' &&
      ticket.operatingSystem !== 'aucun' &&
      !guide.operatingSystems.includes(ticket.operatingSystem)
    ) {
      continue;
    }

    // 4. Symptôme strict : aucun guide hors sujet (ex. Batterie exclu si le ticket concerne une lenteur Linux)
    const domainOverlap = guide.symptomDomains.filter((d) => ticketDomains.includes(d));
    if (ticketDomains.length > 0 && guide.symptomDomains.length > 0 && domainOverlap.length === 0) {
      continue;
    }

    // Calcul du score de pertinence
    let score = 10;
    const exactModelMatches = guide.models.filter((m) => ticketModels.includes(m));
    score += exactModelMatches.length * 30;
    if (guide.brands.some((b) => ticketBrands.includes(b))) score += 18;
    score += domainOverlap.length * 12;
    if (guide.operatingSystems?.includes(ticket.operatingSystem)) score += 8;
    if (guide.source !== 'builtin') score += 6;
    if (guide.lang === 'fr') score += 2;

    scored.push({ guide, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((item) => item.guide);
}

/**
 * Recherche textuelle dans la bibliothèque locale pour l'onglet ou le relais LAN Laptop -> Tablettes.
 */
export function searchOfflineGuidesLibrary(query: string, guides: OfflineRepairGuide[]): OfflineRepairGuide[] {
  const normQuery = normalizeDiagnosticText(query);
  if (!normQuery) return guides;

  const tokens = normQuery.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return guides;

  return guides
    .map((guide) => {
      const haystack = normalizeDiagnosticText(
        `${guide.title} ${guide.device} ${guide.brands.join(' ')} ${guide.models.join(' ')} ${guide.symptomDomains.join(' ')} ${guide.introduction}`
      );
      let hits = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) hits++;
      }
      return { guide, hits };
    })
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((entry) => entry.guide);
}

/**
 * Convertit un OfflineRepairGuide en format lisible par IfixitGuideViewer.
 */
export function offlineGuideToViewerDetail(guide: OfflineRepairGuide): IfixitGuideDetail {
  return {
    guideid: guide.ifixitGuideId || Math.abs(hashStringToInt(guide.id)),
    title: guide.title,
    device: guide.device,
    difficulty: guide.difficulty,
    timeRequired: guide.timeRequired,
    introduction: guide.introduction,
    tools: guide.tools,
    parts: guide.parts,
    lang: guide.lang,
    fromCache: true,
    staleCache: false,
    steps: guide.steps.map((st) => ({
      stepid: st.stepid,
      orderby: st.orderby,
      title: st.title,
      images: st.images.map((img) => ({
        id: img.id,
        thumbnail: img.thumbnailDataUrl || img.mediumUrl || img.fullResUrl || '',
        medium: img.thumbnailDataUrl || img.mediumUrl || img.fullResUrl || '',
        standard: img.fullResUrl || img.mediumUrl || img.thumbnailDataUrl || '',
        original: img.fullResUrl || img.mediumUrl || '',
        embeddedDataUrl: img.thumbnailDataUrl
      })),
      lines: st.lines
    }))
  };
}

function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return hash || 1;
}

async function fetchImageBlob(url: string): Promise<Blob | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) {
    try {
      const resp = await fetch(url);
      return await resp.blob();
    } catch {
      return null;
    }
  }

  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (resp.ok) return await resp.blob();
  } catch {
    // Bloqué par CORS : tentative via le compagnon local PC
  }

  const companion = getCompanionEndpoint();
  if (companion) {
    try {
      const proxyUrl = `${companion.base}/image?cle=${encodeURIComponent(companion.key)}&url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      if (resp.ok) return await resp.blob();
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Compresse une image d'étape en miniature JPEG (maxWidth 480px) pour embarquement hors-ligne léger (~15-30 Ko/étape).
 */
export async function compressImageToThumbnailDataUrl(url: string, maxWidth = 480): Promise<string | undefined> {
  const blob = await fetchImageBlob(url);
  if (!blob || typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return undefined;
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return undefined;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  }
}

export async function getAllOfflineGuides(): Promise<OfflineRepairGuide[]> {
  let stored: OfflineRepairGuide[] = [];
  try {
    stored = await db.repairGuides.toArray();
  } catch {
    stored = [];
  }
  const byId = new Map<string, OfflineRepairGuide>();
  for (const g of BUILTIN_REPAIR_GUIDES) byId.set(g.id, g);
  for (const g of stored) byId.set(g.id, g);
  return Array.from(byId.values());
}

export async function saveOfflineGuide(guide: OfflineRepairGuide): Promise<void> {
  await db.repairGuides.put({ ...guide, updatedAt: Date.now() });
}

export async function deleteOfflineGuide(id: string): Promise<void> {
  await db.repairGuides.delete(id);
}

/**
 * Télécharge un guide iFixit complet sur le Laptop, compresse 1 miniature par étape (en conservant fullResUrl)
 * et l'enregistre dans db.repairGuides.
 */
export async function downloadIfixitGuideToOfflineLibrary(
  guideId: number,
  lang: IfixitLang,
  overrides?: {
    brands?: string[];
    categories?: DeviceCategory[];
    operatingSystems?: OperatingSystem[];
    symptomDomains?: RepairSymptomDomain[];
  }
): Promise<OfflineRepairGuide> {
  const detail = await getIfixitGuideDetail(guideId, lang, { forceRefresh: true });
  const inferred = inferGuideMetadata(detail.title, detail.device);

  const steps: OfflineGuideStep[] = [];
  for (const step of detail.steps) {
    const primary = step.images[0];
    const images: OfflineGuideImage[] = [];
    if (primary) {
      const thumbSource = primary.medium || primary.standard || primary.thumbnail || '';
      const fullResUrl = primary.original || primary.standard || primary.medium || '';
      const thumbnailDataUrl = await compressImageToThumbnailDataUrl(thumbSource);
      images.push({
        id: primary.id,
        thumbnailDataUrl,
        mediumUrl: primary.medium || primary.standard || '',
        fullResUrl
      });
    }
    steps.push({
      stepid: step.stepid,
      orderby: step.orderby,
      title: step.title,
      images,
      lines: step.lines
    });
  }

  const record: OfflineRepairGuide = {
    id: `ifixit-${lang}-${detail.guideid}`,
    source: 'ifixit',
    ifixitGuideId: detail.guideid,
    lang,
    title: detail.title,
    device: detail.device,
    brands: overrides?.brands && overrides.brands.length > 0 ? overrides.brands : inferred.brands,
    models: inferred.models,
    categories:
      overrides?.categories && overrides.categories.length > 0 ? overrides.categories : inferred.categories,
    operatingSystems: overrides?.operatingSystems ?? inferred.operatingSystems,
    symptomDomains:
      overrides?.symptomDomains && overrides.symptomDomains.length > 0
        ? overrides.symptomDomains
        : inferred.symptomDomains,
    difficulty: detail.difficulty,
    timeRequired: detail.timeRequired,
    introduction: detail.introduction,
    tools: detail.tools,
    parts: detail.parts,
    steps,
    updatedAt: Date.now()
  };

  await saveOfflineGuide(record);
  return record;
}

export function exportOfflineGuidesPack(guides: OfflineRepairGuide[]): string {
  return JSON.stringify(
    {
      format: 'insertech-offline-guides-v1',
      exportedAt: new Date().toISOString(),
      guides: guides.filter((g) => g.source !== 'builtin')
    },
    null,
    2
  );
}

export async function importOfflineGuidesPack(jsonText: string): Promise<number> {
  const parsed = JSON.parse(jsonText);
  const items: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.guides) ? parsed.guides : [];
  const valid: OfflineRepairGuide[] = [];

  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' || !Array.isArray(item.steps)) {
      continue;
    }
    valid.push({
      id: item.id,
      source: item.source === 'ifixit' ? 'ifixit' : 'custom',
      ifixitGuideId: typeof item.ifixitGuideId === 'number' ? item.ifixitGuideId : undefined,
      lang: item.lang === 'en' ? 'en' : 'fr',
      title: item.title,
      device: typeof item.device === 'string' ? item.device : '',
      brands: Array.isArray(item.brands) ? item.brands : [],
      models: Array.isArray(item.models) ? item.models : [],
      categories: Array.isArray(item.categories) && item.categories.length > 0 ? item.categories : ['laptop'],
      operatingSystems: Array.isArray(item.operatingSystems) ? item.operatingSystems : undefined,
      symptomDomains:
        Array.isArray(item.symptomDomains) && item.symptomDomains.length > 0
          ? item.symptomDomains
          : ALL_SYMPTOM_DOMAINS,
      difficulty: typeof item.difficulty === 'string' ? item.difficulty : '',
      timeRequired: typeof item.timeRequired === 'string' ? item.timeRequired : '',
      introduction: typeof item.introduction === 'string' ? item.introduction : '',
      tools: Array.isArray(item.tools) ? item.tools : [],
      parts: Array.isArray(item.parts) ? item.parts : [],
      steps: item.steps,
      updatedAt: Date.now()
    });
  }

  if (valid.length > 0) {
    await db.repairGuides.bulkPut(valid);
  }
  return valid.length;
}
