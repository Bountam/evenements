import { expect, test } from '@playwright/test';

const URL = 'http://localhost:4173/';

const SIMULATE_ANDROID = () => {
  (window as any).androidBridge = { postMessage: () => {} };
};

test('ReparateurCockpit : onglets Fiche / Diagnostic local / Guides iFixit (FR->EN, lecteur intégré et cache offline)', async ({
  page
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);

  // 1. Créer un Réparothon et inscrire un appareil ThinkPad T480 (Alimentation + Surchauffe)
  await page.getByRole('radio', { name: /^Réparothon/ }).click();
  await page.locator('#eventName').fill('Réparothon Diagnostic CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  await page.getByRole('group', { name: "Catégorie d'appareil" }).getByRole('button', { name: 'Portable' }).click();
  await page.getByRole('group', { name: "Marque de l'appareil" }).getByRole('button', { name: 'Lenovo' }).click();
  await page.getByRole('group', { name: 'Gamme ou modèle' }).getByRole('button', { name: 'ThinkPad' }).click();
  await page.getByRole('group', { name: 'Domaine du problème' }).getByRole('button', { name: /Problème Matériel/i }).click();
  await page.getByRole('group', { name: "Symptômes de l'appareil" }).getByRole('button', { name: /Alimentation \/ Batterie/i }).click();
  await page.getByRole('group', { name: "Symptômes de l'appareil" }).getByRole('button', { name: /Surchauffe \/ Nettoyage/i }).click();
  await page.getByRole('button', { name: /^Continuer/i }).click();
  await page.getByRole('button', { name: /Inscrire le participant/i }).click();

  await page.locator('#rp-displayName').fill('Marc Tremblay');
  await page.locator('#rp-phone').fill('514 555-7788');
  await page.locator('#rp-consentActivity').check();
  await page.getByRole('button', { name: /Valider et enregistrer 1 appareil/i }).click();
  await expect(page.getByText('Appareil enregistré pour Marc Tremblay !')).toBeVisible();

  // 2. Simuler mobile Réparateur et prendre le ticket
  await page.addInitScript(SIMULATE_ANDROID);
  await page.reload();
  await page.getByRole('button', { name: /Animateur Réparateur/i }).click();
  await page.getByRole('button', { name: /Alexandre Tremblay/i }).click();

  await page
    .locator('.p-4.rounded-2xl')
    .filter({ hasText: 'Marc Tremblay' })
    .getByRole('button', { name: /Prendre cet appareil/i })
    .click();

  // 3. Vérifier les 3 onglets [Fiche], [Diagnostic], [Guides iFixit]
  const tabList = page.getByRole('tablist', { name: 'Vues du ticket actif' });
  await expect(tabList).toBeVisible();
  const tabFiche = tabList.getByRole('tab', { name: /^Fiche/ });
  const tabDiag = tabList.getByRole('tab', { name: /^Diagnostic/ });
  const tabIfixit = tabList.getByRole('tab', { name: /^Guides iFixit/ });
  await expect(tabFiche).toBeVisible();
  await expect(tabDiag).toBeVisible();
  await expect(tabIfixit).toBeVisible();

  // 4. Onglet Diagnostic hors-ligne : questions contextuelles + cochage + persistance
  await tabDiag.click();
  const qSector = page.getByRole('button', { name: /L'appareil réagit-il sur secteur sans batterie/i });
  const qThermal = page.getByRole('button', { name: /L’appareil s’éteint-il brusquement/i });
  await expect(qSector).toBeVisible();
  await expect(qThermal).toBeVisible();

  await qSector.click();
  await qThermal.click();
  await expect(qSector).toHaveAttribute('aria-pressed', 'true');
  await expect(qThermal).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('diag-progress-count')).toContainText('2 /');

  // Persistance après aller-retour sur Fiche
  await tabFiche.click();
  await expect(page.getByRole('button', { name: '1. Accueil' })).toBeVisible();
  await tabDiag.click();
  await expect(qSector).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('diag-progress-count')).toContainText('2 /');

  // 5. Mock réseau iFixit v2.0 : priorité FR (1 seul résultat -> repli auto EN + déduplication)
  let offlineMode = false;
  const capturedFrAuthHeaders: Array<string | undefined> = [];
  await page.route('https://fr.ifixit.com/api/2.0/**', async (route) => {
    if (offlineMode) {
      await route.abort();
      return;
    }
    capturedFrAuthHeaders.push(route.request().headers()['authorization']);
    const url = route.request().url();
    if (url.includes('/search/')) {
      if (url.includes('Nokia')) {
        await route.fulfill({ json: { results: [] } });
        return;
      }
      await route.fulfill({
        json: {
          results: [
            {
              guideid: 1001,
              title_raw: 'Remplacement de la batterie ThinkPad',
              category: 'Lenovo ThinkPad',
              subject: 'Batterie',
              summary: 'Guide FR complet',
              difficulty: 'Facile',
              image: { medium: 'https://fr.ifixit.com/static/images/default_image.jpg' }
            }
          ]
        }
      });
      return;
    }
    if (url.includes('/guides/1001')) {
      await route.fulfill({
        json: {
          guideid: 1001,
          title_raw: 'Remplacement de la batterie ThinkPad',
          category: 'Lenovo ThinkPad',
          difficulty: 'Facile',
          time_required: '15 - 30 minutes',
          introduction_raw: 'Procédure sécuritaire pour remplacer la batterie interne.',
          tools: [{ text: 'Tournevis Phillips #0' }, { text: 'Outil d’ouverture en plastique' }],
          parts: [{ text: 'Batterie ThinkPad interne' }],
          steps: [
            {
              stepid: 1,
              orderby: 1,
              title: 'Retirer la batterie externe',
              media: { data: [] },
              lines: [
                {
                  text_raw: 'Couper le courant et retirer le câble secteur avant ouverture.',
                  bullet: 'icon_caution',
                  level: 0
                },
                {
                  text_raw: 'Dévisser les vis imperdables du capot inférieur.',
                  bullet: 'black',
                  level: 0
                }
              ]
            },
            {
              stepid: 2,
              orderby: 2,
              title: 'Débrancher le connecteur interne',
              media: { data: [] },
              lines: [
                {
                  text_raw: 'Soulever délicatement le connecteur verticalement avec une spatule.',
                  bullet: 'icon_note',
                  level: 0
                }
              ]
            }
          ]
        }
      });
      return;
    }
    await route.fulfill({ status: 404, json: {} });
  });

  await page.route('https://www.ifixit.com/api/2.0/**', async (route) => {
    if (offlineMode) {
      await route.abort();
      return;
    }
    const url = route.request().url();
    if (url.includes('/search/')) {
      if (url.includes('Nokia')) {
        await route.fulfill({ json: { results: [] } });
        return;
      }
      await route.fulfill({
        json: {
          results: [
            // Doublon guideid 1001 : doit être dédupliqué au profit de FR
            {
              guideid: 1001,
              title_raw: 'ThinkPad Battery Replacement',
              category: 'Lenovo ThinkPad',
              subject: 'Battery',
              difficulty: 'Easy'
            },
            {
              guideid: 2002,
              title_raw: 'ThinkPad Thermal Fan Cleaning',
              category: 'Lenovo ThinkPad',
              subject: 'Fan',
              difficulty: 'Moderate'
            }
          ]
        }
      });
      return;
    }
    await route.fulfill({ status: 404, json: {} });
  });

  // 6. Ouvrir l'onglet Guides iFixit : vérifier FR + repli EN dédupliqué + filtres + lecteur intégré
  await tabIfixit.click();
  const cardFr = page.getByRole('button', { name: /Remplacement de la batterie ThinkPad/i });
  const cardEn = page.getByRole('button', { name: /ThinkPad Thermal Fan Cleaning/i });
  await expect(cardFr).toBeVisible();
  await expect(cardEn).toBeVisible();
  // Le doublon anglais 1001 ne doit pas apparaître en double
  await expect(page.getByRole('button', { name: /ThinkPad Battery Replacement/i })).toHaveCount(0);

  // Tester les filtres FR / EN / Tous
  const filterGroup = page.getByRole('group', { name: 'Filtrer par langue' });
  await filterGroup.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(cardFr).toHaveCount(0);
  await expect(cardEn).toBeVisible();
  await filterGroup.getByRole('button', { name: 'FR', exact: true }).click();
  await expect(cardFr).toBeVisible();
  await expect(cardEn).toHaveCount(0);
  await filterGroup.getByRole('button', { name: 'Tous', exact: true }).click();

  // Ouvrir le guide dans le lecteur intégré pas à pas
  await cardFr.click();
  await expect(page.getByText('Difficulté : Facile')).toBeVisible();
  await expect(page.getByText('Durée : 15 - 30 minutes')).toBeVisible();
  await expect(page.getByText('Tournevis Phillips #0')).toBeVisible();
  await expect(page.getByText('Étape 1 / 2')).toBeVisible();
  await expect(page.getByText('Attention', { exact: true })).toBeVisible();
  await expect(page.getByText(/Couper le courant et retirer le câble secteur/i)).toBeVisible();

  // Naviguer à l'étape 2/2
  await page.getByRole('button', { name: 'Suivant', exact: true }).click();
  await expect(page.getByText('Étape 2 / 2')).toBeVisible();
  await expect(page.getByText('Note', { exact: true })).toBeVisible();
  await expect(page.getByText(/Soulever délicatement le connecteur/i)).toBeVisible();

  // Revenir aux guides : badge En cache présent
  await page.getByRole('button', { name: 'Retour aux guides' }).click();
  await expect(cardFr).toContainText('En cache');

  // Vérifier l'envoi du header Authorization: Bearer après saisie de la clé API locale
  await page.getByRole('button', { name: 'Clé API' }).click();
  await page.getByLabel('Clé API iFixit').fill('ifx_test_mock_key');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(cardFr).toBeVisible();
  expect(capturedFrAuthHeaders).toContain('Bearer ifx_test_mock_key');

  // 7. Couper le réseau (offlineMode = true) et vérifier cache IndexedDB + gestion propre d'une requête non cachée
  offlineMode = true;
  await cardFr.click();
  await expect(page.getByText('Étape 1 / 2')).toBeVisible();
  await expect(page.getByText('En cache').first()).toBeVisible();
  await page.getByRole('button', { name: 'Retour aux guides' }).click();

  // Recherche manuelle hors-ligne non cachée
  await page.getByLabel('Rechercher un guide iFixit').fill('Nokia 3310');
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect(page.getByText('Mode hors-ligne — le diagnostic local reste disponible')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();

  expect(errors).toEqual([]);
});
