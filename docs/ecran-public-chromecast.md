# Écran public sur un téléviseur ou un Chromecast

L'écran public (chronos en direct, classement, tirage) peut s'afficher sur un grand écran **sans internet** et
**sans que le PC hôte écoute sur le réseau** : aucune fenêtre du pare-feu Windows, aucun droit administrateur.

Trois voies, de la plus sûre à la moins sûre :

| Voie | Principe | À vérifier |
| --- | --- | --- |
| 1. Câble HDMI sur le PC | La fenêtre « Écran public » du PC sur le téléviseur ou le projecteur | Rien |
| 2. Tablette en écran public + Smart View | Une tablette Samsung affiche l'écran public et l'envoie au téléviseur avec Smart View | Que le Chromecast ou le téléviseur accepte le miroir sans internet |
| 3. Le PC caste l'onglet | Menu « Caster » d'Edge ou de Chrome sur la fenêtre « Écran public » | Qu'aucune fenêtre du pare-feu ne s'ouvre, et que ça marche sans internet |

L'application ne dépend jamais de Google : pour les voies 2 et 3, c'est le système (Samsung) ou le navigateur
qui envoie l'image.

> Une voie retirée : faire ouvrir au téléviseur une adresse du PC dans son navigateur. Le PC devrait écouter
> sur le réseau, et le pare-feu de Windows le bloquerait.

## Voie 1. Câble HDMI sur le PC (recommandée)

1. Brancher le téléviseur ou le projecteur au PC hôte avec un câble HDMI.
2. Windows : touche **Windows + P**, puis **Étendre**.
3. Dans l'application, ouvrir l'activité, puis **Plus** > **Ouvrir le projecteur** : la fenêtre « Écran public » s'ouvre.
4. Glisser cette fenêtre sur le téléviseur, puis appuyer sur le bouton plein écran (en haut à droite) ou **F11**.
5. Les commandes et le curseur s'effacent après 3 secondes sans bouger la souris.

## Voie 2. Tablette en écran public, puis Smart View

La tablette suit le PC comme les autres tablettes (réseau local) et envoie son propre écran au téléviseur.

1. Sur la tablette : rejoindre l'événement (scanner le QR du PC), puis choisir le mode **Écran public**.
   La tablette passe d'elle-même en plein écran, en paysage, et ne se met plus en veille.
2. Option : **Verrouiller ce mode** (code à 4 chiffres réglé sur le PC) pour que personne ne change d'écran.
3. Brancher la tablette sur secteur : le miroir d'écran vide la batterie vite.
4. Ouvrir le panneau rapide d'Android (glisser deux fois depuis le haut), puis **Smart View**.
5. Choisir le téléviseur ou le Chromecast dans la liste.
6. Au repos, aucune commande n'est visible sur le téléviseur ; toucher la tablette les fait réapparaître.

Bon à savoir :

- Le téléviseur ou le Chromecast doit être sur le **même Wi-Fi** que la tablette (le hotspot du cellulaire).
- Un Chromecast fraîchement réinitialisé demande une configuration avec internet (application Google Home) :
  la faire **avant** l'événement, chez soi.
- Si la liste de Smart View reste vide : vérifier que le hotspot n'isole pas les appareils
  (même réglage que pour les tablettes).

## Voie 3. Le PC caste l'onglet (Edge ou Chrome)

1. Ouvrir la fenêtre **Écran public** dans Edge ou Chrome.
2. Menu **⋯** > **Caster, enregistrer et partager** > **Caster** (Edge), ou **⋮** > **Caster…** (Chrome).
3. Choisir le Chromecast, puis la source **Caster l'onglet**.

À surveiller : si Windows affiche une fenêtre « Pare-feu Windows Defender a bloqué certaines fonctionnalités »,
cliquer **Annuler**, ne rien autoriser, et passer à la voie 1 ou 2. Le PC ne doit jamais avoir à accepter de
connexion entrante.

## Résultats des essais

À compléter par Luka, avec le Chromecast, les données mobiles du hotspot **coupées** (noter aussi un échec) :

| Essai | Date | Résultat | Remarques (fenêtre de Windows, délai, qualité) |
| --- | --- | --- | --- |
| Voie 1 : HDMI | | | |
| Voie 2 : Smart View vers le Chromecast | | | |
| Voie 3 : Caster depuis Edge | | | |
| Le chrono et le tirage suivent en direct sur le téléviseur | | | |

## Lisibilité à 5 mètres

Sur un écran 16:9, les chronos occupent 8 à 12 % de la hauteur de l'écran, et les noms des coureurs
environ 6 % (une piste) ou 5 % (quatre pistes). Si le public est plus loin, préférer une seule piste
active à la fois sur le grand écran.
