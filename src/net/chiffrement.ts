// Chiffrement de la liaison PC ↔ tablette, avec l'API Web Crypto seulement (navigateur, WebView, Node).
// - La clé de session réseau (12 caractères base32, affichée ABCD-EFGH-JKLM) ne voyage jamais : chaque
//   côté prouve qu'il la connaît (HMAC-SHA256 d'un nonce aléatoire de l'autre côté).
// - Une clé AES-GCM 256 bits propre à la liaison est dérivée (HKDF-SHA256) des deux nonces.
// - Chaque message : JSON, AES-GCM avec un IV aléatoire de 12 octets placé devant, le tout en base64.

export const ALPHABET_CLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1 (32 signes = 5 bits)
export const LONGUEUR_CLE = 12; // 60 bits

const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Le chiffrement n'est pas disponible dans ce navigateur.");
  return s;
}

function octetsAleatoires(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function versBase64(bytes: Uint8Array): string {
  let binaire = '';
  const PAS = 0x8000; // par tranches : String.fromCharCode refuse les très longs tableaux
  for (let i = 0; i < bytes.length; i += PAS) {
    binaire += String.fromCharCode(...bytes.subarray(i, i + PAS));
  }
  return btoa(binaire);
}

export function depuisBase64(texte: string): Uint8Array {
  const binaire = atob(texte);
  const bytes = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) bytes[i] = binaire.charCodeAt(i);
  return bytes;
}

// --- Clé de session réseau ---

export function nouvelleCle(): string {
  // Rejet des valeurs ≥ 256 - (256 % 32) inutile : 256 est un multiple de 32, chaque signe est équiprobable
  return Array.from(octetsAleatoires(LONGUEUR_CLE), (b) => ALPHABET_CLE[b % 32]).join('');
}

// Saisie tolérante : minuscules, espaces et tirets acceptés ; renvoie null si la clé n'est pas valide
export function normaliserCle(saisie: string): string | null {
  const cle = saisie.toUpperCase().replace(/[\s-]/g, '');
  if (cle.length !== LONGUEUR_CLE) return null;
  for (const c of cle) if (!ALPHABET_CLE.includes(c)) return null;
  return cle;
}

export function formaterCle(cle: string): string {
  return cle.match(/.{1,4}/g)?.join('-') ?? cle;
}

export function nouveauNonce(): string {
  return versBase64(octetsAleatoires(16));
}

// --- Preuve de connaissance de la clé ---

async function cleHmac(cle: string): Promise<CryptoKey> {
  return subtle().importKey('raw', encodeur.encode(cle), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function preuve(cle: string, nonce: string, code: string): Promise<string> {
  const signature = await subtle().sign('HMAC', await cleHmac(cle), encodeur.encode(`${nonce}|${code}`));
  return versBase64(new Uint8Array(signature));
}

// Comparaison en temps constant : la durée ne révèle pas la longueur du préfixe juste
export async function verifierPreuve(cle: string, nonce: string, code: string, recue: unknown): Promise<boolean> {
  if (typeof recue !== 'string') return false;
  const attendue = await preuve(cle, nonce, code);
  if (attendue.length !== recue.length) return false;
  let diff = 0;
  for (let i = 0; i < attendue.length; i++) diff |= attendue.charCodeAt(i) ^ recue.charCodeAt(i);
  return diff === 0;
}

// --- Clé de la liaison ---

export async function cleDeSession(cle: string, nonceHote: string, nonceTablette: string): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', encodeur.encode(cle), 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encodeur.encode(`${nonceHote}|${nonceTablette}`),
      info: encodeur.encode('insertech-liaison-v1')
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function chiffrer(cleSession: CryptoKey, objet: unknown): Promise<string> {
  const iv = octetsAleatoires(12);
  const clair = encodeur.encode(JSON.stringify(objet));
  const chiffre = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, cleSession, clair));
  const tout = new Uint8Array(iv.length + chiffre.length);
  tout.set(iv, 0);
  tout.set(chiffre, iv.length);
  return versBase64(tout);
}

// Lève une erreur si le message a été altéré ou chiffré avec une autre clé
export async function dechiffrer(cleSession: CryptoKey, texte: string): Promise<unknown> {
  const tout = depuisBase64(texte);
  if (tout.length < 12 + 16) throw new Error('Message trop court');
  const clair = await subtle().decrypt({ name: 'AES-GCM', iv: tout.subarray(0, 12) }, cleSession, tout.subarray(12));
  return JSON.parse(decodeur.decode(clair));
}
