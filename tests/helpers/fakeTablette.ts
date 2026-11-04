import { WebSocketServer, type WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { LienChiffre, PoigneeTablette } from '../../src/net/poignee';
import { estMessageMaj, recevoirMajTablette, reinitialiserReceptionMaj, versionCodeDe, type NatifMaj } from '../../src/net/miseAJour';

// Tablette simulée en Node : même serveur que le plugin Android ServeurLocal (/decouverte, /session),
// même poignée de main et même chiffrement que l'application, partagés avec src/net.
export class FakeTablette {
  private serveur: WebSocketServer | null = null;
  readonly recus: any[] = [];
  lien: LienChiffre | null = null;
  refus = 0;
  // Plugin natif de mise à jour simulé : la tablette répond aux MAJ_* avec le vrai code de l'appli
  natifMaj: NatifMaj | null = null;
  version = '1.2.5';
  port = 0;

  constructor(
    public session: string,
    public cle: string,
    public nom = 'Tablette test',
    public versionCode = 10205
  ) {}

  async demarrer(port = 0): Promise<number> {
    reinitialiserReceptionMaj();
    const serveur = new WebSocketServer({ host: '127.0.0.1', port });
    await new Promise<void>((resolve, reject) => {
      serveur.once('listening', () => resolve());
      serveur.once('error', reject);
    });
    this.serveur = serveur;
    this.port = (serveur.address() as AddressInfo).port;
    serveur.on('connection', (ws, req) => {
      if (req.url === '/decouverte') {
        ws.send(JSON.stringify(this.fiche()));
        ws.close();
      } else if (req.url === '/session') {
        this.accepter(ws);
      } else {
        ws.close();
      }
    });
    return this.port;
  }

  fiche() {
    return { app: 'insertech', versionCode: this.versionCode, nom: this.nom, modele: 'Simulée', session: this.session };
  }

  private accepter(ws: WebSocket) {
    const poignee = new PoigneeTablette(this.cle, this.session, (t) => ws.send(t));
    let lien: LienChiffre | null = null;
    let chaine: Promise<void> = Promise.resolve();
    ws.on('message', (data) => {
      const texte = data.toString();
      chaine = chaine.then(async () => {
        if (lien) {
          lien.recevoirTexte(texte);
          return;
        }
        const cleSession = await poignee.recevoir(texte);
        if (!cleSession) {
          this.refus += 1;
          ws.close();
          return;
        }
        lien = new LienChiffre('PC hôte', cleSession, (t) => ws.send(t), () => ws.close());
        const actuel = lien;
        lien.on('data', (m: any) => {
          this.recus.push(m);
          if (estMessageMaj(m)) {
            recevoirMajTablette(actuel, m, {
              natif: this.natifMaj,
              versionCodeActuel: () => versionCodeDe(this.version) ?? 0,
              verrouillee: () => false,
              avantInstallation: async () => {}
            });
          }
        });
        this.lien?.close();
        this.lien = lien;
      });
    });
    ws.on('close', () => lien?.transportFerme());
    poignee.ouvrir();
  }

  envoyer(message: unknown) {
    if (!this.lien?.open) throw new Error('Pas de liaison');
    this.lien.send(message);
  }

  async attendre(predicat: (m: any) => boolean, delaiMs = 15_000): Promise<any> {
    const fin = Date.now() + delaiMs;
    while (Date.now() < fin) {
      const m = this.recus.find(predicat);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Message attendu non reçu');
  }

  async arreter() {
    this.lien?.close();
    this.lien = null;
    const serveur = this.serveur;
    this.serveur = null;
    if (!serveur) return;
    for (const client of serveur.clients) client.terminate();
    await new Promise<void>((resolve) => serveur.close(() => resolve()));
  }
}
