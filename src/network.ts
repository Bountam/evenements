import { db, notifySync } from './db';
import { SyncMessage, TrackState } from './types';
import { getAppVersion, normalizeVersion } from './utils/updateCheck';
import type { Lien } from './net/lien';
import { HoteLocal, type EtatHoteLocal } from './net/hoteLocal';
import { arreterServeurTablette, demarrerServeurTablette, majFicheTablette } from './net/tabletteLocale';
import { nouvelleCle } from './net/chiffrement';

// Types de messages réseau local
export type NetworkMessage =
  | { type: 'DB_WRITE'; table: string; action: 'put' | 'delete'; data: any; opId?: string }
  | { type: 'DB_DELTA'; table: string; action: 'put' | 'delete'; data: any }
  | { type: 'DB_BATCH_WRITE'; table: string; items: any[]; opId?: string }
  | { type: 'DB_SYNC'; table: string; data: any[] }
  | { type: 'CHRONO_ACTION'; message: SyncMessage; opId?: string }
  | { type: 'ACK'; opId: string }
  | { type: 'PING' }
  | { type: 'PONG' }
  | { type: 'REQUEST_INITIAL_SYNC'; version?: string }
  | { type: 'CLOCK_PING'; t0: number }
  | { type: 'CLOCK_PONG'; t0: number; hostTime: number }
  | { type: 'INITIAL_SYNC'; payload: { event: any; tickets: any[]; technicians: any[]; participants: any[]; attendees: any[] } };

const OUTBOX_KEY = 'insertech_net_outbox';
const HEARTBEAT_MS = 4000;
const HOST_SILENCE_MS = 12000;
const CLIENT_SILENCE_MS = 20000;
const SESSION_KEY_KEY = 'insertech_net_session_key';
const TABLET_NAME_KEY = 'insertech_net_tablet_name';
const EVENT_NAME_KEY = 'insertech_net_event_nom';

class P2PNetworkManager {
  connections: Lien[] = [];
  role: 'host' | 'client' | 'standalone' = 'standalone';
  // Activité partagée par l'hôte : suit l'activité ouverte sur le PC principal (voir setHostEvent)
  private hostEventId: string | null = null;
  sessionId: string = '';
  isConnecting: boolean = false;
  onStatusChange: ((status: string) => void) | null = null;
  onTracksSync: ((tracks: Record<number, TrackState>) => void) | null = null;
  onCelebration: ((payload: any) => void) | null = null;
  onRaffleAction: ((action: SyncMessage) => void) | null = null;
  onClientVersionsChange: ((mismatchedVersions: string[]) => void) | null = null;
  onActivityStateChange: (() => void) | null = null;

  // Versions des tablettes connectées au PC principal (connectionId -> version X.Y.Z)
  private clientVersions = new Map<string, string>();

  // PC hôte : appel des tablettes du réseau local (voir src/net/hoteLocal.ts)
  private hoteLocal: HoteLocal | null = null;
  private etatHoteLocal: EtatHoteLocal | null = null;
  private abonnesHoteLocal = new Set<(etat: EtatHoteLocal | null) => void>();
  private arretHoteLocal: (() => void) | null = null;

  // Variables locales temporaires pour l'état des chronos (si hôte, on maintient l'état des 5 pistes)
  tracksState: Record<number, TrackState> = {
    1: { trackId: 1, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0 },
    2: { trackId: 2, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0 },
    3: { trackId: 3, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0 },
    4: { trackId: 4, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0 },
    5: { trackId: 5, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0 }
  };

  // Décalage d'horloge avec le PC Principal (ms) : heure commune = Date.now() + clockOffset.
  // Les chronos et le tirage sont horodatés dans cette heure commune pour que tous les appareils
  // affichent et enregistrent le même temps, même si leurs horloges ne sont pas à l'heure.
  clockOffset: number = 0;
  private clockSyncInterval: any = null;
  private clockSamples: { rtt: number; offset: number }[] = [];

  // Envois d'une tablette pas encore confirmés par le PC principal (écritures et chronos).
  // Conservés dans localStorage : ils survivent à une coupure Wi-Fi, à la mise en veille ou à un
  // rechargement, et sont renvoyés à la reconnexion jusqu'à confirmation (ACK).
  private outbox: (NetworkMessage & { opId: string })[] = [];

  // Tablette : session mémorisée ; elle attend que le PC hôte l'appelle (elle n'appelle personne)
  private joinCode: string | null = null;
  private joinEventId = 'temp';
  // Depuis quand la tablette est sans lien avec le PC (null : liée, ou hors session)
  private hostLostSince: number | null = null;

