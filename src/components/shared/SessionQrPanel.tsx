import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Wifi, Smartphone, Maximize2, Minimize2, Copy, Eye, EyeOff } from 'lucide-react';
import Button from './Button';
import TextField from './TextField';
import { showToast } from './Toast';
import { buildJoinUrl, buildWifiQrPayload, PUBLIC_APP_URL, getShareableAppUrl } from '../../utils/joinLink';

const WIFI_SSID_KEY = 'insertech_wifi_ssid';
const WIFI_PASSWORD_KEY = 'insertech_wifi_password';

function readStored(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStored(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Stockage indisponible : le code QR reste utilisable pour cette ouverture
  }
}

// Noir sur blanc : le meilleur contraste pour les appareils photo, quel que soit le thème
function useQrDataUrl(payload: string | null): string {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    if (!payload) {
      setDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(payload, { width: 480, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err) => console.error('Erreur génération QR Code:', err));
    return () => {
      cancelled = true;
    };
  }, [payload]);
  return dataUrl;
}

interface QrTileProps {
  step: number;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' }>;
  dataUrl: string;
  alt: string;
  large: boolean;
  children?: React.ReactNode;
}

function QrTile({ step, title, icon: Icon, dataUrl, alt, large, children }: QrTileProps) {
  return (
    <figure className="flex flex-col items-center text-center gap-2 p-3 rounded-xl bg-app-input border border-app-card-border">
      <figcaption className="flex items-center gap-1.5 text-xs font-bold text-app-text">
        <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-micro font-black">
          {step}
        </span>
        <Icon size={14} className="text-primary" aria-hidden="true" />
        <span>{title}</span>
      </figcaption>
      <div className="p-2 bg-white rounded-xl">
        {dataUrl ? (
          <img src={dataUrl} alt={alt} className={`${large ? 'w-64 h-64' : 'w-36 h-36'} object-contain`} />
        ) : (
          <div className={`${large ? 'w-64 h-64' : 'w-36 h-36'} flex items-center justify-center text-xs text-app-text-muted`}>
            Génération…
          </div>
        )}
      </div>
      {children}
    </figure>
  );
}

interface SessionQrPanelProps {
  sessionCode: string;
}

// Codes QR affichés par le PC principal : 1) rejoindre le Wi-Fi (optionnel), 2) ouvrir l'application
// et se connecter automatiquement à la session.
export default function SessionQrPanel({ sessionCode }: SessionQrPanelProps) {
  const [ssid, setSsid] = useState(() => readStored(WIFI_SSID_KEY));
  const [password, setPassword] = useState(() => readStored(WIFI_PASSWORD_KEY));
  const [showPassword, setShowPassword] = useState(false);
  const [large, setLarge] = useState(false);

  useEffect(() => writeStored(WIFI_SSID_KEY, ssid.trim()), [ssid]);
  useEffect(() => writeStored(WIFI_PASSWORD_KEY, password), [password]);

  const joinUrl = buildJoinUrl(sessionCode);
  const usesPublicUrl = getShareableAppUrl() === PUBLIC_APP_URL;
  const wifiPayload = ssid.trim() ? buildWifiQrPayload(ssid.trim(), password) : null;

  const joinQr = useQrDataUrl(joinUrl);
  const wifiQr = useQrDataUrl(wifiPayload);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-micro uppercase font-bold text-app-text-muted">Connexion par code QR</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLarge((v) => !v)}
          aria-pressed={large}
        >
          {large ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
          <span>{large ? 'Réduire' : 'Agrandir'}</span>
        </Button>
      </div>

      <div className={`grid gap-3 ${wifiPayload && !large ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {wifiPayload && (
          <QrTile
            step={1}
            title="Rejoindre le Wi-Fi"
            icon={Wifi}
            dataUrl={wifiQr}
            alt={`Code QR pour rejoindre le réseau Wi-Fi ${ssid.trim()}`}
            large={large}
          >
            <span className="text-micro text-app-text-muted break-all">{ssid.trim()}</span>
          </QrTile>
        )}
        <QrTile
          step={wifiPayload ? 2 : 1}
          title="Ouvrir l'application"
          icon={Smartphone}
          dataUrl={joinQr}
          alt={`Code QR pour ouvrir l'application et rejoindre la session ${sessionCode}`}
          large={large}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigator.clipboard
                .writeText(joinUrl)
                .then(() => showToast("Lien d'invitation copié !", 'success'))
                .catch(() => showToast('Copie impossible sur cet appareil.', 'error'));
            }}
          >
            <Copy size={14} aria-hidden="true" />
            <span>Copier le lien</span>
          </Button>
        </QrTile>
      </div>

      <p className="text-micro text-app-text-muted leading-relaxed">
        Scannez avec l'appareil photo du téléphone ou de la tablette : l'application s'ouvre et se connecte toute seule à cette session.
        {usesPublicUrl && ' Le lien ouvre la version en ligne de l’application ; le réseau doit donner accès à Internet.'}
      </p>

      <details className="rounded-xl bg-app-input border border-app-card-border p-3">
        <summary className="cursor-pointer text-xs font-bold text-app-text">
          {wifiPayload ? 'Modifier le réseau Wi-Fi' : 'Ajouter un code QR pour le Wi-Fi (partage de connexion)'}
        </summary>
        <div className="mt-3 space-y-2">
          <TextField
            id="net-wifi-ssid"
            label="Nom du réseau (SSID)"
            icon={Wifi}
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            placeholder="Ex. Partage Insertech"
            autoComplete="off"
          />
          <div className="flex items-end gap-2">
            <TextField
              id="net-wifi-password"
              label="Mot de passe (vide si réseau ouvert)"
              className="flex-grow"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
            </Button>
          </div>
          <p className="text-micro text-app-text-muted">Mémorisé sur cet ordinateur uniquement, jamais envoyé sur le réseau.</p>
        </div>
      </details>
    </div>
  );
}
