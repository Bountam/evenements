import { Capacitor, registerPlugin } from '@capacitor/core';

// Point d'entrée unique du code propre à l'application Android (Capacitor).
// Règle : tout appel natif commence par `if (!isAndroidApp())` et garde le comportement web comme repli,
// pour que le PC (navigateur lancé par le lanceur) et la version web restent inchangés.

export function isAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

// Filtre `accept` d'un <input type="file">. Android traduit chaque extension en type MIME et grise
// les fichiers dont le type ne correspond pas (.md, .tex et souvent .json ou .csv n'en ont pas de fiable
// dans Documents ou Téléchargements). Sur Android on montre donc tous les fichiers : l'import vérifie
// déjà l'extension et le contenu, et affiche une erreur claire si le fichier ne convient pas.
export function fileAccept(webAccept: string): string {
  return isAndroidApp() ? '*/*' : webAccept;
}

// --- Verrouillage de la tablette (lot 4) ---
// Chaque fonction ne fait rien hors de l'application Android, et n'échoue jamais : un plugin absent
// (ancienne version de l'APK) laisse simplement la tablette moins protégée.

interface InsertechNatifPlugin {
  pleinEcran(options: { actif: boolean }): Promise<void>;
  epingler(): Promise<void>;
  desepingler(): Promise<void>;
  etat(): Promise<{ epinglee: boolean }>;
  quitter(): Promise<void>;
}

// Jamais renvoyé par une fonction async : « await » sur un proxy de plugin appellerait sa méthode then()
let natif: InsertechNatifPlugin | null = null;
function getNatif(): InsertechNatifPlugin {
  if (!natif) natif = registerPlugin<InsertechNatifPlugin>('InsertechNatif');
  return natif;
}

async function quietly(label: string, action: () => Promise<unknown>) {
  if (!isAndroidApp()) return;
  try {
    await action();
  } catch (e) {
    console.warn(`${label} :`, e);
  }
}

export function pleinEcran(actif: boolean) {
  return quietly('Plein écran', async () => getNatif().pleinEcran({ actif }));
}

export function epingler() {
  return quietly('Épinglage', async () => getNatif().epingler());
}

export function desepingler() {
  return quietly('Désépinglage', async () => getNatif().desepingler());
}

export function quitterApplication() {
  return quietly('Fermeture', async () => getNatif().quitter());
}

export function garderEcranAllume(actif: boolean) {
  return quietly('Écran allumé', async () => {
    const { KeepAwake } = await import('@capacitor-community/keep-awake');
    await (actif ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
  });
}

export function bloquerPaysage(actif: boolean) {
  return quietly('Orientation', async () => {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    await (actif ? ScreenOrientation.lock({ orientation: 'landscape' }) : ScreenOrientation.unlock());
  });
}

// Bouton Retour d'Android : un seul écouteur, qui remplace le comportement par défaut (quitter l'appli)
export function onBoutonRetour(handler: () => void): () => void {
  if (!isAndroidApp()) return () => {};
  let remove: (() => void) | null = null;
  let cancelled = false;
  import('@capacitor/app')
    .then(({ App }) => App.addListener('backButton', handler))
    .then((listener) => {
      if (cancelled) listener.remove();
      else remove = () => listener.remove();
    })
    .catch((e) => console.warn('Bouton Retour :', e));
  return () => {
    cancelled = true;
    remove?.();
  };
}

// --- Lien profond insertech://rejoindre (lot 6) ---
// L'appareil photo Samsung lit le QR du PC et ouvre l'appli avec ce lien : au lancement (getLaunchUrl)
// ou pendant qu'elle tourne déjà (appUrlOpen, l'activité est en singleTask).
export function onLienOuvert(handler: (url: string) => void): () => void {
  if (!isAndroidApp()) return () => {};
  let remove: (() => void) | null = null;
  let cancelled = false;
  import('@capacitor/app')
    .then(async ({ App }) => {
      const listener = await App.addListener('appUrlOpen', ({ url }) => handler(url));
      if (cancelled) {
        listener.remove();
        return;
      }
      remove = () => listener.remove();
      const lancement = await App.getLaunchUrl();
      if (!cancelled && lancement?.url) handler(lancement.url);
    })
    .catch((e) => console.warn('Lien profond :', e));
  return () => {
    cancelled = true;
    remove?.();
  };
}
