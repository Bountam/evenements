import React, { useEffect, useState } from 'react';
import { Tablet } from 'lucide-react';
import { networkManager } from '../../network';
import { getEtatServeurTablette, onEtatServeurTablette, type EtatServeurTablette } from '../../net/tabletteLocale';
import { showToast } from '../shared/Toast';
import Button from '../shared/Button';
import RejoindreEvenement from '../tablette/RejoindreEvenement';

const ATTENTE_LONGUE_MS = 60_000;

export const TEXTE_NAVIGATEUR =
  "Pour rejoindre un événement en réseau local, installez l'appli Android Insertech Événements. Un navigateur ne peut pas recevoir la connexion du PC : iPhone et ordinateurs ne sont pas pris en charge.";

interface PanneauTabletteProps {
  sessionCode: string;
  netStatus: string;
  codePropose?: string;
  onJoined: (code: string) => void;
  onLeave: () => void;
}

const champ =
  'w-full bg-app-input border border-app-input-border rounded-xl px-3 py-2 text-app-text text-sm focus:outline-none focus:border-primary';

// Fenêtre Réseau local de la tablette : rejoindre une session (QR ou code et clé), puis attendre l'appel du PC
export default function PanneauTablette({ sessionCode, netStatus, codePropose = '', onJoined, onLeave }: PanneauTabletteProps) {
  const [nom, setNom] = useState(() => networkManager.getTabletName());
  const [serveur, setServeur] = useState<EtatServeurTablette>(getEtatServeurTablette);
  const [maintenant, setMaintenant] = useState(Date.now());

  useEffect(() => onEtatServeurTablette(setServeur), []);
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const renommer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await networkManager.renommerTablette(nom);
      showToast('Nom de la tablette enregistré.', 'success');
    } catch {
      showToast('Donnez un nom à cette tablette.', 'error');
    }
  };

  if (sessionCode) {
    const enAttenteDepuis = networkManager.getHostLostSince();
    const attenteLongue = enAttenteDepuis !== null && maintenant - enAttenteDepuis >= ATTENTE_LONGUE_MS;
    const adresse = serveur.ip ?? '192.168.x.y';
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-1.5">
          <Tablet size={22} className="text-primary mx-auto" aria-hidden="true" />
          <p className="font-bold text-app-text text-sm">{networkManager.getTabletName() || 'Tablette'}</p>
          {networkManager.getEventNom() && <p className="text-xs text-app-text">{networkManager.getEventNom()}</p>}
          <p className="text-[11px] text-app-text-muted">Session {sessionCode}</p>
          <p className="text-[11px] font-mono text-app-text" data-testid="adresse-tablette">
            Adresse : {serveur.ip ? `${serveur.ip}${serveur.port && serveur.port !== 47630 ? `:${serveur.port}` : ''}` : '…'}
          </p>
          <p role="status" className="text-xs font-bold text-primary">{netStatus}</p>
        </div>
        {serveur.erreur && <p role="alert" className="text-xs font-bold text-danger">{serveur.erreur}</p>}
        {attenteLongue && (
          <p role="status" className="p-3 rounded-xl bg-warning/10 border border-warning/40 text-app-text text-xs leading-relaxed">
            Le PC ne nous a pas encore trouvés. Adresse de cette tablette : {adresse}, à saisir sur le PC si besoin. Vérifiez que le PC est sur le même hotspot.
          </p>
        )}
        <form onSubmit={renommer} className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label htmlFor="nom-tablette" className="text-xs font-bold text-app-text block">Nom de cet appareil</label>
            <input id="nom-tablette" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={40} className={champ} />
          </div>
          <Button type="submit" size="sm" disabled={!nom.trim() || nom.trim() === networkManager.getTabletName()}>Renommer</Button>
        </form>
        <button
          type="button"
          onClick={onLeave}
          className="w-full py-2.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-300 hover:bg-red-900/30 hover:text-white font-bold font-display uppercase tracking-wider text-xs cursor-pointer transition"
        >
          Quitter cet événement
        </button>
      </div>
    );
  }

  return <RejoindreEvenement codePropose={codePropose} onJoined={onJoined} />;
}
