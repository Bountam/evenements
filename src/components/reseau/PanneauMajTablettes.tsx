import React, { useEffect, useState } from 'react';
import { Download, FileUp, RefreshCw, Send } from 'lucide-react';
import { networkManager } from '../../network';
import {
  empreinteDansSommes, NOM_APK_GITHUB, sha256Hex, TAILLE_MAX_APK, versionCodeDe, versionDepuisNomFichier,
  type ApkPret, type DiffusionMaj, type EnvoiTablette, type EtatEnvoi
} from '../../net/miseAJour';
import { fetchLatestAndroidRelease } from '../../utils/updateCheck';
import Button from '../shared/Button';

const LIBELLES: Record<EtatEnvoi, string> = {
  proposee: 'En attente de la tablette',
  refusee: 'Refusée',
  envoi: 'Envoi',
  verification: 'Vérification',
  confirmation: 'À confirmer sur la tablette',
  autorisation: 'Autoriser l’installation sur la tablette',
  installee: 'Installée',
  erreur: 'Erreur',
  perdue: 'Liaison perdue'
};

const champ =
  'w-full bg-app-input border border-app-input-border rounded-xl px-3 py-2 text-app-text text-sm focus:outline-none focus:border-primary';

function texteEnvoi(e: EnvoiTablette): string {
  if (e.etat === 'envoi' || e.etat === 'perdue') return `${LIBELLES[e.etat]} ${e.pourcentage} %`;
  if (e.etat === 'installee') return `${LIBELLES.installee}${e.version ? ` (${e.version})` : ''}`;
  if (e.raison) return `${LIBELLES[e.etat]} : ${e.raison}`;
  return LIBELLES[e.etat];
}

function megaoctets(n: number) {
  return `${(n / 1024 / 1024).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} Mo`;
}

