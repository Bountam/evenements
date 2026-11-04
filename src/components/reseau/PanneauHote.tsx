import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, KeyRound, Plus, Tablet, Trash2, X } from 'lucide-react';
import { networkManager } from '../../network';
import type { EtatHoteLocal, EtatTablette, TabletteVue } from '../../net/hoteLocal';
import { adresseValide } from '../../net/hoteLocal';
import { formaterCle } from '../../net/chiffrement';
import { showToast } from '../shared/Toast';
import Button from '../shared/Button';
import { confirmDialog } from '../shared/ConfirmDialog';
import SessionQrPanel from '../shared/SessionQrPanel';
import PanneauMajTablettes from './PanneauMajTablettes';
import { formatDuree, prefixe24 } from './duree';

const AVERT_PC_KEY = 'insertech_avert_pc_hote_compris';
const AUCUNE_TABLETTE_MS = 30_000;
const PERDUE_MS = 30_000;

const LIBELLES: Record<EtatTablette, string> = {
  attente: 'En attente',
  connexion: 'Connexion…',
  connectee: 'Connectée',
  autre_session: 'Autre session',
  sans_session: 'Sans session',
  refusee: 'Clé refusée',
  perdue: 'Injoignable'
};

const PASTILLES: Record<EtatTablette, string> = {
  attente: 'bg-app-text-muted',
  connexion: 'bg-warning animate-pulse',
  connectee: 'bg-success',
  autre_session: 'bg-app-text-muted',
  sans_session: 'bg-app-text-muted',
  refusee: 'bg-danger',
  perdue: 'bg-warning'
};

export function texteTablettePerdue(t: TabletteVue, maintenant: number): string {
  return `« ${t.nom} » injoignable depuis ${formatDuree(maintenant - (t.perdueDepuis ?? maintenant))}. Ses saisies arriveront à sa reconnexion.`;
}

