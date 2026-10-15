import { Peer, DataConnection } from 'peerjs';
import { db, notifySync } from './db';
import { SyncMessage, TrackState } from './types';

// Types de messages réseau P2P
export type NetworkMessage =
  | { type: 'DB_WRITE'; table: string; action: 'put' | 'delete'; data: any; opId?: string }
  | { type: 'DB_DELTA'; table: string; action: 'put' | 'delete'; data: any }
  | { type: 'DB_BATCH_WRITE'; table: string; items: any[]; opId?: string }
  | { type: 'DB_SYNC'; table: string; data: any[] }
  | { type: 'CHRONO_ACTION'; message: SyncMessage; opId?: string }
  | { type: 'ACK'; opId: string }
  | { type: 'PING' }
  | { type: 'PONG' }
  | { type: 'REQUEST_INITIAL_SYNC' }
  | { type: 'CLOCK_PING'; t0: number }
  | { type: 'CLOCK_PONG'; t0: number; hostTime: number }
  | { type: 'INITIAL_SYNC'; payload: { event: any; tickets: any[]; technicians: any[]; participants: any[]; attendees: any[] } };

// Chargement dynamique du script MQTT Paho pour l'auto-découverte sans clé d'API
function loadPahoMqtt(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).Paho) {
      resolve((window as any).Paho);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js';
    script.onload = () => resolve((window as any).Paho);
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
}

const OUTBOX_KEY = 'insertech_net_outbox';
const HEARTBEAT_MS = 4000;
const HOST_SILENCE_MS = 12000;
const CLIENT_SILENCE_MS = 20000;
const CONNECT_TIMEOUT_MS = 10000;

class P2PNetworkManager {
  peer: Peer | null = null;
  connections: DataConnection[] = [];
  role: 'host' | 'client' | 'standalone' = 'standalone';
  // Activité partagée par l'hôte : suit l'activité ouverte sur le PC principal (voir setHostEvent)
  private hostEventId: string | null = null;
  sessionId: string = '';
  isConnecting: boolean = false;
  onStatusChange: ((status: string) => void) | null = null;
  onTracksSync: ((tracks: Record<number, TrackState>) => void) | null = null;
  onCelebration: ((payload: any) => void) | null = null;
  onRaffleAction: ((action: SyncMessage) => void) | null = null;

  // Découverte réseau MQTT
  mqttClient: any = null;
  discoveredSessions: Record<string, { code: string; name: string; type: string; lastSeen: number }> = {};
  onSessionsDiscovered: ((sessions: any[]) => void) | null = null;
  discoveryInterval: any = null;

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

  // Reconnexion automatique d'une tablette au PC principal
  private joinCode: string | null = null;
  private joinEventId = 'temp';
  private reconnectTimer: any = null;
  private reconnectAttempts = 0;
  private connectTimeout: any = null;

  // Battement de cœur : une liaison WebRTC peut mourir sans événement « close » (veille, Wi-Fi)
  private heartbeatInterval: any = null;
  private lastHostMessageAt = 0;
  private hostAnswersPing = false;
  private lastClientPingAt = new Map<string, number>();

  // Messages traités un à un par liaison : une écriture reçue avant une demande de synchro
  // complète est enregistrée avant que la synchro soit lue dans la base
  private incomingChains = new Map<string, Promise<void>>();
  private hostReconnectTimer: any = null;

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

