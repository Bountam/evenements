import { defineConfig } from '@playwright/test';

// Test de rendu du bundle compilé (dist/) tel que l'ouvrent les cibles :
// file:// pour l'exe Windows/Linux et l'APK, http pour la PWA (vite preview).
export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    browserName: 'chromium',
    locale: 'fr-CA',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI
  }
});
