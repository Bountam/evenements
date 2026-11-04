import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { ScanLine } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

const IMAGES_PAR_SECONDE = 5;
const LARGEUR_ANALYSE = 640;

interface QrScannerProps {
  isOpen: boolean;
  onClose: () => void;
  // Texte du QR lu ; renvoie un message d'erreur pour continuer à scanner, ou null pour fermer
  onResult: (texte: string) => string | null;
}

// Lecture d'un QR avec la caméra arrière, sans service Google : une image toutes les 200 ms est passée à jsQR
export default function QrScanner({ isOpen, onClose, onResult }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState('');
  const [erreurCamera, setErreurCamera] = useState('');
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!isOpen) return;
    setMessage('');
    setErreurCamera('');
    let flux: MediaStream | null = null;
    let minuterie: number | null = null;
    let arrete = false;
    let dernierRefus = '';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const analyser = () => {
      const video = videoRef.current;
      if (arrete || !video || !ctx || video.readyState < 2 || !video.videoWidth) return;
      const echelle = Math.min(1, LARGEUR_ANALYSE / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * echelle);
      canvas.height = Math.round(video.videoHeight * echelle);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (!qr?.data || qr.data === dernierRefus) return;
      const refus = onResultRef.current(qr.data);
      if (refus) {
        dernierRefus = qr.data;
        setMessage(refus);
      }
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErreurCamera("La caméra n'est pas disponible sur cet appareil. Saisissez le code et la clé.");
        return;
      }
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (arrete) {
          flux.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = flux;
          await video.play().catch(() => {});
        }
        minuterie = window.setInterval(analyser, 1000 / IMAGES_PAR_SECONDE);
      } catch (e) {
        const refusee = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        setErreurCamera(
          refusee
            ? "L'accès à la caméra a été refusé. Autorisez-le dans les réglages Android, ou saisissez le code et la clé."
            : "La caméra n'a pas pu démarrer. Saisissez le code et la clé."
        );
      }
    })();

    return () => {
      arrete = true;
      if (minuterie !== null) window.clearInterval(minuterie);
      flux?.getTracks().forEach((t) => t.stop());
    };
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Scanner le QR du PC" icon={ScanLine} maxWidth="max-w-md" id="qr-scanner">
      <div className="space-y-3">
        {erreurCamera ? (
          <p role="alert" className="text-sm font-bold text-danger">{erreurCamera}</p>
        ) : (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-square">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" aria-label="Image de la caméra" />
            <div className="absolute inset-8 border-4 border-primary/80 rounded-2xl pointer-events-none" aria-hidden="true"></div>
          </div>
        )}
        <p role="status" aria-live="polite" className="min-h-5 text-xs font-bold text-warning">{message}</p>
        <p className="text-xs text-app-text-muted">Visez le QR affiché dans la fenêtre Réseau du PC hôte.</p>
        <Button onClick={onClose} className="w-full">Annuler</Button>
      </div>
    </Modal>
  );
}
