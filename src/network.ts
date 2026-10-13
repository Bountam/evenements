import { Peer, DataConnection } from 'peerjs';
import { db, notifySync } from './db';
import { SyncMessage, TrackState } from './types';

// Types de messages réseau P2P
export type NetworkMessage =
  | { type: 'DB_WRITE'; table: string; action: 'put' | 'delete'; data: any }
  | { type: 'DB_DELTA'; table: string; action: 'put' | 'delete'; data: any }
  | { type: 'DB_BATCH_WRITE'; table: string; items: any[] }
  | { type: 'DB_SYNC'; table: string; data: any[] }
  | { type: 'CHRONO_ACTION'; message: SyncMessage }
  | { type: 'REQUEST_INITIAL_SYNC' }
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

class P2PNetworkManager {
  peer: Peer | null = null;
  connections: DataConnection[] = [];
  role: 'host' | 'client' | 'standalone' = 'standalone';
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

  // File d'attente locale pour la résilience hors-ligne (Offline Queue)
  offlineQueue: NetworkMessage[] = [];

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

      if ('BroadcastChannel' in window) {
        this.chronoChannel = new BroadcastChannel('insertech_chrono_sync_channel');
        this.chronoChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'LOCAL_CHRONO_ACTION') {
            this.applyChronoAction(event.data.action, false);
          }
        };
      }
    }
  }

  updateStatus(status: string) {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  // DÉMARRER LA SESSION HÔTE (PC Principal)
  async startHost(eventId: string, existingCode?: string): Promise<string> {
    this.role = 'host';
    this.isConnecting = true;
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

    return new Promise((resolve, reject) => {
      this.peer = new Peer(this.sessionId, {
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        debug: 1
      });

      this.peer.on('open', (id) => {
        this.isConnecting = false;
        this.updateStatus('En ligne (Hôte)');
        // Démarrer la publication d'annonces MQTT pour l'auto-découverte
        this.startMqttDiscoveryAnnounce(eventId);
        resolve(id);
      });

      this.peer.on('error', (err) => {
        this.isConnecting = false;
        this.updateStatus(`Erreur : ${err.type}`);
        reject(err);
      });

      // Écouter les connexions des tablettes clientes
      this.peer.on('connection', (conn) => {
        this.connections.push(conn);
        this.updateStatus(`Connecté (${this.connections.length} appareils)`);

        conn.on('data', (data) => {
          this.handleIncomingData(conn, data as NetworkMessage, eventId);
        });

        conn.on('close', () => {
          this.connections = this.connections.filter(c => c.connectionId !== conn.connectionId);
          this.updateStatus(this.connections.length > 0 ? `Connecté (${this.connections.length} appareils)` : 'En ligne (Hôte, aucun client)');
        });
      });
    });
  }

  // REJOINDRE UNE SESSION EXISTANTE (Tablettes Clients)
  async joinSession(code: string, eventId: string): Promise<void> {
    this.role = 'client';
    this.isConnecting = true;
    this.updateStatus('Recherche de la session...');

    // Sauvegarder les paramètres réseau pour la reconnexion automatique (rechargement)
    localStorage.setItem('insertech_net_role', 'client');
    localStorage.setItem('insertech_net_session_code', code);
    localStorage.setItem('insertech_net_event_id', eventId);

    return new Promise((resolve, reject) => {
      this.peer = new Peer({
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        debug: 1
      });

      this.peer.on('open', () => {
        const conn = this.peer!.connect(code);

        conn.on('open', () => {
          this.isConnecting = false;
          this.connections = [conn];
          this.updateStatus('Connecté au PC Principal');
          
          // Rejouer la file d'attente hors-ligne si des écritures ont eu lieu pendant la déconnexion
          if (this.offlineQueue.length > 0) {
            this.offlineQueue.forEach(pendingMsg => {
              try {
                conn.send(pendingMsg);
              } catch (e) {
                console.error('Erreur vidage file hors-ligne:', e);
              }
            });
            this.offlineQueue = [];
          }

          // Demander la base de données de référence du Master
          conn.send({ type: 'REQUEST_INITIAL_SYNC' });
          resolve();
        });

        conn.on('data', (data) => {
          this.handleIncomingData(conn, data as NetworkMessage, eventId);
        });

        conn.on('error', (err) => {
          this.isConnecting = false;
          this.updateStatus('Erreur de liaison client');
          reject(err);
        });

        conn.on('close', () => {
          this.connections = [];
          this.updateStatus('Déconnecté du PC Principal (mode hors-ligne)');
        });
      });

      this.peer.on('error', (err) => {
        this.isConnecting = false;
        this.updateStatus(`Erreur d'initialisation`);
        reject(err);
      });
    });
  }

  // QUITTER LA SESSION RÉSEAU (Retour au mode standalone)
  leaveSession() {
    this.connections.forEach(conn => conn.close());
    this.connections = [];
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.role = 'standalone';
    this.sessionId = '';
    
    // Nettoyer les paramètres de reconnexion
    localStorage.removeItem('insertech_net_role');
    localStorage.removeItem('insertech_net_session_code');
    localStorage.removeItem('insertech_net_event_id');

    // Arrêter le service MQTT d'auto-découverte
    this.stopMqttDiscovery();

    this.updateStatus('Local uniquement');
  }

  // TRAITER LES MESSAGES ENTRANTS (Master & Clients)
  private async handleIncomingData(conn: DataConnection, msg: NetworkMessage, eventId: string) {
    if (this.role === 'host') {
      // --- PARTIE HÔTE / MASTER (Source de vérité) ---
      switch (msg.type) {
        case 'REQUEST_INITIAL_SYNC':
          // Envoyer toutes les tables de cet eventId au nouveau client connecté
          const tickets = await db.tickets.where('eventId').equals(eventId).toArray();
          const techs = await db.technicians.where('eventId').equals(eventId).toArray();
          const participants = await db.participants.where('eventId').equals(eventId).toArray();
          const attendees = await db.attendees.where('eventId').equals(eventId).toArray();
          const eventSettings = await db.events.get(eventId);

          conn.send({
            type: 'INITIAL_SYNC',
            payload: { event: eventSettings, tickets, technicians: techs, participants, attendees }
          });
          // Synchroniser aussi l'état courant des chronomètres
          conn.send({
            type: 'CHRONO_ACTION',
            message: { type: 'TRACKS_STATE_SYNC', tracks: this.tracksState }
          });
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
          break;

        case 'CHRONO_ACTION':
          // Le Master route les actions de chronomètre et de raffle à tout le monde
          this.applyChronoAction(msg.message);
          this.broadcastExcept(conn, msg);
          break;
      }
    } else if (this.role === 'client') {
      // --- PARTIE CLIENT ---
      switch (msg.type) {
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
          break;
      }
    }
  }

  // ÉMETTRE UNE ACTION DE CHRONO / RAFFLE
  sendChronoAction(action: SyncMessage) {
    this.applyChronoAction(action, true);
    if (this.role !== 'standalone') {
      this.broadcast({
        type: 'CHRONO_ACTION',
        message: action
      });
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
      const conn = this.connections[0];
      if (conn && conn.open) {
        conn.send({
          type: 'DB_WRITE',
          table,
          action,
          data
        });
      } else {
        // En file d'attente hors-ligne si déconnecté temporairement
        this.offlineQueue.push({
          type: 'DB_WRITE',
          table,
          action,
          data
        });
      }
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
      const conn = this.connections[0];
      if (conn && conn.open) {
        conn.send({
          type: 'DB_BATCH_WRITE',
          table,
          items
        });
      } else {
        this.offlineQueue.push({
          type: 'DB_BATCH_WRITE',
          table,
          items
        });
      }
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
