import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  Smartphone, Download, QrCode, Share, PlusSquare, 
  Check, ExternalLink, X, Sparkles, Tablet, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MobileInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  onInstallPwa: () => void;
  isStandalone: boolean;
}

export default function MobileInstallModal({
  isOpen,
  onClose,
  deferredPrompt,
  onInstallPwa,
  isStandalone
}: MobileInstallModalProps) {
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'qrcode'>('android');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  // Détecter automatiquement le système d'exploitation de l'utilisateur
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.userAgent) {
      const ua = navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(ua)) {
        setActiveTab('ios');
      } else {
        setActiveTab('android');
      }
    }
  }, []);

  // Générer le QR Code localement pour que les téléphones puissent scanner
  useEffect(() => {
    if (isOpen) {
      const targetUrl = window.location.href;
      QRCode.toDataURL(targetUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#180A2b',
          light: '#ffffff'
        }
      })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error('Erreur génération QR Code:', err));
    }
  }, [isOpen]);

  // Télécharger le fichier HTML autonome pour mobile
  const handleDownloadStandaloneMobile = () => {
    try {
      const htmlContent = document.documentElement.outerHTML;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'InsertechEvenements-Mobile.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err) {
      console.error('Erreur téléchargement autonome:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-app-card border-2 border-primary/40 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto text-app-text"
        >
          {/* Bouton de fermeture */}
          <button
            onClick={onClose}
            title="Fermer"
            className="absolute top-4 right-4 p-2 rounded-xl bg-app-input border border-app-card-border hover:border-primary/50 text-app-text-muted hover:text-app-text transition cursor-pointer"
          >
            <X size={16} />
          </button>

          {/* En-tête */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-primary/20 border border-primary/40 text-primary flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
              <Smartphone size={22} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-primary font-display block">
                Application Mobile & Tablette
              </span>
              <h3 className="text-lg sm:text-xl font-bold font-display uppercase tracking-tight text-app-text">
                Installer sur Mobile (PWA)
              </h3>
            </div>
          </div>

          {/* Statut si déjà installé */}
          {isStandalone && (
            <div className="mb-4 p-3 rounded-2xl bg-primary/15 border border-primary/40 text-xs text-primary flex items-center gap-2">
              <Check size={16} className="shrink-0" />
              <span>Cette application est déjà installée en mode autonome sur cet appareil !</span>
            </div>
          )}

          {/* Onglets de plateforme */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-app-input border border-app-card-border mb-4 text-xs font-bold font-display uppercase">
            <button
              onClick={() => setActiveTab('android')}
              className={`flex-1 py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'android'
                  ? 'bg-primary text-secondary font-black shadow-sm'
                  : 'text-app-text-muted hover:text-app-text'
              }`}
            >
              <Smartphone size={14} />
              <span>Android (APK / PWA)</span>
            </button>
            <button
              onClick={() => setActiveTab('ios')}
              className={`flex-1 py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'ios'
                  ? 'bg-primary text-secondary font-black shadow-sm'
                  : 'text-app-text-muted hover:text-app-text'
              }`}
            >
              <Tablet size={14} />
              <span>iPhone / iPad</span>
            </button>
            <button
              onClick={() => setActiveTab('qrcode')}
              className={`flex-1 py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'qrcode'
                  ? 'bg-primary text-secondary font-black shadow-sm'
                  : 'text-app-text-muted hover:text-app-text'
              }`}
            >
              <QrCode size={14} />
              <span>Scanner (QR)</span>
            </button>
          </div>

          {/* Contenu de l'onglet Android */}
          {activeTab === 'android' && (
            <div className="space-y-3.5">
              {/* Bouton d'installation directe si supporté */}
              {deferredPrompt && (
                <button
                  onClick={onInstallPwa}
                  className="w-full py-3 px-4 rounded-2xl bg-primary text-secondary hover:brightness-110 font-bold font-display text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-primary/25 cursor-pointer transition"
                >
                  <Download size={18} />
                  <span>Installer maintenant sur cet Android</span>
                </button>
              )}

              <div className="p-4 rounded-2xl bg-app-input border border-app-card-border space-y-2.5 text-xs">
                <div className="font-bold text-app-text flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-black">
                    1
                  </span>
                  <span>Ouvrez le lien dans Google Chrome</span>
                </div>
                <div className="font-bold text-app-text flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-black">
                    2
                  </span>
                  <span>Appuyez sur le menu <strong className="text-primary font-mono text-sm">⋮</strong> en haut à droite</span>
                </div>
                <div className="font-bold text-app-text flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-black">
                    3
                  </span>
                  <span>Sélectionnez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong></span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-400/40 text-[11px] text-amber-300 flex items-start gap-2">
                <Info size={14} className="shrink-0 mt-0.5 text-amber-400" />
                <span>
                  <strong>Exécutable natif APK :</strong> Le package Android (.apk) est également généré automatiquement dans les Releases et Artifacts GitHub de la PR.
                </span>
              </div>
            </div>
          )}

          {/* Contenu de l'onglet iOS */}
          {activeTab === 'ios' && (
            <div className="space-y-3.5">
              <div className="p-4 rounded-2xl bg-app-input border border-app-card-border space-y-2.5 text-xs">
                <div className="font-bold text-app-text flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-black">
                    1
                  </span>
                  <span>Ouvrez cette page dans <strong>Safari</strong> sur votre iPhone/iPad</span>
                </div>
                <div className="font-bold text-app-text flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-black">
                    2
                  </span>
                  <span className="flex items-center gap-1.5">
                    Appuyez sur le bouton <strong>Partager</strong> <Share size={14} className="text-primary inline" /> en bas
                  </span>
                </div>
                <div className="font-bold text-app-text flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-black">
                    3
                  </span>
                  <span className="flex items-center gap-1.5">
                    Faites défiler et choisissez <strong>« Sur l'écran d'accueil »</strong> <PlusSquare size={14} className="text-primary inline" />
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-app-text-muted leading-relaxed">
                L'icône Insertech s'ajoutera à votre écran d'accueil et s'ouvrira en plein écran, fonctionnelle même sans connexion Internet grâce au stockage local IndexedDB.
              </p>
            </div>
          )}

          {/* Contenu de l'onglet QR Code */}
          {activeTab === 'qrcode' && (
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="p-3 bg-white rounded-2xl border-2 border-primary/50 shadow-md">
                {qrCodeDataUrl ? (
                  <img src={qrCodeDataUrl} alt="QR Code PWA Mobile" className="w-48 h-48 object-contain" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-500">
                    Génération du QR Code...
                  </div>
                )}
              </div>
              <p className="text-xs text-app-text-muted max-w-xs">
                Pointez l'appareil photo de votre téléphone ou tablette vers ce code pour ouvrir et installer l'application immédiatement.
              </p>
            </div>
          )}

          {/* Séparateur et bouton de téléchargement de l'exécutable autonome */}
          <div className="mt-4 pt-4 border-t border-app-card-border flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <button
              onClick={handleDownloadStandaloneMobile}
              title="Télécharger l'application complète sous forme de fichier autonome"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-app-input border border-app-card-border hover:border-primary/50 text-xs font-bold text-app-text transition cursor-pointer"
            >
              {downloadSuccess ? (
                <>
                  <Check size={14} className="text-primary" />
                  <span className="text-primary">Fichier téléchargé !</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>Télécharger le package Mobile (.html)</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-app-card border border-app-card-border text-xs font-bold text-app-text-muted hover:text-app-text transition cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
