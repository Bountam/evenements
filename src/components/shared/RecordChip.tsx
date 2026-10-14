import React from 'react';
import { Trophy } from 'lucide-react';
import { formatTime } from './Stopwatch';

interface RecordChipProps {
  label: string;
  timeMs: number;
  name: string;
  className?: string;
}

// Pastille « Record / Temps à battre » de l'écran public
export default function RecordChip({ label, timeMs, name, className = '' }: RecordChipProps) {
  return (
    <div className={`flex items-center gap-2 min-w-0 bg-primary/10 border border-primary/30 px-3 py-1.5 rounded-2xl text-app-text shadow-sm ${className}`}>
      <Trophy size={15} className="text-rank-1 shrink-0" aria-hidden="true" />
      <span className="text-kiosk-caption font-black uppercase tracking-wide min-w-0 truncate">
        {label} : <span className="font-mono text-kiosk-body text-primary">{formatTime(timeMs)}</span>{' '}
        <span className="text-app-text-muted">({name})</span>
      </span>
    </div>
  );
}
