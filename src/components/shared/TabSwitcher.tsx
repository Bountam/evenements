import React from 'react';
import { motion } from 'motion/react';

export interface TabItem {
  id: string;
  label: string;
}

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
      className={`flex items-center bg-app-input p-1 rounded-xl border border-app-card-border transition-colors duration-300 relative ${className}`}
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
            className={`relative px-3.5 py-1.5 rounded-lg text-xs font-bold font-display uppercase transition cursor-pointer z-10 ${
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
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
