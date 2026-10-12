import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, RotateCcw } from 'lucide-react';
import { StopwatchState } from '../../types';

interface StopwatchProps {
  state: StopwatchState;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  readOnly?: boolean;
}

export function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor((ms % 1000) / 10); // Format à 2 chiffres

  const mStr = minutes.toString().padStart(2, '0');
  const sStr = seconds.toString().padStart(2, '0');
  const msStr = milliseconds.toString().padStart(2, '0');

  return `${mStr}:${sStr}.${msStr}`;
}

export default function Stopwatch({
  state,
  onStart,
  onStop,
  onReset,
  readOnly = false
}: StopwatchProps) {
  const [time, setTime] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (state.isRunning && state.startTime !== null) {
      // Mettre à jour en temps réel
      const tick = () => {
        const elapsed = Date.now() - state.startTime! + state.elapsedBeforeStart;
        setTime(elapsed);
      };
      
      tick(); // Premier appel immédiat
      intervalRef.current = window.setInterval(tick, 10);
    } else {
      // Arrêté
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setTime(state.elapsedBeforeStart);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [state.isRunning, state.startTime, state.elapsedBeforeStart]);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[#24123d]/60 border border-purple-900/40 rounded-3xl shadow-lg">
      <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-1 font-sans">
        Temps Écoulé
      </div>
      
      {/* Affichage digital géant */}
      <div className="font-mono text-5xl sm:text-7xl font-bold text-white tracking-wider tabular-nums bg-purple-950/80 px-6 py-4 rounded-2xl border border-primary/20 mb-6 min-w-[280px] text-center shadow-inner">
        <span className={state.isRunning ? 'text-primary' : 'text-white'}>
          {formatTime(time)}
        </span>
      </div>

      {/* Boutons de contrôle (masqués si affichage public uniquement) */}
      {!readOnly && (
        <div className="flex items-center gap-4">
          {state.isRunning ? (
            <button
              onClick={onStop}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-red-600 text-white font-bold font-display uppercase tracking-wider hover:bg-red-500 transition cursor-pointer"
            >
              <Square size={16} fill="white" />
              <span>Arrêter</span>
            </button>
          ) : (
            <button
              onClick={onStart}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider hover:scale-105 transition cursor-pointer shadow-md shadow-primary/10"
            >
              <Play size={16} fill="currentColor" />
              <span>Démarrer</span>
            </button>
          )}

          <button
            onClick={onReset}
            disabled={state.isRunning || time === 0}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-purple-950 text-purple-300 font-bold font-display uppercase tracking-wider border border-purple-900/60 hover:text-white hover:border-purple-600 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
          >
            <RotateCcw size={16} />
            <span>Réinitialiser</span>
          </button>
        </div>
      )}
    </div>
  );
}
