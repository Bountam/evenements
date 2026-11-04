import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isAndroidApp } from '../native/android';
import { DELAI_POIGNEE_MS, LienChiffre, PoigneeTablette } from './poignee';
import type { Lien } from './lien';

// Côté tablette : la tablette écoute sur le réseau local (plugin natif ServeurLocal) et le PC hôte l'appelle.
// Les connexions entrantes vers Windows sont bloquées par son pare-feu, pas les sortantes : c'est donc au PC
// d'appeler. Le plugin ne fait que transporter du texte ; l'authentification et le chiffrement sont ici.

export const PORT_TABLETTE = 47630;
const ECHECS_AVANT_BLOCAGE = 5;
const BLOCAGE_MS = 60_000;

interface ServeurLocalPlugin {
  demarrer(options: { port: number; nom: string; session: string }): Promise<{ port: number; ip: string | null }>;
  majFiche(options: { nom: string; session: string | null }): Promise<void>;
  envoyer(options: { id: string; texte: string }): Promise<void>;
  fermer(options: { id: string }): Promise<void>;
  arreter(): Promise<void>;
  addListener(event: 'connexion', cb: (e: { id: string; ip?: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'message', cb: (e: { id: string; texte: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'deconnexion', cb: (e: { id: string }) => void): Promise<PluginListenerHandle>;
}

export interface EtatServeurTablette {
  actif: boolean;
  ip: string | null;
  port: number | null;
  erreur: string | null;
}

let plugin: ServeurLocalPlugin | null = null;
function getPlugin(): ServeurLocalPlugin {
  if (!plugin) plugin = registerPlugin<ServeurLocalPlugin>('ServeurLocal');
  return plugin;
}

let ecouteurs: PluginListenerHandle[] = [];
let etat: EtatServeurTablette = { actif: false, ip: null, port: null, erreur: null };
const abonnesEtat = new Set<(e: EtatServeurTablette) => void>();

function changerEtat(prochain: Partial<EtatServeurTablette>) {
  etat = { ...etat, ...prochain };
  abonnesEtat.forEach((cb) => cb(etat));
}

export function getEtatServeurTablette(): EtatServeurTablette {
  return etat;
}

export function onEtatServeurTablette(cb: (e: EtatServeurTablette) => void): () => void {
  abonnesEtat.add(cb);
  return () => abonnesEtat.delete(cb);
}

interface Connexion {
  poignee: PoigneeTablette;
  lien: LienChiffre | null;
  delai: ReturnType<typeof setTimeout>;
}

export async function demarrerServeurTablette(
  session: { code: string; cle: string; nom: string },
  onLien: (lien: Lien) => void
): Promise<void> {
  if (!isAndroidApp()) {
    changerEtat({ actif: false, erreur: "Seule l'application Android peut recevoir la connexion du PC." });
    return;
  }
  await arreterServeurTablette();
  const serveur = getPlugin();
  const connexions = new Map<string, Connexion>();
  let echecs = 0;
  let bloqueJusqua = 0;

  const fermer = (id: string) => {
    const c = connexions.get(id);
    if (c) clearTimeout(c.delai);
    connexions.delete(id);
    serveur.fermer({ id }).catch(() => {});
  };

  const echec = (id: string) => {
    echecs += 1;
    if (echecs >= ECHECS_AVANT_BLOCAGE) {
      echecs = 0;
      bloqueJusqua = Date.now() + BLOCAGE_MS;
    }
    fermer(id);
  };

  ecouteurs = [
    await serveur.addListener('connexion', ({ id }) => {
      if (Date.now() < bloqueJusqua) {
        serveur.fermer({ id }).catch(() => {});
        return;
      }
      const envoyer = (texte: string) => {
        serveur.envoyer({ id, texte }).catch(() => {});
      };
      const poignee = new PoigneeTablette(session.cle, session.code, envoyer);
      const delai = setTimeout(() => {
        if (!connexions.get(id)?.lien) echec(id);
      }, DELAI_POIGNEE_MS);
      connexions.set(id, { poignee, lien: null, delai });
      poignee.ouvrir();
    }),
    await serveur.addListener('message', async ({ id, texte }) => {
      const c = connexions.get(id);
      if (!c) return;
      if (c.lien) {
        c.lien.recevoirTexte(texte);
        return;
      }
      const cleSession = await c.poignee.recevoir(texte);
      if (!cleSession) {
        echec(id);
        return;
      }
      clearTimeout(c.delai);
      echecs = 0;
      const lien = new LienChiffre('PC hôte', cleSession, (t) => serveur.envoyer({ id, texte: t }).catch(() => lien.transportFerme()), () => fermer(id));
      c.lien = lien;
      // Un seul PC à la fois : une nouvelle liaison remplace les autres
      for (const [autreId, autre] of connexions) {
        if (autreId !== id && autre.lien) autre.lien.close();
      }
      onLien(lien);
    }),
    await serveur.addListener('deconnexion', ({ id }) => {
      const c = connexions.get(id);
      if (!c) return;
      clearTimeout(c.delai);
      connexions.delete(id);
      c.lien?.transportFerme();
    })
  ];

  try {
    const { port, ip } = await serveur.demarrer({ port: PORT_TABLETTE, nom: session.nom, session: session.code });
    changerEtat({ actif: true, ip, port, erreur: null });
  } catch (e) {
    changerEtat({ actif: false, erreur: e instanceof Error ? e.message : String(e) });
  }
}

export async function arreterServeurTablette(): Promise<void> {
  if (!isAndroidApp()) return;
  for (const e of ecouteurs) {
    try {
      await e.remove();
    } catch {
      // Déjà retiré
    }
  }
  ecouteurs = [];
  if (etat.actif) {
    try {
      await getPlugin().arreter();
    } catch {
      // Serveur déjà arrêté
    }
  }
  changerEtat({ actif: false, ip: null, port: null });
}
