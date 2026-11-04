// Liaison de données entre le PC hôte et une tablette, quel que soit le transport.
// network.ts ne connaît que cette interface : la file d'envoi, les accusés, les battements et la
// synchro complète ne dépendent pas de la façon dont les messages voyagent.

export type LienEvent = 'open' | 'data' | 'close' | 'error';

export interface Lien {
  // Identifiant unique de cette liaison (une reconnexion en crée une nouvelle)
  readonly connectionId: string;
  // Appareil à l'autre bout (nom de la tablette, ou « PC hôte »)
  readonly idDistant: string;
  // Vrai tant que des messages peuvent partir
  readonly open: boolean;
  send(message: unknown): void;
  close(): void;
  on(event: 'open', callback: () => void): void;
  on(event: 'data', callback: (message: unknown) => void): void;
  on(event: 'close', callback: () => void): void;
  on(event: 'error', callback: (error: unknown) => void): void;
}

// Base commune : gestion des abonnés aux événements
export class EmetteurLien {
  private abonnes: Record<string, Array<(...args: any[]) => void>> = {};

  on(event: LienEvent, callback: (...args: any[]) => void): void {
    (this.abonnes[event] ||= []).push(callback);
  }

  protected emit(event: LienEvent, ...args: unknown[]) {
    for (const callback of this.abonnes[event] || []) {
      try {
        callback(...args);
      } catch (e) {
        console.error(`Erreur dans un écouteur « ${event} » :`, e);
      }
    }
  }
}
