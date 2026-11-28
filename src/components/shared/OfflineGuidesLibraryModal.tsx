import React, { useEffect, useRef, useState } from 'react';
import {
  Library,
  Search,
  Download,
  Upload,
  Trash2,
  Plus,
  CheckCircle,
  KeyRound,
  BookOpen,
  Loader2,
  Link2,
  Eye,
  X
} from 'lucide-react';
import Modal from '../shared/Modal';
import { showToast } from '../shared/Toast';
import type {
  DeviceCategory,
  OfflineRepairGuide,
  OperatingSystem,
  RepairSymptomDomain
} from '../../types';
import {
  BUILTIN_REPAIR_GUIDES,
  deleteOfflineGuide,
  exportOfflineGuidesPack,
  extractBrandTags,
  getAllOfflineGuides,
  importOfflineGuidesPack,
  linkIfixitArticle,
  saveOfflineGuide,
  unlinkIfixitArticle
} from '../../utils/offlineGuideLibrary';
import {
  getIfixitGuideDetail,
  getStoredIfixitApiKey,
  hasIfixitApiKey,
  isIfixitRelayed,
  searchIfixitGuides,
  setIfixitApiKey,
  testIfixitApiKey,
  type IfixitGuideDetail,
  type IfixitGuideSummary
} from '../../services/ifixitService';
import IfixitGuideViewer from '../matrices/reparothon/IfixitGuideViewer';
import { saveFile } from '../../utils/saveFile';
import ScrollZone from './ScrollZone';

interface OfflineGuidesLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOMAIN_OPTIONS: { id: RepairSymptomDomain; label: string }[] = [
  { id: 'alimentation', label: 'Alimentation' },
  { id: 'batterie', label: 'Batterie' },
  { id: 'ecran', label: 'Écran' },
  { id: 'lenteur_os', label: 'Lenteur / OS' },
  { id: 'linux', label: 'Linux' },
  { id: 'surchauffe', label: 'Surchauffe / Ventilo' },
  { id: 'clavier_ports', label: 'Clavier / Ports' },
  { id: 'wifi', label: 'Wi-Fi / Réseau' }
];

const CATEGORY_OPTIONS: { id: DeviceCategory; label: string }[] = [
  { id: 'laptop', label: 'Portable' },
  { id: 'pc_tour', label: 'PC Tour' },
  { id: 'cellulaire', label: 'Cellulaire' },
  { id: 'tablette', label: 'Tablette' },
  { id: 'autre', label: 'Autre' }
];

