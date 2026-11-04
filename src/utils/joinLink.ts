// Liens et codes QR pour rejoindre une session réseau local depuis une tablette Android.

import { normaliserCle } from '../net/chiffrement';

// Paramètre d'URL qui déclenche la connexion automatique à une session (?rejoindre=INS-1234-ABCD)
export const JOIN_PARAM = 'rejoindre';

// Lien du QR affiché par le PC hôte, ouvert par l'appli Android (scanner intégré ou appareil photo) :
//   insertech://rejoindre?code=INS-1234-ABCD&cle=ABCDEFGHJKLM&nom=<nom de l'événement>
// Pas d'adresse IP ni d'adresse internet : c'est le PC qui trouve la tablette sur le réseau local.
export const SCHEMA_LIEN = 'insertech:';
export const CODE_SESSION_RE = /^INS-[A-Z0-9-]{4,24}$/;

export interface LienRejoindre {
  code: string;
  cle: string;
  nom: string;
}

export function buildNativeJoinLink(code: string, cle: string, nom = ''): string {
  const params = new URLSearchParams({ code, cle });
  const nomPropre = nom.trim().slice(0, 60);
  if (nomPropre) params.set('nom', nomPropre);
  return `insertech://rejoindre?${params.toString()}`;
}

// Lien valide → { code, cle, nom } ; tout autre texte (autre QR, lien altéré) → null
export function parseJoinLink(texte: string): LienRejoindre | null {
  let url: URL;
  try {
    url = new URL(texte.trim());
  } catch {
    return null;
  }
  if (url.protocol !== SCHEMA_LIEN) return null;
  // insertech://rejoindre?… : « rejoindre » est l'hôte de l'URL (ou le chemin selon le navigateur)
  const cible = (url.hostname || url.pathname.replace(/^\/+/, '')).toLowerCase();
  if (cible !== 'rejoindre') return null;
  const code = (url.searchParams.get('code') || '').trim().toUpperCase();
  const cle = normaliserCle(url.searchParams.get('cle') || '');
  if (!CODE_SESSION_RE.test(code) || !cle) return null;
  return { code, cle, nom: (url.searchParams.get('nom') || '').trim().slice(0, 60) };
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
