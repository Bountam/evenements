import { EventSettings } from '../types';
import prizeSsdImage from '../assets/prize-ssd.webp';
import prizeLaptopImage from '../assets/prize-laptop.webp';

// Prix du Kiosque-concours, stockés dans event.extraData.contestPrizes
export interface ContestPrize {
  title: string;
  shortTitle: string; // Titre court pour les cartes compactes et le ruban
  description: string;
  value: string; // Valeur affichée (ex : « 500$ »), vide pour masquer
  image: string; // URL ou data URL ; vide pour afficher une icône
}

export interface ContestPrizes {
  best: ContestPrize; // Meilleur chrono
  raffle: ContestPrize; // Tirage au sort parmi tous les participants
}

export const DEFAULT_CONTEST_PRIZES: ContestPrizes = {
  best: {
    title: 'Disque SSD portable 128 Go',
    shortTitle: 'SSD 128 Go',
    description: 'Boîtier rapide USB-C avec outils de diagnostic PC intégrés.',
    value: '',
    image: prizeSsdImage
  },
  raffle: {
    title: 'TOSHIBA Dynabook Portégé X40-G',
    shortTitle: 'Portégé X40-G',
    description: 'Intel Core i5 (10e gen) reconditionné par Insertech. Tiré parmi TOUS les participants !',
    value: '500$',
    image: prizeLaptopImage
  }
};

export function getContestPrizes(event: EventSettings): ContestPrizes {
  const saved = event.extraData?.contestPrizes || {};
  return {
    best: { ...DEFAULT_CONTEST_PRIZES.best, ...(saved.best || {}) },
    raffle: { ...DEFAULT_CONTEST_PRIZES.raffle, ...(saved.raffle || {}) }
  };
}

// Réduire une image téléversée (max 400 px) pour garder la base et la synchro P2P légères
export function resizeImageFile(file: File, maxSize = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas indisponible'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Ne pas stocker les images par défaut (déjà incluses dans l'application)
export function serializeContestPrizes(prizes: ContestPrizes): Record<string, Partial<ContestPrize>> {
  const strip = (prize: ContestPrize, fallback: ContestPrize): Partial<ContestPrize> => {
    const { image, ...rest } = prize;
    return image === fallback.image ? rest : prize;
  };
  return {
    best: strip(prizes.best, DEFAULT_CONTEST_PRIZES.best),
    raffle: strip(prizes.raffle, DEFAULT_CONTEST_PRIZES.raffle)
  };
}
