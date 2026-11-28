import { expect, test } from '@playwright/test';
import { GUIDES_LOCAUX, RECHERCHE_FICHES_INITIALES } from '../src/data/guidesLocaux';

// Plan v1.9, étape 5 : fiches locales complètes, utilisables sans internet et prêtes à être liées à iFixit
test('Fiches locales : complètes, sans contenu distant, toutes catégories et tous symptômes couverts', () => {
  expect(GUIDES_LOCAUX.length + Object.keys(RECHERCHE_FICHES_INITIALES).length).toBeGreaterThanOrEqual(30);
  const ids = new Set(GUIDES_LOCAUX.map((g) => g.id));
  expect(ids.size).toBe(GUIDES_LOCAUX.length);

  for (const g of GUIDES_LOCAUX) {
    const ou = `fiche ${g.id}`;
    expect(g.introduction.length, ou).toBeGreaterThan(60);
    expect(g.tools.length, ou).toBeGreaterThan(0);
    expect(g.steps.length, ou).toBeGreaterThanOrEqual(3);
    expect(g.ifixitRecherche, ou).toBeTruthy();
    expect(g.reluPar, ou).toBe('');
    for (const step of g.steps) {
      expect(step.title, ou).toBeTruthy();
      expect(step.lines.length, `${ou} / ${step.title}`).toBeGreaterThan(0);
      expect(step.images, ou).toEqual([]);
    }
    // Sécurité d'abord : au moins un avertissement par fiche
    expect(g.steps.some((s) => s.lines.some((l) => l.bullet === 'icon_caution')), ou).toBe(true);
    // Rien qui charge internet depuis une tablette
    expect(JSON.stringify(g), ou).not.toMatch(/https?:\/\//);
  }

  const categories = new Set(GUIDES_LOCAUX.flatMap((g) => g.categories));
  for (const c of ['laptop', 'pc_tour', 'cellulaire', 'tablette']) expect(categories.has(c as any), c).toBe(true);
  const domaines = new Set(GUIDES_LOCAUX.flatMap((g) => g.symptomDomains));
  for (const d of ['alimentation', 'batterie', 'ecran', 'lenteur_os', 'surchauffe', 'clavier_ports', 'wifi', 'linux']) {
    expect(domaines.has(d as any), d).toBe(true);
  }
});
