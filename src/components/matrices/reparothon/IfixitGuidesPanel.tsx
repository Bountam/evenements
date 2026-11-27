import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  BookOpen,
  WifiOff,
  RefreshCw,
  Database,
  ArrowRight,
  ImageOff,
  Stethoscope,
  KeyRound,
  Library
} from 'lucide-react';
import type { OfflineRepairGuide, RepairTicket } from '../../../types';
import { registerSyncListener } from '../../../db';
import { networkManager } from '../../../network';
import { buildIfixitQueries, getDiagnosticSuggestions } from '../../../utils/repairLexicon';
import {
  extractBrandTags,
  getAllOfflineGuides,
  matchOfflineGuidesForTicket,
  offlineGuideToViewerDetail,
  searchOfflineGuidesLibrary
} from '../../../utils/offlineGuideLibrary';
import {
  getIfixitGuideDetail,
  getStoredIfixitApiKey,
  hasIfixitApiKey,
  searchIfixitGuides,
  setIfixitApiKey,
  type IfixitGuideDetail,
  type IfixitGuideSummary
} from '../../../services/ifixitService';
import IfixitGuideViewer from './IfixitGuideViewer';

interface IfixitGuidesPanelProps {
  ticket: RepairTicket;
  onOpenDiagnostic?: () => void;
  onOpenLibrary?: () => void;
}

type LangFilter = 'all' | 'fr' | 'en';

