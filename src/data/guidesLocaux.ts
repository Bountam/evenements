import type { DeviceCategory, OfflineRepairGuide, OperatingSystem, RepairSymptomDomain } from '../types';

// Fiches de réparation complètes rédigées pour Insertech, inspirées de la démarche des guides iFixit
// (sécurité d'abord, outils et pièces, une action par ligne). 100 % hors ligne, aucune image distante.
// Chaque fiche porte des termes de recherche iFixit (ifixitRecherche) : depuis le PC hôte, l'administrateur
// y lie les articles complets d'iFixit, qui s'ouvrent ensuite dans l'application via la clé du PC.
// reluPar vide = brouillon à faire relire par un technicien d'Insertech avant l'événement.

// Préfixes d'une ligne : « ! » attention, « i: » note, « r: » rappel ; sans préfixe = action
type Ligne = string;

interface FicheSource {
  id: string;
  titre: string;
  appareil: string;
  categories: DeviceCategory[];
  os?: OperatingSystem[];
  domaines: RepairSymptomDomain[];
  difficulte: 'Très facile' | 'Facile' | 'Moyen' | 'Difficile';
  duree: string;
  intro: string;
  outils: string[];
  pieces: string[];
  recherche: string;
  etapes: [string, Ligne[]][];
}

export const GUIDES_LOCAUX_VERSION = 1;
const DATE_REDACTION = 1795824000000; // 2026-11-28, date fixe : la fiche ne change pas à chaque démarrage

function ligne(texte: Ligne) {
  if (texte.startsWith('!')) return { text: texte.slice(1).trim(), bullet: 'icon_caution', level: 0 };
  if (texte.startsWith('i:')) return { text: texte.slice(2).trim(), bullet: 'icon_note', level: 0 };
  if (texte.startsWith('r:')) return { text: texte.slice(2).trim(), bullet: 'icon_reminder', level: 0 };
  return { text: texte.trim(), bullet: 'black', level: 0 };
}

function fiche(src: FicheSource, rang: number): OfflineRepairGuide {
  return {
    id: `local-${src.id}`,
    source: 'builtin',
    lang: 'fr',
    title: src.titre,
    device: src.appareil,
    brands: [],
    models: [],
    categories: src.categories,
    operatingSystems: src.os,
    symptomDomains: src.domaines,
    difficulty: src.difficulte,
    timeRequired: src.duree,
    introduction: src.intro,
    tools: src.outils,
    parts: src.pieces,
    ifixitRecherche: src.recherche,
    ifixitLinks: [],
    reluPar: '',
    version: GUIDES_LOCAUX_VERSION,
    updatedAt: DATE_REDACTION + rang,
    steps: src.etapes.map(([titre, lignes], i) => ({
      stepid: i + 1,
      orderby: i + 1,
      title: titre,
      images: [],
      lines: lignes.map(ligne)
    }))
  };
}

const SECURITE_PORTABLE = '!Éteindre complètement (pas en veille), débrancher le chargeur et débrancher la nappe de batterie avant de toucher la carte mère.';
const SECURITE_ESD = 'r:Se décharger en touchant une pièce métallique reliée à la terre ou porter un bracelet antistatique.';
const VIS = 'r:Classer les vis par étape sur un tapis magnétique ou une feuille annotée : leurs longueurs diffèrent souvent.';
const DONNEES = '!Demander au participant si ses données sont sauvegardées avant toute intervention sur le disque ou le système.';

