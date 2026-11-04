# Vérification des tablettes Android avant un événement

Deux listes : la **première fois** qu'on installe une nouvelle version (une seule tablette suffit), puis la
**veille de chaque événement** (toutes les tablettes). Faire les essais sur le hotspot du cellulaire avec les
**données mobiles coupées** : l'application ne doit jamais avoir besoin d'internet.

> Imprimer cette page ou la copier dans une note, et cocher au fur et à mesure. Un essai raté se note aussi,
> avec la tablette, la version de l'application et ce qui s'est passé.

## A. Nouvelle version de l'application (une tablette Samsung, Android 10 ou plus)

### Installation et démarrage

- [ ] L'icône Insertech apparaît, l'application s'ouvre.
- [ ] L'en-tête n'est pas caché par la barre d'état.
- [ ] Une activité créée est encore là après avoir fermé l'application (balayer depuis la liste des applis récentes).
- [ ] Après **Paramètres > Applications > Insertech Événements > Stockage > Effacer les données**, l'activité est récupérée (sauvegarde SQLite).
- [ ] La nouvelle version s'installe **par-dessus** l'ancienne, sans désinstaller (même clé de signature).

### Fichiers

- [ ] Les exports Excel, CSV, contacts et la sauvegarde JSON arrivent dans **Documents/Insertech** et s'ouvrent.
- [ ] « Partager » ouvre la feuille de partage d'Android avec le fichier.
- [ ] « Restaurer une sauvegarde JSON », l'image d'un prix et un logo partenaire ouvrent le sélecteur de fichiers ; annuler puis recommencer fonctionne.

### Rejoindre l'événement du PC

- [ ] Scanner le QR de la fenêtre **Réseau local** du PC : la tablette passe « connectée » en moins de 5 secondes.
- [ ] L'appareil photo Samsung (hors de l'application) ouvre l'application sur ce QR.
- [ ] La saisie à la main du code et de la clé marche ; une clé fausse n'est **jamais** connectée.
- [ ] Fermer puis rouvrir l'application, ou redémarrer le PC : la tablette se reconnecte sans rien retaper.
- [ ] Après **Nouvelle clé** sur le PC, l'ancien QR ne connecte plus.

### Synchronisation (réseau local seulement)

- [ ] Le PC trouve les tablettes et les connecte ; aucune fenêtre de Windows (pare-feu, administrateur) n'apparaît.
- [ ] Une inscription faite sur une tablette apparaît sur le PC en moins d'une seconde.
- [ ] Couper le Wi-Fi d'une tablette 30 secondes puis le remettre : elle est rappelée seule et ses saisies arrivent.

### Modes et verrouillage

- [ ] Choisir **Kiosque formulaire**, verrouiller, fermer puis rouvrir l'application : elle reste dans le formulaire.
- [ ] Le bon code déverrouille ; trois mauvais codes bloquent 30 secondes.
- [ ] Changer le code sur le PC change celui des tablettes connectées.
- [ ] Verrouillée en kiosque, 30 minutes sans toucher : l'écran reste allumé.
- [ ] Verrouillée : les barres du haut et du bas sont cachées ; Retour et Accueil ne sortent pas de l'application.
- [ ] Le bon code déverrouille et rend la tablette à la normale (barres visibles, épinglage retiré).
- [ ] En mode libre, Retour ferme une fenêtre, puis revient au choix du mode, puis demande avant de quitter.

### Écran public et téléviseur

- [ ] Mode **Écran public** : plein écran, paysage, l'écran ne se met pas en veille.
- [ ] Smart View vers le Chromecast ou le téléviseur, données mobiles coupées (noter le résultat dans [ecran-public-chromecast.md](ecran-public-chromecast.md), même un échec).
- [ ] Sur le téléviseur, le chrono et le tirage suivent en direct.

### Mise à jour envoyée par le PC

- [ ] Sur le PC, **Mettre à jour les tablettes** avec l'APK suivant : chaque tablette demande confirmation, redémarre dans la nouvelle version et se reconnecte avec ses données.
- [ ] La première fois, Android demande d'autoriser l'installation d'applications pour Insertech : l'autoriser, puis revenir.
- [ ] Un APK modifié, ou signé d'une autre clé, est refusé avec un message clair sur le PC.
- [ ] Une tablette verrouillée refuse tant que le code n'est pas saisi.
- [ ] Un APK d'environ 15 Mo passe en moins d'une minute sur le hotspot.
- [ ] Si l'application ne se rouvre pas seule après la mise à jour, la rouvrir depuis son icône : elle se reconnecte.

## B. La veille de chaque événement (chaque tablette)

- [ ] Tablette chargée à **100 %**, chargeur et câble dans le sac.
- [ ] **Paramètres > Affichage > Mise en veille de l'écran** au plus long, et économie d'énergie désactivée
      (l'application garde l'écran allumé dans les modes kiosque et écran public, mais pas sur l'accueil).
- [ ] Même version de l'application sur toutes les tablettes et le PC (numéro en bas de l'accueil).
- [ ] Hotspot du cellulaire allumé, **données mobiles coupées**, tablettes et PC sur ce Wi-Fi.
- [ ] Ouvrir l'application et rejoindre l'événement (QR du PC).
- [ ] Choisir le mode de chaque tablette, puis **Verrouiller ce mode**.
- [ ] Faire une inscription d'essai sur chaque tablette et la voir arriver sur le PC, puis la supprimer.
- [ ] Faire une sauvegarde JSON du PC.

> **Après un redémarrage de la tablette**, l'application ne se relance pas toute seule : il faut la rouvrir
> depuis son icône. Elle reprend alors son mode verrouillé et se reconnecte au PC sans rien retaper.

## Si quelque chose ne marche pas

- La tablette ne trouve pas le PC, ou le PC ne trouve pas la tablette : vérifier que le hotspot n'isole pas
  les appareils, et que tous sont sur le même Wi-Fi.
- Pour voir les erreurs de l'application : brancher la tablette au PC en USB (débogage USB activé dans les
  options de développement), puis ouvrir `chrome://inspect` dans Chrome ou `edge://inspect` dans Edge sur le PC.
  Cela ne marche qu'avec l'APK debug (l'APK release ne laisse pas inspecter sa page).
