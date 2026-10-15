import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import App from './App.tsx';
import { ToastContainer, showToast } from './components/shared/Toast';
import { ConfirmDialogHost } from './components/shared/ConfirmDialog';
import './index.css';

// Prevent benign sandbox WebSocket error from appearing as an unhandled rejection overlay
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason) {
      const msg = typeof reason === 'string' ? reason : (reason.message || '');
      if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('closed without opened')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('vite')) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  // Enregistrement du Service Worker PWA (uniquement sur HTTP/HTTPS comme GitHub Pages)
  if (
    'serviceWorker' in navigator &&
    (window.location.protocol === 'https:' || window.location.protocol === 'http:')
  ) {
    window.addEventListener('load', () => {
      // Premier passage : pas de version précédente, donc rien à annoncer
      const hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker
        .register('./sw.js')
        .then((registration) => {
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => {
              if (worker.state === 'activated' && hadController) {
                // Pas de rechargement forcé : un chrono ou un tirage peut être en cours
                showToast('Une nouvelle version est prête.', 'info', {
                  label: 'Recharger',
                  onClick: () => window.location.reload()
                });
              }
            });
          });
        })
        .catch(() => {
          // Ignore en mode développement local si non applicable
        });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Respecte « Réduire les animations » du système pour les animations JS (motion) */}
    <MotionConfig reducedMotion="user">
      <App />
      {/* Montés une seule fois, hors des vues : notifications et confirmations disponibles partout */}
      <ToastContainer />
      <ConfirmDialogHost />
    </MotionConfig>
  </StrictMode>,
);
