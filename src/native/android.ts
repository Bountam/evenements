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
