import { versBase64 } from './chiffrement';
import type { Lien } from './lien';

// Mise à jour des tablettes par le PC hôte, sur la liaison chiffrée déjà ouverte (lot 8) : ni Play Store,
// ni internet. L'APK part en morceaux de 64 Ko, un seul en vol à la fois :
//   PC → tablette : MAJ_PROPOSEE { versionName, versionCode, taille, sha256, morceaux }
//   tablette → PC : MAJ_ACCEPTEE { depuis } (reprise possible) ou MAJ_REFUSEE { raison }
//   PC → tablette : MAJ_MORCEAU { index, donnees }   tablette → PC : MAJ_MORCEAU_OK { index } ou MAJ_REDEMANDE { index }
//   PC → tablette : MAJ_FIN                           tablette → PC : MAJ_VERIFIEE ou MAJ_ERREUR { raison }
//   tablette → PC : MAJ_ETAT { etat: 'confirmation' | 'autorisation' }
// La tablette vérifie le SHA-256 et la signature de l'APK (même clé que l'appli installée) avant d'installer.

export const TAILLE_MORCEAU = 64 * 1024;
export const TAILLE_MAX_APK = 200 * 1024 * 1024;
export const NOM_APK_GITHUB = 'InsertechEvenements-Android.apk';

export type MessageMaj =
  | { type: 'MAJ_PROPOSEE'; versionName: string; versionCode: number; taille: number; sha256: string; morceaux: number }
  | { type: 'MAJ_ACCEPTEE'; depuis: number }
  | { type: 'MAJ_REFUSEE'; raison: string }
  | { type: 'MAJ_MORCEAU'; index: number; donnees: string }
  | { type: 'MAJ_MORCEAU_OK'; index: number }
  | { type: 'MAJ_REDEMANDE'; index: number }
  | { type: 'MAJ_FIN' }
  | { type: 'MAJ_VERIFIEE' }
  | { type: 'MAJ_ERREUR'; raison: string }
  | { type: 'MAJ_ETAT'; etat: 'confirmation' | 'autorisation' };

export function estMessageMaj(msg: unknown): msg is MessageMaj {
  const type = (msg as { type?: unknown } | null)?.type;
  return typeof type === 'string' && type.startsWith('MAJ_');
}

// Même calcul que scripts/sync-version.js (versionCode de l'APK)
export function versionCodeDe(version: string): number | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) return null;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

export function versionDepuisNomFichier(nom: string): string {
  return /(\d+\.\d+\.\d+)/.exec(nom)?.[1] ?? '';
}

export async function sha256Hex(octets: Uint8Array): Promise<string> {
  const empreinte = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', octets));
  return Array.from(empreinte, (b) => b.toString(16).padStart(2, '0')).join('');
}

// SHA256SUMS.txt d'une Release : « <empreinte>  <nom du fichier> » par ligne
export function empreinteDansSommes(sommes: string, nomFichier: string): string | null {
  for (const ligne of sommes.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(ligne.trim());
    if (m && m[2].trim() === nomFichier) return m[1].toLowerCase();
  }
  return null;
}

// --- Côté PC hôte ---

export type EtatEnvoi =
  | 'proposee'
  | 'refusee'
  | 'envoi'
  | 'verification'
  | 'confirmation'
  | 'autorisation'
  | 'installee'
  | 'erreur'
  | 'perdue';

export interface EnvoiTablette {
  nom: string;
  etat: EtatEnvoi;
  pourcentage: number;
  raison: string;
  version: string | null;
}

export interface ApkPret {
  octets: Uint8Array;
  versionName: string;
  versionCode: number;
  sha256: string;
}

export class DiffusionMaj {
  readonly morceaux: number;
  private envois = new Map<string, EnvoiTablette>(); // par nom de tablette (idDistant)
  private liens = new Map<string, Lien>(); // connectionId → liaison qui reçoit l'APK
  private abonnes = new Set<() => void>();

  constructor(readonly apk: ApkPret) {
    this.morceaux = Math.max(1, Math.ceil(apk.octets.length / TAILLE_MORCEAU));
  }

  onChange(cb: () => void): () => void {
    this.abonnes.add(cb);
    return () => this.abonnes.delete(cb);
  }

