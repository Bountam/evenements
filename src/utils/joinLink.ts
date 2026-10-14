// Liens et codes QR pour rejoindre une session réseau local depuis un téléphone ou une tablette.

// Adresse publique de l'application (GitHub Pages), utilisée quand cette fenêtre n'a pas
// d'adresse joignable par les autres appareils (exécutable en file://, serveur de dev localhost).
export const PUBLIC_APP_URL = 'https://bountam.github.io/evenements/';

// Paramètre d'URL qui déclenche la connexion automatique à une session (?rejoindre=INS-1234-ABCD)
export const JOIN_PARAM = 'rejoindre';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// Adresse de l'application que les autres appareils peuvent ouvrir
export function getShareableAppUrl(loc: Location = window.location): string {
  const isWeb = loc.protocol === 'http:' || loc.protocol === 'https:';
  if (isWeb && !LOCAL_HOSTS.has(loc.hostname)) {
    return loc.origin + loc.pathname;
  }
  return PUBLIC_APP_URL;
}

export function buildJoinUrl(code: string, loc: Location = window.location): string {
  const url = new URL(getShareableAppUrl(loc));
  url.searchParams.set(JOIN_PARAM, code);
  return url.toString();
}

// Code de session lu dans l'URL courante (null si absent ou mal formé)
export function readJoinCodeFromUrl(loc: Location = window.location): string | null {
  const raw = new URLSearchParams(loc.search).get(JOIN_PARAM);
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9-]{4,40}$/.test(code) ? code : null;
}

// Retire ?rejoindre=… de la barre d'adresse pour qu'un rechargement ne relance pas la connexion
export function clearJoinCodeFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(JOIN_PARAM)) return;
  url.searchParams.delete(JOIN_PARAM);
  window.history.replaceState(window.history.state, '', url.toString());
}

// Échappement des caractères réservés du format WIFI: (\ ; , : ")
function escapeWifiField(value: string): string {
  return value.replace(/([\;,:"])/g, '\\$1');
}

// Contenu standard d'un code QR Wi-Fi, reconnu par l'appareil photo d'iOS et d'Android
export function buildWifiQrPayload(ssid: string, password: string): string {
  const s = escapeWifiField(ssid);
  if (!password) return `WIFI:T:nopass;S:${s};;`;
  return `WIFI:T:WPA;S:${s};P:${escapeWifiField(password)};;`;
}
