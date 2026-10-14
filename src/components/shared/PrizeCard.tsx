import React from 'react';
import { ContestPrize, ContestPrizes } from '../../utils/prizes';
import { PrizeImage } from './PrizeEditorModal';

type PrizeKind = keyof ContestPrizes;

// Identité visuelle de chaque prix, partagée par toutes les cartes et le ruban
export const PRIZE_STYLES: Record<
  PrizeKind,
  { badge: string; shortBadge: string; subtitle?: string; badgeClass: string; valueClass: string; gradient: string; border: string }
> = {
  best: {
    badge: '1er Prix',
    shortBadge: '1er Prix',
    subtitle: 'Meilleur chrono',
    badgeClass: 'bg-warning/15 text-warning border border-warning/40',
    valueClass: 'bg-warning/15 text-warning border border-warning/40',
    gradient: 'from-amber-500/10',
    border: 'border-warning/40'
  },
  raffle: {
    badge: 'Tirage au sort',
    shortBadge: 'Tirage',
    badgeClass: 'bg-accent/20 text-accent border border-accent/40',
    valueClass: 'bg-primary/20 text-primary border border-primary/40',
    gradient: 'from-purple-500/10',
    border: 'border-primary/50'
  }
};

interface PrizeCardProps {
  kind: PrizeKind;
  prize: ContestPrize;
  size: 'sm' | 'lg';
}

export default function PrizeCard({ kind, prize, size }: PrizeCardProps) {
  const style = PRIZE_STYLES[kind];
  const isLarge = size === 'lg';
  const title = isLarge ? prize.title : prize.shortTitle || prize.title;

  return (
    <div
      className={`bg-gradient-to-br ${style.gradient} via-app-card to-app-card border-2 ${style.border} shadow-md relative overflow-hidden group ${
        isLarge ? 'p-3 sm:p-3.5 rounded-3xl flex items-center gap-3.5' : 'p-2.5 rounded-2xl flex flex-col justify-between'
      }`}
    >
      <div className={isLarge ? 'contents' : 'flex items-center gap-2 mb-1'}>
        <div
          className={`rounded-xl bg-white border border-slate-200/90 flex items-center justify-center shrink-0 shadow-sm overflow-hidden ${
            isLarge ? 'w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl p-2' : 'w-14 h-14 xl:w-16 xl:h-16 p-1'
          }`}
        >
          <PrizeImage
            src={prize.image}
            alt={prize.title}
            kind={kind}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-md ${style.badgeClass} text-kiosk-caption font-black uppercase font-display tracking-wider leading-tight`}>
              {isLarge ? style.badge : style.shortBadge}
            </span>
            {isLarge && style.subtitle && (
              <span className="text-kiosk-caption font-bold text-app-text-muted uppercase">{style.subtitle}</span>
            )}
            {prize.value && (
              <span className={`px-1.5 py-0.5 rounded ${style.valueClass} text-kiosk-caption font-black font-mono leading-tight`}>
                {isLarge ? `Valeur ${prize.value}` : prize.value}
              </span>
            )}
          </div>
          <h4
            className={`${isLarge ? 'text-kiosk-title' : 'text-kiosk-body'} font-black text-app-text font-display uppercase tracking-tight mt-0.5 leading-tight line-clamp-2`}
          >
            {title}
          </h4>
          {isLarge && <p className="text-kiosk-caption text-app-text-muted mt-0.5 leading-snug line-clamp-2">{prize.description}</p>}
        </div>
      </div>
      {!isLarge && <p className="text-kiosk-caption text-app-text-muted leading-snug font-sans line-clamp-2">{prize.description}</p>}
    </div>
  );
}
