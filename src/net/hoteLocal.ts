import { getCompanionEndpoint } from '../utils/sqliteBackup';
import { DELAI_POIGNEE_MS, LienChiffre, PoigneeHote } from './poignee';
import type { Lien } from './lien';
import { PORT_TABLETTE } from './tabletteLocale';

// Côté PC hôte : le PC n'écoute jamais sur le réseau (pas de fenêtre du pare-feu Windows, pas de droits
// administrateur). Il appelle les tablettes, qui écoutent :
// - le lanceur balaie le réseau local (connexions sortantes) et donne la liste sur 127.0.0.1 (/tablettes) ;
// - une tablette peut aussi être ajoutée à la main par son adresse IP ;
// - chaque tablette de la session ouverte est appelée en WebSocket, authentifiée puis chiffrée.

const TOUR_MS = 2000;
const PAUSE_APRES_REFUS_MS = 10_000;
const DELAI_CONNEXION_MS = 5000;
const SONDE_MANUELLE_MS = 10_000;
const MANUELLES_KEY = 'insertech_tablettes_manuelles';

export interface FicheTablette {
  app: 'insertech';
  versionCode?: number;
  nom?: string;
  modele?: string;
  session: string | null;
}

export type EtatTablette = 'attente' | 'connexion' | 'connectee' | 'autre_session' | 'sans_session' | 'refusee' | 'perdue';

export interface TabletteVue {
  adresse: string; // ip:port
  ip: string;
  port: number;
  nom: string;
  modele: string;
  session: string | null;
  etat: EtatTablette;
  rttMs: number | null;
  vuA: number;
  perdueDepuis: number | null;
  manuelle: boolean;
}

export interface ReseauPc {
  nom: string;
  adresse: string;
  prefixe: string; // ex. 192.168.43.0
}

export interface EtatHoteLocal {
  tablettes: TabletteVue[];
  reseaux: ReseauPc[];
  lanceur: boolean; // liste du lanceur disponible (exe PC)
  demarreA: number;
}

interface Candidat {
  ip: string;
  port: number;
  fiche: FicheTablette;
  manuelle: boolean;
  vuA: number;
}

function lireManuelles(): Array<{ ip: string; port: number }> {
  try {
    const liste = JSON.parse(localStorage.getItem(MANUELLES_KEY) || '[]');
    return Array.isArray(liste) ? liste.filter((t) => typeof t?.ip === 'string' && typeof t?.port === 'number') : [];
  } catch {
    return [];
  }
}

function ecrireManuelles(liste: Array<{ ip: string; port: number }>) {
  try {
    localStorage.setItem(MANUELLES_KEY, JSON.stringify(liste));
  } catch {
    // Quota : la tablette restera ajoutée jusqu'au rechargement
  }
}

export function estFiche(valeur: unknown): valeur is FicheTablette {
  return Boolean(valeur && typeof valeur === 'object' && (valeur as FicheTablette).app === 'insertech');
}