  // Battement de cœur : une liaison peut mourir sans événement « close » (veille, Wi-Fi)
  private heartbeatInterval: any = null;
  private lastHostMessageAt = 0;
  private hostAnswersPing = false;
  private lastClientPingAt = new Map<string, number>();

  // Messages traités un à un par liaison : une écriture reçue avant une demande de synchro
  // complète est enregistrée avant que la synchro soit lue dans la base
  private incomingChains = new Map<string, Promise<void>>();

  // Canal de synchronisation inter-onglets / multi-fenêtres (HDMI Écran Public local)
  chronoChannel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedTracks = localStorage.getItem('insertech_tracks_state');
        if (savedTracks) {
          const parsed = JSON.parse(savedTracks);
          if (parsed && typeof parsed === 'object') {
            this.tracksState = { ...this.tracksState, ...parsed };
          }
        }
      } catch (e) {
        // Ignorer si corrompu
      }

      try {
        const savedOutbox = localStorage.getItem(OUTBOX_KEY);
        if (savedOutbox) this.outbox = JSON.parse(savedOutbox);
      } catch (e) {
        this.outbox = [];
      }

      // Les autres fenêtres du même ordinateur (écran public) reprennent le décalage de la console
      if (localStorage.getItem('insertech_net_role') === 'client') {
        const savedOffset = Number(localStorage.getItem('insertech_clock_offset'));
        if (Number.isFinite(savedOffset)) this.clockOffset = savedOffset;
      }

      if ('BroadcastChannel' in window) {
        this.chronoChannel = new BroadcastChannel('insertech_chrono_sync_channel');
        this.chronoChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'LOCAL_CHRONO_ACTION') {
            this.applyChronoAction(event.data.action, false);
          } else if (event.data && event.data.type === 'LOCAL_CLOCK_OFFSET' && typeof event.data.offset === 'number') {
            this.clockOffset = event.data.offset;
          }
        };
      }
    }
  }

  // Heure commune (horloge du PC Principal) à utiliser pour tout calcul de chrono ou de tirage
  now(): number {
    return Date.now() + this.clockOffset;
  }

  private setClockOffset(offset: number) {
    this.clockOffset = offset;
    try {
      localStorage.setItem('insertech_clock_offset', String(offset));
    } catch (e) {
      // Ignorer quota localStorage
    }
    if (this.chronoChannel) {
      try {
        this.chronoChannel.postMessage({ type: 'LOCAL_CLOCK_OFFSET', offset });
      } catch (e) {
        // Ignorer
      }
    }
  }

  // Mesurer le décalage avec le PC Principal : rafale de 5 allers-retours, l'échantillon le plus
  // rapide (plus petit aller-retour) est le plus précis. Répété chaque minute pour suivre la dérive.
  private startClockSync() {
    this.stopClockSync();
    const burst = () => {
      this.clockSamples = [];
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          const conn = this.connections[0];
          if (conn && conn.open) conn.send({ type: 'CLOCK_PING', t0: Date.now() });
        }, i * 250);
      }
    };
    burst();
    this.clockSyncInterval = setInterval(burst, 60000);
  }

  private stopClockSync() {
    if (this.clockSyncInterval) {
      clearInterval(this.clockSyncInterval);
      this.clockSyncInterval = null;
    }
  }

  private handleClockPong(t0: number, hostTime: number) {
    const t1 = Date.now();
    const rtt = t1 - t0;
    if (rtt < 0 || rtt > 10000) return;
    this.clockSamples.push({ rtt, offset: hostTime + rtt / 2 - t1 });
    const best = this.clockSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.setClockOffset(Math.round(best.offset));
  }

  updateStatus(status: string) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
    if (this.onActivityStateChange) {
      this.onActivityStateChange();
    }
  }

  isUpdateBlocked(): boolean {
    const hasRunningTrack = Object.values(this.tracksState).some((t) => Boolean(t && t.isRunning));
    return this.role !== 'standalone' || Boolean(this.sessionId) || this.connections.length > 0 || hasRunningTrack;
  }

  getMismatchedClientVersions(): string[] {
    if (this.role !== 'host') return [];
    const hostVer = getAppVersion();
    const mismatched = new Set<string>();
    for (const ver of this.clientVersions.values()) {
      if (ver && ver !== hostVer) mismatched.add(ver);
    }
    return Array.from(mismatched);
  }

  private notifyClientVersions() {
    if (this.onClientVersionsChange) {
      this.onClientVersionsChange(this.getMismatchedClientVersions());
    }
    if (this.onActivityStateChange) {
      this.onActivityStateChange();
    }
  }

  // DÉMARRER LA SESSION HÔTE (PC Principal)
  // Le PC n'écoute pas : il appelle les tablettes qui attendent cette session (code + clé). Rien ne passe
  // par internet, et Windows ne demande ni pare-feu ni droits administrateur pour des connexions sortantes.
  async startHost(eventId: string, existingCode?: string, _keepTrying = false): Promise<string> {
    this.stopHoteLocal();
    this.role = 'host';
    this.hostEventId = eventId;
    this.isConnecting = false;
    this.stopClockSync();
    this.setClockOffset(0); // Le PC Principal est l'horloge de référence

    if (existingCode) {
      this.sessionId = existingCode;
    } else {
      // Identifiant de session court et lisible (ex: INS-4821-AB12)
      const randomCode = Math.floor(1000 + Math.random() * 9000);
      this.sessionId = `INS-${randomCode}-${eventId.substring(4, 8).toUpperCase()}`;
    }
    // La clé est gardée tant que la session dure : les tablettes déjà réglées restent reconnues
    const savedKey = existingCode ? localStorage.getItem(SESSION_KEY_KEY) : null;
    const key = savedKey || nouvelleCle();

    // Sauvegarder les paramètres réseau pour la reprise automatique (rechargement)
    localStorage.setItem('insertech_net_role', 'host');
    localStorage.setItem('insertech_net_session_code', this.sessionId);
    localStorage.setItem('insertech_net_event_id', eventId);
    localStorage.setItem(SESSION_KEY_KEY, key);

    this.startHostWatchdog();

    const hote = new HoteLocal(this.sessionId, key, (lien) => this.attachClientLien(lien));
    this.hoteLocal = hote;
    this.arretHoteLocal = hote.onChange((etat) => {
      this.etatHoteLocal = etat;
      this.abonnesHoteLocal.forEach((cb) => cb(etat));
    });
    hote.demarrer();
    this.updateStatus('En ligne (Hôte, aucune tablette)');
    return this.sessionId;
  }

  private stopHoteLocal() {
    this.arretHoteLocal?.();
    this.arretHoteLocal = null;
    this.hoteLocal?.arreter();
    this.hoteLocal = null;
    this.etatHoteLocal = null;
    this.abonnesHoteLocal.forEach((cb) => cb(null));
  }

  // Clé de la session ouverte (PC hôte ou tablette), à saisir ou scanner sur les tablettes
  getSessionKey(): string | null {
    return this.role === 'standalone' ? null : localStorage.getItem(SESSION_KEY_KEY);
  }

  // PC hôte : nouvelle clé de session. Toutes les tablettes sont déconnectées et devront scanner le
  // nouveau QR (ou saisir la nouvelle clé) ; le code de session ne change pas.
  async renouvelerCle(): Promise<string> {
    if (this.role !== 'host' || !this.sessionId || !this.hostEventId) throw new Error('Aucune session hôte ouverte');
    const cle = nouvelleCle();
    localStorage.setItem(SESSION_KEY_KEY, cle);
    for (const conn of [...this.connections]) {
      try {
        conn.close();
      } catch {
        // Déjà fermée
      }
    }
    await this.startHost(this.hostEventId, this.sessionId, true);
    return cle;
  }

  getHoteLocal(): HoteLocal | null {
    return this.hoteLocal;
  }

  onHoteLocalChange(cb: (etat: EtatHoteLocal | null) => void): () => void {
    this.abonnesHoteLocal.add(cb);
    cb(this.etatHoteLocal);
    return () => this.abonnesHoteLocal.delete(cb);
  }

  // Une tablette authentifiée vient d'être reliée au PC hôte
  private attachClientLien(conn: Lien) {
    this.connections.push(conn);
    this.updateStatus(`Connecté (${this.connections.length} appareils)`);

    conn.on('data', (data) => {
      this.enqueueIncoming(conn, data as NetworkMessage, () => this.hostEventId ?? '');
    });

    conn.on('close', () => {
      this.connections = this.connections.filter(c => c.connectionId !== conn.connectionId);
      this.lastClientPingAt.delete(conn.connectionId);
      this.incomingChains.delete(conn.connectionId);
      if (this.clientVersions.delete(conn.connectionId)) {
        this.notifyClientVersions();
      }
      if (this.role === 'host') {
        this.updateStatus(this.connections.length > 0 ? `Connecté (${this.connections.length} appareils)` : 'En ligne (Hôte, aucune tablette)');
      }
    });
  }

  // L'hôte ferme les liaisons des tablettes muettes depuis trop longtemps (veille, hors de portée) :
  // il les rappellera au tour suivant et le nombre d'appareils affiché reste juste
  private startHostWatchdog() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const conn of this.connections) {
        const last = this.lastClientPingAt.get(conn.connectionId);
        if (last !== undefined && now - last > CLIENT_SILENCE_MS) {
          this.lastClientPingAt.delete(conn.connectionId);
          try {
            conn.close();
          } catch (e) {
            // Déjà fermée
          }
        }
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Traiter les messages d'une liaison dans leur ordre d'arrivée, un à la fois
  private enqueueIncoming(conn: Lien, msg: NetworkMessage, eventId: () => string) {
    const key = conn.connectionId;
    const previous = this.incomingChains.get(key) ?? Promise.resolve();
    const next = previous
      .then(() => this.handleIncomingData(conn, msg, eventId()))
      .catch((e) => console.error('Erreur de traitement du message réseau :', e));
    this.incomingChains.set(key, next);
  }

  // REJOINDRE UNE SESSION (tablette)
  // La tablette mémorise le code et la clé, démarre son serveur local et attend l'appel du PC hôte.
  // options.cle et options.nom : sinon ceux déjà mémorisés (reprise après un redémarrage)
  async joinSession(code: string, eventId: string, options: boolean | { cle?: string; nom?: string; evenement?: string } = {}): Promise<void> {
    const opts = typeof options === 'object' ? options : {};
    if (opts.evenement !== undefined) {
      if (opts.evenement) localStorage.setItem(EVENT_NAME_KEY, opts.evenement);
      else localStorage.removeItem(EVENT_NAME_KEY);
    }
    const key = opts.cle || localStorage.getItem(SESSION_KEY_KEY);
    const name = opts.nom || localStorage.getItem(TABLET_NAME_KEY) || 'Tablette';
    if (!key) throw new Error('Clé de session manquante');
    if (this.joinCode && this.joinCode !== code) {
      // Nouvelle session : les envois en attente visaient l'ancien PC principal
      this.outbox = [];
      this.persistOutbox();
    }
    this.role = 'client';
    this.joinCode = code;
    this.sessionId = code;
    this.joinEventId = eventId;
    this.hostLostSince = Date.now();

    // Sauvegarder les paramètres réseau pour la reprise automatique (rechargement)
    localStorage.setItem('insertech_net_role', 'client');
    localStorage.setItem('insertech_net_session_code', code);
    localStorage.setItem('insertech_net_event_id', eventId);
    localStorage.setItem(SESSION_KEY_KEY, key);
    localStorage.setItem(TABLET_NAME_KEY, name);

    this.updateStatus('En attente du PC hôte');
    await demarrerServeurTablette({ code, cle: key, nom: name }, (lien) => this.attachHostLien(lien));
  }

  getTabletName(): string {
    return localStorage.getItem(TABLET_NAME_KEY) || '';
  }

  // Tablette : nouveau nom affiché dans la liste du PC hôte (fiche /decouverte)
  async renommerTablette(nom: string): Promise<void> {
    const propre = nom.trim().slice(0, 40);
    if (!propre) throw new Error('Nom vide');
    localStorage.setItem(TABLET_NAME_KEY, propre);
    if (this.role === 'client') await majFicheTablette(propre, this.joinCode);
  }

  // Tablette : nom de l'événement lu dans le QR du PC (affichage seulement)
  getEventNom(): string {
    return localStorage.getItem(EVENT_NAME_KEY) || '';
  }

  // Tablette : depuis quand aucun lien avec le PC (ms), ou null si liée ou hors session
  getHostLostSince(): number | null {
    return this.role === 'client' ? this.hostLostSince : null;
  }

  getPendingCount(): number {
    return this.outbox.length;
  }

  private isLinkedToHost(): boolean {
    return this.connections.length > 0 && this.connections[0].open;
  }

  // Le PC hôte vient d'appeler la tablette et l'authentification a réussi
  private attachHostLien(conn: Lien) {
    if (this.role !== 'client') {
      conn.close();
      return;
    }
    const previous = this.connections[0];
    if (previous && previous !== conn) {
      this.connections = [];
      try {
        previous.close();
      } catch (e) {
        // Déjà fermée
      }
    }
    this.connections = [conn];
    this.lastHostMessageAt = Date.now();
    this.hostAnswersPing = false;
    this.hostLostSince = null;
    this.updateStatus('Connecté au PC Principal');

    conn.on('data', (data) => {
      if (this.connections[0] === conn) this.lastHostMessageAt = Date.now();
      this.enqueueIncoming(conn, data as NetworkMessage, () => this.joinEventId);
    });
    conn.on('error', () => this.handleLostHost(conn));
    conn.on('close', () => this.handleLostHost(conn));

    // Renvoyer d'abord tout ce que le PC principal n'a pas confirmé (coupure, veille, rechargement),
    // puis demander sa base : il traite les messages dans l'ordre, la synchro les inclura
    for (const pendingMsg of this.outbox) {
      try {
        conn.send(pendingMsg);
      } catch (e) {
        console.error('Erreur de renvoi en attente :', e);
      }
    }
    conn.send({ type: 'REQUEST_INITIAL_SYNC', version: getAppVersion() });

    // Se caler sur l'horloge du Master
    this.startClockSync();
    this.startClientHeartbeat(conn);
  }

  // La liaison au PC principal est perdue : les écritures restent en attente et le PC rappellera
  private handleLostHost(conn: Lien) {
    if (this.connections[0] !== conn) return;
    this.connections = [];
    this.incomingChains.delete(conn.connectionId);
    this.stopClockSync(); // Garder le dernier décalage mesuré pendant la déconnexion
    this.stopHeartbeat();
    try {
      conn.close();
    } catch (e) {
      // Déjà fermée
    }
    if (this.role !== 'client') return;
    this.hostLostSince = Date.now();
    this.updateStatus('En attente du PC hôte');
  }

  private startClientHeartbeat(conn: Lien) {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.connections[0] !== conn) return;
      // Un PC principal d'une version antérieure ne répond pas : ne pas couper sa liaison pour autant
      if (this.hostAnswersPing && Date.now() - this.lastHostMessageAt > HOST_SILENCE_MS) {
        this.handleLostHost(conn);
        return;
      }
      if (conn.open) {
        try {
          conn.send({ type: 'PING' });
        } catch (e) {
          this.handleLostHost(conn);
        }
      }
    }, HEARTBEAT_MS);
  }

  // QUITTER LA SESSION RÉSEAU (Retour au mode standalone)
  leaveSession() {
    const wasClient = this.role === 'client';
    this.role = 'standalone';
    this.joinCode = null;
    this.hostLostSince = null;
    this.stopHeartbeat();
    this.stopHoteLocal();
    this.connections.forEach(conn => conn.close());
    this.connections = [];
    this.incomingChains.clear();
    this.lastClientPingAt.clear();
    this.clientVersions.clear();
    this.notifyClientVersions();
    if (wasClient) arreterServeurTablette().catch(() => {});
    this.isConnecting = false;
    this.sessionId = '';
    this.stopClockSync();
    this.setClockOffset(0);
    // Les données restent sur cet appareil ; elles ne sont plus destinées à une session
    this.outbox = [];
    this.persistOutbox();

    // Nettoyer les paramètres de reconnexion
    localStorage.removeItem('insertech_net_role');
    localStorage.removeItem('insertech_net_session_code');
    localStorage.removeItem('insertech_net_event_id');
    localStorage.removeItem(SESSION_KEY_KEY);
    localStorage.removeItem(EVENT_NAME_KEY);

    this.updateStatus('Local uniquement');
  }

  private persistOutbox() {
    try {
      if (this.outbox.length > 0) localStorage.setItem(OUTBOX_KEY, JSON.stringify(this.outbox));
      else localStorage.removeItem(OUTBOX_KEY);
    } catch (e) {
      // Ignorer quota localStorage
    }
  }

  // Tablette : garder le message jusqu'à confirmation du PC principal, l'envoyer tout de suite si possible
  private sendToHost(msg: NetworkMessage) {
    const queued = { ...msg, opId: `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}` } as NetworkMessage & { opId: string };
    this.outbox.push(queued);
    this.persistOutbox();
    const conn = this.connections[0];
    if (conn && conn.open) {
      try {
        conn.send(queued);
      } catch (e) {
        // Renvoyé à la reconnexion
      }
    }
  }

  // Après la synchro complète reçue du PC principal, réappliquer localement ce qu'il n'a pas encore
  // confirmé : sinon une inscription faite pendant la synchro disparaîtrait de la tablette
  private async reapplyPendingWrites() {
    for (const msg of this.outbox) {
      try {
        if (msg.type === 'DB_WRITE') {
          if (msg.action === 'put') await db.table(msg.table).put(msg.data);
          else await db.table(msg.table).delete(msg.data);
        } else if (msg.type === 'DB_BATCH_WRITE') {
          await db.table(msg.table).bulkPut(msg.items);
        }
      } catch (e) {
        console.error('Erreur de réapplication locale :', e);
      }
    }
  }

  private reapplyPendingChronoActions() {
    for (const msg of this.outbox) {
      if (msg.type === 'CHRONO_ACTION') this.applyChronoAction(msg.message);
    }
  }

  // Envoyer à un client toutes les tables de l'activité partagée, puis l'état des chronomètres
  private async sendInitialSync(conn: Lien, eventId: string) {
    const tickets = await db.tickets.where('eventId').equals(eventId).toArray();
    const techs = await db.technicians.where('eventId').equals(eventId).toArray();
    const participants = await db.participants.where('eventId').equals(eventId).toArray();
    const attendees = await db.attendees.where('eventId').equals(eventId).toArray();
    const eventSettings = await db.events.get(eventId);

    conn.send({
      type: 'INITIAL_SYNC',
      payload: { event: eventSettings, tickets, technicians: techs, participants, attendees }
    });
    conn.send({
      type: 'CHRONO_ACTION',
      message: { type: 'TRACKS_STATE_SYNC', tracks: this.tracksState }
    });
  }

  // L'hôte a ouvert une autre activité : la session la partage désormais et les tablettes basculent dessus.
  // Sans cela, les tablettes restaient sur l'activité du démarrage de la session et leurs chronos
  // n'apparaissaient pas sur le PC principal.
  async setHostEvent(eventId: string) {
    if (this.role !== 'host' || this.hostEventId === eventId) return;
    this.hostEventId = eventId;
    localStorage.setItem('insertech_net_event_id', eventId);
    for (const conn of this.connections) {
      if (conn.open) {
        try {
          await this.sendInitialSync(conn, eventId);
        } catch (e) {
          console.error("Erreur d'envoi de l'activité aux tablettes :", e);
        }
      }
    }
  }

  // TRAITER LES MESSAGES ENTRANTS (Master & Clients)
  private async handleIncomingData(conn: Lien, msg: NetworkMessage, eventId: string) {
    if (this.role === 'host') {
      // --- PARTIE HÔTE / MASTER (Source de vérité) ---
      this.lastClientPingAt.set(conn.connectionId, Date.now());
      switch (msg.type) {
        case 'PING':
          conn.send({ type: 'PONG' });
          break;

        case 'CLOCK_PING':
          conn.send({ type: 'CLOCK_PONG', t0: msg.t0, hostTime: Date.now() });
          break;

        case 'REQUEST_INITIAL_SYNC':
          if (typeof msg.version === 'string' && msg.version.trim()) {
            const cleanVer = normalizeVersion(msg.version) || msg.version.trim();
            this.clientVersions.set(conn.connectionId, cleanVer);
            this.notifyClientVersions();
          }
          await this.sendInitialSync(conn, eventId);
          break;

        case 'DB_WRITE':
          // Écrire la modification reçue d'un client dans le Dexie.js local du Master
          try {
            const table = db.table(msg.table);
            if (msg.action === 'put') {
              await table.put(msg.data);
            } else if (msg.action === 'delete') {
              await table.delete(msg.data); // data contient l'id dans ce cas
            }

            notifySync(); // Notifier les onglets locaux du Master

            // Diffuser le delta atomique aux AUTRES clients connectés (élimine l'amplification O(N))
            this.broadcastExcept(conn, {
              type: 'DB_DELTA',
              table: msg.table,
              action: msg.action,
              data: msg.data
            });
          } catch (e) {
            console.error('Erreur lors de la réplication DB_WRITE sur le Master:', e);
          }
          this.acknowledge(conn, msg.opId);
          break;

        case 'DB_BATCH_WRITE':
          // Écriture par lot transactionnelle reçue d'un client
          try {
            const table = db.table(msg.table);
            if (Array.isArray(msg.items) && msg.items.length > 0) {
              await table.bulkPut(msg.items);
              notifySync();
              this.broadcastExcept(conn, {
                type: 'DB_BATCH_WRITE',
                table: msg.table,
                items: msg.items
              });
            }
          } catch (e) {
            console.error('Erreur lors de la réplication DB_BATCH_WRITE sur le Master:', e);
          }
          this.acknowledge(conn, msg.opId);
          break;

        case 'CHRONO_ACTION':
          // Le Master route les actions de chronomètre et de raffle à tout le monde
          this.applyChronoAction(msg.message);
          this.broadcastExcept(conn, { type: 'CHRONO_ACTION', message: msg.message });
          this.acknowledge(conn, msg.opId);
          break;
      }
    } else if (this.role === 'client') {
      // --- PARTIE CLIENT ---
      switch (msg.type) {
        case 'PONG':
          this.hostAnswersPing = true;
          break;

        case 'ACK':
          if (this.outbox.some((m) => m.opId === msg.opId)) {
            this.outbox = this.outbox.filter((m) => m.opId !== msg.opId);
            this.persistOutbox();
          }
          break;

        case 'CLOCK_PONG':
          this.handleClockPong(msg.t0, msg.hostTime);
          break;

        case 'INITIAL_SYNC':
          // Remplacer l'IndexedDB locale par celle du Master
          const importedEvent = msg.payload.event;
          
          await db.transaction('rw', [db.events, db.tickets, db.technicians, db.participants, db.attendees], async () => {
            if (importedEvent) {
              await db.events.put(importedEvent);
            }
            
            const targetEventId = importedEvent ? importedEvent.id : eventId;

            await db.tickets.where('eventId').equals(targetEventId).delete();
            await db.technicians.where('eventId').equals(targetEventId).delete();
            await db.participants.where('eventId').equals(targetEventId).delete();
            await db.attendees.where('eventId').equals(targetEventId).delete();

            if (msg.payload.tickets.length > 0) await db.tickets.bulkPut(msg.payload.tickets);
            if (msg.payload.technicians.length > 0) await db.technicians.bulkPut(msg.payload.technicians);
            if (msg.payload.participants.length > 0) await db.participants.bulkPut(msg.payload.participants);
            if (msg.payload.attendees.length > 0) await db.attendees.bulkPut(msg.payload.attendees);
          });
          await this.reapplyPendingWrites();

          if (importedEvent) {
            localStorage.setItem('insertech_active_event_id', importedEvent.id);
          }
          notifySync(); // Recharger les composants locaux React
          break;

        case 'DB_DELTA':
          // Réception d'un delta atomique unitaire (O(1))
          try {
            const deltaTable = db.table(msg.table);
            if (msg.action === 'put') {
              await deltaTable.put(msg.data);
            } else if (msg.action === 'delete') {
              await deltaTable.delete(msg.data);
            }
            notifySync();
          } catch (e) {
            console.error('Erreur DB_DELTA client:', e);
          }
          break;

        case 'DB_BATCH_WRITE':
          // Réception d'un lot d'écritures
          try {
            const batchTable = db.table(msg.table);
            if (Array.isArray(msg.items) && msg.items.length > 0) {
              await batchTable.bulkPut(msg.items);
              notifySync();
            }
          } catch (e) {
            console.error('Erreur DB_BATCH_WRITE client:', e);
          }
          break;

        case 'DB_SYNC':
          // Synchroniser une table spécifique avec les données du Master (fallback)
          await db.transaction('rw', db.table(msg.table), async () => {
            await db.table(msg.table).where('eventId').equals(eventId).delete();
            if (msg.data.length > 0) {
              await db.table(msg.table).bulkPut(msg.data);
            }
          });
          notifySync();
          break;

        case 'CHRONO_ACTION':
          // Appliquer l'action de chronométrage reçue du Master
          this.applyChronoAction(msg.message);
          // L'état complet des pistes ne contient pas encore les actions de cette tablette en attente
          if (msg.message.type === 'TRACKS_STATE_SYNC') this.reapplyPendingChronoActions();
          break;
      }
    }
  }

  private acknowledge(conn: Lien, opId: string | undefined) {
    if (opId && conn.open) conn.send({ type: 'ACK', opId });
  }

  // ÉMETTRE UNE ACTION DE CHRONO / RAFFLE
  sendChronoAction(action: SyncMessage) {
    this.applyChronoAction(action, true);
    if (this.role === 'host') {
      this.broadcast({ type: 'CHRONO_ACTION', message: action });
    } else if (this.role === 'client') {
      // Les pistes sont rejouées après une coupure ; un tirage ou une célébration périmés ne le sont pas
      if (action.type === 'PEER_CELEBRATION' || action.type === 'RAFFLE_START' || action.type === 'RAFFLE_RESET') {
        const conn = this.connections[0];
        if (conn && conn.open) conn.send({ type: 'CHRONO_ACTION', message: action });
      } else {
        this.sendToHost({ type: 'CHRONO_ACTION', message: action });
      }
    }
  }

  private persistTracksState() {
    try {
      localStorage.setItem('insertech_tracks_state', JSON.stringify(this.tracksState));
    } catch (e) {
      // Ignorer quota localStorage
    }
    if (this.onActivityStateChange) {
      this.onActivityStateChange();
    }
  }

  // APPLIQUER CHRONO EN LOCAL
  private applyChronoAction(action: SyncMessage, broadcastLocal: boolean = true) {
    if (broadcastLocal && this.chronoChannel) {
      try {
        this.chronoChannel.postMessage({ type: 'LOCAL_CHRONO_ACTION', action });
      } catch (e) {
        // Ignorer
      }
    }

    if (action.type === 'TRACKS_STATE_SYNC') {
      this.tracksState = action.tracks;
      this.persistTracksState();
      if (this.onTracksSync) this.onTracksSync({ ...this.tracksState });
    } else if (action.type === 'TRACK_ASSIGN') {
      const track = this.tracksState[action.trackId];
      if (track) {
        track.participantId = action.participantId;
        track.participantName = action.participantName;
        track.eventId = action.eventId ?? null;
        track.isRunning = false;
        track.startTime = null;
        track.elapsedBeforeStart = 0;
        this.tracksState[action.trackId] = { ...track };
        this.persistTracksState();
        if (this.onTracksSync) this.onTracksSync({ ...this.tracksState });
      }
    } else if (action.type === 'TIMER_START') {
      const track = this.tracksState[action.trackId];
      if (track) {
        track.isRunning = true;
        track.startTime = action.startTime;
        track.elapsedBeforeStart = action.elapsedBeforeStart;
        this.tracksState[action.trackId] = { ...track };
        this.persistTracksState();
        if (this.onTracksSync) this.onTracksSync({ ...this.tracksState });
      }
    } else if (action.type === 'TIMER_STOP') {
      const track = this.tracksState[action.trackId];
      if (track) {
        track.isRunning = false;
        track.startTime = null;
        track.elapsedBeforeStart = action.elapsed;
        this.tracksState[action.trackId] = { ...track };
        this.persistTracksState();
        if (this.onTracksSync) this.onTracksSync({ ...this.tracksState });
      }
    } else if (action.type === 'TIMER_RESET') {
      const track = this.tracksState[action.trackId];
      if (track) {
        track.isRunning = false;
        track.startTime = null;
        track.elapsedBeforeStart = 0;
        this.tracksState[action.trackId] = { ...track };
        this.persistTracksState();
        if (this.onTracksSync) this.onTracksSync({ ...this.tracksState });
      }
    } else if (action.type === 'PEER_CELEBRATION') {
      if (this.onCelebration) this.onCelebration(action.payload);
    } else if (action.type === 'RAFFLE_START' || action.type === 'RAFFLE_RESET') {
      if (this.onRaffleAction) this.onRaffleAction(action);
    }
  }

  // APPELÉ POUR PROPAGER UNE ÉCRITURE VERS LE MASTER (OU DIRECTEMENT SI HÔTE)
  async writeToDatabase(table: string, action: 'put' | 'delete', data: any) {
    // 1. Toujours persister immédiatement dans l'IndexedDB locale (Master, Client ou Standalone)
    const t = db.table(table);
    if (action === 'put') {
      await t.put(data);
    } else if (action === 'delete') {
      await t.delete(data);
    }
    notifySync();

    // 2. Propager sur le réseau P2P selon le rôle
    if (this.role === 'client') {
      this.sendToHost({ type: 'DB_WRITE', table, action, data });
    } else if (this.role === 'host') {
      // Si Master, diffuser le delta atomique aux clients (O(1) au lieu de O(N))
      this.broadcast({
        type: 'DB_DELTA',
        table,
        action,
        data
      });
    }
  }

  // ÉCRITURE PAR LOT TRANSACTIONNELLE (OPTIMISATION POUR IMPORTATIONS MASSIFS)
  async writeBatchToDatabase(table: string, items: any[]) {
    if (!items || items.length === 0) return;

    const t = db.table(table);
    await t.bulkPut(items);
    notifySync();

    if (this.role === 'client') {
      this.sendToHost({ type: 'DB_BATCH_WRITE', table, items });
    } else if (this.role === 'host') {
      this.broadcast({
        type: 'DB_BATCH_WRITE',
        table,
        items
      });
    }
  }

  // DIFFUSER UN MESSAGE À TOUS LES CLIENTS (Master)
  broadcast(msg: NetworkMessage) {
    this.broadcastExcept(null, msg);
  }

  // DIFFUSER À TOUS LES CLIENTS SAUF L'ÉMETTEUR
  broadcastExcept(excludeConn: Lien | null, msg: NetworkMessage) {
    this.connections.forEach((conn) => {
      if (conn.open && (!excludeConn || conn.connectionId !== excludeConn.connectionId)) {
        conn.send(msg);
      }
    });
  }

}

export const networkManager = new P2PNetworkManager();