export default function IfixitGuidesPanel({
  ticket,
  onOpenDiagnostic,
  onOpenLibrary
}: IfixitGuidesPanelProps) {
  const initialQueries = useMemo(() => buildIfixitQueries(ticket), [ticket]);
  const suggestions = useMemo(() => getDiagnosticSuggestions(ticket), [ticket]);
  const ticketBrands = useMemo(
    () => extractBrandTags(`${ticket.extraData?.brand || ''} ${ticket.objectName || ''}`),
    [ticket]
  );

  const [query, setQuery] = useState(initialQueries.frQuery);
  const [langFilter, setLangFilter] = useState<LangFilter>('all');
  const [offlineGuides, setOfflineGuides] = useState<OfflineRepairGuide[]>([]);
  const [results, setResults] = useState<IfixitGuideSummary[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [offlineState, setOfflineState] = useState(false);
  const [usedFallbackEn, setUsedFallbackEn] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedGuide, setSelectedGuide] = useState<IfixitGuideDetail | null>(null);
  const [loadingGuideId, setLoadingGuideId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => getStoredIfixitApiKey());
  const [apiKeyConfigured, setApiKeyConfigured] = useState(() => hasIfixitApiKey());
  const [isManualQuery, setIsManualQuery] = useState(false);

  const loadRelevantOffline = useCallback(
    async (manualText?: string) => {
      const all = await getAllOfflineGuides();
      if (manualText && manualText.trim()) {
        const localHits = searchOfflineGuidesLibrary(manualText, all);
        if (networkManager.role === 'client') {
          const hostHits = await networkManager.searchHostGuides(manualText, ticket.id);
          const byId = new Map<string, OfflineRepairGuide>();
          for (const g of [...hostHits, ...localHits]) byId.set(g.id, g);
          setOfflineGuides(Array.from(byId.values()));
          return Array.from(byId.values());
        }
        setOfflineGuides(localHits);
        return localHits;
      }

      const matched = matchOfflineGuidesForTicket(ticket, all, 6);
      setOfflineGuides(matched);
      return matched;
    },
    [ticket]
  );

  const runSearch = useCallback(
    async (searchText: string, enQueryHint?: string, forceRefresh = false, manual = false) => {
      const cleaned = searchText.trim();
      if (!cleaned) return;
      setLoadingSearch(true);
      setSearchError(null);
      setDetailError(null);
      setIsManualQuery(manual);

      try {
        await loadRelevantOffline(manual ? cleaned : undefined);
        const res = await searchIfixitGuides(cleaned, {
          enQuery: enQueryHint || cleaned,
          forceRefresh
        });

        // Exclure aussi côté résultats iFixit les marques manifestement incompatibles si la marque du ticket est connue
        const brandFiltered =
          !manual && ticketBrands.length > 0
            ? res.results.filter((r) => {
                const guideBrands = extractBrandTags(`${r.title} ${r.device}`);
                return guideBrands.length === 0 || guideBrands.some((b) => ticketBrands.includes(b));
              })
            : res.results;

        setResults(brandFiltered);
        setFromCache(res.fromCache);
        setOfflineState(res.offline);
        setUsedFallbackEn(res.usedFallbackEn);
        setSearchError(res.error || null);
      } catch {
        setResults([]);
        setOfflineState(true);
        setSearchError('Impossible de joindre iFixit.');
      } finally {
        setLoadingSearch(false);
      }
    },
    [loadRelevantOffline, ticketBrands]
  );

  useEffect(() => {
    setSelectedGuide(null);
    setQuery(initialQueries.frQuery);
    void runSearch(initialQueries.frQuery, initialQueries.enQuery, false, false);
  }, [ticket.id, initialQueries.frQuery, initialQueries.enQuery, runSearch]);

  // Se rafraîchit automatiquement dès que le Laptop serveur pousse un guide pertinent via GUIDES_SYNC
  useEffect(() => {
    const unsub = registerSyncListener(() => {
      if (!isManualQuery) {
        void loadRelevantOffline();
      }
    });
    return unsub;
  }, [isManualQuery, loadRelevantOffline]);

  const handleOpenGuide = async (summary: IfixitGuideSummary) => {
    setLoadingGuideId(summary.guideid);
    setDetailError(null);
    try {
      const detail = await getIfixitGuideDetail(summary.guideid, summary.lang);
      setResults((prev) =>
        prev.map((item) =>
          item.guideid === summary.guideid && item.lang === summary.lang
            ? { ...item, isCachedDetail: true }
            : item
        )
      );
      setSelectedGuide(detail);
    } catch (err) {
      setDetailError(
        err instanceof Error
          ? err.message
          : "Impossible d'ouvrir ce guide en mode hors-ligne."
      );
    } finally {
      setLoadingGuideId(null);
    }
  };

  if (selectedGuide) {
    return (
      <IfixitGuideViewer
        guide={selectedGuide}
        onBack={() => setSelectedGuide(null)}
      />
    );
  }

  const filteredOffline =
    langFilter === 'all'
      ? offlineGuides
      : offlineGuides.filter((g) => g.lang === langFilter);

  // Éviter les doublons si un guide iFixit téléchargé hors-ligne est aussi dans les résultats en ligne
  const offlineIfixitIds = new Set(
    filteredOffline.map((g) => g.ifixitGuideId).filter((id): id is number => typeof id === 'number')
  );
  const filteredOnline = (
    langFilter === 'all' ? results : results.filter((r) => r.lang === langFilter)
  ).filter((r) => !offlineIfixitIds.has(r.guideid));

  const hasAnyGuides = filteredOffline.length > 0 || filteredOnline.length > 0;

  const quickTags = Array.from(
    new Set([...suggestions.suggestedKeywords.fr, ...suggestions.suggestedKeywords.en])
  ).slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Barre de recherche iFixit + Bibliothèque hors-ligne + filtre langue */}
      <div className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-micro uppercase font-black text-primary block">
              Guides ciblés selon l&apos;inscription • Hors-ligne + iFixit
            </span>
            <h4 className="text-base font-display font-bold uppercase text-app-text">
              Guides adaptés à {ticket.objectName}
            </h4>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {fromCache && results.length > 0 && (
              <span className="text-micro px-2.5 py-1 rounded-full bg-success/15 border border-success/40 text-success font-bold uppercase inline-flex items-center gap-1">
                <Database size={11} aria-hidden="true" />
                <span>Recherche en cache</span>
              </span>
            )}
            {onOpenLibrary && (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="min-h-9 px-2.5 py-1 rounded-full border bg-primary/15 border-primary/40 text-primary text-micro font-display font-bold uppercase cursor-pointer inline-flex items-center gap-1"
              >
                <Library size={12} aria-hidden="true" />
                <span>Bibliothèque</span>
              </button>
            )}
            <button
              type="button"
              aria-expanded={showKeyConfig}
              onClick={() => setShowKeyConfig((prev) => !prev)}
              className={`min-h-9 px-2.5 py-1 rounded-full border text-micro font-display font-bold uppercase cursor-pointer inline-flex items-center gap-1 ${
                apiKeyConfigured
                  ? 'bg-success/15 border-success/40 text-success'
                  : 'bg-app-input border-app-card-border text-app-text-muted hover:border-primary/50'
              }`}
            >
              <KeyRound size={12} aria-hidden="true" />
              <span>Clé API</span>
            </button>
          </div>
        </div>

        {showKeyConfig && (
          <div className="p-3 rounded-2xl bg-app-input border border-app-card-border flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="password"
              aria-label="Clé API iFixit"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="ifx_..."
              className="flex-1 bg-app-card border border-app-input-border rounded-xl px-3 py-2 min-h-10 text-xs text-app-text font-mono"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIfixitApiKey(apiKeyInput);
                  setApiKeyConfigured(hasIfixitApiKey());
                  setShowKeyConfig(false);
                  void runSearch(query, query, true, isManualQuery);
                }}
                className="min-h-10 px-3.5 py-1.5 rounded-xl bg-primary text-secondary font-display font-black uppercase text-xs cursor-pointer"
              >
                Enregistrer
              </button>
              {getStoredIfixitApiKey() && (
                <button
                  type="button"
                  onClick={() => {
                    setApiKeyInput('');
                    setIfixitApiKey('');
                    setApiKeyConfigured(hasIfixitApiKey());
                    setShowKeyConfig(false);
                  }}
                  className="min-h-10 px-3 py-1.5 rounded-xl bg-app-card border border-app-card-border text-app-text-muted font-display font-bold uppercase text-xs cursor-pointer"
                >
                  Effacer
                </button>
              )}
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query, query, false, true);
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              aria-label="Rechercher un guide iFixit"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Modèle et symptôme (ex. ThinkPad T480 battery)"
              className="w-full bg-app-input border border-app-input-border rounded-xl pl-3.5 pr-3 py-2.5 min-h-11 text-sm text-app-text"
            />
          </div>
          <button
            type="submit"
            disabled={loadingSearch}
            className="min-h-11 px-5 py-2.5 rounded-xl bg-primary text-secondary font-display font-black uppercase text-xs cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Search size={15} aria-hidden="true" />
            <span>Rechercher</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par langue">
            {(
              [
                { id: 'all', label: 'Tous' },
                { id: 'fr', label: 'FR' },
                { id: 'en', label: 'EN' }
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={langFilter === opt.id}
                onClick={() => setLangFilter(opt.id)}
                className={`min-h-9 px-3 py-1 rounded-full border text-xs font-display font-bold uppercase cursor-pointer ${
                  langFilter === opt.id
                    ? 'bg-primary text-secondary border-primary'
                    : 'bg-app-input text-app-text-muted border-app-card-border hover:border-primary/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {quickTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {quickTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const nextQuery = `${ticket.objectName} ${tag}`.trim();
                    setQuery(nextQuery);
                    void runSearch(nextQuery, nextQuery, false, true);
                  }}
                  className="min-h-8 px-2.5 py-0.5 rounded-full bg-app-input border border-app-card-border text-micro font-mono text-app-text-muted hover:text-primary hover:border-primary/50 cursor-pointer"
                >
                  + {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {usedFallbackEn && results.some((r) => r.lang === 'en') && (
          <p className="text-xs text-app-text-muted">
            Peu de résultats en français : complété automatiquement avec les guides anglais (EN).
          </p>
        )}
      </div>

      {/* Bandeau erreur ouverture guide */}
      {detailError && (
        <div
          role="alert"
          className="bg-warning/15 border border-warning/40 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-sm text-app-text font-semibold">
            <WifiOff size={17} className="text-warning shrink-0" aria-hidden="true" />
            <span>{detailError}</span>
          </div>
          {onOpenDiagnostic && (
            <button
              type="button"
              onClick={onOpenDiagnostic}
              className="min-h-10 px-3.5 py-1.5 rounded-xl bg-app-card border border-app-card-border text-xs font-display font-bold uppercase text-app-text cursor-pointer"
            >
              Diagnostic local
            </button>
          )}
        </div>
      )}

      {/* État chargement */}
      {loadingSearch && (
        <div className="bg-app-card border border-app-card-border p-8 rounded-3xl text-center text-sm text-app-text-muted">
          Recherche des guides adaptés en cours…
        </div>
      )}

      {/* État hors-ligne sans aucun guide correspondant */}
      {!loadingSearch && !hasAnyGuides && (offlineState || searchError) && (
        <div className="bg-app-card border border-app-card-border p-6 rounded-3xl shadow-lg text-center space-y-3">
          <WifiOff size={28} className="mx-auto text-warning" aria-hidden="true" />
          <div className="space-y-1">
            <h5 className="text-base font-display font-bold uppercase text-app-text">
              Mode hors-ligne — le diagnostic local reste disponible
            </h5>
            <p className="text-xs text-app-text-muted">
              {searchError ||
                'Aucun guide en cache local pour cette recherche. Connectez l’appareil au réseau ou utilisez la fiche de diagnostic locale.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void runSearch(query, query, true, isManualQuery)}
              className="min-h-11 px-4 py-2 rounded-xl bg-primary text-secondary font-display font-black uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>Réessayer</span>
            </button>
            {onOpenDiagnostic && (
              <button
                type="button"
                onClick={onOpenDiagnostic}
                className="min-h-11 px-4 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Stethoscope size={14} aria-hidden="true" />
                <span>Ouvrir le diagnostic local</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* État vide en ligne */}
      {!loadingSearch && !hasAnyGuides && !offlineState && !searchError && (
        <div className="bg-app-card border border-app-card-border p-6 rounded-3xl text-center space-y-2">
          <BookOpen size={24} className="mx-auto text-app-text-muted" aria-hidden="true" />
          <p className="text-sm text-app-text-muted">
            Aucun guide trouvé pour « {query} ». Essayez un nom de modèle plus court (ex. ThinkPad T480).
          </p>
        </div>
      )}

      {/* Guides hors-ligne pertinents (distribués avec le participant + fiches maison ciblées) */}
      {!loadingSearch && filteredOffline.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-micro font-display font-black uppercase tracking-wider text-primary px-1">
            Guides disponibles hors-ligne pour ce ticket ({filteredOffline.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredOffline.map((guide) => {
              const thumb = guide.steps.find((s) => s.images.length > 0)?.images[0]?.thumbnailDataUrl || '';
              return (
                <button
                  key={guide.id}
                  type="button"
                  onClick={() => setSelectedGuide(offlineGuideToViewerDetail(guide))}
                  className="bg-app-card border border-app-card-border hover:border-primary/70 rounded-2xl p-3.5 text-left shadow-sm transition-colors cursor-pointer flex items-center gap-3"
                >
                  <div className="w-20 h-16 rounded-xl overflow-hidden bg-app-input border border-app-card-border shrink-0 flex items-center justify-center">
                    {thumb ? (
                      <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen size={18} className="text-primary opacity-80" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-micro px-2 py-0.5 rounded-full bg-primary/15 border border-primary/40 text-primary font-display font-black uppercase">
                        {guide.lang.toUpperCase()}
                      </span>
                      <span className="text-micro px-2 py-0.5 rounded-full bg-success/15 border border-success/40 text-success font-bold uppercase">
                        Hors-ligne prêt
                      </span>
                      {guide.device && (
                        <span className="text-micro text-app-text-muted truncate">{guide.device}</span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-app-text line-clamp-2 leading-snug">
                      {guide.title}
                    </div>
                  </div>

                  <ArrowRight size={16} className="text-app-text-muted shrink-0" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Liste des guides iFixit en ligne / cache navigateur */}
      {!loadingSearch && filteredOnline.length > 0 && (
        <div className="space-y-3">
          {offlineState && (
            <div className="bg-warning/15 border border-warning/40 px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs text-app-text">
              <span className="font-semibold">
                Mode hors-ligne : résultats affichés depuis le cache local.
              </span>
              <button
                type="button"
                onClick={() => void runSearch(query, query, true, isManualQuery)}
                className="min-h-8 px-3 py-1 rounded-lg bg-app-card border border-app-card-border font-bold uppercase cursor-pointer"
              >
                Réessayer
              </button>
            </div>
          )}

          <p className="text-micro font-display font-black uppercase tracking-wider text-app-text-muted px-1">
            Guides iFixit ({filteredOnline.length})
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredOnline.map((guide) => {
              const isOpening = loadingGuideId === guide.guideid;
              return (
                <button
                  key={`${guide.lang}-${guide.guideid}`}
                  type="button"
                  disabled={isOpening}
                  onClick={() => void handleOpenGuide(guide)}
                  className="bg-app-card border border-app-card-border hover:border-primary/70 rounded-2xl p-3.5 text-left shadow-sm transition-colors cursor-pointer flex items-center gap-3 disabled:opacity-60"
                >
                  <div className="w-20 h-16 rounded-xl overflow-hidden bg-app-input border border-app-card-border shrink-0 flex items-center justify-center">
                    {guide.thumbnail && !failedThumbs[guide.thumbnail] ? (
                      <img
                        src={guide.thumbnail}
                        alt=""
                        loading="lazy"
                        onError={() =>
                          setFailedThumbs((prev) => ({ ...prev, [guide.thumbnail]: true }))
                        }
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageOff size={18} className="text-app-text-muted opacity-60" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-micro px-2 py-0.5 rounded-full bg-primary/15 border border-primary/40 text-primary font-display font-black uppercase">
                        {guide.lang.toUpperCase()}
                      </span>
                      {(guide.isCachedDetail || fromCache) && (
                        <span className="text-micro px-2 py-0.5 rounded-full bg-success/15 border border-success/40 text-success font-bold uppercase">
                          En cache
                        </span>
                      )}
                      {guide.device && (
                        <span className="text-micro text-app-text-muted truncate">{guide.device}</span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-app-text line-clamp-2 leading-snug">
                      {guide.title}
                    </div>
                    {isOpening && (
                      <span className="text-micro text-primary font-bold uppercase">Chargement…</span>
                    )}
                  </div>

                  <ArrowRight size={16} className="text-app-text-muted shrink-0" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
