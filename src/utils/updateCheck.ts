// Vérification des mises à jour depuis la page Releases de GitHub (Bountam/evenements).
// Légère (quelques Ko en JSON), sans téléchargement automatique d'exécutable ni d'APK.

export const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/Bountam/evenements/releases/latest';
export const ALLOWED_RELEASE_PAGE_PREFIX = 'https://github.com/Bountam/evenements/releases/';
export const ALLOWED_DOWNLOAD_PREFIX = 'https://github.com/Bountam/evenements/releases/download/';

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 heures
export const POSTPONE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 heures

const POSTPONED_STORAGE_KEY = 'insertech_update_postponed';
const IGNORED_STORAGE_KEY = 'insertech_update_ignored';

export interface ReleaseUpdateInfo {
  version: string;
  tagName: string;
  notes: string;
  htmlUrl: string;
  publishedAt: string | null;
  windowsInstallerUrl: string | null;
  androidApkUrl: string | null;
  sha256SumsUrl: string | null;
}

export type UpdateCheckResult =
  | { status: 'update_available'; release: ReleaseUpdateInfo; currentVersion: string }
  | { status: 'up_to_date'; currentVersion: string }
  | { status: 'rate_limited'; currentVersion: string }
  | { status: 'offline'; currentVersion: string }
  | { status: 'error'; currentVersion: string };

// Version courante de l'application (issue de package.json au build, surchargeable en test Playwright)
export function getAppVersion(): string {
  if (typeof window !== 'undefined') {
    const override = (window as any).__INSERTECH_APP_VERSION__;
    if (typeof override === 'string' && override.trim()) {
      return normalizeVersion(override.trim()) || override.trim();
    }
  }
  return normalizeVersion(__APP_VERSION__) || __APP_VERSION__;
}

export function parseSemver(raw: string): [number, number, number] | null {
  if (typeof raw !== 'string') return null;
  const match = /^[vV]?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function normalizeVersion(raw: string): string | null {
  const parsed = parseSemver(raw);
  if (!parsed) return null;
  return `${parsed[0]}.${parsed[1]}.${parsed[2]}`;
}

export function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function isReleaseDismissed(version: string, now = Date.now()): boolean {
  const normalized = normalizeVersion(version) || version;
  try {
    const ignored = localStorage.getItem(IGNORED_STORAGE_KEY);
    if (ignored && (normalizeVersion(ignored) || ignored) === normalized) {
      return true;
    }
    const rawPostponed = localStorage.getItem(POSTPONED_STORAGE_KEY);
    if (rawPostponed) {
      const parsed = JSON.parse(rawPostponed);
      if (
        parsed &&
        typeof parsed.version === 'string' &&
        typeof parsed.until === 'number' &&
        (normalizeVersion(parsed.version) || parsed.version) === normalized &&
        now < parsed.until
      ) {
        return true;
      }
    }
  } catch (e) {
    // Ignorer localStorage indisponible
  }
  return false;
}

export function postponeRelease(version: string, now = Date.now()): void {
  const normalized = normalizeVersion(version) || version;
  try {
    localStorage.setItem(
      POSTPONED_STORAGE_KEY,
      JSON.stringify({ version: normalized, until: now + POSTPONE_DURATION_MS })
    );
  } catch (e) {
    // Ignorer quota localStorage
  }
}

export function ignoreRelease(version: string): void {
  const normalized = normalizeVersion(version) || version;
  try {
    localStorage.setItem(IGNORED_STORAGE_KEY, normalized);
    localStorage.removeItem(POSTPONED_STORAGE_KEY);
  } catch (e) {
    // Ignorer quota localStorage
  }
}

export function clearReleaseDismissal(): void {
  try {
    localStorage.removeItem(POSTPONED_STORAGE_KEY);
    localStorage.removeItem(IGNORED_STORAGE_KEY);
  } catch (e) {
    // Ignorer localStorage indisponible
  }
}

function sanitizeDownloadUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  return url.startsWith(ALLOWED_DOWNLOAD_PREFIX) ? url : null;
}

function sanitizeReleasePageUrl(url: unknown, tagName: string): string {
  if (typeof url === 'string' && url.startsWith(ALLOWED_RELEASE_PAGE_PREFIX)) {
    return url;
  }
  return `${ALLOWED_RELEASE_PAGE_PREFIX}tag/${encodeURIComponent(tagName)}`;
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = getAppVersion();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'offline', currentVersion };
  }

  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' }
    });

    if (response.status === 403 || response.status === 429) {
      return { status: 'rate_limited', currentVersion };
    }

    if (!response.ok) {
      return { status: 'error', currentVersion };
    }

    const data = await response.json();
    if (!data || typeof data !== 'object') {
      return { status: 'error', currentVersion };
    }

    // Les brouillons et pré-versions sont toujours ignorés
    if (data.draft === true || data.prerelease === true) {
      return { status: 'up_to_date', currentVersion };
    }

    const tagName = typeof data.tag_name === 'string' ? data.tag_name.trim() : '';
    const remoteVersion = normalizeVersion(tagName);
    if (!remoteVersion) {
      return { status: 'error', currentVersion };
    }

    if (compareVersions(remoteVersion, currentVersion) <= 0) {
      return { status: 'up_to_date', currentVersion };
    }

    const assets: any[] = Array.isArray(data.assets) ? data.assets : [];
    const expectedWinName = `InsertechEvenements-Setup-${remoteVersion}.exe`;
    const winAsset = assets.find((a) => a && a.name === expectedWinName);
    const apkAsset = assets.find((a) => a && a.name === 'InsertechEvenements-Android.apk');
    const sumsAsset = assets.find((a) => a && a.name === 'SHA256SUMS.txt');

    const release: ReleaseUpdateInfo = {
      version: remoteVersion,
      tagName,
      notes: typeof data.body === 'string' ? data.body.trim() : '',
      htmlUrl: sanitizeReleasePageUrl(data.html_url, tagName),
      publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
      windowsInstallerUrl: sanitizeDownloadUrl(winAsset?.browser_download_url),
      androidApkUrl: sanitizeDownloadUrl(apkAsset?.browser_download_url),
      sha256SumsUrl: sanitizeDownloadUrl(sumsAsset?.browser_download_url)
    };

    return { status: 'update_available', release, currentVersion };
  } catch (e) {
    return { status: 'offline', currentVersion };
  }
}
