import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Version affichée dans l'interface : package.json est la seule source de vérité (voir scripts/sync-version.js)
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

// Donne au cache du service worker un nom propre à chaque build : l'ancien cache est purgé au déploiement
function serviceWorkerBuildId(): Plugin {
  const buildId = `${pkg.version}-${Date.now().toString(36)}`;
  return {
    name: 'service-worker-build-id',
    apply: 'build',
    writeBundle(options) {
      const swPath = path.join(options.dir ?? 'dist', 'sw.js');
      if (existsSync(swPath)) {
        writeFileSync(swPath, readFileSync(swPath, 'utf8').replaceAll('__BUILD_ID__', buildId));
      }
    },
  };
}

// Favicon inliné : l'exe et l'APK n'embarquent que index.html, ./favicon.ico y serait introuvable
function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    apply: 'build',
    transformIndexHtml(html) {
      const icon = readFileSync(path.resolve(__dirname, 'public/favicon.ico')).toString('base64');
      return html.replace('href="./favicon.ico"', `href="data:image/x-icon;base64,${icon}"`);
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [react(), tailwindcss(), viteSingleFile(), serviceWorkerBuildId(), inlineFavicon()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
