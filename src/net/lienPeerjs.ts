import type { DataConnection } from 'peerjs';
import { EmetteurLien, type Lien } from './lien';

// Adaptateur temporaire : une DataConnection PeerJS vue comme un Lien (retiré avec PeerJS dans ce lot)
export class LienPeerjs extends EmetteurLien implements Lien {
  constructor(private readonly conn: DataConnection) {
    super();
    conn.on('open', () => this.emit('open'));
    conn.on('data', (data) => this.emit('data', data));
    conn.on('close', () => this.emit('close'));
    conn.on('error', (err) => this.emit('error', err));
  }

  get connectionId() {
    return this.conn.connectionId;
  }

  get idDistant() {
    return this.conn.peer;
  }

  get open() {
    return this.conn.open;
  }

  send(message: unknown) {
    this.conn.send(message);
  }

  close() {
    this.conn.close();
  }
}