export default function OfflineGuidesLibraryModal({ isOpen, onClose }: OfflineGuidesLibraryModalProps) {
  const [tab, setTab] = useState<'library' | 'ifixit' | 'custom'>('library');
  const [guides, setGuides] = useState<OfflineRepairGuide[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState(() => getStoredIfixitApiKey());
  const [hasKey, setHasKey] = useState(() => hasIfixitApiKey());

  // Articles iFixit liés aux fiches locales (PC hôte seulement : la clé n'existe que sur ce PC)
  const relayed = isIfixitRelayed();
  const [ifixitQuery, setIfixitQuery] = useState('');
  const [ifixitResults, setIfixitResults] = useState<IfixitGuideSummary[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [targetGuideId, setTargetGuideId] = useState('');
  const [preview, setPreview] = useState<IfixitGuideDetail | null>(null);
  const [keyTest, setKeyTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingKey, setTestingKey] = useState(false);

  // Nouvelle fiche maison
  const [customTitle, setCustomTitle] = useState('');
  const [customDevice, setCustomDevice] = useState('');
  const [customCategory, setCustomCategory] = useState<DeviceCategory>('laptop');
  const [customOs, setCustomOs] = useState<OperatingSystem | ''>('');
  const [customDomains, setCustomDomains] = useState<RepairSymptomDomain[]>(['lenteur_os']);
  const [customTools, setCustomTools] = useState('');
  const [customStepsText, setCustomStepsText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadGuides = async () => {
    const all = await getAllOfflineGuides();
    setGuides(all);
  };

  useEffect(() => {
    if (isOpen) {
      void loadGuides();
      setHasKey(hasIfixitApiKey());
    }
  }, [isOpen]);

  const customOrDownloaded = guides.filter((g) => g.source !== 'builtin');
  const targetGuide = guides.find((g) => g.id === targetGuideId) || null;
  const linkedIds = new Set((targetGuide?.ifixitLinks ?? []).map((l) => `${l.lang}-${l.guideId}`));

  const chooseTarget = (id: string) => {
    setTargetGuideId(id);
    const g = guides.find((x) => x.id === id);
    setIfixitQuery(g?.ifixitRecherche || g?.title || '');
    setIfixitResults([]);
    setSearchMessage(null);
  };

  const handleIfixitSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ifixitQuery.trim()) return;
    setSearching(true);
    setSearchMessage(null);
    try {
      const res = await searchIfixitGuides(ifixitQuery.trim(), { forceRefresh: true });
      setIfixitResults(res.results);
      if (res.error) setSearchMessage(res.error);
      else if (res.results.length === 0) setSearchMessage('Aucun article trouvé. Essayez des mots en anglais (ex. battery, screen).');
    } finally {
      setSearching(false);
    }
  };

  const handlePreview = async (summary: IfixitGuideSummary) => {
    setBusyId(summary.guideid);
    try {
      setPreview(await getIfixitGuideDetail(summary.guideid, summary.lang));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Impossible d'ouvrir l'article.", 'error');
    } finally {
      setBusyId(null);
    }
  };

  // Lier l'article à la fiche : seul le lien est enregistré, l'article reste chez iFixit (licence CC BY-NC-SA)
  const handleLink = async (summary: IfixitGuideSummary) => {
    if (!targetGuide) return;
    setBusyId(summary.guideid);
    try {
      let url: string | undefined;
      try {
        url = (await getIfixitGuideDetail(summary.guideid, summary.lang)).url;
      } catch {
        url = undefined;
      }
      await linkIfixitArticle(targetGuide.id, { guideId: summary.guideid, lang: summary.lang, title: summary.title, url });
      await loadGuides();
      showToast(`Article lié à « ${targetGuide.title} ».`, 'success');
    } finally {
      setBusyId(null);
    }
  };

  const handleExportPack = async () => {
    const json = exportOfflineGuidesPack(guides);
    await saveFile('insertech-guides-hors-ligne.json', new Blob([json], { type: 'application/json' }));
    showToast('Pack de guides hors-ligne exporté.', 'success');
  };

  const handleImportPack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const count = await importOfflineGuidesPack(text);
      await loadGuides();
      showToast(`${count} guide(s) importé(s) dans la bibliothèque.`, 'success');
    } catch {
      showToast('Fichier JSON de guides invalide.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;
    const rawSteps = customStepsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const guide: OfflineRepairGuide = {
      id: `custom-${Date.now().toString(36)}`,
      source: 'custom',
      lang: 'fr',
      title: customTitle.trim(),
      device: customDevice.trim(),
      brands: extractBrandTags(`${customTitle} ${customDevice}`),
      models: [],
      categories: [customCategory],
      operatingSystems: customOs ? [customOs] : undefined,
      symptomDomains: customDomains.length > 0 ? customDomains : ['lenteur_os'],
      difficulty: 'Facile',
      timeRequired: '15 min',
      introduction: '',
      tools: customTools
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      parts: [],
      steps:
        rawSteps.length > 0
          ? rawSteps.map((line, idx) => ({
              stepid: idx + 1,
              orderby: idx + 1,
              title: `Étape ${idx + 1}`,
              images: [],
              lines: [{ text: line, bullet: 'black', level: 0 }]
            }))
          : [
              {
                stepid: 1,
                orderby: 1,
                title: 'Procédure',
                images: [],
                lines: [{ text: customTitle.trim(), bullet: 'black', level: 0 }]
              }
            ],
      updatedAt: Date.now()
    };
    await saveOfflineGuide(guide);
    await loadGuides();
    setCustomTitle('');
    setCustomDevice('');
    setCustomTools('');
    setCustomStepsText('');
    setTab('library');
    showToast('Fiche maison ajoutée à la bibliothèque hors-ligne.', 'success');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bibliothèque de guides hors-ligne"
      icon={Library}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        <div className={`grid ${relayed ? 'grid-cols-2' : 'grid-cols-3'} gap-2`} role="tablist" aria-label="Gestion bibliothèque hors-ligne">
          {(
            [
              { id: 'library', label: `Bibliothèque (${guides.length})` },
              { id: 'ifixit', label: 'Articles iFixit' },
              { id: 'custom', label: 'Nouvelle fiche' }
            ] as const
          ).filter((t) => !(relayed && t.id === 'ifixit')).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-11 px-3 py-2 rounded-xl border-2 font-display font-bold uppercase text-xs cursor-pointer ${
                tab === t.id
                  ? 'bg-primary text-secondary border-primary'
                  : 'bg-app-input text-app-text border-app-card-border'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'library' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-app-input border border-app-card-border">
              <div className="text-xs text-app-text-muted">
                <strong className="text-app-text">{BUILTIN_REPAIR_GUIDES.length} fiches Insertech</strong> pré-incluses +{' '}
                <strong className="text-primary">{customOrDownloaded.length} fiche(s) ajoutée(s)</strong> (distribuées automatiquement aux tablettes avec les tickets).
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportPack}
                  className="min-h-10 px-3 py-1.5 rounded-xl bg-app-card border border-app-card-border text-xs font-display font-bold uppercase text-app-text cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Download size={14} aria-hidden="true" />
                  <span>Exporter JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-10 px-3 py-1.5 rounded-xl bg-primary text-secondary text-xs font-display font-black uppercase cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Upload size={14} aria-hidden="true" />
                  <span>Importer JSON</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportPack}
                  className="hidden"
                />
              </div>
            </div>

            <ScrollZone className="space-y-2 max-h-96 pr-1">
              {guides.map((g) => (
                <div
                  key={g.id}
                  className="p-3.5 rounded-2xl bg-app-input border border-app-card-border flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-micro px-2 py-0.5 rounded-full bg-primary/15 border border-primary/40 text-primary font-display font-black uppercase">
                        {g.source === 'builtin' ? 'Insertech' : g.source === 'ifixit' ? `iFixit ${g.lang.toUpperCase()}` : 'Maison'}
                      </span>
                      {g.reluPar === '' && (
                        <span className="text-micro px-2 py-0.5 rounded-full bg-warning/15 border border-warning/40 text-warning font-bold uppercase">
                          Brouillon
                        </span>
                      )}
                      {(g.ifixitLinks?.length ?? 0) > 0 && (
                        <span className="text-micro px-2 py-0.5 rounded-full bg-success/15 border border-success/40 text-success font-bold uppercase">
                          {g.ifixitLinks?.length} article(s) iFixit
                        </span>
                      )}
                      {g.brands.map((b) => (
                        <span key={b} className="text-micro px-2 py-0.5 rounded-full bg-app-card border border-app-card-border text-app-text uppercase font-bold">
                          {b}
                        </span>
                      ))}
                      {g.operatingSystems?.map((os) => (
                        <span key={os} className="text-micro px-2 py-0.5 rounded-full bg-info/15 border border-info/40 text-info uppercase font-bold">
                          {os}
                        </span>
                      ))}
                    </div>
                    <div className="text-sm font-bold text-app-text truncate">{g.title}</div>
                    <div className="text-xs text-app-text-muted truncate">
                      {g.device || g.categories.join(', ')} • {g.steps.length} étape(s)
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                  {!relayed && (
                    <button
                      type="button"
                      aria-label={`Lier un article iFixit à ${g.title}`}
                      title="Lier un article iFixit"
                      onClick={() => {
                        chooseTarget(g.id);
                        setTab('ifixit');
                      }}
                      className="min-h-10 min-w-10 p-2 rounded-xl bg-app-card border border-app-card-border text-primary cursor-pointer flex items-center justify-center"
                    >
                      <Link2 size={15} aria-hidden="true" />
                    </button>
                  )}
                  {g.source !== 'builtin' ? (
                    <button
                      type="button"
                      aria-label={`Supprimer ${g.title}`}
                      onClick={async () => {
                        await deleteOfflineGuide(g.id);
                        await loadGuides();
                      }}
                      className="min-h-10 min-w-10 p-2 rounded-xl bg-danger/15 border border-danger/40 text-danger cursor-pointer shrink-0 flex items-center justify-center"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  ) : (
                    <BookOpen size={16} className="text-app-text-muted shrink-0 mr-1" aria-hidden="true" />
                  )}
                  </div>
                </div>
              ))}
            </ScrollZone>
          </div>
        )}

        {tab === 'ifixit' && !relayed && preview && (
          <IfixitGuideViewer guide={preview} backLabel="Retour aux résultats" onBack={() => setPreview(null)} />
        )}

        {tab === 'ifixit' && !relayed && !preview && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-app-input border border-app-card-border space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-app-text inline-flex items-center gap-1.5">
                  <KeyRound size={14} className="text-primary" aria-hidden="true" />
                  <span>Clé API iFixit (stockée uniquement sur ce PC)</span>
                </span>
                {hasKey && <span className="text-micro text-success font-bold uppercase">Active</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="password"
                  aria-label="Clé API iFixit serveur"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="ifx_..."
                  className="flex-1 min-w-40 bg-app-card border border-app-input-border rounded-xl px-3 py-2 min-h-10 text-xs text-app-text font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIfixitApiKey(apiKeyInput);
                    setHasKey(hasIfixitApiKey());
                    setKeyTest(null);
                    showToast('Clé API enregistrée localement sur le PC.', 'success');
                  }}
                  className="min-h-10 px-3.5 py-1.5 rounded-xl bg-app-card border border-app-card-border text-xs font-display font-bold uppercase text-app-text cursor-pointer"
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  disabled={testingKey || !hasKey}
                  onClick={async () => {
                    setTestingKey(true);
                    setKeyTest(await testIfixitApiKey());
                    setTestingKey(false);
                  }}
                  className="min-h-10 px-3.5 py-1.5 rounded-xl bg-app-card border border-app-card-border text-xs font-display font-bold uppercase text-app-text cursor-pointer disabled:opacity-50"
                >
                  {testingKey ? 'Test…' : 'Tester la clé'}
                </button>
              </div>
              {keyTest && (
                <p role="status" className={`text-xs font-bold ${keyTest.ok ? 'text-success' : 'text-warning'}`}>
                  {keyTest.message}
                </p>
              )}
              <p className="text-xs text-app-text-muted">
                Les articles ne sont pas copiés : chaque fiche garde un lien, et l&apos;article complet s&apos;ouvre
                dans l&apos;application, sur ce PC comme sur les tablettes, via cette clé.
              </p>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-app-text">Fiche locale à compléter</span>
              <select
                aria-label="Fiche locale à compléter"
                value={targetGuideId}
                onChange={(e) => chooseTarget(e.target.value)}
                className="w-full bg-app-input border border-app-input-border rounded-xl px-3 py-2.5 min-h-11 text-sm text-app-text"
              >
                <option value="">Choisir une fiche…</option>
                {guides.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>

            {targetGuide && (targetGuide.ifixitLinks?.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <span className="text-micro font-display font-black uppercase text-primary">Articles liés</span>
                {targetGuide.ifixitLinks?.map((l) => (
                  <div
                    key={`${l.lang}-${l.guideId}`}
                    className="p-2.5 rounded-xl bg-app-input border border-app-card-border flex items-center justify-between gap-2"
                  >
                    <span className="text-sm text-app-text truncate">
                      {l.title} <span className="text-micro font-black text-primary">{l.lang.toUpperCase()}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Retirer le lien ${l.title}`}
                      onClick={async () => {
                        await unlinkIfixitArticle(targetGuide.id, l);
                        await loadGuides();
                      }}
                      className="min-h-9 min-w-9 p-2 rounded-lg bg-danger/15 border border-danger/40 text-danger cursor-pointer flex items-center justify-center"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleIfixitSearch} className="flex gap-2">
              <input
                type="text"
                aria-label="Rechercher un article iFixit à lier"
                value={ifixitQuery}
                onChange={(e) => setIfixitQuery(e.target.value)}
                placeholder="Ex. ThinkPad T480 battery, Dell Latitude..."
                className="flex-1 bg-app-input border border-app-input-border rounded-xl px-3.5 py-2.5 min-h-11 text-sm text-app-text"
              />
              <button
                type="submit"
                disabled={searching}
                className="min-h-11 px-4 py-2 rounded-xl bg-primary text-secondary font-display font-black uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                {searching ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
                <span>Chercher</span>
              </button>
            </form>
            {searchMessage && <p className="text-xs text-warning font-semibold">{searchMessage}</p>}

            <ScrollZone className="space-y-2 max-h-80 pr-1">
              {ifixitResults.map((res) => {
                const isLinked = linkedIds.has(`${res.lang}-${res.guideid}`);
                const isBusy = busyId === res.guideid;
                return (
                  <div
                    key={`${res.lang}-${res.guideid}`}
                    className="p-3.5 rounded-2xl bg-app-input border border-app-card-border flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="text-micro font-black uppercase text-primary block">
                        {res.lang.toUpperCase()} • {res.device || 'Guide'}
                      </span>
                      <span className="text-sm font-bold text-app-text block truncate">{res.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        aria-label={`Aperçu de ${res.title}`}
                        onClick={() => void handlePreview(res)}
                        className="min-h-10 px-3 py-1.5 rounded-xl bg-app-card border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Eye size={14} aria-hidden="true" />
                        <span>Aperçu</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || !targetGuide || isLinked}
                        aria-label={`Lier ${res.title} à la fiche`}
                        onClick={() => void handleLink(res)}
                        className={`min-h-10 px-3 py-1.5 rounded-xl font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-1.5 disabled:cursor-not-allowed ${
                          isLinked ? 'bg-success/15 border border-success/40 text-success' : 'bg-primary text-secondary disabled:opacity-50'
                        }`}
                      >
                        {isBusy ? (
                          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        ) : isLinked ? (
                          <CheckCircle size={14} aria-hidden="true" />
                        ) : (
                          <Link2 size={14} aria-hidden="true" />
                        )}
                        <span>{isLinked ? 'Lié' : 'Lier'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </ScrollZone>
          </div>
        )}

        {tab === 'custom' && (
          <form onSubmit={handleCreateCustom} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                aria-label="Titre de la fiche"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Titre (ex. Dell Latitude : remplacement batterie)"
                className="bg-app-input border border-app-input-border rounded-xl px-3.5 py-2.5 min-h-11 text-sm text-app-text"
              />
              <input
                type="text"
                aria-label="Appareil / Marque ciblée"
                value={customDevice}
                onChange={(e) => setCustomDevice(e.target.value)}
                placeholder="Marque / Modèle (ex. Dell Latitude)"
                className="bg-app-input border border-app-input-border rounded-xl px-3.5 py-2.5 min-h-11 text-sm text-app-text"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                aria-label="Catégorie ciblée"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value as DeviceCategory)}
                className="bg-app-input border border-app-input-border rounded-xl px-3 py-2.5 min-h-11 text-sm text-app-text"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Système d'exploitation ciblé"
                value={customOs}
                onChange={(e) => setCustomOs(e.target.value as OperatingSystem | '')}
                className="bg-app-input border border-app-input-border rounded-xl px-3 py-2.5 min-h-11 text-sm text-app-text"
              >
                <option value="">Tous les OS</option>
                <option value="linux">Linux</option>
                <option value="windows">Windows</option>
                <option value="mac">macOS</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {DOMAIN_OPTIONS.map((dom) => {
                const active = customDomains.includes(dom.id);
                return (
                  <button
                    key={dom.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setCustomDomains((prev) =>
                        prev.includes(dom.id) ? prev.filter((d) => d !== dom.id) : [...prev, dom.id]
                      )
                    }
                    className={`min-h-9 px-3 py-1 rounded-full border text-xs font-bold cursor-pointer ${
                      active
                        ? 'bg-primary text-secondary border-primary'
                        : 'bg-app-input text-app-text-muted border-app-card-border'
                    }`}
                  >
                    {dom.label}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              aria-label="Outils requis"
              value={customTools}
              onChange={(e) => setCustomTools(e.target.value)}
              placeholder="Outils (séparés par des virgules)"
              className="w-full bg-app-input border border-app-input-border rounded-xl px-3.5 py-2.5 min-h-11 text-sm text-app-text"
            />

            <textarea
              rows={4}
              aria-label="Étapes pas à pas"
              value={customStepsText}
              onChange={(e) => setCustomStepsText(e.target.value)}
              placeholder="Une étape par ligne..."
              className="w-full bg-app-input border border-app-input-border rounded-xl px-3.5 py-2.5 text-sm text-app-text"
            />

            <div className="flex justify-end">
              <button
                type="submit"
                className="min-h-11 px-5 py-2.5 rounded-xl bg-primary text-secondary font-display font-black uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus size={15} aria-hidden="true" />
                <span>Enregistrer la fiche</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