      // Une tablette reprend la liaison dès qu'elle se réveille ou retrouve le réseau
      const wake = () => {
        if (this.role === 'client' && this.joinCode && !this.isLinkedToHost()) this.reconnectNow();
      };
      window.addEventListener('online', wake);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') wake();
      });

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
  }

  // DÉMARRER LA SESSION HÔTE (PC Principal)
  // keepTrying : reprise automatique après un rechargement, où le serveur de signalement peut encore
  // réserver le code de la session précédente quelques secondes
  async startHost(eventId: string, existingCode?: string, keepTrying = false): Promise<string> {
    this.role = 'host';
    this.hostEventId = eventId;
    this.isConnecting = true;
    this.stopClockSync();
    this.setClockOffset(0); // Le PC Principal est l'horloge de référence
    this.updateStatus('Connexion au serveur de signalement...');

    if (existingCode) {
      this.sessionId = existingCode;
    } else {
      // Créer un identifiant de session court et lisible (ex: INS-XXXX)
      const randomCode = Math.floor(1000 + Math.random() * 9000);
      this.sessionId = `INS-${randomCode}-${eventId.substring(4, 8).toUpperCase()}`;
    }

    // Sauvegarder les paramètres réseau pour la reconnexion automatique (rechargement)
    localStorage.setItem('insertech_net_role', 'host');
    localStorage.setItem('insertech_net_session_code', this.sessionId);
    localStorage.setItem('insertech_net_event_id', eventId);

    this.startHostWatchdog();

    return new Promise((resolve, reject) => {
      if (this.peer) this.peer.destroy();
      const peer = new Peer(this.sessionId, {
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        debug: 1
      });
      this.peer = peer;
      let opened = false;

      peer.on('open', (id) => {
        opened = true;
        this.isConnecting = false;
        this.updateStatus(this.connections.length > 0 ? `Connecté (${this.connections.length} appareils)` : 'En ligne (Hôte)');
        // Démarrer la publication d'annonces MQTT pour l'auto-découverte
        this.startMqttDiscoveryAnnounce(this.hostEventId ?? eventId);
        resolve(id);
      });

      // Liaison au serveur de signalement perdue (Wi-Fi, veille) : les tablettes déjà connectées
      // continuent de fonctionner, mais aucune ne pourrait (re)joindre la session sans cette reprise
      peer.on('disconnected', () => {
        if (this.peer !== peer || this.role !== 'host') return;
        this.updateStatus('Reconnexion au serveur de signalement...');
        this.scheduleHostSignalingReconnect(peer);
      });

      peer.on('error', (err) => {
        if (this.peer !== peer) return;
        this.isConnecting = false;
        if (!opened && keepTrying && err.type === 'unavailable-id') {
          setTimeout(() => {
            if (this.peer !== peer || this.role !== 'host') return;
            this.startHost(this.hostEventId ?? eventId, this.sessionId, true).then(resolve, reject);
          }, 3000);
          return;
        }
        this.updateStatus(`Erreur : ${err.type}`);
        if (!opened) reject(err);
      });

      // Écouter les connexions des tablettes clientes
      peer.on('connection', (conn) => {
        this.connections.push(conn);
        this.updateStatus(`Connecté (${this.connections.length} appareils)`);

        conn.on('data', (data) => {
          this.enqueueIncoming(conn, data as NetworkMessage, () => this.hostEventId ?? eventId);
        });

        conn.on('close', () => {
          this.connections = this.connections.filter(c => c.connectionId !== conn.connectionId);
          this.lastClientPingAt.delete(conn.connectionId);
          this.incomingChains.delete(conn.connectionId);
          if (this.role === 'host') {
            this.updateStatus(this.connections.length > 0 ? `Connecté (${this.connections.length} appareils)` : 'En ligne (Hôte, aucun client)');
          }
        });
      });
    });
  }

  private scheduleHostSignalingReconnect(peer: Peer) {
    if (this.hostReconnectTimer) return;
    this.hostReconnectTimer = setTimeout(() => {
      this.hostReconnectTimer = null;
      if (this.peer !== peer || this.role !== 'host' || !peer.disconnected) return;
      if (peer.destroyed) {
        this.startHost(this.hostEventId ?? '', this.sessionId, true).catch(() => {});
        return;
      }
      try {
        peer.reconnect();
      } catch (e) {
        // Réessayer au prochain passage
      }
      // Si la reprise échoue, l'événement « disconnected » n'est pas toujours réémis
      setTimeout(() => {
        if (this.peer === peer && this.role === 'host' && peer.disconnected) this.scheduleHostSignalingReconnect(peer);
      }, 5000);
    }, 2000);
  }

  // L'hôte ferme les liaisons des tablettes muettes depuis trop longtemps (veille, hors de portée) :
  // elles se reconnecteront d'elles-mêmes et le nombre d'appareils affiché reste juste
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
  private enqueueIncoming(conn: DataConnection, msg: NetworkMessage, eventId: () => string) {
    const key = conn.connectionId;
    const previous = this.incomingChains.get(key) ?? Promise.resolve();
    const next = previous
      .then(() => this.handleIncomingData(conn, msg, eventId()))
      .catch((e) => console.error('Erreur de traitement du message réseau :', e));
    this.incomingChains.set(key, next);
  }

  // REJOINDRE UNE SESSION EXISTANTE (Tablettes Clients)
  // keepTrying : reprise automatique après un rechargement, réessaie tant que le PC principal est absent
  async joinSession(code: string, eventId: string, keepTrying = false): Promise<void> {
    if (this.joinCode && this.joinCode !== code) {
      // Nouvelle session : les envois en attente visaient l'ancien PC principal
      this.outbox = [];
      this.persistOutbox();
    }
    this.role = 'client';
    this.joinCode = code;
    this.joinEventId = eventId;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();

    // Sauvegarder les paramètres réseau pour la reconnexion automatique (rechargement)
    localStorage.setItem('insertech_net_role', 'client');
    localStorage.setItem('insertech_net_session_code', code);
    localStorage.setItem('insertech_net_event_id', eventId);

    try {
      await this.connectToHost();
    } catch (e) {
      if (keepTrying) {
        this.scheduleReconnect();
        return;
      }
      throw e;
    }
  }

  private isLinkedToHost(): boolean {
    return this.connections.length > 0 && this.connections[0].open;
  }

  // Une tentative de liaison au PC principal ; résolue quand la liaison de données est ouverte
  private connectToHost(): Promise<void> {
    const code = this.joinCode;
    if (!code) return Promise.reject(new Error('Aucune session'));
    this.isConnecting = true;
    this.updateStatus(this.reconnectAttempts > 0 ? 'Reconnexion au PC Principal...' : 'Recherche de la session...');

    if (this.peer) this.peer.destroy();
    this.connections = [];

    return new Promise((resolve, reject) => {
      const peer = new Peer({
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        debug: 1
      });
      this.peer = peer;
      let settled = false;
      const fail = (err: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(this.connectTimeout);
        this.isConnecting = false;
        if (this.peer === peer) {
          peer.destroy();
          this.peer = null;
        }
        reject(err);
      };

      clearTimeout(this.connectTimeout);
      this.connectTimeout = setTimeout(() => fail(new Error('Délai de connexion dépassé')), CONNECT_TIMEOUT_MS);

      peer.on('open', () => {
        const conn = peer.connect(code, { reliable: true });

        conn.on('open', () => {
          if (this.peer !== peer || this.role !== 'client') return;
          settled = true;
          clearTimeout(this.connectTimeout);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.connections = [conn];
          this.lastHostMessageAt = Date.now();
          this.hostAnswersPing = false;
          this.updateStatus('Connecté au PC Principal');

          // Renvoyer d'abord tout ce que le PC principal n'a pas confirmé (coupure, veille, rechargement),
          // puis demander sa base : il traite les messages dans l'ordre, la synchro les inclura
          for (const pendingMsg of this.outbox) {
            try {
              conn.send(pendingMsg);
            } catch (e) {
              console.error('Erreur de renvoi en attente :', e);
            }
          }
          conn.send({ type: 'REQUEST_INITIAL_SYNC' });

          // Se caler sur l'horloge du Master
          this.startClockSync();
          this.startClientHeartbeat(conn);
          resolve();
        });

        conn.on('data', (data) => {
          if (this.connections[0] === conn) this.lastHostMessageAt = Date.now();
          this.enqueueIncoming(conn, data as NetworkMessage, () => this.joinEventId);
        });

        conn.on('error', (err) => {
          if (!settled) {
            this.updateStatus('Erreur de liaison client');
            fail(err);
          } else {
            this.handleLostHost(conn);
          }
        });

        conn.on('close', () => {
          if (!settled) fail(new Error('Liaison fermée'));
          else this.handleLostHost(conn);
        });
      });

      peer.on('error', (err) => {
        if (!settled) {
          this.updateStatus(`Erreur d'initialisation`);
          fail(err);
        }
      });
    });
  }

  // La liaison au PC principal est perdue : les écritures restent en attente et la tablette se reconnecte
  private handleLostHost(conn: DataConnection) {
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
    this.updateStatus('Déconnecté du PC Principal (reconnexion...)');
    this.scheduleReconnect();
  }

  private startClientHeartbeat(conn: DataConnection) {
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

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.role !== 'client' || !this.joinCode || this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    this.reconnectAttempts++;
    this.updateStatus('Déconnecté du PC Principal (reconnexion...)');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectToHost().catch(() => this.scheduleReconnect());
    }, delay);
  }

  private reconnectNow() {
    if (this.isConnecting) return;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.connectToHost().catch(() => this.scheduleReconnect());
  }

  // QUITTER LA SESSION RÉSEAU (Retour au mode standalone)
  leaveSession() {
    this.role = 'standalone';
    this.joinCode = null;
    this.clearReconnectTimer();
    clearTimeout(this.connectTimeout);
    if (this.hostReconnectTimer) {
      clearTimeout(this.hostReconnectTimer);
      this.hostReconnectTimer = null;
    }
    this.stopHeartbeat();
    this.connections.forEach(conn => conn.close());
    this.connections = [];
    this.incomingChains.clear();
    this.lastClientPingAt.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
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

    // Arrêter le service MQTT d'auto-découverte
    this.stopMqttDiscovery();

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
  private async sendInitialSync(conn: DataConnection, eventId: string) {
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
    if (this.peer && !this.peer.disconnected) this.startMqttDiscoveryAnnounce(eventId);
  }

  // TRAITER LES MESSAGES ENTRANTS (Master & Clients)
  private async handleIncomingData(conn: DataConnection, msg: NetworkMessage, eventId: string) {
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

  private acknowledge(conn: DataConnection, opId: string | undefined) {
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
  broadcastExcept(excludeConn: DataConnection | null, msg: NetworkMessage) {
    this.connections.forEach((conn) => {
      if (conn.open && (!excludeConn || conn.connectionId !== excludeConn.connectionId)) {
        conn.send(msg);
      }
    });
  }

  // --- AUTO-DÉCOUVERTE SESSIONS RÉSEAU (MQTT PUBLIC) ---
  
  private async startMqttDiscoveryAnnounce(eventId: string) {
    this.stopMqttDiscovery();

    try {
      const Paho = await loadPahoMqtt();
      const clientId = 'ins-host-' + Math.random().toString(36).substring(2, 9);
      // EMQX Broker public gratuit avec support WebSocket TLS
      const client = new Paho.MQTT.Client('broker.emqx.io', 8084, '/mqtt', clientId);

      client.onConnectionLost = (responseObject: any) => {
        if (responseObject.errorCode !== 0) {
          console.warn('MQTT Host Discovery perdu. Reconnexion automatique dans 8s...');
          setTimeout(() => this.startMqttDiscoveryAnnounce(eventId), 8000);
        }
      };

      client.connect({
        useSSL: true,
        timeout: 5,
        onSuccess: () => {
          this.mqttClient = client;
          // Première annonce
          this.sendDiscoveryAnnounce(eventId);

          // Annonce périodique toutes les 8 secondes
          if (this.discoveryInterval) clearInterval(this.discoveryInterval);
          this.discoveryInterval = setInterval(() => {
            this.sendDiscoveryAnnounce(eventId);
          }, 8000);
        },
        onFailure: (err: any) => {
          console.warn('Échec connexion MQTT discovery (Host) :', err);
        }
      });
    } catch (e) {
      console.warn('Impossible de charger la découverte MQTT (Host) :', e);
    }
  }

  private async sendDiscoveryAnnounce(eventId: string) {
    if (!this.mqttClient || !this.mqttClient.isConnected()) return;
    try {
      const eventSettings = await db.events.get(eventId);
      const payload = JSON.stringify({
        type: 'ANNOUNCE',
        code: this.sessionId,
        name: eventSettings ? eventSettings.name : 'Console Insertech',
        eventType: eventSettings ? eventSettings.type : 'générique',
        timestamp: Date.now()
      });
      const message = new (window as any).Paho.MQTT.Message(payload);
      message.destinationName = 'insertech/sessions/discovery';
      message.retained = false;
      this.mqttClient.send(message);
    } catch (e) {
      console.error('Erreur envoi annonce MQTT :', e);
    }
  }

  // Lancer la recherche de sessions hôtes actives
  async startSessionsSearch() {
    this.stopSessionsSearch();
    this.discoveredSessions = {};
    this.notifyDiscoveredSessions();

    try {
      const Paho = await loadPahoMqtt();
      const clientId = 'ins-client-' + Math.random().toString(36).substring(2, 9);
      const client = new Paho.MQTT.Client('broker.emqx.io', 8084, '/mqtt', clientId);

      client.onConnectionLost = (responseObject: any) => {
        if (responseObject.errorCode !== 0) {
          console.warn('MQTT Client Discovery perdu. Reconnexion...');
        }
      };

      client.onMessageArrived = (message: any) => {
        try {
          const payload = JSON.parse(message.payloadString);
          if (
            payload &&
            typeof payload === 'object' &&
            payload.type === 'ANNOUNCE' &&
            typeof payload.code === 'string' &&
            payload.code.startsWith('INS-')
          ) {
            const cleanCode = payload.code.replace(/[^A-Za-z0-9-]/g, '').substring(0, 30);
            this.discoveredSessions[cleanCode] = {
              code: cleanCode,
              name: typeof payload.name === 'string' ? payload.name.substring(0, 100) : 'Console Insertech',
              type: typeof payload.eventType === 'string' ? payload.eventType.substring(0, 50) : 'générique',
              lastSeen: Date.now()
            };
            this.notifyDiscoveredSessions();
          }
        } catch (e) {
          // Ignorer messages corrompus
        }
      };

      client.connect({
        useSSL: true,
        timeout: 5,
        onSuccess: () => {
          this.mqttClient = client;
          client.subscribe('insertech/sessions/discovery');
          
          // Purger périodiquement les sessions inactives de la liste
          if (this.discoveryInterval) clearInterval(this.discoveryInterval);
          this.discoveryInterval = setInterval(() => {
            const now = Date.now();
            let changed = false;
            Object.keys(this.discoveredSessions).forEach((code) => {
              // Si aucune annonce reçue depuis plus de 18 secondes, on supprime de la liste
              if (now - this.discoveredSessions[code].lastSeen > 18000) {
                delete this.discoveredSessions[code];
                changed = true;
              }
            });
            if (changed) this.notifyDiscoveredSessions();
          }, 4000);
        },
        onFailure: (err: any) => {
          console.warn('Échec connexion MQTT discovery (Client) :', err);
        }
      });
    } catch (e) {
      console.warn('Impossible de démarrer la découverte MQTT (Client) :', e);
    }
  }

  stopSessionsSearch() {
    this.stopMqttDiscovery();
    this.discoveredSessions = {};
  }

  private stopMqttDiscovery() {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    if (this.mqttClient) {
      try {
        if (this.mqttClient.isConnected()) {
          this.mqttClient.disconnect();
        }
      } catch (e) {}
      this.mqttClient = null;
    }
  }

  private notifyDiscoveredSessions() {
    if (this.onSessionsDiscovered) {
      this.onSessionsDiscovered(Object.values(this.discoveredSessions));
    }
  }
}

export const networkManager = new P2PNetworkManager();
