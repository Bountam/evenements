import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, WifiOff } from 'lucide-react';
import { networkManager } from '../../network';
import type { EtatHoteLocal } from '../../net/hoteLocal';
import { showToast } from './Toast';
import { formatDuree } from '../reseau/duree';
import { texteTablettePerdue } from '../reseau/PanneauHote';

export const TABLETTE_ORANGE_MS = 15_000;
export const TABLETTE_ROUGE_MS = 5 * 60_000;
const PC_TABLETTE_PERDUE_MS = 30_000;

// Avertissements des limites du réseau local, au moment où la situation se produit :
// - tablette : bandeau orange après 15 s sans le PC hôte, rouge après 5 min (en haut de tous les modes) ;
// - PC hôte : notification quand une tablette connue est injoignable depuis 30 s.
export default function NetworkWarnings() {
  const [maintenant, setMaintenant] = useState(Date.now());
  const [etatHote, setEtatHote] = useState<EtatHoteLocal | null>(null);
  const signalees = useRef(new Set<string>());

  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => networkManager.onHoteLocalChange(setEtatHote), []);

  // PC : une notification par perte (la liste de la fenêtre Réseau garde l'état en continu)
  useEffect(() => {
    if (!etatHote) return;
    for (const t of etatHote.tablettes) {
      const cle = `${t.adresse}@${t.perdueDepuis}`;
      if (t.etat === 'perdue' && t.perdueDepuis && maintenant - t.perdueDepuis >= PC_TABLETTE_PERDUE_MS && !signalees.current.has(cle)) {
        signalees.current.add(cle);
        showToast(texteTablettePerdue(t, maintenant), 'warning');
      }
    }
  }, [etatHote, maintenant]);

  const perduDepuis = networkManager.getHostLostSince();
  if (perduDepuis === null) return null;
  const duree = maintenant - perduDepuis;
  if (duree < TABLETTE_ORANGE_MS) return null;

  const enAttente = networkManager.getPendingCount();
  if (duree >= TABLETTE_ROUGE_MS) {
    return (
      <div role="alert" className="sticky top-0 z-[60] flex items-start gap-2 px-4 py-2.5 bg-danger text-white text-sm font-bold shadow-lg">
        <WifiOff size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Toujours aucun contact avec le PC hôte. Vérifiez qu'il est allumé et connecté au même hotspot.
          {enAttente > 0 ? ` (${enAttente} en attente)` : ''}
        </p>
      </div>
    );
  }
  return (
    <div role="status" data-testid="bandeau-pc-injoignable" className="sticky top-0 z-[60] flex items-start gap-2 px-4 py-2.5 bg-warning text-secondary text-sm font-bold shadow-lg">
      <AlertTriangle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
      <p>
        PC hôte injoignable depuis {formatDuree(duree)}. Vos saisies sont gardées sur cette tablette ({enAttente} en attente) et
        partiront dès la reconnexion. Ne fermez pas l'appli et ne videz pas ses données.
      </p>
    </div>
  );
}
