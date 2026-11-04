import React, { useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { networkManager } from '../../network';
import { normaliserCle } from '../../net/chiffrement';
import { lireModeleTablette } from '../../net/tabletteLocale';
import { CODE_SESSION_RE, parseJoinLink, type LienRejoindre } from '../../utils/joinLink';
import { showToast } from '../shared/Toast';
import Button from '../shared/Button';
import QrScanner from '../shared/QrScanner';

export const TEXTE_QR_INCONNU = "Ce QR n'est pas un QR Insertech.";

const champ =
  'w-full bg-app-input border border-app-input-border rounded-xl px-3 py-2.5 text-app-text text-sm focus:outline-none focus:border-primary';

// Rejoint la session et mémorise tout : aux lancements suivants, la tablette attend le PC sans rien demander
export async function rejoindreAvecLien(lien: LienRejoindre, nomTablette?: string): Promise<void> {
  const nom = (nomTablette || networkManager.getTabletName() || (await lireModeleTablette()) || 'Tablette').trim().slice(0, 40);
  await networkManager.joinSession(lien.code, 'temp', { cle: lien.cle, nom, evenement: lien.nom });
}

interface RejoindreEvenementProps {
  codePropose?: string;
  onJoined: (code: string) => void;
}

// Tablette : rejoindre l'événement du PC hôte en scannant son QR, ou en saisissant le code et la clé
export default function RejoindreEvenement({ codePropose = '', onJoined }: RejoindreEvenementProps) {
  const [code, setCode] = useState(codePropose);
  const [cle, setCle] = useState('');
  const [nom, setNom] = useState(() => networkManager.getTabletName());
  const [erreur, setErreur] = useState('');
  const [scanner, setScanner] = useState(false);

  // Nom proposé : celui déjà donné, sinon le modèle de la tablette
  useEffect(() => {
    if (nom) return;
    let annule = false;
    lireModeleTablette().then((modele) => {
      if (!annule && modele) setNom((actuel) => actuel || modele);
    });
    return () => {
      annule = true;
    };
  }, []);

  const terminer = async (lien: LienRejoindre, nomTablette: string) => {
    try {
      await rejoindreAvecLien(lien, nomTablette);
      setErreur('');
      onJoined(lien.code);
      showToast('Tablette prête : en attente du PC hôte.', 'success');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Impossible de démarrer la tablette.');
    }
  };

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault();
    const codeNet = code.trim().toUpperCase();
    const cleNet = normaliserCle(cle);
    if (!CODE_SESSION_RE.test(codeNet)) {
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
    terminer({ code: codeNet, cle: cleNet, nom: '' }, nom);
  };

  const qrLu = (texte: string): string | null => {
    const lien = parseJoinLink(texte);
    if (!lien) return TEXTE_QR_INCONNU;
    setScanner(false);
    setCode(lien.code);
    terminer(lien, nom);
    return null;
  };

  return (
    <div className="space-y-4 text-left">
      <Button variant="primary" className="w-full min-h-12" onClick={() => setScanner(true)}>
        <ScanLine size={18} aria-hidden="true" />
        <span>Scanner le QR du PC</span>
      </Button>
      <form onSubmit={soumettre} className="space-y-3" noValidate aria-labelledby="titre-saisie">
        <div id="titre-saisie" className="text-[10px] uppercase font-bold text-app-text-muted">Ou saisir le code et la clé</div>
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
        <Button type="submit" className="w-full">Rejoindre</Button>
        <p className="text-[10px] text-app-text-muted">Le QR, le code et la clé s'affichent dans la fenêtre Réseau du PC hôte. Rien ne passe par internet.</p>
      </form>
      <QrScanner isOpen={scanner} onClose={() => setScanner(false)} onResult={qrLu} />
    </div>
  );
}
