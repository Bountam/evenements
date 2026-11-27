import { expect, test } from '@playwright/test';

const URL = 'http://localhost:4173/';

const SIMULATE_ANDROID = () => {
  (window as any).androidBridge = { postMessage: () => {} };
};

// PNG 1x1 valide en base64 pour mocker miniature et image pleine résolution
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test('Bibliothèque hors-ligne : filtrage strict selon l’inscription, zoom image HD et gestionnaire Laptop', async ({
  page
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL);

  // Bloquer toute requête iFixit externe dans ce test pour isoler le 100 % hors-ligne
  await page.route('https://*.ifixit.com/**', async (route) => {
    await route.abort();
  });

  // 1. Sur Laptop : ouvrir la Bibliothèque de guides hors-ligne depuis Plus et créer un guide Dell batterie + un guide Lenovo Linux
  await page.getByRole('radio', { name: /^Réparothon/ }).click();
  await page.locator('#eventName').fill('Réparothon Bibliothèque CI');
  await page.getByPlaceholder('Ex. Montréal, QC').fill('Montréal');
  await page.getByRole('button', { name: "Créer l'activité" }).click();

  await page.getByRole('button', { name: 'Plus' }).click();
  await page.getByRole('button', { name: 'Bibliothèque de guides hors-ligne' }).click();
  await expect(page.getByRole('heading', { name: 'Bibliothèque de guides hors-ligne' })).toBeVisible();

  await page.getByRole('tab', { name: 'Nouvelle fiche' }).click();
  await page.getByLabel('Titre de la fiche').fill('Dell Latitude 5400 : remplacement batterie');
  await page.getByLabel('Appareil / Marque ciblée').fill('Dell Latitude 5400');
  await page.getByLabel('Catégorie ciblée').selectOption('laptop');
  await page.getByRole('button', { name: 'Batterie', exact: true }).click();
  await page.getByLabel('Outils requis').fill('Tournevis Phillips #0');
  await page.getByLabel('Étapes pas à pas').fill('Dévisser le capot inférieur.\nDébrancher la batterie Dell.');
  await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await expect(page.getByText('Dell Latitude 5400 : remplacement batterie')).toBeVisible();
  await page.keyboard.press('Escape');

  // Injecter aussi un guide hors-ligne ciblé Lenovo ThinkPad + Linux + Lenteur AVEC miniature embarquée et fullResUrl
  await page.evaluate(async (thumbDataUrl) => {
    const req = indexedDB.open('insertech_events_db');
    await new Promise<void>((resolve, reject) => {
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('repairGuides', 'readwrite');
        tx.objectStore('repairGuides').put({
          id: 'custom-lenovo-linux-slow',
          source: 'custom',
          lang: 'fr',
          title: 'Lenovo ThinkPad sous Linux : diagnostic disque lent',
          device: 'Lenovo ThinkPad T480',
          brands: ['lenovo'],
          models: ['t480'],
          categories: ['laptop'],
          operatingSystems: ['linux'],
          symptomDomains: ['lenteur_os', 'linux'],
          difficulty: 'Facile',
          timeRequired: '15 min',
          introduction: 'Diagnostic rapide disque & RAM sous Linux.',
          tools: ['Clé USB Live Linux'],
          parts: [],
          steps: [
            {
              stepid: 1,
              orderby: 1,
              title: 'Vérifier l’espace et la santé SMART',
              images: [
                {
                  id: 1,
                  thumbnailDataUrl: thumbDataUrl,
                  fullResUrl: 'https://guide-images.cdn.ifixit.com/igi/test-hd-fullres.jpg'
                }
              ],
              lines: [{ text: 'Ouvrir Disques et inspecter le statut SMART.', bullet: 'black', level: 0 }]
            }
          ],
          updatedAt: Date.now()
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, TINY_PNG_DATA_URL);

  // 2. Inscrire un participant avec un Lenovo ThinkPad sous Linux souffrant de lenteur
  await page.getByRole('group', { name: "Catégorie d'appareil" }).getByRole('button', { name: 'Portable' }).click();
  await page.getByRole('group', { name: "Marque de l'appareil" }).getByRole('button', { name: 'Lenovo' }).click();
  await page.getByRole('group', { name: 'Gamme ou modèle' }).getByRole('button', { name: 'ThinkPad' }).click();
  await page.getByRole('group', { name: 'Domaine du problème' }).getByRole('button', { name: /Problème Logiciel/i }).click();
  await page.getByRole('group', { name: "Symptômes de l'appareil" }).getByRole('button', { name: /Lent \/ Virus \/ Nettoyage/i }).click();
  await page.getByRole('button', { name: /^Continuer/i }).click();
  await page.getByLabel(/Système d'exploitation de/i).selectOption('linux');
  await page.getByRole('button', { name: /Inscrire le participant/i }).click();

  await page.locator('#rp-displayName').fill('Claire Gagnon');
  await page.locator('#rp-phone').fill('514 555-3344');
  await page.locator('#rp-consentActivity').check();
  await page.getByRole('button', { name: /Valider et enregistrer 1 appareil/i }).click();
  await expect(page.getByText('Appareil enregistré pour Claire Gagnon !')).toBeVisible();

  // 3. Passer sur mobile Réparateur, prendre le ticket de Claire, ouvrir l'onglet Guides iFixit
  await page.addInitScript(SIMULATE_ANDROID);
  await page.reload();
  await page.getByRole('button', { name: /Animateur Réparateur/i }).click();
  await page.getByRole('button', { name: /Alexandre Tremblay/i }).click();

  await page
    .locator('.p-4.rounded-2xl')
    .filter({ hasText: 'Claire Gagnon' })
    .getByRole('button', { name: /Prendre cet appareil/i })
    .click();

  await page
    .getByRole('tablist', { name: 'Vues du ticket actif' })
    .getByRole('tab', { name: /^Guides iFixit/ })
    .click();

  // Filtrage strict : le guide Lenovo Linux Lenteur est affiché, le guide Dell Batterie N'APPARAÎT JAMAIS
  const relevantGuideCard = page.getByRole('button', {
    name: /Lenovo ThinkPad sous Linux : diagnostic disque lent/i
  });
  await expect(relevantGuideCard).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Dell Latitude 5400 : remplacement batterie/i })
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Windows lent/i })
  ).toHaveCount(0);

  // 4. Tester le clic sur la miniature dans le lecteur :
  // a) Hors-ligne / erreur HD -> l'image reste affichée telle quelle sans modale cassée
  let allowFullRes = false;
  await page.route('https://guide-images.cdn.ifixit.com/igi/test-hd-fullres.jpg', async (route) => {
    if (!allowFullRes) {
      await route.abort();
      return;
    }
    await route.fulfill({ contentType: 'image/png', body: TINY_PNG_BUFFER });
  });

  await relevantGuideCard.click();
  await expect(page.getByText('Étape 1 / 1')).toBeVisible();
  const imgBtn = page.getByRole('button', { name: "Afficher l'image en pleine résolution" });
  await expect(imgBtn).toBeVisible();

  await imgBtn.click();
  await page.waitForTimeout(300);
  await expect(page.getByRole('dialog', { name: 'Image étape en pleine résolution' })).toHaveCount(0);
  await expect(imgBtn).toBeVisible();

  // b) Lorsque la pleine résolution répond, le clic ouvre la vue pleine résolution puis Fermer la referme
  allowFullRes = true;
  await imgBtn.click();
  const hdDialog = page.getByRole('dialog', { name: 'Image étape en pleine résolution' });
  await expect(hdDialog).toBeVisible();
  await hdDialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(hdDialog).toHaveCount(0);

  expect(errors).toEqual([]);
});
