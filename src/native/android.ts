import { Capacitor } from '@capacitor/core';

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
