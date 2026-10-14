import React, { Suspense, lazy } from 'react';
import type { ComponentProps } from 'react';
import type * as Charts from './Charts';

// Chart.js n'est chargé qu'à l'affichage d'un graphique : le kiosque-concours n'en utilise pas.
// L'espace réservé a la hauteur du graphique (h-64) pour éviter tout saut de mise en page.
const loadCharts = () => import('./Charts');
const LazyDoughnut = lazy(() => loadCharts().then((m) => ({ default: m.DoughnutChart })));
const LazyBar = lazy(() => loadCharts().then((m) => ({ default: m.BarChart })));

const placeholder = <div className="w-full h-64" aria-hidden="true" />;

export function DoughnutChart(props: ComponentProps<typeof Charts.DoughnutChart>) {
  return (
    <Suspense fallback={placeholder}>
      <LazyDoughnut {...props} />
    </Suspense>
  );
}

export function BarChart(props: ComponentProps<typeof Charts.BarChart>) {
  return (
    <Suspense fallback={placeholder}>
      <LazyBar {...props} />
    </Suspense>
  );
}
