import React from 'react';

export type StatTone = 'primary' | 'info' | 'warning' | 'accent';

const TONES: Record<StatTone, string> = {
  primary: 'bg-primary/15 border-primary/30 text-primary',
  info: 'bg-info/15 border-info/30 text-info',
  warning: 'bg-warning/15 border-warning/30 text-warning',
  accent: 'bg-accent/15 border-accent/30 text-accent'
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
        <span className="text-micro uppercase font-bold text-app-text-muted block leading-none">{label}</span>
        {children}
      </div>
    </div>
  );
}