function Avertissement({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div role="status" className="flex items-start gap-2 p-3 rounded-xl bg-warning/10 border border-warning/40 text-app-text">
      <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 space-y-2 text-xs leading-relaxed">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Masquer" className="p-1 text-app-text-muted hover:text-app-text cursor-pointer">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

interface PanneauHoteProps {
  sessionCode: string;
  evenementNom?: string;
  onLeave: () => void;
}

// Fenêtre Réseau local du PC hôte : code et clé de session, tablettes trouvées, ajout par adresse IP
export default function PanneauHote({ sessionCode, evenementNom = '', onLeave }: PanneauHoteProps) {
  const [etat, setEtat] = useState<EtatHoteLocal | null>(null);
  const [maintenant, setMaintenant] = useState(Date.now());
  const [ip, setIp] = useState('');
  const [erreurIp, setErreurIp] = useState('');
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [avertPcCompris, setAvertPcCompris] = useState(() => {
    try {
      return sessionStorage.getItem(AVERT_PC_KEY) === sessionCode;
    } catch {
      return false;
    }
  });
  const [cle, setCle] = useState(() => networkManager.getSessionKey());

  useEffect(() => networkManager.onHoteLocalChange(setEtat), []);
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const comprisPc = () => {
    setAvertPcCompris(true);
    try {
      sessionStorage.setItem(AVERT_PC_KEY, sessionCode);
    } catch {
      // Le message reviendra à la prochaine ouverture
    }
  };

  const copier = (texte: string, quoi: string) => {
    navigator.clipboard?.writeText(texte).then(
      () => showToast(`${quoi} copié dans le presse-papier.`, 'success'),
      () => showToast(`Copie impossible : notez ${quoi.toLowerCase()} à la main.`, 'warning')
    );
  };

  const changerCle = async () => {
    const ok = await confirmDialog({
      title: 'Nouvelle clé ?',
      message: "Toutes les tablettes sont déconnectées et devront scanner le nouveau QR, ou saisir la nouvelle clé. À faire si la clé a été vue par quelqu'un d'autre.",
      confirmLabel: 'Changer la clé',
      tone: 'destructive'
    });
    if (!ok) return;
    try {
      setCle(await networkManager.renouvelerCle());
      showToast('Nouvelle clé créée : scannez le nouveau QR sur chaque tablette.', 'success');
    } catch {
      showToast('Impossible de changer la clé.', 'error');
    }
  };

  const ajouter = async (e: React.FormEvent) => {
    e.preventDefault();
    const adresse = ip.trim();
    if (!adresseValide(adresse)) {
      setErreurIp('Adresse attendue sous la forme 192.168.43.17.');
      return;
    }
    const hote = networkManager.getHoteLocal();
    if (!hote) return;
    setAjoutEnCours(true);
    setErreurIp('');
    try {
      const fiche = await hote.ajouterParIp(adresse);
      setIp('');
      showToast(`Tablette « ${fiche.nom || adresse} » ajoutée.`, 'success');
    } catch {
      setErreurIp(
        `Le PC ne peut pas joindre ${adresse}. Le hotspot isole probablement les appareils : désactivez cette option dans les réglages du point d'accès du cellulaire.`
      );
    } finally {
      setAjoutEnCours(false);
    }
  };

  const tablettes = etat?.tablettes ?? [];
  const reseaux = etat?.reseaux ?? [];
  const aucuneTablette = etat && tablettes.length === 0 && maintenant - etat.demarreA > AUCUNE_TABLETTE_MS;
  const prefixeReseau = reseaux[0]?.prefixe || '192.168.x.0';

  return (
    <div className="space-y-4">
      {!avertPcCompris && (
        <Avertissement>
          <p>Ce PC relie toutes les tablettes. Branchez-le sur secteur et désactivez la mise en veille jusqu'à la fin de l'événement.</p>
          <Button size="sm" onClick={comprisPc}>Compris</Button>
        </Avertissement>
      )}

      <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <span className="text-[10px] uppercase font-black text-primary tracking-widest block">Code de session</span>
            <span className="text-2xl font-display font-bold text-app-text tracking-wider block" data-testid="code-session">{sessionCode}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-black text-primary tracking-widest block">Clé</span>
            <span className="text-2xl font-mono font-bold text-app-text tracking-wider block" data-testid="cle-session">{cle ? formaterCle(cle) : '—'}</span>
          </div>
        </div>
        <div className="flex gap-2 justify-center">
          <Button size="sm" onClick={() => copier(sessionCode, 'Code')}>
            <Copy size={13} aria-hidden="true" />
            <span>Copier le code</span>
          </Button>
          {cle && (
            <Button size="sm" onClick={() => copier(formaterCle(cle), 'Clé')}>
              <Copy size={13} aria-hidden="true" />
              <span>Copier la clé</span>
            </Button>
          )}
          <Button size="sm" onClick={changerCle}>
            <KeyRound size={13} aria-hidden="true" />
            <span>Nouvelle clé</span>
          </Button>
        </div>
        <p className="text-[10px] text-app-text-muted text-center">
          Sur chaque tablette : Scanner le QR du PC, ou saisir ce code et cette clé. Rien ne passe par internet.
        </p>
      </div>

      {cle && <SessionQrPanel sessionCode={sessionCode} cle={cle} evenementNom={evenementNom} />}

      {reseaux.length > 1 && (
        <Avertissement>
          <p>
            Ce PC est sur plusieurs réseaux. Les tablettes sont cherchées sur : {reseaux.map((r) => `${r.nom} ${r.prefixe}`).join(', ')}.
          </p>
        </Avertissement>
      )}

      <section aria-labelledby="titre-tablettes" className="space-y-2">
        <h3 id="titre-tablettes" className="text-[10px] uppercase font-bold text-app-text-muted">
          Tablettes du réseau local ({tablettes.filter((t) => t.etat === 'connectee').length} connectée{tablettes.filter((t) => t.etat === 'connectee').length > 1 ? 's' : ''})
        </h3>
        {tablettes.length === 0 ? (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-app-input border border-app-card-border">
            <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" aria-hidden="true"></div>
            <span>{etat?.lanceur === false ? 'Ajoutez les tablettes par leur adresse IP (recherche automatique offerte par le lanceur du PC).' : 'Recherche des tablettes sur le réseau…'}</span>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {tablettes.map((t) => (
              <li key={t.adresse} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-app-input border border-app-card-border">
                <Tablet size={16} className="text-primary shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-app-text text-xs truncate">{t.nom}</div>
                  <div className="text-[10px] text-app-text-muted font-mono truncate">
                    {[t.modele, t.ip, t.rttMs !== null && t.etat === 'connectee' ? `${t.rttMs} ms` : null].filter(Boolean).join(' · ')}
                  </div>
                  {t.etat === 'perdue' && t.perdueDepuis && maintenant - t.perdueDepuis >= PERDUE_MS && (
                    <div className="text-[10px] text-warning font-bold">{texteTablettePerdue(t, maintenant)}</div>
                  )}
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase text-app-text shrink-0">
                  <span className={`w-2 h-2 rounded-full ${PASTILLES[t.etat]}`} aria-hidden="true"></span>
                  {LIBELLES[t.etat]}
                </span>
                {t.manuelle && (
                  <button
                    type="button"
                    onClick={() => networkManager.getHoteLocal()?.retirerManuelle(t.adresse)}
                    aria-label={`Retirer ${t.nom}`}
                    className="p-1 text-app-text-muted hover:text-danger cursor-pointer"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {aucuneTablette && (
          <Avertissement>
            <p>
              Aucune tablette trouvée sur le réseau {prefixeReseau}. Vérifiez que : 1) les tablettes sont sur le même hotspot que ce PC ;
              2) l'option « Isoler les appareils » du hotspot est désactivée ; 3) l'appli est ouverte sur la tablette, écran « En attente du PC ».
            </p>
          </Avertissement>
        )}

        <form onSubmit={ajouter} className="space-y-1.5" noValidate>
          <label htmlFor="ip-tablette" className="text-[10px] uppercase font-bold text-app-text-muted block">Ajouter une tablette par son adresse IP</label>
          <div className="flex gap-2">
            <input
              id="ip-tablette"
              type="text"
              inputMode="decimal"
              value={ip}
              onChange={(e) => {
                setIp(e.target.value);
                setErreurIp('');
              }}
              placeholder="Ex. 192.168.43.17"
              className="flex-grow min-w-0 bg-app-input border border-app-input-border rounded-xl px-3 py-2 text-app-text text-xs font-mono focus:outline-none focus:border-primary"
            />
            <Button type="submit" size="sm" variant="primary" disabled={ajoutEnCours || !ip.trim()}>
              <Plus size={13} aria-hidden="true" />
              <span>Ajouter</span>
            </Button>
          </div>
          {erreurIp && <p role="alert" className="text-xs font-bold text-danger">{erreurIp}</p>}
          <p className="text-[10px] text-app-text-muted">L'adresse s'affiche sur l'écran d'attente de la tablette.</p>
        </form>
      </section>

      <PanneauMajTablettes />

      <button
        type="button"
        onClick={onLeave}
        className="w-full py-2.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-300 hover:bg-red-900/30 hover:text-white font-bold font-display uppercase tracking-wider text-xs cursor-pointer transition"
      >
        Fermer la session réseau
      </button>
    </div>
  );
}
