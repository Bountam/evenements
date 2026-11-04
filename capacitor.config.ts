import type { CapacitorConfig } from '@capacitor/cli';

// Application Android (Capacitor) : embarque le même dist/ que le PC (npm run build, puis npx cap sync android).
// Schéma par défaut (https://localhost) : la page de la tablette ne parle jamais au réseau elle-même ;
// c'est un plugin natif qui écoutera les connexions du PC hôte (lot 5 du plan Android natif).
const config: CapacitorConfig = {
  appId: 'org.insertech.evenements',
  appName: 'Insertech Événements',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  },
  plugins: {
    SystemBars: {
      // Fond sombre : icônes claires dans les barres d'état et de navigation
      style: 'DARK',
      // index.html déclare viewport-fit=cover ; les en-têtes ajoutent env(safe-area-inset-top)
      initialViewportFitValueHint: 'cover'
    }
  }
};

export default config;
