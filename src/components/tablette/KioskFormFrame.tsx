import React from 'react';

interface KioskFormFrameProps {
  title?: string;
  children: React.ReactNode;
}

// Cadre du mode « Kiosque formulaire » : le formulaire d'inscription seul, centré, sans listes ni réglages
export default function KioskFormFrame({ title = 'Inscription', children }: KioskFormFrameProps) {
  return (
    <section aria-label="Formulaire d'inscription" className="w-full max-w-2xl mx-auto bg-app-card border border-app-card-border p-4 sm:p-8 court:p-3 rounded-3xl court:rounded-2xl shadow-lg">
      <h2 className="text-lg font-bold font-display text-app-text uppercase tracking-wider mb-4 text-center max-sm:hidden court:hidden">{title}</h2>
      {children}
    </section>
  );
}
