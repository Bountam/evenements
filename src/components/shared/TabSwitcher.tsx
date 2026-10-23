import React from 'react';
import { motion } from 'motion/react';

export type TabBadgeTone = 'success' | 'info' | 'warning';

// Pastille d'état affichée à côté du libellé (ex. nombre de chronos en marche)
export interface TabBadge {
  text: string;
  srText: string;
  tone: TabBadgeTone;
  pulse?: boolean;
}

export interface TabItem {
  id: string;
  label: string;
  badge?: TabBadge;
}

const BADGE_TONES: Record<TabBadgeTone, string> = {
  success: 'bg-success/20 border-success/50 text-success',
  info: 'bg-info/20 border-info/50 text-info',
  warning: 'bg-warning/20 border-warning/50 text-warning'
};

interface TabSwitcherProps {
  tabs: TabItem[];
  currentTab: string;
  onTabChange: (tab: string) => void;
  ariaLabel: string;
  className?: string;
}

// Sélecteur d'onglets en pastille (motif ARIA « tabs » à activation automatique).
// Chaque onglet porte l'id `tab-<id>` et contrôle le panneau `panel-<id>`.
export default function TabSwitcher({ tabs, currentTab, onTabChange, ariaLabel, className = '' }: TabSwitcherProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === currentTab);
    if (index === -1) return;
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onTabChange(tabs[next].id);
    // Le bouton existe déjà : seul son état sélectionné change
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`flex items-center max-w-full overflow-x-auto bg-app-input p-1 rounded-xl border border-app-card-border transition-colors duration-300 relative ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={`relative shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-bold font-display uppercase transition cursor-pointer z-10 ${
              isActive
                ? 'bg-primary text-secondary font-extrabold shadow-sm'
                : 'text-app-text-muted hover:text-app-text'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="activeTabPill"
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className="absolute inset-0 bg-primary rounded-lg -z-10 shadow-md shadow-primary/25"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {tab.label}
              {tab.badge && (
                <>
                  <span
                    aria-hidden="true"
                    className={`inline-flex items-center gap-1 min-w-5 justify-center px-1.5 rounded-full border text-micro font-mono font-black leading-4 ${
                      isActive ? 'bg-secondary/20 border-secondary/40 text-secondary' : BADGE_TONES[tab.badge.tone]
                    }`}
                  >
                    {tab.badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                    {tab.badge.text}
                  </span>
                  <span className="sr-only">{`(${tab.badge.srText})`}</span>
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