const SOURCES: FicheSource[] = [
  // ---------------------------------------------------------------- Portables
  {
    id: 'portable-ssd',
    titre: 'Portable lent : remplacer le disque dur par un SSD (avec clonage)',
    appareil: 'Ordinateur portable (disque 2,5 po SATA ou M.2)',
    categories: ['laptop'],
    domaines: ['lenteur_os'],
    difficulte: 'Moyen',
    duree: '45 - 90 min',
    intro:
      'Un disque mécanique est la première cause de lenteur sur un portable de plus de 5 ans. Le passage à un SSD redonne souvent plusieurs années de vie, sans réinstaller le système grâce au clonage.',
    outils: ['Tournevis cruciforme PH0 et PH1', 'Spatule en plastique', 'Boîtier ou adaptateur USB vers SATA/NVMe', 'Clé USB avec Clonezilla ou Rescuezilla'],
    pieces: ['SSD SATA 2,5 po ou M.2 (vérifier le format et la clé B/M)', 'Vis de fixation M.2 si absente'],
    recherche: 'laptop hard drive replacement SSD',
    etapes: [
      ['Vérifier le format du disque', [
        DONNEES,
        'Noter le modèle exact (étiquette sous l’appareil) et chercher le type d’emplacement : baie 2,5 po SATA, M.2 SATA (clé B+M) ou M.2 NVMe (clé M).',
        'Vérifier que le SSD neuf a une capacité au moins égale à l’espace occupé sur l’ancien disque (pas forcément sa taille totale).',
        'i:Sous Windows, Gestionnaire des tâches > Performance indique HDD ou SSD. Un HDD à 100 % en continu confirme le diagnostic.'
      ]],
      ['Cloner l’ancien disque vers le SSD', [
        'Brancher le SSD neuf au portable par l’adaptateur USB.',
        'Démarrer sur la clé Rescuezilla ou Clonezilla et choisir « Cloner » : source = disque interne, destination = SSD en USB.',
        '!Vérifier deux fois la destination : le clonage efface tout le disque de destination.',
        'i:Si le SSD est plus petit, réduire d’abord la partition Windows (Gestion des disques) puis cloner.'
      ]],
      ['Ouvrir le portable', [
        SECURITE_PORTABLE,
        SECURITE_ESD,
        'Retirer les vis du capot inférieur, puis décliper le capot avec la spatule en partant d’un coin, sans forcer près des charnières.',
        VIS
      ]],
      ['Remplacer le disque', [
        'Retirer la vis ou le support du disque, puis le faire glisser hors de son connecteur à plat, sans faire levier sur la nappe.',
        'Transférer le cadre ou les rails sur le SSD et l’insérer dans le même sens.',
        'Pour un M.2 : insérer à 30°, rabattre, puis visser sans serrer fort.',
        'Rebrancher la batterie et refermer le capot.'
      ]],
      ['Démarrer et vérifier', [
        'Allumer : le système doit démarrer comme avant, en beaucoup moins de temps.',
        'Si le portable ne trouve pas de système, ouvrir le BIOS/UEFI et choisir le SSD comme premier périphérique de démarrage.',
        'Remettre l’ancien disque au participant ou l’effacer devant lui s’il le demande (données personnelles).'
      ]]
    ]
  },
  {
    id: 'portable-ram',
    titre: 'Ajouter ou remplacer la mémoire vive (RAM SO-DIMM) d’un portable',
    appareil: 'Ordinateur portable avec RAM non soudée',
    categories: ['laptop'],
    domaines: ['lenteur_os'],
    difficulte: 'Facile',
    duree: '15 - 30 min',
    intro:
      'Avec 4 Go ou moins, un portable récent sature dès qu’un navigateur est ouvert. Ajouter une barrette est souvent la réparation la plus rentable, si la mémoire n’est pas soudée.',
    outils: ['Tournevis cruciforme PH0', 'Spatule en plastique', 'Clé USB MemTest86 (facultatif)'],
    pieces: ['Barrette SO-DIMM du même type (DDR3L, DDR4 ou DDR5) et fréquence compatible'],
    recherche: 'laptop RAM replacement',
    etapes: [
      ['Identifier la mémoire compatible', [
        'Lire la quantité et le type de RAM installés (Gestionnaire des tâches > Performance > Mémoire, ou sudo dmidecode -t memory sous Linux).',
        'Vérifier dans la fiche du fabricant le maximum accepté et le nombre d’emplacements libres.',
        'i:Les DDR3 et DDR3L ont le même détrompeur : un portable DDR3L peut refuser une barrette DDR3 1,5 V.',
        '!Sur beaucoup d’ultraportables, la RAM est soudée : inutile d’ouvrir si la fiche l’indique.'
      ]],
      ['Ouvrir et accéder aux emplacements', [
        SECURITE_PORTABLE,
        SECURITE_ESD,
        'Retirer le capot inférieur ou la trappe mémoire. Les barrettes sont parfois sous un film ou une plaque métallique.'
      ]],
      ['Installer la barrette', [
        'Pour retirer une barrette : écarter doucement les deux clips latéraux, elle se relève à 30°, puis la tirer.',
        'Insérer la nouvelle barrette à 30°, encoche alignée, bien au fond du connecteur, puis la rabattre jusqu’au déclic des clips.',
        'r:Ne toucher que les bords de la barrette, jamais les contacts dorés.'
      ]],
      ['Vérifier', [
        'Rebrancher la batterie, démarrer et vérifier que la quantité totale de RAM est reconnue.',
        'Si le portable bipe ou reste noir : réinsérer la barrette, puis tester chaque barrette seule dans le premier emplacement.',
        'i:Un passage de MemTest86 (une passe, environ 20 min) confirme qu’il n’y a pas d’erreur mémoire.'
      ]]
    ]
  },
  {
    id: 'portable-prise-charge',
    titre: 'Portable qui ne charge plus : chargeur, prise DC ou port USB-C',
    appareil: 'Ordinateur portable',
    categories: ['laptop'],
    domaines: ['alimentation', 'batterie'],
    difficulte: 'Moyen',
    duree: '20 - 60 min',
    intro:
      'Avant de conclure à une carte mère morte, on vérifie chaque maillon : chargeur, câble, prise, batterie. La prise DC desserrée ou le câble coupé sont les causes les plus fréquentes.',
    outils: ['Multimètre', 'Chargeur de test compatible', 'Tournevis PH0 et PH1', 'Spatule en plastique', 'Lampe de poche'],
    pieces: ['Chargeur de même tension et puissance égale ou supérieure', 'Prise DC (jack) ou câble DC-in du modèle'],
    recherche: 'laptop DC jack replacement',
    etapes: [
      ['Tester le chargeur', [
        'Lire sur l’étiquette du chargeur la tension (souvent 19 V ou 20 V) et la puissance (W).',
        'Mesurer au multimètre la tension à la fiche : centre et extérieur. Une tension nulle ou instable = chargeur ou câble défectueux.',
        'Plier doucement le câble près des deux extrémités en surveillant le voyant : un faux contact indique un fil coupé.',
        '!Ne jamais réparer un chargeur 120 V au ruban adhésif : le remplacer.'
      ]],
      ['Tester avec un autre chargeur', [
        'Brancher un chargeur sain de même tension et de puissance égale ou supérieure.',
        'Pour l’USB-C, utiliser un chargeur Power Delivery d’au moins 45 W : un chargeur de téléphone ne suffit pas.',
        'Si le portable charge, le diagnostic est terminé : chargeur à remplacer.'
      ]],
      ['Inspecter la prise de l’ordinateur', [
        'Éclairer la prise : broche centrale tordue, débris, traces de brûlé ?',
        'Bouger la fiche branchée : si le voyant clignote, la prise est desserrée ou ses soudures sont fêlées.',
        'Souffler la poussière ou retirer les débris avec un cure-dent en bois, jamais en métal.'
      ]],
      ['Remplacer la prise DC', [
        SECURITE_PORTABLE,
        'Sur la majorité des portables récents, la prise est sur un petit câble (DC-in) : la débrancher de la carte mère et dévisser son support.',
        'Installer la pièce du même numéro, faire passer le câble par le même chemin et la rebrancher.',
        'i:Si la prise est soudée sur la carte mère, la réparation demande une station de dessoudage : orienter vers un technicien expérimenté.'
      ]],
      ['Vérifier la charge', [
        'Rebrancher la batterie, brancher le chargeur : le voyant de charge doit s’allumer.',
        'Dans le système, vérifier que l’état passe à « En charge ». Sinon, consulter la fiche batterie.'
      ]]
    ]
  },
  {
    id: 'portable-pile-cmos',
    titre: 'Heure et date qui se réinitialisent : remplacer la pile CMOS',
    appareil: 'Portable ou PC tour',
    categories: ['laptop', 'pc_tour'],
    domaines: ['alimentation'],
    difficulte: 'Facile',
    duree: '15 - 30 min',
    intro:
      'Une pile CMOS épuisée provoque une heure fausse à chaque démarrage, des erreurs « CMOS checksum » ou des paramètres BIOS perdus, et parfois un démarrage impossible.',
    outils: ['Tournevis cruciforme', 'Spatule en plastique', 'Multimètre (facultatif)'],
    pieces: ['Pile CR2032 (bouton ou avec fil et connecteur selon le modèle)'],
    recherche: 'CMOS battery replacement',
    etapes: [
      ['Confirmer le symptôme', [
        'Débrancher l’appareil quelques minutes, rallumer et entrer dans le BIOS : si la date est revenue à une valeur par défaut, la pile est en cause.',
        'i:Une CR2032 neuve mesure environ 3 V ; en dessous de 2,5 V elle est à remplacer.'
      ]],
      ['Accéder à la pile', [
        SECURITE_PORTABLE,
        'Sur un PC tour : débrancher le cordon d’alimentation, ouvrir le panneau latéral ; la pile est sur la carte mère.',
        'Sur un portable, la pile est souvent sous un film noir avec un fil et un petit connecteur.'
      ]],
      ['Remplacer la pile', [
        'Pile bouton : appuyer sur la languette pour la libérer, insérer la neuve face « + » visible.',
        'Pile à fil : débrancher le connecteur en tirant sur le connecteur, pas sur les fils, puis coller la nouvelle pile au même endroit.',
        '!Ne pas utiliser d’outil métallique pour soulever la pile : risque de court-circuit.'
      ]],
      ['Régler et vérifier', [
        'Remonter, démarrer dans le BIOS, régler la date et l’heure, puis enregistrer (souvent F10).',
        'Remettre le mode de démarrage d’origine (UEFI ou Legacy) si le système ne démarre plus.',
        'r:Déposer l’ancienne pile au bac de recyclage des piles.'
      ]]
    ]
  },
  {
    id: 'portable-charniere',
    titre: 'Charnière d’écran cassée, raide ou boîtier qui s’ouvre',
    appareil: 'Ordinateur portable',
    categories: ['laptop'],
    domaines: ['ecran'],
    difficulte: 'Difficile',
    duree: '45 - 90 min',
    intro:
      'Une charnière bloquée finit par arracher ses inserts dans la coque et peut couper la nappe d’écran. Agir tôt évite une réparation plus coûteuse.',
    outils: ['Tournevis PH0 et PH1', 'Spatules en plastique', 'Colle époxy bi-composant', 'Pince à épiler'],
    pieces: ['Charnières du modèle (gauche et droite)', 'Inserts filetés en laiton si arrachés'],
    recherche: 'laptop hinge replacement',
    etapes: [
      ['Évaluer les dégâts', [
        'Ouvrir et fermer doucement l’écran : la coque s’écarte-t-elle près d’une charnière ? Un craquement indique un insert arraché.',
        '!Ne plus ouvrir l’écran en force tant que la charnière n’est pas réparée : la nappe d’écran passe à côté.'
      ]],
      ['Démonter le cadre d’écran', [
        SECURITE_PORTABLE,
        'Retirer les caches des vis du cadre (patins en caoutchouc), puis décliper le cadre avec une spatule en partant du bas.',
        VIS,
        'i:Sur certains modèles, il faut d’abord retirer le capot inférieur et dévisser les charnières côté base.'
      ]],
      ['Réparer ou remplacer la charnière', [
        'Dévisser la charnière de la dalle et de la coque arrière.',
        'Si un insert fileté est arraché : le recoller à l’époxy dans son logement, laisser durcir le temps indiqué avant de revisser.',
        'Installer la charnière neuve ; ne pas lubrifier une charnière à friction.'
      ]],
      ['Remonter et tester', [
        'Vérifier que la nappe d’écran n’est pas pincée avant de refermer le cadre.',
        'Rebrancher la batterie, démarrer et ouvrir et fermer l’écran plusieurs fois en surveillant l’image.'
      ]]
    ]
  },
  {
    id: 'portable-clavier',
    titre: 'Clavier de portable : liquide renversé, touches mortes ou remplacement',
    appareil: 'Ordinateur portable',
    categories: ['laptop'],
    domaines: ['clavier_ports'],
    difficulte: 'Moyen',
    duree: '30 - 120 min',
    intro:
      'Après un liquide renversé, la priorité est de couper l’alimentation et de sécher. Ensuite, on teste au clavier externe pour savoir si seul le clavier est atteint.',
    outils: ['Clavier USB externe', 'Alcool isopropylique 90 % ou plus', 'Brosse antistatique', 'Spatules en plastique', 'Tournevis PH0'],
    pieces: ['Clavier du modèle exact (disposition canadienne-française ou autre)'],
    recherche: 'laptop keyboard replacement',
    etapes: [
      ['Liquide renversé : mise en sécurité', [
        '!Éteindre immédiatement, débrancher le chargeur et retirer ou débrancher la batterie. Ne pas rallumer « pour voir ».',
        'Retourner le portable ouvert en V inversé pour que le liquide s’écoule hors du clavier.',
        'Ouvrir le capot, inspecter la carte mère : nettoyer toute trace de liquide ou de corrosion à l’alcool isopropylique et à la brosse.',
        'i:Le riz ne sèche pas mieux que l’air libre. Laisser sécher au moins 24 h dans un endroit ventilé.'
      ]],
      ['Diagnostiquer', [
        'Brancher un clavier USB externe : s’il fonctionne, le problème vient du clavier interne ou de sa nappe.',
        'Tester les touches mortes dans un éditeur de texte ou sur un site de test hors ligne.',
        'Vérifier que la nappe du clavier est bien insérée et verrouillée dans son connecteur.'
      ]],
      ['Remplacer le clavier', [
        SECURITE_PORTABLE,
        'Selon le modèle : clavier clipsé par le dessus (languettes sous la rangée du haut), ou clavier riveté au repose-mains.',
        'Déverrouiller le connecteur ZIF (lever le volet), retirer la nappe, installer le clavier neuf et refermer le volet.',
        'i:Clavier riveté : le remplacement du repose-mains complet est souvent plus simple.'
      ]],
      ['Tester', [
        'Démarrer et tester toutes les touches, le rétroéclairage et le pavé tactile (qui partage parfois la nappe).'
      ]]
    ]
  },
  {
    id: 'portable-pate-thermique',
    titre: 'Surchauffe et arrêts brusques : changer la pâte thermique du processeur',
    appareil: 'Portable ou PC tour',
    categories: ['laptop', 'pc_tour'],
    domaines: ['surchauffe'],
    difficulte: 'Moyen',
    duree: '45 - 75 min',
    intro:
      'Après 4 à 6 ans, la pâte thermique sèche et le processeur chauffe même après dépoussiérage. La changer fait souvent baisser la température de 10 à 20 °C.',
    outils: ['Tournevis PH0 et PH1', 'Alcool isopropylique 90 % ou plus', 'Chiffon non pelucheux ou filtres à café', 'Spatule en plastique'],
    pieces: ['Pâte thermique non conductrice', 'Pads thermiques de même épaisseur si abîmés'],
    recherche: 'laptop thermal paste replacement',
    etapes: [
      ['Mesurer avant de démonter', [
        'Noter la température du processeur au repos et en charge (HWMonitor sous Windows, sensors sous Linux).',
        'i:Au-delà de 90 °C en charge ou d’un arrêt brusque, la dissipation est en cause. Commencer par la fiche de dépoussiérage si les grilles sont bouchées.'
      ]],
      ['Retirer le dissipateur', [
        SECURITE_PORTABLE,
        SECURITE_ESD,
        'Débrancher le câble du ventilateur. Dévisser les vis du dissipateur dans l’ordre inverse des numéros gravés.',
        'Soulever le dissipateur doucement ; s’il colle, le tourner très légèrement plutôt que de tirer.'
      ]],
      ['Nettoyer et appliquer la pâte', [
        'Retirer l’ancienne pâte du processeur et du dissipateur avec l’alcool isopropylique jusqu’à obtenir des surfaces brillantes.',
        'Déposer une petite quantité de pâte au centre de la puce (la taille d’un grain de riz pour un portable).',
        '!Vérifier que les pads thermiques des autres puces sont intacts et à leur place ; ne jamais les remplacer par de la pâte.'
      ]],
      ['Remonter et vérifier', [
        'Reposer le dissipateur bien à plat, serrer les vis dans l’ordre des numéros, en croix, sans forcer.',
        'Rebrancher ventilateur et batterie, démarrer et comparer les températures avec celles notées au début.'
      ]]
    ]
  },
  {
    id: 'portable-wifi-carte',
    titre: 'Wi-Fi absent ou très faible : carte M.2 et antennes',
    appareil: 'Ordinateur portable',
    categories: ['laptop'],
    domaines: ['wifi'],
    difficulte: 'Moyen',
    duree: '30 - 60 min',
    intro:
      'Quand le Wi-Fi a disparu du système ou capte mal à deux mètres du routeur, la cause est souvent matérielle : antenne débranchée, carte défectueuse ou carte bloquée par le BIOS.',
    outils: ['Tournevis PH0', 'Spatule en plastique', 'Pince à épiler', 'Adaptateur Wi-Fi USB de test'],
    pieces: ['Carte Wi-Fi M.2 2230 compatible (attention aux listes blanches de certains BIOS)'],
    recherche: 'laptop wifi card replacement',
    etapes: [
      ['Écarter les causes logicielles', [
        'Vérifier le mode avion, l’interrupteur ou la touche Wi-Fi (Fn), et la fiche Wi-Fi et réseau pour les pilotes.',
        'Brancher un adaptateur Wi-Fi USB : s’il fonctionne, le réseau et le système sont en cause du côté de la carte interne.',
        'i:Sous Linux, rfkill list indique si la carte est bloquée par le matériel ou le logiciel.'
      ]],
      ['Inspecter la carte et les antennes', [
        SECURITE_PORTABLE,
        'Repérer la petite carte M.2 avec deux fils fins (noir et blanc, ou gris) clipsés dessus.',
        'Vérifier que les deux connecteurs d’antenne sont bien enfoncés : appuyer verticalement jusqu’au déclic.',
        '!Les connecteurs d’antenne sont fragiles : les retirer en soulevant verticalement avec la pince, jamais en tirant sur le fil.'
      ]],
      ['Remplacer la carte', [
        'Débrancher les antennes, retirer la vis, la carte se relève à 30°, la sortir.',
        'Installer la nouvelle carte, la visser, puis rebrancher les antennes au même emplacement (principal/MAIN et auxiliaire/AUX).',
        'i:Les portables Lenovo et HP plus anciens peuvent refuser une carte non autorisée (erreur 1802 ou 104) : choisir une carte de la liste du fabricant.'
      ]],
      ['Vérifier', [
        'Démarrer, installer le pilote si besoin et tester la connexion à quelques mètres du point d’accès.'
      ]]
    ]
  },
  {
    id: 'portable-batterie-gonflee',
    titre: 'Batterie gonflée ou pavé tactile soulevé : retrait sécuritaire',
    appareil: 'Ordinateur portable',
    categories: ['laptop'],
    domaines: ['batterie'],
    difficulte: 'Moyen',
    duree: '20 - 45 min',
    intro:
      'Une batterie lithium gonflée peut prendre feu si elle est percée ou pliée. Le pavé tactile qui se soulève ou la coque déformée sont des signes d’alerte.',
    outils: ['Spatules en plastique (aucun outil métallique)', 'Tournevis PH0', 'Lunettes de protection', 'Bac métallique ou sable pour l’isolement'],
    pieces: ['Batterie neuve du numéro de pièce exact (lire l’étiquette de la batterie)'],
    recherche: 'laptop battery replacement swollen',
    etapes: [
      ['Mettre en sécurité', [
        '!Ne jamais charger ni allumer un portable dont la batterie est gonflée. Débrancher le chargeur.',
        '!Ne pas percer, plier ni comprimer la batterie. Travailler loin des matières inflammables, lunettes sur le nez.',
        'Expliquer au participant le risque et le fait que l’appareil reste utilisable sur secteur après le retrait.'
      ]],
      ['Ouvrir sans comprimer', [
        'Retirer les vis du capot. La batterie pousse le capot : le soulever doucement, sans appuyer dessus.',
        'Débrancher en premier le connecteur de la batterie de la carte mère.'
      ]],
      ['Retirer la batterie', [
        'Dévisser la batterie. Si elle est collée, glisser de l’alcool isopropylique sous les bandes et attendre, plutôt que de faire levier.',
        '!Si la batterie chauffe, fume ou siffle : la sortir à l’extérieur sur une surface incombustible et appeler le responsable de la sécurité.',
        'Placer la batterie dans un sac ou bac isolé, bornes recouvertes de ruban adhésif.'
      ]],
      ['Installer la neuve et recycler', [
        'Installer la batterie de même numéro de pièce, rebrancher, refermer.',
        'Charger complètement une première fois en surveillant la température.',
        'r:Déposer l’ancienne batterie dans un point de collecte Appel à Recycler, jamais aux ordures.'
      ]]
    ]
  },
  {
    id: 'portable-retroeclairage',
    titre: 'Écran très sombre ou noir mais image visible à la lampe',
    appareil: 'Ordinateur portable',
    categories: ['laptop'],
    domaines: ['ecran'],
    difficulte: 'Moyen',
    duree: '20 - 60 min',
    intro:
      'Si une image faible apparaît en éclairant l’écran avec une lampe, la dalle fonctionne mais son rétroéclairage est éteint : réglage, capteur de fermeture, nappe ou dalle.',
    outils: ['Lampe de poche', 'Écran externe et câble HDMI', 'Tournevis PH0', 'Spatules en plastique'],
    pieces: ['Dalle de même référence (lire l’étiquette au dos de la dalle)', 'Nappe eDP/LVDS si endommagée'],
    recherche: 'laptop screen replacement',
    etapes: [
      ['Tests sans démonter', [
        'Éclairer l’écran de biais avec une lampe : une image faible = rétroéclairage. Aucune image = dalle, nappe ou carte graphique.',
        'Augmenter la luminosité (touches Fn) et désactiver la luminosité adaptative.',
        'Brancher un écran externe : s’il affiche bien, la carte graphique est saine.',
        'i:Un aimant qui passe près du capteur de fermeture peut éteindre l’écran : tester loin de tout objet aimanté.'
      ]],
      ['Vérifier la nappe', [
        SECURITE_PORTABLE,
        'Ouvrir et fermer lentement l’écran en surveillant l’image : un clignotement indique une nappe usée au niveau de la charnière.',
        'Reconnecter fermement la nappe côté carte mère et côté dalle.'
      ]],
      ['Remplacer la dalle', [
        'Retirer le cadre, dévisser la dalle, la basculer vers l’avant sur un chiffon propre.',
        'Décoller le ruban qui maintient le connecteur, débrancher la nappe en la tirant droit.',
        'Brancher la nouvelle dalle, tester AVANT de tout revisser, puis remonter.',
        '!Commander par la référence imprimée au dos de la dalle (résolution, nombre de broches 30 ou 40, fixation) et non par le seul modèle du portable.'
      ]]
    ]
  },
  // ---------------------------------------------------------------- PC tour
  {
    id: 'tour-bloc-alimentation',
    titre: 'PC tour qui ne s’allume pas : tester et remplacer le bloc d’alimentation',
    appareil: 'PC tour (bloc ATX)',
    categories: ['pc_tour'],
    domaines: ['alimentation'],
    difficulte: 'Moyen',
    duree: '30 - 60 min',
    intro:
      'Aucun ventilateur, aucun voyant : le bloc d’alimentation est le premier suspect, avec le bouton de façade. On le teste avant de suspecter la carte mère.',
    outils: ['Testeur de bloc ATX ou trombone isolé', 'Multimètre', 'Tournevis cruciforme', 'Bloc d’alimentation de test'],
    pieces: ['Bloc ATX de puissance suffisante et de qualité certifiée 80 Plus'],
    recherche: 'desktop power supply replacement',
    etapes: [
      ['Vérifications externes', [
        'Vérifier la prise murale, le cordon et l’interrupteur 0/I à l’arrière du bloc.',
        '!Ne jamais ouvrir le boîtier d’un bloc d’alimentation : ses condensateurs restent chargés à une tension dangereuse.'
      ]],
      ['Tester le bouton de façade', [
        'Débrancher le cordon, ouvrir le panneau latéral, repérer les fils du bouton (PWR SW) sur la carte mère.',
        'Rebrancher le cordon et faire contact brièvement entre les deux broches PWR SW avec un tournevis : si le PC démarre, le bouton est en cause.'
      ]],
      ['Tester le bloc', [
        'Débrancher le connecteur 24 broches de la carte mère et le brancher sur un testeur ATX.',
        'i:Sans testeur : relier le fil vert (PS_ON) à un fil noir avec un trombone isolé, puis brancher le cordon : le ventilateur du bloc doit tourner.',
        'Mesurer les tensions : 12 V, 5 V et 3,3 V à plus ou moins 5 %.'
      ]],
      ['Remplacer le bloc', [
        'Noter et débrancher tous les câbles (24 broches, 4/8 broches processeur, SATA, PCIe).',
        'Dévisser les 4 vis à l’arrière et sortir le bloc.',
        'Installer le neuf, rebrancher chaque câble, ranger les câbles pour ne pas gêner les ventilateurs.',
        'Démarrer et vérifier que le système est stable.'
      ]]
    ]
  },
  {
    id: 'tour-bips-memoire',
    titre: 'PC qui bipe ou reste à l’écran noir : mémoire, carte graphique et réinitialisation',
    appareil: 'PC tour',
    categories: ['pc_tour'],
    domaines: ['alimentation', 'ecran'],
    difficulte: 'Facile',
    duree: '20 - 45 min',
    intro:
      'Les ventilateurs tournent mais rien ne s’affiche : on isole le composant en cause en partant de la configuration minimale (processeur, une barrette, carte graphique intégrée).',
    outils: ['Tournevis cruciforme', 'Gomme blanche', 'Clé USB MemTest86', 'Bracelet antistatique'],
    pieces: ['Barrette RAM de test compatible', 'Pile CR2032'],
    recherche: 'computer won\'t boot no display',
    etapes: [
      ['Lire les signaux', [
        'Compter les bips ou observer les voyants de diagnostic de la carte mère (CPU, DRAM, VGA, BOOT).',
        'Chercher la signification dans le manuel de la carte mère : elle varie selon le fabricant (AMI, Award, Dell, HP).'
      ]],
      ['Configuration minimale', [
        '!Débrancher le cordon d’alimentation et attendre que le voyant de la carte mère s’éteigne avant de retirer une pièce.',
        SECURITE_ESD,
        'Retirer toutes les barrettes sauf une, puis les disques et cartes d’extension.',
        'Brancher l’écran sur la sortie de la carte mère si le processeur a une puce graphique intégrée.',
        'Démarrer. Si l’image revient, réinstaller les pièces une à une.'
      ]],
      ['Nettoyer et réinsérer', [
        'Frotter les contacts de la RAM à la gomme blanche, puis souffler la poussière des connecteurs.',
        'Réinsérer chaque barrette jusqu’au déclic des deux clips.',
        'Réinitialiser le BIOS : retirer la pile CMOS 1 minute ou utiliser le cavalier CLR_CMOS.'
      ]],
      ['Confirmer', [
        'Tester chaque barrette seule. Une barrette qui empêche le démarrage est à remplacer.',
        'Lancer une passe de MemTest86 sur la configuration finale.'
      ]]
    ]
  },
  {
    id: 'tour-nettoyage',
    titre: 'PC tour bruyant ou qui chauffe : nettoyage complet et ventilateurs',
    appareil: 'PC tour',
    categories: ['pc_tour'],
    domaines: ['surchauffe'],
    difficulte: 'Facile',
    duree: '30 - 45 min',
    intro:
      'La poussière bouche les filtres et les radiateurs : les ventilateurs tournent plus vite et plus fort. Un bon nettoyage règle la plupart des PC bruyants.',
    outils: ['Air comprimé ou souffleur électrique', 'Pinceau antistatique', 'Tournevis cruciforme', 'Chiffon microfibre'],
    pieces: ['Ventilateur de même taille (80, 92, 120 ou 140 mm) et connecteur (3 ou 4 broches)'],
    recherche: 'desktop computer cleaning dust fan',
    etapes: [
      ['Préparer', [
        'Éteindre, débrancher le cordon, sortir le PC à l’extérieur ou au-dessus d’une poubelle si possible.',
        SECURITE_ESD
      ]],
      ['Souffler la poussière', [
        'Bloquer chaque ventilateur avec un doigt ou un bâtonnet avant de souffler : un ventilateur qui tourne trop vite peut s’abîmer.',
        'Souffler par petites rafales le radiateur du processeur, la carte graphique, le bloc d’alimentation (par sa grille) et les filtres.',
        '!Tenir la bombe d’air comprimé droite : retournée, elle projette un liquide glacé.'
      ]],
      ['Repérer le ventilateur bruyant', [
        'Rebrancher, démarrer le panneau ouvert, et arrêter un ventilateur à la fois du bout du doigt (par le moyeu) pour localiser le bruit.',
        'Un ventilateur qui grince ou vibre est à remplacer ; la lubrification ne dure que quelques semaines.'
      ]],
      ['Remplacer et vérifier', [
        'Installer un ventilateur de même taille, dans le même sens de flux (flèche sur le côté), et le brancher sur le même connecteur.',
        'Vérifier les températures et le bruit en charge.'
      ]]
    ]
  },
  {
    id: 'tour-pas-affichage',
    titre: 'Pas d’image sur l’écran : câble, sortie vidéo et carte graphique',
    appareil: 'PC tour',
    categories: ['pc_tour'],
    domaines: ['ecran'],
    difficulte: 'Facile',
    duree: '15 - 30 min',
    intro:
      'Le PC démarre mais l’écran reste noir ou indique « Aucun signal ». Le plus souvent : mauvaise sortie vidéo, mauvaise entrée sur l’écran ou câble défectueux.',
    outils: ['Câble HDMI ou DisplayPort de test', 'Écran de test', 'Tournevis cruciforme'],
    pieces: ['Câble vidéo', 'Carte graphique de test si disponible'],
    recherche: 'desktop no display graphics card',
    etapes: [
      ['Vérifier l’écran et le câble', [
        'Choisir la bonne entrée sur l’écran (bouton Source ou Input).',
        'Tester avec un autre câble et un autre écran connu.'
      ]],
      ['Vérifier la sortie utilisée', [
        'Si une carte graphique est installée, brancher l’écran sur la carte graphique, pas sur la carte mère.',
        'i:Les sorties de la carte mère sont désactivées quand une carte graphique est présente, ou absentes si le processeur n’a pas de puce graphique.'
      ]],
      ['Réinstaller la carte graphique', [
        '!Éteindre et débrancher le cordon d’alimentation avant de retirer ou d’insérer une carte.',
        SECURITE_ESD,
        'Retirer la carte graphique (vis de l’équerre et loquet du connecteur), souffler le connecteur PCIe, la réinsérer jusqu’au déclic.',
        'Vérifier que ses câbles d’alimentation PCIe (6 ou 8 broches) sont branchés.',
        'Tester sans la carte, sur la sortie de la carte mère, pour savoir si elle est en cause.'
      ]]
    ]
  },
  // ---------------------------------------------------------------- Systèmes
  {
    id: 'windows-reinstallation',
    titre: 'Réinstaller Windows 10 ou 11 proprement depuis une clé USB',
    appareil: 'PC ou portable Windows',
    categories: ['laptop', 'pc_tour'],
    os: ['windows'],
    domaines: ['lenteur_os'],
    difficulte: 'Moyen',
    duree: '60 - 120 min',
    intro:
      'Quand le système est trop endommagé ou infecté, une réinstallation propre est plus rapide qu’un nettoyage. La licence numérique se réactive seule si elle était liée à l’appareil.',
    outils: ['Clé USB de 8 Go ou plus avec le support d’installation Microsoft', 'Disque externe pour la sauvegarde'],
    pieces: [],
    recherche: 'Windows clean install USB',
    etapes: [
      ['Sauvegarder', [
        DONNEES,
        'Copier Documents, Bureau, Images, Téléchargements et les favoris du navigateur sur le disque externe.',
        'Noter les logiciels à réinstaller et vérifier que le participant connaît ses mots de passe (courriel, compte Microsoft).'
      ]],
      ['Démarrer sur la clé', [
        'Brancher la clé, redémarrer et ouvrir le menu de démarrage (F12, F9, Échap ou F8 selon la marque).',
        'Choisir la clé en mode UEFI.',
        'i:Windows 11 exige TPM 2.0 et Secure Boot : sur un appareil non admissible, rester sur Windows 10 ou proposer Linux.'
      ]],
      ['Installer', [
        'Choisir « Je n’ai pas de clé de produit » si la licence est numérique, puis l’édition installée auparavant (Famille ou Pro).',
        'Choisir « Personnalisé », supprimer les partitions du disque système uniquement, puis installer sur l’espace non alloué.',
        '!Vérifier le disque sélectionné : un second disque de données ne doit pas être effacé.'
      ]],
      ['Finaliser', [
        'Créer le compte avec le participant, lancer Windows Update jusqu’à ce qu’il n’y ait plus rien.',
        'Restaurer les fichiers sauvegardés et vérifier l’activation (Paramètres > Activation).'
      ]]
    ]
  },
  {
    id: 'linux-mint-installation',
    titre: 'Fin de Windows 10 : installer Linux Mint et garder les données',
    appareil: 'PC ou portable non admissible à Windows 11',
    categories: ['laptop', 'pc_tour'],
    os: ['windows', 'linux'],
    domaines: ['linux', 'lenteur_os'],
    difficulte: 'Facile',
    duree: '45 - 90 min',
    intro:
      'Un ordinateur refusé par Windows 11 peut rester sûr et rapide avec Linux Mint. On essaie d’abord en session Live pour vérifier que tout fonctionne (Wi-Fi, son, imprimante).',
    outils: ['Clé USB de 8 Go ou plus avec Linux Mint (Ventoy conseillé)', 'Disque externe pour la sauvegarde'],
    pieces: [],
    recherche: 'install Linux Mint',
    etapes: [
      ['Préparer avec le participant', [
        DONNEES,
        'Expliquer ce qui change : les logiciels Windows ne s’installent pas tels quels ; vérifier ses besoins (navigateur, bureautique, photos).',
        'Sauvegarder les fichiers personnels sur le disque externe.'
      ]],
      ['Essayer en session Live', [
        'Démarrer sur la clé (menu de démarrage F12, F9 ou Échap) et choisir « Start Linux Mint ».',
        'Tester le Wi-Fi, le son, la webcam, le pavé tactile et la mise en veille.',
        'i:Si le Secure Boot bloque le démarrage, le désactiver temporairement dans le BIOS.'
      ]],
      ['Installer', [
        'Lancer « Install Linux Mint », cocher l’installation des codecs multimédias.',
        'Choisir « Effacer le disque et installer » ou, si le participant le demande, l’installation à côté de Windows.',
        'Créer le compte avec un mot de passe que le participant choisit lui-même.'
      ]],
      ['Finaliser', [
        'Lancer le gestionnaire de mises à jour et le gestionnaire de pilotes.',
        'Restaurer les fichiers et installer les logiciels demandés depuis la logithèque.',
        'Remettre au participant la fiche de prise en main et le lien du groupe d’entraide.'
      ]]
    ]
  },
  {
    id: 'sauvetage-donnees',
    titre: 'Récupérer les fichiers d’un ordinateur qui ne démarre plus',
    appareil: 'Portable ou PC tour',
    categories: ['laptop', 'pc_tour'],
    domaines: ['lenteur_os', 'linux'],
    difficulte: 'Facile',
    duree: '20 - 90 min',
    intro:
      'Tant que le disque répond, on peut copier les fichiers depuis une clé Linux Live sans toucher au système. Si le disque fait des clics, on arrête tout pour ne pas l’abîmer davantage.',
    outils: ['Clé USB Linux Live', 'Disque externe vide', 'Adaptateur USB vers SATA/NVMe'],
    pieces: [],
    recherche: 'recover data from computer that won\'t boot',
    etapes: [
      ['Évaluer le disque', [
        '!Si le disque claque, cliquette ou n’est plus reconnu : ne pas insister. Le confier à un service spécialisé si les données sont précieuses.',
        'Démarrer sur la clé Live et ouvrir l’utilitaire Disques pour lire l’état SMART.'
      ]],
      ['Accéder aux fichiers', [
        'Ouvrir le gestionnaire de fichiers : le disque interne apparaît dans la colonne de gauche.',
        'i:Si Windows refuse le montage (veille prolongée ou démarrage rapide), monter en lecture seule ou désactiver le démarrage rapide depuis Windows.',
        'r:Un disque chiffré BitLocker demande la clé de récupération, liée au compte Microsoft du participant.'
      ]],
      ['Copier en priorité', [
        'Copier d’abord le plus précieux : Images, Documents, Bureau, puis le reste.',
        'Vérifier sur le disque externe que les fichiers s’ouvrent.',
        'Si le disque ralentit ou se déconnecte, utiliser ddrescue pour faire une image complète avant d’aller plus loin.'
      ]]
    ]
  },
  {
    id: 'windows-logiciels-malveillants',
    titre: 'Fenêtres publicitaires, navigateur détourné : nettoyer les logiciels malveillants',
    appareil: 'PC ou portable Windows',
    categories: ['laptop', 'pc_tour'],
    os: ['windows'],
    domaines: ['lenteur_os'],
    difficulte: 'Facile',
    duree: '30 - 60 min',
    intro:
      'Les publicités envahissantes, une page d’accueil changée ou des extensions inconnues viennent souvent d’un logiciel installé « en prime ». On les retire, puis on analyse le système.',
    outils: ['Microsoft Defender (inclus)', 'Clé USB avec un outil d’analyse hors ligne à jour'],
    pieces: [],
    recherche: 'remove malware Windows',
    etapes: [
      ['Désinstaller ce qui est suspect', [
        DONNEES,
        'Paramètres > Applications : trier par date d’installation et retirer, avec le participant, les logiciels inconnus ou installés le même jour que le problème.',
        '!Ne jamais retirer un logiciel sans l’accord du participant.'
      ]],
      ['Nettoyer les navigateurs', [
        'Retirer les extensions inconnues dans chaque navigateur.',
        'Réinitialiser les paramètres du navigateur (page d’accueil, moteur de recherche) et désactiver les notifications des sites douteux.'
      ]],
      ['Analyser le système', [
        'Lancer l’analyse complète de Microsoft Defender, puis l’analyse hors ligne (redémarre l’ordinateur).',
        'Vérifier les programmes au démarrage (Gestionnaire des tâches > Démarrage).',
        'i:Si un rançongiciel a chiffré des fichiers, ne rien supprimer et orienter le participant vers le Centre canadien pour la cybersécurité.'
      ]],
      ['Prévenir', [
        'Faire les mises à jour Windows et navigateur, et expliquer comment repérer les faux boutons « Télécharger ».',
        'Proposer de changer les mots de passe importants depuis un appareil sain.'
      ]]
    ]
  },
  {
    id: 'mac-lent',
    titre: 'Mac lent ou qui ne démarre pas bien : stockage, démarrage et réinitialisations',
    appareil: 'MacBook ou iMac',
    categories: ['laptop', 'pc_tour'],
    os: ['mac'],
    domaines: ['lenteur_os', 'alimentation'],
    difficulte: 'Facile',
    duree: '20 - 45 min',
    intro:
      'Sur un Mac, la lenteur vient souvent d’un disque presque plein, d’éléments d’ouverture lourds ou d’un vieux disque mécanique (iMac et MacBook avant 2013).',
    outils: ['Clé USB d’installation macOS (facultatif)', 'Disque externe pour Time Machine'],
    pieces: ['SSD compatible (anciens modèles uniquement)'],
    recherche: 'MacBook slow fix SSD',
    etapes: [
      ['Libérer de l’espace', [
        DONNEES,
        'Menu Pomme > À propos de ce Mac > Stockage : garder au moins 15 % d’espace libre.',
        'Vider la corbeille, supprimer les anciennes sauvegardes d’iPhone et les gros téléchargements avec le participant.'
      ]],
      ['Alléger le démarrage', [
        'Réglages Système > Général > Ouverture : retirer les éléments inutiles.',
        'Moniteur d’activité : repérer les processus qui occupent le processeur ou la mémoire.'
      ]],
      ['Réinitialiser', [
        'Mac Intel : réinitialiser la NVRAM (Option + Commande + P + R au démarrage, 20 secondes).',
        'Mac Intel portable : réinitialiser le SMC selon la procédure Apple du modèle (problèmes de charge, ventilateur, veille).',
        'i:Les Mac à puce Apple n’ont pas de NVRAM ni de SMC à réinitialiser : un arrêt complet de 30 secondes suffit.'
      ]],
      ['Vérifier le disque', [
        'Démarrer en mode de récupération et lancer S.O.S. dans Utilitaire de disque.',
        'Sur un ancien modèle à disque mécanique, proposer le passage au SSD (voir la fiche SSD et l’article iFixit du modèle).'
      ]]
    ]
  },
  // ---------------------------------------------------------------- Cellulaires et tablettes
  {
    id: 'cellulaire-batterie',
    titre: 'Cellulaire qui se vide vite ou s’éteint : diagnostic et remplacement de la batterie',
    appareil: 'Cellulaire (Android ou iPhone)',
    categories: ['cellulaire'],
    domaines: ['batterie'],
    difficulte: 'Difficile',
    duree: '45 - 90 min',
    intro:
      'Une batterie de plus de 500 cycles ou sous 80 % de capacité fait s’éteindre le téléphone par temps froid ou en usage intense. Le remplacement est faisable, mais l’ouverture est délicate.',
    outils: ['Ventouse et médiators d’ouverture', 'Plaque chauffante ou séchoir (60 °C)', 'Tournevis de précision (Pentalobe, Tri-wing, PH000)', 'Alcool isopropylique'],
    pieces: ['Batterie du modèle exact', 'Adhésif de batterie et joint d’écran ou de dos neufs'],
    recherche: 'phone battery replacement',
    etapes: [
      ['Confirmer l’usure', [
        'iPhone : Réglages > Batterie > État de la batterie. Android : menu Batterie ou code de diagnostic du fabricant.',
        'Vérifier qu’aucune application ne vide la batterie en arrière-plan avant de conclure.',
        '!Si la batterie est gonflée (écran ou dos qui se soulève), éteindre le téléphone et ne plus le charger.'
      ]],
      ['Ouvrir', [
        'Décharger la batterie sous 25 % avant d’ouvrir : elle est moins dangereuse si elle est percée.',
        'Chauffer le bord de l’écran (iPhone) ou du dos (la plupart des Android) pour ramollir l’adhésif.',
        'Créer un jour avec la ventouse, glisser un médiator et le faire courir le long du bord, sans dépasser 5 mm de profondeur.',
        'i:Sur iPhone, l’écran s’ouvre comme un livre, nappes du côté droit : ne pas tendre les nappes.'
      ]],
      ['Remplacer la batterie', [
        'Retirer la plaque qui couvre le connecteur et débrancher la batterie en premier.',
        'Tirer les languettes d’adhésif lentement et à plat. Si elles cassent, quelques gouttes d’alcool isopropylique sous la batterie aident.',
        '!Ne jamais faire levier sur la batterie avec un outil métallique : risque d’incendie.',
        'Poser la batterie neuve sur un adhésif neuf, rebrancher, puis rebrancher l’écran pour tester avant de refermer.'
      ]],
      ['Refermer', [
        'Poser un joint neuf, refermer et presser quelques minutes.',
        'r:Le téléphone n’est plus étanche après ouverture : prévenir le participant.',
        'Recycler l’ancienne batterie au point de collecte Appel à Recycler.'
      ]]
    ]
  },
  {
    id: 'cellulaire-port-charge',
    titre: 'Cellulaire ou tablette qui charge mal : nettoyer ou remplacer le port de charge',
    appareil: 'Cellulaire ou tablette (USB-C, Lightning, micro-USB)',
    categories: ['cellulaire', 'tablette'],
    domaines: ['alimentation', 'clavier_ports'],
    difficulte: 'Facile',
    duree: '10 - 60 min',
    intro:
      'Un câble qui ne tient plus ou une charge intermittente vient le plus souvent de la poussière de poche tassée au fond du port. Un nettoyage prudent règle la majorité des cas.',
    outils: ['Lampe de poche', 'Cure-dent en bois ou outil en plastique fin', 'Alcool isopropylique', 'Câble et chargeur de test'],
    pieces: ['Port ou nappe de charge du modèle (si le nettoyage ne suffit pas)'],
    recherche: 'charging port cleaning replacement phone',
    etapes: [
      ['Écarter le câble et le chargeur', [
        'Tester avec un câble et un chargeur connus. Un câble abîmé est la cause la plus simple.',
        'Vérifier si le téléphone affiche un avertissement d’humidité dans le port (Android) : le laisser sécher.'
      ]],
      ['Nettoyer le port', [
        '!Éteindre l’appareil. Ne jamais utiliser d’aiguille ou de trombone : on raye les contacts ou on court-circuite les broches.',
        'Éclairer l’intérieur : retirer la bourre tassée au fond en grattant doucement le fond avec le cure-dent, sans toucher la languette centrale (USB-C).',
        'Finir avec un peu d’alcool isopropylique sur la pointe, laisser sécher 5 minutes.'
      ]],
      ['Remplacer le port si besoin', [
        'Si le câble ne tient toujours pas ou si les contacts sont brûlés, remplacer le port.',
        'i:Sur la plupart des Android, le port est sur une petite carte fille vissée ; sur iPhone, il fait partie d’une nappe plus longue.',
        'Suivre l’article iFixit du modèle exact, lié à cette fiche, pour l’ouverture.'
      ]]
    ]
  },
  {
    id: 'cellulaire-ecran',
    titre: 'Écran de cellulaire fissuré ou tactile qui ne répond plus : évaluer et remplacer',
    appareil: 'Cellulaire',
    categories: ['cellulaire'],
    domaines: ['ecran'],
    difficulte: 'Difficile',
    duree: '60 - 120 min',
    intro:
      'On évalue d’abord si seule la vitre est cassée ou si l’affichage est atteint, et on sauvegarde les données. Sur la plupart des téléphones récents, on remplace l’écran complet (vitre et dalle collées).',
    outils: ['Ventouse et médiators d’ouverture', 'Plaque chauffante ou séchoir', 'Tournevis de précision', 'Ruban adhésif d’emballage', 'Lunettes de protection'],
    pieces: ['Écran complet du modèle exact (OLED ou LCD)', 'Joint adhésif d’écran'],
    recherche: 'phone screen replacement',
    etapes: [
      ['Évaluer et sauvegarder', [
        'Vérifier l’affichage (taches, lignes, noir) et le tactile sur toute la surface.',
        'Faire une sauvegarde du téléphone avant l’intervention si l’écran permet encore de le déverrouiller.',
        'i:Un écran de remplacement à bas prix (LCD au lieu d’OLED) consomme plus et affiche moins bien : expliquer le choix au participant.'
      ]],
      ['Protéger et ouvrir', [
        '!Recouvrir la vitre fissurée de ruban adhésif pour retenir les éclats, et porter des lunettes.',
        'Chauffer le pourtour, créer un jour à la ventouse et découper l’adhésif au médiator.',
        'Débrancher la batterie avant les nappes d’écran.'
      ]],
      ['Remplacer l’écran', [
        'Débrancher les nappes d’écran, transférer les pièces fixées à l’ancien écran (capteur, écouteur, support) selon le modèle.',
        'Brancher le nouvel écran, rebrancher la batterie et tester affichage et tactile avant de coller.',
        'r:Sur iPhone, le remplacement de l’écran peut désactiver True Tone ou Face ID si les pièces ne sont pas transférées : suivre l’article iFixit du modèle.'
      ]],
      ['Refermer', [
        'Nettoyer l’ancien adhésif, poser le joint neuf, refermer et presser quelques minutes.',
        'Prévenir le participant que l’étanchéité d’origine n’est plus garantie.'
      ]]
    ]
  },
  {
    id: 'tablette-android-lente',
    titre: 'Tablette ou cellulaire Android lent : nettoyage, mises à jour et réinitialisation',
    appareil: 'Tablette ou cellulaire Android',
    categories: ['tablette', 'cellulaire'],
    domaines: ['lenteur_os'],
    difficulte: 'Très facile',
    duree: '20 - 45 min',
    intro:
      'Un stockage plein et les applications qui tournent en arrière-plan ralentissent les tablettes d’entrée de gamme. On libère de l’espace avant d’envisager une réinitialisation.',
    outils: ['Câble USB et ordinateur pour la sauvegarde des photos'],
    pieces: ['Carte microSD (si la tablette en accepte une)'],
    recherche: 'Android tablet slow factory reset',
    etapes: [
      ['Libérer de l’espace', [
        'Paramètres > Stockage : garder au moins 15 % d’espace libre.',
        'Copier les photos et vidéos sur l’ordinateur ou une carte microSD, avec l’accord du participant.',
        'Vider le cache des applications les plus lourdes et désinstaller celles qui ne servent pas.'
      ]],
      ['Mettre à jour et alléger', [
        'Installer les mises à jour système et celles des applications.',
        'Désactiver les applications préinstallées inutiles et les widgets animés.',
        'i:Mettre à jour Android System WebView et Chrome : des versions trop anciennes rendent les sites et applications lents.'
      ]],
      ['Réinitialiser si nécessaire', [
        '!La réinitialisation efface tout : vérifier la sauvegarde ET que le participant connaît le mot de passe de son compte Google (protection antivol).',
        'Paramètres > Gestion globale (Samsung) ou Système > Réinitialiser > Réinitialisation des données d’usine.',
        'Reconfigurer la tablette avec le participant et ne réinstaller que les applications utiles.'
      ]]
    ]
  },
  {
    id: 'cellulaire-eau',
    titre: 'Cellulaire tombé dans l’eau : premiers gestes et nettoyage de la corrosion',
    appareil: 'Cellulaire ou tablette',
    categories: ['cellulaire', 'tablette'],
    domaines: ['alimentation', 'batterie'],
    difficulte: 'Moyen',
    duree: '30 - 90 min',
    intro:
      'Après un contact avec l’eau, c’est le courant qui abîme le téléphone en provoquant la corrosion. Couper l’alimentation au plus vite et nettoyer la carte augmente beaucoup les chances.',
    outils: ['Alcool isopropylique 90 % ou plus', 'Brosse à dents souple ou brosse antistatique', 'Outils d’ouverture', 'Tournevis de précision'],
    pieces: ['Batterie si elle a été court-circuitée', 'Joint adhésif'],
    recherche: 'phone water damage repair',
    etapes: [
      ['Premiers gestes', [
        '!Ne pas allumer ni charger le téléphone. L’éteindre s’il est encore allumé.',
        'Retirer l’étui, la carte SIM et la carte microSD. Essuyer l’extérieur.',
        'i:Le riz n’aide pas : il ne fait que retarder le nettoyage.'
      ]],
      ['Ouvrir et débrancher', [
        'Ouvrir selon l’article iFixit du modèle et débrancher la batterie en premier.',
        'Retirer les plaques de protection pour voir la carte mère.'
      ]],
      ['Nettoyer la corrosion', [
        'Brosser les traces blanches ou vertes à l’alcool isopropylique, surtout autour des connecteurs et des puces d’alimentation.',
        'Laisser sécher complètement (au moins une heure à l’air libre).',
        '!Si l’eau était salée ou sucrée, le nettoyage est indispensable : la corrosion progresse en quelques heures.'
      ]],
      ['Tester', [
        'Rebrancher la batterie et tester. Si rien ne se passe, tester avec une batterie neuve.',
        'Prévenir le participant que des pannes peuvent apparaître plus tard (corrosion invisible) et qu’il faut sauvegarder ses données sans attendre.'
      ]]
    ]
  }
];

export const GUIDES_LOCAUX: OfflineRepairGuide[] = SOURCES.map(fiche);

// Termes de recherche iFixit des 9 premières fiches Insertech (pour lier les articles complets depuis le PC hôte)
export const RECHERCHE_FICHES_INITIALES: Record<string, string> = {
  'builtin-linux-slow-ssd': 'laptop SSD replacement',
  'builtin-windows-slow-cleanup': 'laptop SSD replacement',
  'builtin-laptop-battery-power': 'laptop battery replacement',
  'builtin-laptop-overheat-fan': 'laptop fan cleaning',
  'builtin-laptop-screen-edp': 'laptop screen replacement',
  'builtin-laptop-keyboard-ports': 'laptop keyboard replacement',
  'builtin-wifi-network-fix': 'laptop wifi card replacement',
  'builtin-mobile-charge-screen': 'phone charging port replacement',
  'builtin-desktop-no-boot': 'desktop power supply replacement'
};
