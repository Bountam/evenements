import { createHash } from 'node:crypto';
import { TAILLE_MORCEAU, type NatifMaj } from '../../src/net/miseAJour';

// Plugin natif de mise à jour simulé : fichier en mémoire, mêmes contrôles d'ordre et d'empreinte
export class FauxNatifMaj implements NatifMaj {
  morceaux: Buffer[] = [];
  installe = false;
  constructor(private options: { alterer?: boolean; autreCle?: boolean } = {}) {}

  async ouvrir() {
    return this.morceaux.length * TAILLE_MORCEAU;
  }
  async ecrire(index: number, donnees: string) {
    if (index !== this.morceaux.length) return this.morceaux.length;
    const octets = Buffer.from(donnees, 'base64');
    if (this.options.alterer && index === 0) octets[10] ^= 0xff;
    this.morceaux.push(octets);
    return null;
  }
  async verifier(sha256: string) {
    const recu = createHash('sha256').update(Buffer.concat(this.morceaux)).digest('hex');
    if (recu !== sha256) return 'APK modifié en route : son empreinte SHA-256 ne correspond pas.';
    if (this.options.autreCle) return "APK signé avec une autre clé que l'appli installée : installation refusée.";
    return null;
  }
  async installer() {
    this.installe = true;
    return 'confirmation' as const;
  }
  recu(): Buffer {
    return Buffer.concat(this.morceaux);
  }
}