// PC hôte : envoyer un APK aux tablettes reliées, par le réseau local (ni Play Store, ni internet)
export default function PanneauMajTablettes() {
  const [octets, setOctets] = useState<Uint8Array | null>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [version, setVersion] = useState('');
  const [sha, setSha] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [diffusion, setDiffusion] = useState<DiffusionMaj | null>(() => networkManager.getDiffusionMaj());
  const [, setTic] = useState(0);

  useEffect(
    () =>
      networkManager.onMajChange((d) => {
        setDiffusion(d);
        setTic((n) => n + 1);
      }),
    []
  );

  const charger = async (donnees: Uint8Array, nom: string, versionConnue: string, shaAttendu?: string) => {
    if (donnees.length === 0 || donnees.length > TAILLE_MAX_APK) throw new Error('Fichier vide ou trop gros pour un APK.');
    // Un APK est une archive ZIP : il commence par « PK »
    if (donnees[0] !== 0x50 || donnees[1] !== 0x4b) throw new Error("Ce fichier n'est pas un APK.");
    const empreinte = await sha256Hex(donnees);
    if (shaAttendu && empreinte !== shaAttendu) throw new Error("L'APK téléchargé ne correspond pas à SHA256SUMS.txt de la Release.");
    setOctets(donnees);
    setNomFichier(nom);
    setSha(empreinte);
    setVersion(versionConnue);
  };

  const choisirFichier = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    setErreur('');
    setChargement(true);
    try {
      await charger(new Uint8Array(await fichier.arrayBuffer()), fichier.name, versionDepuisNomFichier(fichier.name));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setChargement(false);
    }
  };

  const telechargerGithub = async () => {
    setErreur('');
    setChargement(true);
    try {
      const release = await fetchLatestAndroidRelease();
      if (!release) throw new Error("La dernière Release ne contient pas d'APK Android avec SHA256SUMS.txt.");
      const [apk, sommes] = await Promise.all([fetch(release.apkUrl), fetch(release.sumsUrl)]);
      if (!apk.ok || !sommes.ok) throw new Error('Téléchargement interrompu.');
      const attendu = empreinteDansSommes(await sommes.text(), NOM_APK_GITHUB);
      if (!attendu) throw new Error("SHA256SUMS.txt ne mentionne pas l'APK.");
      await charger(new Uint8Array(await apk.arrayBuffer()), `${NOM_APK_GITHUB} (GitHub ${release.version})`, release.version, attendu);
    } catch (err) {
      setErreur(
        `Téléchargement impossible (${err instanceof Error ? err.message : String(err)}). Téléchargez l'APK depuis la page Releases sur un appareil relié à internet, puis choisissez le fichier.`
      );
    } finally {
      setChargement(false);
    }
  };

  const envoyer = () => {
    const code = versionCodeDe(version);
    if (!octets || !sha) return;
    if (code === null) {
      setErreur('Version attendue sous la forme 1.4.1 (celle de la Release).');
      return;
    }
    setErreur('');
    const apk: ApkPret = { octets, versionName: version.trim().replace(/^v/, ''), versionCode: code, sha256: sha };
    try {
      networkManager.lancerMiseAJour(apk);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
  };

  const envois = diffusion?.getEnvois() ?? [];
  const reliees = networkManager.connections.filter((c) => c.open).length;

  return (
    <details className="rounded-xl bg-app-input border border-app-card-border p-3" open={Boolean(diffusion)}>
      <summary className="cursor-pointer text-xs font-bold text-app-text">Mettre à jour les tablettes</summary>
      <div className="mt-3 space-y-3">
        <p className="text-[11px] text-app-text-muted leading-relaxed">
          Le PC envoie l'APK aux tablettes par le réseau local. Chaque tablette vérifie qu'il vient bien d'Insertech (même signature),
          sauvegarde ses données, puis Android demande de confirmer la mise à jour.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-app-card border border-app-card-border text-xs font-bold cursor-pointer hover:border-primary">
            <FileUp size={14} aria-hidden="true" />
            <span>Choisir un fichier .apk</span>
            <input id="apk-fichier" type="file" accept=".apk,application/vnd.android.package-archive" className="sr-only" onChange={choisirFichier} disabled={chargement} />
          </label>
          <Button size="sm" onClick={telechargerGithub} disabled={chargement}>
            <Download size={14} aria-hidden="true" />
            <span>Télécharger depuis GitHub</span>
          </Button>
        </div>
        <p className="text-[10px] text-app-text-muted">« Télécharger depuis GitHub » est le seul bouton de l'appli qui utilise internet.</p>
        {chargement && <p role="status" className="text-xs text-app-text-muted">Lecture de l'APK…</p>}
        {octets && (
          <div className="space-y-2">
            <p className="text-xs text-app-text" data-testid="apk-pret">
              {nomFichier} · {megaoctets(octets.length)} · SHA-256 {sha.slice(0, 12)}…
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label htmlFor="apk-version" className="text-xs font-bold text-app-text block">Version de l'APK</label>
                <input id="apk-version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.1" className={`${champ} font-mono`} />
              </div>
              <Button variant="primary" size="sm" onClick={envoyer} disabled={reliees === 0}>
                <Send size={14} aria-hidden="true" />
                <span>Envoyer aux tablettes ({reliees})</span>
              </Button>
            </div>
          </div>
        )}
        {erreur && <p role="alert" className="text-xs font-bold text-danger">{erreur}</p>}
        {envois.length > 0 && (
          <ul className="space-y-1.5" aria-label="Progression de la mise à jour">
            {envois.map((e) => (
              <li key={e.nom} className="flex items-center gap-2 p-2 rounded-lg bg-app-card border border-app-card-border text-xs">
                <span className="font-bold text-app-text truncate flex-1">{e.nom}</span>
                <span
                  className={`text-right ${e.etat === 'erreur' || e.etat === 'refusee' ? 'text-danger font-bold' : e.etat === 'installee' ? 'text-success font-bold' : 'text-app-text-muted'}`}
                  data-testid="etat-maj"
                >
                  {texteEnvoi(e)}
                </span>
                {['refusee', 'erreur', 'perdue', 'autorisation', 'confirmation'].includes(e.etat) && (
                  <Button size="sm" onClick={() => networkManager.renvoyerMiseAJour(e.nom)} aria-label={`Renvoyer à ${e.nom}`}>
                    <RefreshCw size={12} aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
