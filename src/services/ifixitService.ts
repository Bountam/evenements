import { db } from '../db';
import type { IfixitCacheEntry } from '../types';

export const IFIXIT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const IFIXIT_TIMEOUT_MS = 6000;
export const IFIXIT_API_KEY_STORAGE_KEY = 'insertech_ifixit_api_key';

function getEnvApiKey(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_IFIXIT_API_KEY || '').trim();
}

export function getStoredIfixitApiKey(): string {
  try {
    return (localStorage.getItem(IFIXIT_API_KEY_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function getIfixitApiKey(): string {
  return getStoredIfixitApiKey() || getEnvApiKey();
}

export function setIfixitApiKey(apiKey: string): void {
  try {
    const cleaned = apiKey.trim();
    if (!cleaned) {
      localStorage.removeItem(IFIXIT_API_KEY_STORAGE_KEY);
    } else {
      localStorage.setItem(IFIXIT_API_KEY_STORAGE_KEY, cleaned);
    }
  } catch {
    // Stockage local indisponible
  }
}

export function hasIfixitApiKey(): boolean {
  return Boolean(getIfixitApiKey());
}

export type IfixitLang = 'fr' | 'en';

export interface IfixitGuideSummary {
  guideid: number;
  title: string;
  device: string;
  subject: string;
  summary: string;
  difficulty: string;
  thumbnail: string;
  lang: IfixitLang;
  isCachedDetail?: boolean;
}

export interface IfixitStepImage {
  id?: number;
  thumbnail: string;
  medium: string;
  standard: string;
  original?: string;
  embeddedDataUrl?: string;
}

export interface IfixitStepLine {
  text: string;
  bullet: string;
  level: number;
}

export interface IfixitGuideStep {
  stepid: number;
  orderby: number;
  title: string;
  images: IfixitStepImage[];
  lines: IfixitStepLine[];
}

export interface IfixitGuideDetail {
  guideid: number;
  title: string;
  device: string;
  difficulty: string;
  timeRequired: string;
  introduction: string;
  tools: string[];
  parts: string[];
  steps: IfixitGuideStep[];
  lang: IfixitLang;
  fromCache: boolean;
  staleCache: boolean;
}

export interface IfixitSearchResponse {
  results: IfixitGuideSummary[];
  fromCache: boolean;
  staleCache: boolean;
  offline: boolean;
  usedFallbackEn: boolean;
  error?: string;
}

function normalizeQueryKey(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

function guideCacheKey(guideId: number, lang: IfixitLang): string {
  return `guide:${lang}:${guideId}`;
}

function searchCacheKey(query: string): string {
  return `search:${normalizeQueryKey(query)}`;
}

const HTML_ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'"
};

/**
 * Extrait un texte brut sûr depuis `text_raw` ou supprime strictement toute balise HTML sans jamais injecter de HTML brut.
 */
export function cleanPlainText(raw?: unknown, htmlFallback?: unknown): string {
  const candidate =
    typeof raw === 'string' && raw.trim().length > 0
      ? raw
      : typeof htmlFallback === 'string'
        ? htmlFallback
        : '';

  if (!candidate) return '';

  return candidate
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|#x27);/gi, (m) => HTML_ENTITY_MAP[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = IFIXIT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const apiKey = getIfixitApiKey();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function extractImageUrl(image: any): string {
  if (!image || typeof image !== 'object') return '';
  return (
    (typeof image.medium === 'string' && image.medium) ||
    (typeof image.standard === 'string' && image.standard) ||
    (typeof image.thumbnail === 'string' && image.thumbnail) ||
    (typeof image.original === 'string' && image.original) ||
    ''
  );
}

function mapRawSearchItem(raw: any, lang: IfixitLang): IfixitGuideSummary | null {
  const guideid = Number(raw?.guideid);
  if (!Number.isFinite(guideid) || guideid <= 0) return null;

  return {
    guideid,
    title: cleanPlainText(raw?.title_raw, raw?.title) || `Guide #${guideid}`,
    device: cleanPlainText(raw?.category, raw?.subject) || '',
    subject: cleanPlainText(raw?.subject),
    summary: cleanPlainText(raw?.summary),
    difficulty: cleanPlainText(raw?.difficulty),
    thumbnail: extractImageUrl(raw?.image),
    lang
  };
}

async function fetchSearchEndpoint(query: string, lang: IfixitLang): Promise<IfixitGuideSummary[]> {
  const host = lang === 'fr' ? 'fr.ifixit.com' : 'www.ifixit.com';
  const url = `https://${host}/api/2.0/search/${encodeURIComponent(query)}?filter=guide&limit=8`;
  const data = await fetchJsonWithTimeout<any>(url);
  const rawResults = Array.isArray(data?.results) ? data.results : [];
  return rawResults
    .map((item: any) => mapRawSearchItem(item, lang))
    .filter((item: IfixitGuideSummary | null): item is IfixitGuideSummary => Boolean(item));
}

async function annotateCachedDetails(results: IfixitGuideSummary[]): Promise<IfixitGuideSummary[]> {
  if (results.length === 0) return [];
  const keys = results.map((item) => guideCacheKey(item.guideid, item.lang));
  const entries = await db.ifixitCache.bulkGet(keys);
  return results.map((item, idx) => ({
    ...item,
    isCachedDetail: Boolean(entries[idx])
  }));
}

function mergeSearchResults(frResults: IfixitGuideSummary[], enResults: IfixitGuideSummary[]): IfixitGuideSummary[] {
  const seen = new Set<number>();
  const merged: IfixitGuideSummary[] = [];

  for (const item of [...frResults, ...enResults]) {
    if (seen.has(item.guideid)) continue;
    seen.add(item.guideid);
    merged.push(item);
  }
  return merged;
}

function isOfflineNow(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Recherche des guides iFixit : cache IndexedDB -> fr.ifixit.com -> repli auto www.ifixit.com si < 3 résultats.
 */
export async function searchIfixitGuides(
  query: string,
  options?: { enQuery?: string; forceRefresh?: boolean }
): Promise<IfixitSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], fromCache: false, staleCache: false, offline: isOfflineNow(), usedFallbackEn: false };
  }

  const key = searchCacheKey(trimmed);
  const now = Date.now();
  const cached: IfixitCacheEntry | undefined = await db.ifixitCache.get(key).catch(() => undefined);
  const cachedResults: IfixitGuideSummary[] = Array.isArray(cached?.payload?.results) ? cached.payload.results : [];
  const isFresh = Boolean(cached && now - cached.updatedAt < IFIXIT_CACHE_TTL_MS);

  if (cached && isFresh && !options?.forceRefresh) {
    return {
      results: await annotateCachedDetails(cachedResults),
      fromCache: true,
      staleCache: false,
      offline: isOfflineNow(),
      usedFallbackEn: Boolean(cached.payload?.usedFallbackEn)
    };
  }

  if (isOfflineNow()) {
    if (cached) {
      return {
        results: await annotateCachedDetails(cachedResults),
        fromCache: true,
        staleCache: true,
        offline: true,
        usedFallbackEn: Boolean(cached.payload?.usedFallbackEn)
      };
    }
    return {
      results: [],
      fromCache: false,
      staleCache: false,
      offline: true,
      usedFallbackEn: false
    };
  }

  let frResults: IfixitGuideSummary[] = [];
  let frFailed = false;
  try {
    frResults = await fetchSearchEndpoint(trimmed, 'fr');
  } catch {
    frFailed = true;
  }

  let enResults: IfixitGuideSummary[] = [];
  let enFailed = false;
  let usedFallbackEn = false;

  if (frFailed || frResults.length < 3) {
    usedFallbackEn = true;
    const fallbackQuery = (options?.enQuery || trimmed).trim() || trimmed;
    try {
      enResults = await fetchSearchEndpoint(fallbackQuery, 'en');
    } catch {
      enFailed = true;
    }
  }

  if (frFailed && (enFailed || !usedFallbackEn)) {
    if (cached) {
      return {
        results: await annotateCachedDetails(cachedResults),
        fromCache: true,
        staleCache: true,
        offline: true,
        usedFallbackEn: Boolean(cached.payload?.usedFallbackEn),
        error: 'Réseau indisponible — résultats chargés depuis le cache local.'
      };
    }
    return {
      results: [],
      fromCache: false,
      staleCache: false,
      offline: true,
      usedFallbackEn: false,
      error: 'Impossible de joindre iFixit pour le moment.'
    };
  }

  const merged = mergeSearchResults(frResults, enResults);
  const payloadToCache = { results: merged, usedFallbackEn };
  await db.ifixitCache
    .put({
      key,
      kind: 'search',
      lang: frResults.length > 0 ? 'fr' : 'en',
      payload: payloadToCache,
      updatedAt: now
    })
    .catch(() => {});

  return {
    results: await annotateCachedDetails(merged),
    fromCache: false,
    staleCache: false,
    offline: false,
    usedFallbackEn: usedFallbackEn && enResults.length > 0
  };
}

function mapRawGuideDetail(raw: any, guideId: number, lang: IfixitLang, fromCache: boolean, staleCache: boolean): IfixitGuideDetail {
  const tools = Array.isArray(raw?.tools)
    ? raw.tools
        .map((t: any) => cleanPlainText(t?.text, t?.title))
        .filter((s: string) => s.length > 0)
    : [];

  const parts = Array.isArray(raw?.parts)
    ? raw.parts
        .map((p: any) => cleanPlainText(p?.text, p?.title))
        .filter((s: string) => s.length > 0)
    : [];

  const rawSteps = Array.isArray(raw?.steps) ? raw.steps : [];
  const steps: IfixitGuideStep[] = rawSteps.map((step: any, index: number) => {
    const mediaList = Array.isArray(step?.media?.data) ? step.media.data : [];
    const images: IfixitStepImage[] = mediaList
      .map((img: any) => ({
        id: typeof img?.id === 'number' ? img.id : undefined,
        thumbnail: (typeof img?.thumbnail === 'string' && img.thumbnail) || extractImageUrl(img),
        medium: (typeof img?.medium === 'string' && img.medium) || extractImageUrl(img),
        standard: (typeof img?.standard === 'string' && img.standard) || extractImageUrl(img),
        original:
          (typeof img?.original === 'string' && img.original) ||
          (typeof img?.huge === 'string' && img.huge) ||
          (typeof img?.large === 'string' && img.large) ||
          (typeof img?.standard === 'string' && img.standard) ||
          extractImageUrl(img)
      }))
      .filter((img: IfixitStepImage) => Boolean(img.medium || img.standard || img.thumbnail));

    const rawLines = Array.isArray(step?.lines) ? step.lines : [];
    const lines: IfixitStepLine[] = rawLines
      .map((line: any) => ({
        text: cleanPlainText(line?.text_raw, line?.text_rendered || line?.text),
        bullet: typeof line?.bullet === 'string' ? line.bullet : 'black',
        level: typeof line?.level === 'number' ? line.level : 0
      }))
      .filter((line: IfixitStepLine) => line.text.length > 0);

    return {
      stepid: Number(step?.stepid) || index + 1,
      orderby: Number(step?.orderby) || index + 1,
      title: cleanPlainText(step?.title) || `Étape ${index + 1}`,
      images,
      lines
    };
  });

  return {
    guideid: Number(raw?.guideid) || guideId,
    title: cleanPlainText(raw?.title_raw, raw?.title) || `Guide #${guideId}`,
    device: cleanPlainText(raw?.category, raw?.subject),
    difficulty: cleanPlainText(raw?.difficulty),
    timeRequired: cleanPlainText(raw?.time_required),
    introduction: cleanPlainText(raw?.introduction_raw, raw?.introduction_rendered || raw?.introduction),
    tools,
    parts,
    steps,
    lang,
    fromCache,
    staleCache
  };
}

/**
 * Charge le détail complet d'un guide iFixit (avec mise en cache IndexedDB 7 jours et repli hors-ligne).
 */
export async function getIfixitGuideDetail(
  guideId: number,
  lang: IfixitLang,
  options?: { forceRefresh?: boolean }
): Promise<IfixitGuideDetail> {
  const key = guideCacheKey(guideId, lang);
  const now = Date.now();
  const cached: IfixitCacheEntry | undefined = await db.ifixitCache.get(key).catch(() => undefined);
  const isFresh = Boolean(cached && now - cached.updatedAt < IFIXIT_CACHE_TTL_MS);

  if (cached && isFresh && !options?.forceRefresh) {
    return mapRawGuideDetail(cached.payload, guideId, lang, true, false);
  }

  if (isOfflineNow()) {
    if (cached) {
      return mapRawGuideDetail(cached.payload, guideId, lang, true, true);
    }
    throw new Error("Mode hors-ligne : ce guide n'est pas encore enregistré dans le cache local.");
  }

  const host = lang === 'fr' ? 'fr.ifixit.com' : 'www.ifixit.com';
  const url = `https://${host}/api/2.0/guides/${guideId}`;

  try {
    const raw = await fetchJsonWithTimeout<any>(url);
    await db.ifixitCache
      .put({
        key,
        kind: 'guide',
        lang,
        payload: raw,
        updatedAt: now
      })
      .catch(() => {});
    return mapRawGuideDetail(raw, guideId, lang, false, false);
  } catch {
    if (cached) {
      return mapRawGuideDetail(cached.payload, guideId, lang, true, true);
    }
    throw new Error("Impossible de charger ce guide iFixit hors-ligne ou sans connexion.");
  }
}
