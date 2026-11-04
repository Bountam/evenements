import React, { useEffect, useState } from 'react';
import { Tablet } from 'lucide-react';
import { networkManager } from '../../network';
import { normaliserCle } from '../../net/chiffrement';
import { getEtatServeurTablette, onEtatServeurTablette, type EtatServeurTablette } from '../../net/tabletteLocale';
import { showToast } from '../shared/Toast';
import Button from '../shared/Button';

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
  'w-full bg-app-input border border-app-input-border rounded-xl px-3 py-2.5 text-app-text text-sm focus:outline-none focus:border-primary';

// Fenêtre Réseau local de la tablette : rejoindre une session (code, clé, nom), puis attendre l'appel du PC
export default function PanneauTablette({ sessionCode, netStatus, codePropose = '', onJoined, onLeave }: PanneauTabletteProps) {
  const [code, setCode] = useState(codePropose);
  const [cle, setCle] = useState('');
  const [nom, setNom] = useState(() => networkManager.getTabletName());
  const [erreur, setErreur] = useState('');
  const [serveur, setServeur] = useState<EtatServeurTablette>(getEtatServeurTablette);
  const [maintenant, setMaintenant] = useState(Date.now());

  useEffect(() => onEtatServeurTablette(setServeur), []);
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const rejoindre = async (e: React.FormEvent) => {
    e.preventDefault();
    const codeNet = code.trim().toUpperCase();
    const cleNet = normaliserCle(cle);
    if (!/^INS-[A-Z0-9-]{4,24}$/.test(codeNet)) {
      setErreur('Code attendu sous la forme INS-4821-AB12, affiché sur le PC hôte.');
      return;
    }
    if (!cleNet) {
      setErreur('Clé attendue : 12 caractères, par exemple ABCD-EFGH-JKLM, affichée sur le PC hôte.');
      return;
    }
    if (!nom.trim()) {
      setErreur('Donnez un nom à cette tablette, par exemple « Kiosque entrée ».');
      return;
    }
    try {
      await networkManager.joinSession(codeNet, 'temp', { cle: cleNet, nom: nom.trim().slice(0, 40) });
      setErreur('');
      onJoined(codeNet);
      showToast('Tablette prête : en attente du PC hôte.', 'success');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Impossible de démarrer la tablette.');
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
        <button
          type="button"
          onClick={onLeave}
          className="w-full py-2.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-300 hover:bg-red-900/30 hover:text-white font-bold font-display uppercase tracking-wider text-xs cursor-pointer transition"
        >
          Quitter la session
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={rejoindre} className="space-y-3" noValidate>
      <div className="text-[10px] uppercase font-bold text-app-text-muted">Rejoindre la session du PC hôte</div>
      <div className="space-y-1">
        <label htmlFor="rejoindre-code" className="text-xs font-bold text-app-text block">Code de session</label>
        <input id="rejoindre-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="INS-4821-AB12" autoCapitalize="characters" className={`${champ} font-mono uppercase`} />
      </div>
      <div className="space-y-1">
        <label htmlFor="rejoindre-cle" className="text-xs font-bold text-app-text block">Clé</label>
        <input id="rejoindre-cle" value={cle} onChange={(e) => setCle(e.target.value)} placeholder="ABCD-EFGH-JKLM" autoCapitalize="characters" autoComplete="off" className={`${champ} font-mono uppercase`} />
      </div>
      <div className="space-y-1">
        <label htmlFor="rejoindre-nom" className="text-xs font-bold text-app-text block">Nom de cette tablette</label>
        <input id="rejoindre-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Kiosque entrée" maxLength={40} className={champ} />
      </div>
      {erreur && <p role="alert" className="text-xs font-bold text-danger">{erreur}</p>}
      <Button type="submit" variant="primary" className="w-full">Rejoindre</Button>
      <p className="text-[10px] text-app-text-muted">Le code et la clé s'affichent dans la fenêtre Réseau du PC hôte. Rien ne passe par internet.</p>
    </form>
  );
}
