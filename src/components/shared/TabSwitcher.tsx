import React from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import ScrollZone from './ScrollZone';

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
  icon?: LucideIcon;
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
  compact?: boolean;
  variant?: 'header' | 'bottom';
  className?: string;
  // Identifiant d'animation de la pastille active : distinct si deux sélecteurs sont visibles en même temps
  pillId?: string;
}

// Sélecteur d'onglets en pastille (motif ARIA « tabs » à activation automatique).
// Chaque onglet porte l'id `tab-<id>` et contrôle le panneau `panel-<id>`.
export default function TabSwitcher({
  tabs,
  currentTab,
  onTabChange,
  ariaLabel,
  compact = false,
  variant = 'header',
  className = '',
  pillId = 'activeTabPill',
}: TabSwitcherProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
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

  if (variant === 'bottom') {
    return (
      <nav
        aria-label={ariaLabel}
        className={`shrink-0 z-40 bg-app-header/95 backdrop-blur-xl border-t-2 border-primary/40 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] shadow-2xl court:w-20 court:px-1.5 court:py-2 court:border-t-0 court:border-r-2 ${className}`}
      >
        {/* Barre du bas (64 px) ; en paysage sur cellulaire, colonne d'icônes à gauche */}
        <div
          role="tablist"
          aria-label={ariaLabel}
          onKeyDown={handleKeyDown}
          className="flex items-stretch justify-around gap-1 max-w-xl mx-auto court:flex-col court:justify-start court:h-full court:gap-2"
        >
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                aria-label={tab.badge ? `${tab.label} (${tab.badge.srText})` : tab.label}
                title={tab.label}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex-1 court:flex-none min-w-0 min-h-12 flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-xl text-micro font-bold font-display uppercase transition cursor-pointer ${
                  isActive
                    ? 'bg-primary text-secondary font-extrabold shadow-sm'
                    : 'text-app-text-muted hover:text-app-text'
                }`}
              >
                <span className="relative inline-flex items-center justify-center">
                  {TabIcon && <TabIcon size={17} aria-hidden="true" />}
                  {tab.badge && (
                    <>
                      <span
                        aria-hidden="true"
                        className={`ml-1 inline-flex items-center gap-0.5 min-w-4 justify-center px-1 rounded-full border text-micro font-mono font-black leading-4 ${
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
                <span className="truncate max-w-full leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <ScrollZone
      horizontal
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`flex items-center max-w-full bg-app-input p-1 rounded-xl border border-app-card-border transition-colors duration-300 relative shrink-0 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = currentTab === tab.id;
        const TabIcon = tab.icon;
        return (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            title={tab.label}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={`relative shrink-0 whitespace-nowrap ${
              compact ? 'px-2.5 xl:px-3 py-1.5' : 'px-3.5 py-1.5'
            } rounded-lg text-xs font-bold font-display uppercase transition cursor-pointer z-10 ${
              isActive
                ? 'bg-primary text-secondary font-extrabold shadow-sm'
                : 'text-app-text-muted hover:text-app-text'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={pillId}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className="absolute inset-0 bg-primary rounded-lg -z-10 shadow-md shadow-primary/25"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {TabIcon && <TabIcon size={15} aria-hidden="true" />}
              <span className={compact && TabIcon ? 'sr-only xl:not-sr-only' : ''}>{tab.label}</span>
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
    </ScrollZone>
  );
}