// Lit la fiche publique d'une tablette (nom, modèle, session attendue) ; jamais la clé
export function lireFiche(ip: string, port: number, delaiMs = 3000): Promise<FicheTablette> {
  return new Promise((resolve, reject) => {
    let fini = false;
    let ws: WebSocket;
    const terminer = (err: Error | null, fiche?: FicheTablette) => {
      if (fini) return;
      fini = true;
      clearTimeout(delai);
      try {
        ws.close();
      } catch {
        // Déjà fermée
      }
      if (err) reject(err);
      else resolve(fiche as FicheTablette);
    };
    const delai = setTimeout(() => terminer(new Error('injoignable')), delaiMs);
    try {
      ws = new WebSocket(`ws://${ip}:${port}/decouverte`);
    } catch (e) {
      terminer(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    ws.onmessage = (ev) => {
      try {
        const fiche = JSON.parse(String(ev.data));
        if (estFiche(fiche)) terminer(null, fiche);
        else terminer(new Error('pas_insertech'));
      } catch {
        terminer(new Error('pas_insertech'));
      }
    };
    ws.onerror = () => terminer(new Error('injoignable'));
    ws.onclose = () => terminer(new Error('injoignable'));
  });
}

export function adresseValide(ip: string): boolean {
  const parts = ip.trim().split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

export class HoteLocal {
  private timer: ReturnType<typeof setInterval> | null = null;
  private candidats = new Map<string, Candidat>();
  private vues = new Map<string, TabletteVue>();
  private liens = new Map<string, LienChiffre>();
  private enCours = new Set<string>();
  private pauseJusqua = new Map<string, number>();
  private derniereSonde = 0;
  private reseaux: ReseauPc[] = [];
  private lanceur = false;
  private readonly demarreA = Date.now();
  private abonnes = new Set<(etat: EtatHoteLocal) => void>();

  constructor(
    private readonly code: string,
    private readonly cle: string,
    private readonly onLien: (lien: Lien) => void
  ) {}

  demarrer() {
    if (this.timer) return;
    this.tour();
    this.timer = setInterval(() => this.tour(), TOUR_MS);
  }

  arreter() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const lien of this.liens.values()) lien.close();
    this.liens.clear();
  }

  onChange(cb: (etat: EtatHoteLocal) => void): () => void {
    this.abonnes.add(cb);
    cb(this.getEtat());
    return () => this.abonnes.delete(cb);
  }

  getEtat(): EtatHoteLocal {
    return {
      tablettes: Array.from(this.vues.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
      reseaux: this.reseaux,
      lanceur: this.lanceur,
      demarreA: this.demarreA
    };
  }

  private notifier() {
    const etat = this.getEtat();
    this.abonnes.forEach((cb) => cb(etat));
  }

  // Ajout manuel : vérifie d'abord que la tablette répond, puis la garde dans la liste
  async ajouterParIp(ip: string, port = PORT_TABLETTE): Promise<FicheTablette> {
    const fiche = await lireFiche(ip.trim(), port);
    const liste = lireManuelles().filter((t) => !(t.ip === ip.trim() && t.port === port));
    liste.push({ ip: ip.trim(), port });
    ecrireManuelles(liste);
    this.candidats.set(`${ip.trim()}:${port}`, { ip: ip.trim(), port, fiche, manuelle: true, vuA: Date.now() });
    this.tour();
    return fiche;
  }

  retirerManuelle(adresse: string) {
    ecrireManuelles(lireManuelles().filter((t) => `${t.ip}:${t.port}` !== adresse));
    this.candidats.delete(adresse);
    this.vues.delete(adresse);
    this.liens.get(adresse)?.close();
    this.notifier();
  }

  private async lireLanceur() {
    const endpoint = getCompanionEndpoint();
    if (!endpoint) {
      this.lanceur = false;
      return;
    }
    try {
      const res = await fetch(`${endpoint.base}/tablettes?cle=${encodeURIComponent(endpoint.key)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      this.lanceur = true;
      this.reseaux = Array.isArray(data?.reseaux) ? data.reseaux : [];
      for (const t of Array.isArray(data?.tablettes) ? data.tablettes : []) {
        if (typeof t?.ip !== 'string' || typeof t?.port !== 'number') continue;
        const fiche: FicheTablette = {
          app: 'insertech',
          nom: t.nom,
          modele: t.modele,
          session: typeof t.session === 'string' ? t.session : null,
          versionCode: t.versionCode
        };
        const adresse = `${t.ip}:${t.port}`;
        const deja = this.candidats.get(adresse);
        this.candidats.set(adresse, { ip: t.ip, port: t.port, fiche, manuelle: deja?.manuelle ?? false, vuA: Number(t.vuA) || Date.now() });
      }
    } catch {
      this.lanceur = false;
    }
  }

  private async sonderManuelles() {
    if (Date.now() - this.derniereSonde < SONDE_MANUELLE_MS) return;
    this.derniereSonde = Date.now();
    await Promise.all(
      lireManuelles().map(async ({ ip, port }) => {
        const adresse = `${ip}:${port}`;
        if (this.liens.has(adresse)) return;
        try {
          const fiche = await lireFiche(ip, port, 1500);
          this.candidats.set(adresse, { ip, port, fiche, manuelle: true, vuA: Date.now() });
        } catch {
          // Pas de réponse : elle garde son dernier état
        }
      })
    );
  }

  private majVue(adresse: string, changements: Partial<TabletteVue>) {
    const c = this.candidats.get(adresse);
    const precedente = this.vues.get(adresse);
    const base: TabletteVue = precedente ?? {
      adresse,
      ip: c?.ip ?? adresse.split(':')[0],
      port: c?.port ?? PORT_TABLETTE,
      nom: c?.fiche.nom || 'Tablette',
      modele: c?.fiche.modele || '',
      session: c?.fiche.session ?? null,
      etat: 'attente',
      rttMs: null,
      vuA: c?.vuA ?? Date.now(),
      perdueDepuis: null,
      manuelle: c?.manuelle ?? false
    };
    const suivante = {
      ...base,
      ...(c ? { nom: c.fiche.nom || base.nom, modele: c.fiche.modele || base.modele, session: c.fiche.session, vuA: c.vuA, manuelle: c.manuelle } : {}),
      ...changements
    };
    this.vues.set(adresse, suivante);
  }

  private async tour() {
    await Promise.all([this.lireLanceur(), this.sonderManuelles()]);
    for (const [adresse, c] of this.candidats) {
      if (this.liens.has(adresse) || this.enCours.has(adresse)) continue;
      const precedente = this.vues.get(adresse);
      if (c.fiche.session === null) {
        this.majVue(adresse, { etat: precedente?.etat === 'perdue' ? 'perdue' : 'sans_session' });
        continue;
      }
      if (c.fiche.session !== this.code) {
        this.majVue(adresse, { etat: 'autre_session' });
        continue;
      }
      if ((this.pauseJusqua.get(adresse) ?? 0) > Date.now()) continue;
      this.appeler(adresse, c);
    }
    this.notifier();
  }

  private appeler(adresse: string, c: Candidat) {
    this.enCours.add(adresse);
    const precedente = this.vues.get(adresse);
    this.majVue(adresse, { etat: precedente?.etat === 'perdue' ? 'perdue' : 'connexion' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://${c.ip}:${c.port}/session`);
    } catch {
      this.enCours.delete(adresse);
      return;
    }
    let lien: LienChiffre | null = null;
    let envoiPreuveA = 0;
    let preuveEnvoyee = false;
    const poignee = new PoigneeHote(this.cle, this.code, (texte) => {
      envoiPreuveA = performance.now();
      ws.send(texte);
    });
    const delai = setTimeout(() => {
      if (!lien) ws.close();
    }, DELAI_CONNEXION_MS + DELAI_POIGNEE_MS);
    let chaine: Promise<void> = Promise.resolve();

    ws.onmessage = (ev) => {
      const texte = String(ev.data);
      if (lien) {
        lien.recevoirTexte(texte);
        return;
      }
      chaine = chaine.then(async () => {
        if (lien) {
          lien.recevoirTexte(texte);
          return;
        }
        const resultat = await poignee.recevoir(texte);
        if (resultat === 'attente') {
          preuveEnvoyee = true;
          return;
        }
        if (!resultat) {
          this.pauseJusqua.set(adresse, Date.now() + PAUSE_APRES_REFUS_MS);
          this.majVue(adresse, { etat: 'refusee' });
          this.notifier();
          ws.close();
          return;
        }
        clearTimeout(delai);
        const rttMs = Math.round(performance.now() - envoiPreuveA);
        lien = new LienChiffre(
          c.fiche.nom || adresse,
          resultat,
          (t) => ws.send(t),
          () => ws.close()
        );
        this.liens.set(adresse, lien);
        this.enCours.delete(adresse);
        this.majVue(adresse, { etat: 'connectee', rttMs, perdueDepuis: null });
        this.notifier();
        this.onLien(lien);
      });
    };

    ws.onclose = () => {
      clearTimeout(delai);
      this.enCours.delete(adresse);
      if (lien) {
        this.liens.delete(adresse);
        lien.transportFerme();
        this.majVue(adresse, { etat: 'perdue', perdueDepuis: Date.now() });
        this.notifier();
      } else if (preuveEnvoyee && this.vues.get(adresse)?.etat !== 'refusee') {
        // La tablette vérifie la preuve du PC en premier et raccroche si la clé ne correspond pas
        this.pauseJusqua.set(adresse, Date.now() + PAUSE_APRES_REFUS_MS);
        this.majVue(adresse, { etat: 'refusee' });
        this.notifier();
      } else if (this.vues.get(adresse)?.etat === 'connexion') {
        this.majVue(adresse, { etat: 'attente' });
      }
    };
    ws.onerror = () => {
      // onclose suit toujours
    };
  }
}
