import { expect, test, type Page } from '@playwright/test';

const URL = 'http://localhost:4173/';

const SIMULATE_ANDROID = () => {
  (window as any).androidBridge = { postMessage: () => {} };
};

// API iFixit v2.0 simulée (FR, puis repli EN avec un doublon à dédupliquer)
async function installIfixitMocks(page: Page, state: { offline: boolean; frAuth: Array<string | undefined>; calls: string[] }) {
  page.on('request', (req) => {
    if (/ifixit\.com/.test(req.url())) state.calls.push(req.url());
  });
  await page.route('https://fr.ifixit.com/api/2.0/**', async (route) => {
    if (state.offline) {
      await route.abort();
      return;
    }
    state.frAuth.push(route.request().headers()['authorization']);
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
          url: 'https://fr.ifixit.com/Tutoriel/Remplacement+batterie+ThinkPad/1001',
          author: { username: 'Technicienne iFixit' },
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
    if (state.offline) {
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

}

test('ReparateurCockpit tablette : fiche, diagnostic Oui/Non, guides locaux et aucun appel à iFixit sans le PC hôte', async ({
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
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#rp-phone').fill('514 555-7788');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.locator('#rp-consentActivity').check();
  await page.getByRole('button', { name: /Valider et enregistrer 1 appareil/i }).click();
  await expect(page.getByText('Appareil enregistré pour Marc Tremblay !')).toBeVisible();

  // 2. Simuler mobile Réparateur et prendre le ticket
  await page.addInitScript(SIMULATE_ANDROID);
  await page.reload();
  await page.getByRole('button', { name: /Animateur Réparateur/i }).click();
  await page.getByRole('button', { name: /Alexandre Tremblay/i }).click();

  const ifixit = { offline: false, frAuth: [] as Array<string | undefined>, calls: [] as string[] };
  await installIfixitMocks(page, ifixit);

  await page
    .getByTestId('appareil-en-attente')
    .filter({ hasText: 'Marc Tremblay' })
    .getByRole('button', { name: /Prendre cet appareil/i })
    .click();

  // 3. Vue unifiée sans sous-onglets : Fiche permanente + Diagnostic Oui/Non + Guides iFixit directement visibles
  await expect(page.getByRole('region', { name: "Fiche technique de l'appareil" })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Vues du ticket actif' })).toHaveCount(0);

  // 4. Diagnostic interactif Oui / Non + points de contrôle complémentaires persistés
  const diagSection = page.getByRole('region', { name: 'Diagnostic guidé interactif' });
  await expect(diagSection).toBeVisible();
  await diagSection.getByRole('button', { name: /Ne démarre pas/i }).click();
  await expect(diagSection.getByText(/Un voyant de charge/i)).toBeVisible();
  await diagSection.getByRole('button', { name: 'Non', exact: true }).click();
  await diagSection.getByRole('button', { name: 'Non', exact: true }).click();
  await expect(diagSection.getByText(/Bloc d’alimentation \/ chargeur défectueux/i)).toBeVisible();
  const actionDoneBtn = diagSection.getByRole('button', { name: /Marquer cette action faite/i });
  await actionDoneBtn.click();
  await expect(diagSection.getByRole('button', { name: /Vérification faite/i })).toHaveAttribute('aria-pressed', 'true');

  // Liste repliable des points de contrôle complémentaires
  await diagSection.getByRole('button', { name: /Points de contrôle complémentaires/i }).click();
  const qSector = diagSection.getByRole('button', { name: /L'appareil réagit-il sur secteur sans batterie/i });
  const qThermal = diagSection.getByRole('button', { name: /L’appareil s’éteint-il brusquement/i });
  await expect(qSector).toBeVisible();
  await expect(qThermal).toBeVisible();
  await qSector.click();
  await qThermal.click();
  await expect(qSector).toHaveAttribute('aria-pressed', 'true');
  await expect(qThermal).toHaveAttribute('aria-pressed', 'true');
  await expect(diagSection.getByRole('button', { name: /Points de contrôle complémentaires \(2\//i })).toBeVisible();

  // 6. Sur tablette : guides locaux affichés, articles iFixit demandés au PC hôte (absent ici), jamais à ifixit.com
  await expect(page.getByText(/Guides disponibles hors-ligne pour ce ticket/)).toBeVisible();
  await expect(page.getByText(/Articles iFixit : PC hôte injoignable/)).toBeVisible();
  await page.getByRole('button', { name: 'Recherche manuelle' }).click();
  await expect(page.getByRole('button', { name: 'Clé API' })).toHaveCount(0);

  // Fiche locale complète : badge Insertech, brouillon à relire, recherche de l'article iFixit proposée
  await page.getByRole('button', { name: /Portable qui ne charge plus/i }).click();
  await expect(page.getByText('Fiche Insertech')).toBeVisible();
  await expect(page.getByText('Brouillon à relire')).toBeVisible();
  await expect(page.getByText(/Étape 1 \/ 5/)).toBeVisible();
  await page.getByRole('button', { name: "Chercher l'article iFixit" }).click();
  await expect(page.getByLabel('Rechercher un guide iFixit')).toHaveValue('laptop DC jack replacement');
  await expect(page.getByText(/PC hôte injoignable/).first()).toBeVisible();
  expect(ifixit.calls).toEqual([]);

  // 8. Validation rapide en 1 clic (« Valider rapidement ») -> appareil marqué réparé et file d'attente réaffichée
  await page.getByRole('button', { name: /Valider rapidement/i }).click();
  await expect(page.getByText('Appareil validé comme réparé !')).toBeVisible();
  await expect(page.getByText(/File d'attente/i)).toBeVisible();

  expect(errors).toEqual([]);
});

test('PC hôte : articles iFixit (FR puis EN), aperçu avec attribution, lien vers une fiche locale et cache hors ligne', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const ifixit = { offline: false, frAuth: [] as Array<string | undefined>, calls: [] as string[] };
  await installIfixitMocks(page, ifixit);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);
  await page.getByRole('radio', { name: /^Réparothon/ }).click();
  await page.locator('#eventName').fill('Réparothon iFixit CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  await page.getByRole('button', { name: 'Plus' }).click();
  await page.getByRole('button', { name: 'Bibliothèque de guides hors-ligne' }).click();
  await expect(page.getByText(/33 fiches Insertech/)).toBeVisible();
  await page.getByRole('tab', { name: 'Articles iFixit' }).click();

  // Clé enregistrée sur ce PC seulement, envoyée à iFixit en Bearer
  await page.getByLabel('Clé API iFixit serveur').fill('ifx_test_mock_key');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

  const fiche = 'Portable qui ne charge plus : chargeur, prise DC ou port USB-C';
  await page.getByLabel('Fiche locale à compléter').selectOption({ label: fiche });
  await expect(page.getByLabel('Rechercher un article iFixit à lier')).toHaveValue('laptop DC jack replacement');
  await page.getByLabel('Rechercher un article iFixit à lier').fill('ThinkPad battery');
  await page.getByRole('button', { name: 'Chercher' }).click();

  await expect(page.getByText('Remplacement de la batterie ThinkPad')).toBeVisible();
  await expect(page.getByText('ThinkPad Thermal Fan Cleaning')).toBeVisible();
  await expect(page.getByText('ThinkPad Battery Replacement')).toHaveCount(0);
  expect(ifixit.frAuth).toContain('Bearer ifx_test_mock_key');

  // Aperçu dans le lecteur intégré, avec l'attribution exigée par la licence
  await page.getByRole('button', { name: 'Aperçu de Remplacement de la batterie ThinkPad' }).click();
  await expect(page.getByText('Difficulté : Facile')).toBeVisible();
  await expect(page.getByText('Durée : 15 - 30 minutes')).toBeVisible();
  await expect(page.getByText('Tournevis Phillips #0')).toBeVisible();
  const attribution = page.getByTestId('attribution-ifixit');
  await expect(attribution).toContainText('par Technicienne iFixit');
  await expect(attribution).toContainText('Licence CC BY-NC-SA 3.0');
  await expect(attribution.getByRole('link', { name: 'Voir sur iFixit' })).toHaveAttribute('href', /fr\.ifixit\.com/);
  await expect(page.getByText('Étape 1 / 2')).toBeVisible();
  await expect(page.getByText('Attention', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Suivant', exact: true }).click();
  await expect(page.getByText('Étape 2 / 2')).toBeVisible();
  await expect(page.getByText('Note', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retour aux résultats' }).click();

  // Lier l'article à la fiche : seul le lien est enregistré
  await page.getByRole('button', { name: 'Lier Remplacement de la batterie ThinkPad à la fiche' }).click();
  await expect(page.getByRole('button', { name: 'Lier Remplacement de la batterie ThinkPad à la fiche' })).toContainText('Lié');
  await expect(page.getByText('Articles liés')).toBeVisible();
  const stored = await page.evaluate(async () => {
    return await new Promise<any>((resolve) => {
      const req = indexedDB.open('insertech_events_db');
      req.onsuccess = () => {
        const get = req.result.transaction('repairGuides', 'readonly').objectStore('repairGuides').get('local-portable-prise-charge');
        get.onsuccess = () => resolve(get.result);
      };
    });
  });
  expect(stored.ifixitLinks).toEqual([
    expect.objectContaining({ guideId: 1001, lang: 'fr', title: 'Remplacement de la batterie ThinkPad' })
  ]);

  // La bibliothèque indique l'article lié ; hors ligne, l'aperçu s'ouvre depuis le cache du PC
  await page.getByRole('tab', { name: /^Bibliothèque/ }).click();
  await expect(page.getByText('1 article(s) iFixit')).toBeVisible();
  ifixit.offline = true;
  await page.getByRole('tab', { name: 'Articles iFixit' }).click();
  await page.getByLabel('Fiche locale à compléter').selectOption({ label: fiche });
  await page.getByLabel('Rechercher un article iFixit à lier').fill('ThinkPad battery');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.getByRole('button', { name: 'Aperçu de Remplacement de la batterie ThinkPad' }).click();
  await expect(page.getByText('Étape 1 / 2')).toBeVisible();

  expect(errors).toEqual([]);
});