  getEnvois(): EnvoiTablette[] {
    return Array.from(this.envois.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }

  private maj(lien: Lien, changements: Partial<EnvoiTablette>) {
    const avant = this.envois.get(lien.idDistant) ?? { nom: lien.idDistant, etat: 'proposee', pourcentage: 0, raison: '', version: null };
    this.envois.set(lien.idDistant, { ...avant, ...changements });
    this.abonnes.forEach((cb) => cb());
  }

  proposer(lien: Lien) {
    if (!lien.open) return;
    this.liens.set(lien.connectionId, lien);
    this.maj(lien, { etat: 'proposee', pourcentage: 0, raison: '' });
    const { versionName, versionCode, sha256, octets } = this.apk;
    lien.send({ type: 'MAJ_PROPOSEE', versionName, versionCode, taille: octets.length, sha256, morceaux: this.morceaux });
  }

  private envoyerMorceau(lien: Lien, index: number) {
    if (index >= this.morceaux) {
      this.maj(lien, { etat: 'verification', pourcentage: 100 });
      lien.send({ type: 'MAJ_FIN' });
      return;
    }
    const debut = index * TAILLE_MORCEAU;
    const donnees = versBase64(this.apk.octets.subarray(debut, debut + TAILLE_MORCEAU));
    this.maj(lien, { etat: 'envoi', pourcentage: Math.floor((index / this.morceaux) * 100) });
    lien.send({ type: 'MAJ_MORCEAU', index, donnees });
  }

  recevoir(lien: Lien, msg: MessageMaj) {
    if (!this.liens.has(lien.connectionId)) return; // pas de proposition en cours sur cette liaison
    switch (msg.type) {
      case 'MAJ_ACCEPTEE':
        this.envoyerMorceau(lien, Math.max(0, Math.min(Number(msg.depuis) || 0, this.morceaux)));
        break;
      case 'MAJ_REFUSEE':
        this.liens.delete(lien.connectionId);
        this.maj(lien, { etat: 'refusee', raison: String(msg.raison || '') });
        break;
      case 'MAJ_MORCEAU_OK':
        this.envoyerMorceau(lien, Number(msg.index) + 1);
        break;
      case 'MAJ_REDEMANDE':
        this.envoyerMorceau(lien, Math.max(0, Number(msg.index) || 0));
        break;
      case 'MAJ_VERIFIEE':
        this.maj(lien, { etat: 'verification', pourcentage: 100 });
        break;
      case 'MAJ_ERREUR':
        this.liens.delete(lien.connectionId);
        this.maj(lien, { etat: 'erreur', raison: String(msg.raison || '') });
        break;
      case 'MAJ_ETAT':
        this.maj(lien, { etat: msg.etat === 'autorisation' ? 'autorisation' : 'confirmation' });
        break;
    }
  }

  // Liaison coupée : pendant l'installation c'est normal (l'appli redémarre), sinon l'envoi est perdu
  lienFerme(lien: Lien) {
    if (!this.liens.delete(lien.connectionId)) return;
    const envoi = this.envois.get(lien.idDistant);
    if (envoi && (envoi.etat === 'envoi' || envoi.etat === 'proposee')) this.maj(lien, { etat: 'perdue' });
  }

  // Version annoncée par une tablette (REQUEST_INITIAL_SYNC) : installée, ou à reproposer après une coupure
  versionSignalee(lien: Lien, version: string) {
    const code = versionCodeDe(version);
    const envoi = this.envois.get(lien.idDistant);
    if (code !== null && code >= this.apk.versionCode) {
      if (envoi) this.maj(lien, { etat: 'installee', version, raison: '' });
      return;
    }
    if (envoi && ['perdue', 'confirmation', 'autorisation', 'verification'].includes(envoi.etat)) this.proposer(lien);
  }
}

// --- Côté tablette ---

export interface NatifMaj {
  // Prépare le fichier ; renvoie le nombre d'octets déjà reçus pour cette empreinte (reprise)
  ouvrir(sha256: string, taille: number): Promise<number>;
  // Ajoute un morceau ; renvoie null si accepté, sinon l'index attendu
  ecrire(index: number, donnees: string): Promise<number | null>;
  // Vérifie empreinte, signature et version ; renvoie la raison d'un refus, ou null
  verifier(sha256: string, versionCode: number): Promise<string | null>;
  installer(): Promise<'confirmation' | 'autorisation'>;
}

export interface ContexteTablette {
  natif: NatifMaj | null;
  versionCodeActuel(): number;
  verrouillee(): boolean;
  avantInstallation(): Promise<void>;
  informer?(texte: string): void;
}

interface Reception {
  sha256: string;
  taille: number;
  versionCode: number;
  versionName: string;
  morceaux: number;
}

let reception: Reception | null = null;

export function reinitialiserReceptionMaj() {
  reception = null;
}

const RAISON_VERROUILLEE = 'Tablette verrouillée : déverrouillez-la avec le code à 4 chiffres, puis renvoyez la mise à jour.';

export async function recevoirMajTablette(lien: Lien, msg: MessageMaj, ctx: ContexteTablette): Promise<void> {
  const repondre = (m: MessageMaj) => {
    if (lien.open) lien.send(m);
  };
  const erreur = (raison: string) => {
    reception = null;
    repondre({ type: 'MAJ_ERREUR', raison });
  };
  try {
    switch (msg.type) {
      case 'MAJ_PROPOSEE': {
        const { versionName, versionCode, taille, sha256, morceaux } = msg;
        if (!ctx.natif) return repondre({ type: 'MAJ_REFUSEE', raison: "Seule l'application Android peut installer une mise à jour." });
        if (!Number.isInteger(versionCode) || versionCode <= ctx.versionCodeActuel()) {
          return repondre({ type: 'MAJ_REFUSEE', raison: `Version ${versionName} pas plus récente que celle de la tablette.` });
        }
        if (ctx.verrouillee()) return repondre({ type: 'MAJ_REFUSEE', raison: RAISON_VERROUILLEE });
        if (!/^[0-9a-f]{64}$/.test(sha256) || !(taille > 0 && taille <= TAILLE_MAX_APK) || morceaux !== Math.ceil(taille / TAILLE_MORCEAU)) {
          return repondre({ type: 'MAJ_REFUSEE', raison: 'Proposition de mise à jour invalide.' });
        }
        const deja = await ctx.natif.ouvrir(sha256, taille);
        reception = { sha256, taille, versionCode, versionName, morceaux };
        ctx.informer?.(`Mise à jour ${versionName} en cours de réception depuis le PC hôte…`);
        // Fichier déjà complet (renvoi après l'autorisation d'installer) : directement la vérification
        return repondre({ type: 'MAJ_ACCEPTEE', depuis: deja >= taille ? morceaux : Math.floor(deja / TAILLE_MORCEAU) });
      }
      case 'MAJ_MORCEAU': {
        if (!reception || !ctx.natif) return;
        if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= reception.morceaux || typeof msg.donnees !== 'string') {
          return erreur('Morceau de mise à jour invalide.');
        }
        const attendu = await ctx.natif.ecrire(msg.index, msg.donnees);
        if (attendu === null) return repondre({ type: 'MAJ_MORCEAU_OK', index: msg.index });
        return repondre({ type: 'MAJ_REDEMANDE', index: attendu });
      }
      case 'MAJ_FIN': {
        if (!reception || !ctx.natif) return;
        const { sha256, versionCode, versionName } = reception;
        const refus = await ctx.natif.verifier(sha256, versionCode);
        if (refus) return erreur(refus);
        repondre({ type: 'MAJ_VERIFIEE' });
        if (ctx.verrouillee()) return erreur(RAISON_VERROUILLEE);
        // Rien ne doit se perdre pendant le redémarrage : sauvegarde locale et envois au PC terminés
        await ctx.avantInstallation();
        const etat = await ctx.natif.installer();
        ctx.informer?.(
          etat === 'autorisation'
            ? 'Autorisez Insertech à installer des applis, puis demandez au PC de renvoyer la mise à jour.'
            : `Touchez « Mettre à jour » pour installer la version ${versionName}.`
        );
        return repondre({ type: 'MAJ_ETAT', etat });
      }
      default:
        return;
    }
  } catch (e) {
    erreur(e instanceof Error ? e.message : String(e));
  }
}
