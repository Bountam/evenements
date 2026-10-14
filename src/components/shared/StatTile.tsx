import React from 'react';

export type StatTone = 'primary' | 'info' | 'warning' | 'accent';

const TONES: Record<StatTone, string> = {
  primary: 'bg-primary/15 border-primary/30 text-primary',
  info: 'bg-blue-500/15 border-blue-500/30 text-info',
  warning: 'bg-amber-500/15 border-amber-500/30 text-amber-500',
  accent: 'bg-purple-500/15 border-purple-500/30 text-accent'
};

interface StatTileProps {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  tone?: StatTone;
  children: React.ReactNode;
}

export default function StatTile({ icon: Icon, label, tone = 'primary', children }: StatTileProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${TONES[tone]}`} aria-hidden="true">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <span className="text-[10px] uppercase font-bold text-app-text-muted block leading-none">{label}</span>
        {children}
      </div>
    </div>
  );
}
