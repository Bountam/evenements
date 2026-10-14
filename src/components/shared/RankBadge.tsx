import React from 'react';

// Couleurs de rang partagées par la console, le ruban et le classement
export const RANK_BADGE_CLASSES: Record<1 | 2 | 3, string> = {
  1: 'bg-amber-400 text-slate-950 border border-amber-300',
  2: 'bg-slate-300 text-slate-950 border border-slate-200',
  3: 'bg-amber-700 text-amber-50 border border-amber-600'
};

const OTHER_RANK = 'bg-primary/20 text-primary border border-primary/40';

interface RankBadgeProps {
  rank: number;
  className?: string;
}

export default function RankBadge({ rank, className = '' }: RankBadgeProps) {
  const colors = rank <= 3 ? RANK_BADGE_CLASSES[rank as 1 | 2 | 3] : OTHER_RANK;
  return (
    <span className={`font-mono font-black px-1.5 py-0.5 rounded-md leading-none ${colors} ${className}`} aria-label={`Rang ${rank}`}>
      #{rank}
    </span>
  );
}
