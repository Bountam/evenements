import { EmetteurLien, type Lien } from './lien';
import { chiffrer, cleDeSession, dechiffrer, nouveauNonce, preuve, verifierPreuve } from './chiffrement';

// Poignée de main entre le PC hôte (qui appelle) et la tablette (qui écoute), sur un transport texte :
//   1. tablette → PC : { type: 'DEFI', nonce: nT }
//   2. PC → tablette : { type: 'PREUVE', preuve: HMAC(clé, nT | code | pc), nonce: nH }
//   3. tablette → PC : { type: 'PREUVE', preuve: HMAC(clé, nH | code | tablette) }
// Chaque côté a prouvé qu'il connaît la clé sans l'envoyer ; la clé AES de la liaison est dérivée des
// deux nonces. Les étiquettes « pc » et « tablette » empêchent de renvoyer à l'un la preuve de l'autre.

export const DELAI_POIGNEE_MS = 10_000;

type Envoi = (texte: string) => void;

function lire(texte: string): any {
  try {
    const msg = JSON.parse(texte);
    return msg && typeof msg === 'object' ? msg : null;
  } catch {
    return null;
  }
}

export class PoigneeTablette {
  private readonly nonceTablette = nouveauNonce();
  private terminee = false;

  constructor(private readonly cle: string, private readonly code: string, private readonly envoyer: Envoi) {}

  ouvrir() {
    this.envoyer(JSON.stringify({ type: 'DEFI', nonce: this.nonceTablette, v: 1 }));
  }

  // Clé de la liaison si le PC a prouvé connaître la clé, null sinon (la connexion doit être fermée)
  async recevoir(texte: string): Promise<CryptoKey | null> {
    if (this.terminee) return null;
    this.terminee = true;
    const msg = lire(texte);
    if (!msg || msg.type !== 'PREUVE' || typeof msg.nonce !== 'string' || msg.nonce.length < 16) return null;
    if (!(await verifierPreuve(this.cle, this.nonceTablette, `${this.code}|pc`, msg.preuve))) return null;
    this.envoyer(JSON.stringify({ type: 'PREUVE', preuve: await preuve(this.cle, msg.nonce, `${this.code}|tablette`) }));
    return cleDeSession(this.cle, msg.nonce, this.nonceTablette);
  }
}

export class PoigneeHote {
  private readonly nonceHote = nouveauNonce();
  private nonceTablette: string | null = null;

  constructor(private readonly cle: string, private readonly code: string, private readonly envoyer: Envoi) {}

  // 'attente' après le défi, la clé de la liaison après la preuve de la tablette, null si refusée
  async recevoir(texte: string): Promise<CryptoKey | 'attente' | null> {
    const msg = lire(texte);
    if (!msg) return null;
    if (this.nonceTablette === null) {
      if (msg.type !== 'DEFI' || typeof msg.nonce !== 'string' || msg.nonce.length < 16) return null;
      this.nonceTablette = msg.nonce;
      this.envoyer(
        JSON.stringify({ type: 'PREUVE', preuve: await preuve(this.cle, msg.nonce, `${this.code}|pc`), nonce: this.nonceHote })
      );
      return 'attente';
    }
    if (msg.type !== 'PREUVE') return null;
    if (!(await verifierPreuve(this.cle, this.nonceHote, `${this.code}|tablette`, msg.preuve))) return null;
    return cleDeSession(this.cle, this.nonceHote, this.nonceTablette);
  }
}

let compteurLiens = 0;

// Lien chiffré au-dessus d'un transport texte déjà authentifié. Les envois et les réceptions gardent leur
// ordre malgré le chiffrement asynchrone ; un message qui ne se déchiffre pas est jeté et compté.
export class LienChiffre extends EmetteurLien implements Lien {
  readonly connectionId: string;
  private ouvert = true;
  private chaineEnvoi: Promise<void> = Promise.resolve();
  private chaineReception: Promise<void> = Promise.resolve();
  rejetes = 0;

  constructor(
    readonly idDistant: string,
    private readonly cleSession: CryptoKey,
    private readonly envoyerTexte: Envoi,
    private readonly fermerTransport: () => void
  ) {
    super();
    compteurLiens += 1;
    this.connectionId = `lien-${Date.now().toString(36)}-${compteurLiens}`;
  }

  get open() {
    return this.ouvert;
  }

  send(message: unknown) {
    if (!this.ouvert) throw new Error('Liaison fermée');
    this.chaineEnvoi = this.chaineEnvoi
      .then(async () => {
        const texte = await chiffrer(this.cleSession, message);
        if (this.ouvert) this.envoyerTexte(texte);
      })
      .catch((e) => {
        console.error("Échec d'envoi chiffré :", e);
        this.emit('error', e);
      });
  }

  recevoirTexte(texte: string) {
    this.chaineReception = this.chaineReception.then(async () => {
      try {
        const message = await dechiffrer(this.cleSession, texte);
        if (this.ouvert) this.emit('data', message);
      } catch {
        this.rejetes += 1;
      }
    });
  }

  close() {
    if (!this.ouvert) return;
    this.ouvert = false;
    try {
      this.fermerTransport();
    } catch {
      // Déjà fermé
    }
    this.emit('close');
  }

  // Le transport s'est fermé de lui-même (Wi-Fi, veille, autre côté)
  transportFerme() {
    if (!this.ouvert) return;
    this.ouvert = false;
    this.emit('close');
  }
}
