import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, RotateCcw, Zap } from 'lucide-react';
import { StopwatchState } from '../../types';

interface StopwatchProps {
  state: StopwatchState;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  readOnly?: boolean;
  bestTimeMs?: number | null;
}

export function splitTimeParts(ms: number): { mStr: string; sStr: string; msStr: string } {
  const safeMs = Math.max(0, ms);
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const milliseconds = Math.floor((safeMs % 1000) / 10);

  return {
    mStr: minutes.toString().padStart(2, '0'),
    sStr: seconds.toString().padStart(2, '0'),
    msStr: milliseconds.toString().padStart(2, '0')
  };
}

export function formatTime(ms: number): string {
  const { mStr, sStr, msStr } = splitTimeParts(ms);
  return `${mStr}:${sStr}.${msStr}`;
}

interface LcdSegmentProps {
  digits: string;
  label: string;
  digitColorClass: string;
  sizeClass?: string;
}

function LcdSegment({ digits, label, digitColorClass, sizeClass = 'text-4xl sm:text-5xl' }: LcdSegmentProps) {
  return (
    <div className="stopwatch-segment-box px-2.5 py-1 rounded-xl bg-app-input border border-app-input-border">
      <span className={`${sizeClass} font-mono font-black tabular-nums ${digitColorClass}`}>{digits}</span>
      <span className="block text-[8px] uppercase tracking-widest text-app-text-muted font-sans -mt-1 font-bold">
        {label}
      </span>
    </div>
  );
}

export default function Stopwatch({
  state,
  onStart,
  onStop,
  onReset,
  readOnly = false,
  bestTimeMs = null
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

  const { mStr, sStr, msStr } = splitTimeParts(time);
  const digitColorClass = state.isRunning
    ? 'text-primary stopwatch-digits-running'
    : 'text-app-text stopwatch-digits-idle';

  // Calcul de la jauge de rythme par rapport au record (1re place)
  const hasBestRecord = typeof bestTimeMs === 'number' && bestTimeMs > 0;
  const showPaceGauge = hasBestRecord && (state.isRunning || time > 0);
  const paceRatio = hasBestRecord ? time / bestTimeMs! : 0;
  const pacePercent = Math.min(100, Math.max(0, paceRatio * 100));

  let paceBarColor = 'bg-primary';
  let paceStatusText = 'En avance sur le record 🏆';
  if (paceRatio >= 1) {
    paceBarColor = 'bg-rose-500';
    paceStatusText = `Record dépassé (+${((time - bestTimeMs!) / 1000).toFixed(2)}s)`;
  } else if (paceRatio >= 0.75) {
    paceBarColor = 'bg-amber-400 animate-pulse';
    paceStatusText = 'Zone critique du record ⚡';
  }

  return (
    <div className="flex flex-col items-center justify-center p-5 bg-app-card border border-app-card-border rounded-3xl shadow-lg">
      <div className="text-[10px] uppercase font-black tracking-widest text-app-text-muted mb-2 font-sans flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${
            state.isRunning ? 'bg-primary animate-ping' : time > 0 ? 'bg-amber-400' : 'bg-slate-600'
          }`}
        />
        <span>Télémétrie Chrono</span>
      </div>

      {/* Région accessible non intrusive pour lecteurs d'écran */}
      <div className="sr-only" aria-live="polite">
        {!state.isRunning && time > 0 ? `Chronomètre arrêté à ${formatTime(time)}` : ''}
      </div>
      
      {/* Affichage digital télémétrique segmenté */}
      <div
        aria-hidden="true"
        className={`stopwatch-lcd font-mono font-bold tracking-wider tabular-nums bg-app-input px-4 py-3.5 rounded-2xl border transition-all duration-300 mb-4 w-full text-center shadow-inner flex items-baseline justify-center gap-1 sm:gap-1.5 ${
          state.isRunning ? 'border-primary/60 shadow-primary/10' : 'border-app-card-border'
        }`}
      >
        <LcdSegment digits={mStr} label="MIN" digitColorClass={digitColorClass} />

        <span
          className={`text-3xl sm:text-4xl font-black ${digitColorClass} ${
            state.isRunning ? 'animate-pulse' : ''
          }`}
        >
          :
        </span>

        <LcdSegment digits={sStr} label="SEC" digitColorClass={digitColorClass} />

        <span className={`text-2xl sm:text-3xl font-black ${digitColorClass}`}>.</span>

        <LcdSegment digits={msStr} label="CS" digitColorClass={digitColorClass} sizeClass="text-2xl sm:text-3xl" />
      </div>

      {/* Jauge de rythme en direct face au record (1re place) accélérée par GPU */}
      {showPaceGauge && (
        <div className="w-full mb-4 space-y-1">
          <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1 text-app-text-muted">
              <Zap size={10} className="text-primary" />
              <span>{paceStatusText}</span>
            </span>
            <span className="font-mono text-app-text-muted font-bold">
               Cible : {formatTime(bestTimeMs!)}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-app-input border border-app-input-border overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-transform duration-75 origin-left ${paceBarColor}`}
              style={{ transform: `scaleX(${pacePercent / 100})` }}
            />
          </div>
        </div>
      )}

      {/* Boutons de contrôle (masqués si affichage public uniquement) */}
      {!readOnly && (
        <div className="flex items-center gap-3 w-full justify-center">
          {state.isRunning ? (
            <button
              onClick={onStop}
              aria-label="Arrêter le chronomètre"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold font-display uppercase tracking-wider text-xs hover:bg-red-500 transition cursor-pointer shadow-md shadow-red-600/20"
            >
              <Square size={14} fill="white" />
              <span>Arrêter</span>
            </button>
          ) : (
            <button
              onClick={onStart}
              aria-label={time > 0 ? "Reprendre le chronomètre" : "Démarrer le chronomètre"}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-105 transition cursor-pointer shadow-md shadow-primary/15"
            >
              <Play size={14} fill="currentColor" />
              <span>{time > 0 ? 'Reprendre' : 'Démarrer'}</span>
            </button>
          )}

          <button
            onClick={onReset}
            disabled={state.isRunning || time === 0}
            aria-label="Réinitialiser le chronomètre"
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-app-input text-app-text-muted font-bold font-display uppercase tracking-wider text-xs border border-app-card-border hover:text-app-text hover:border-primary disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Réinit.</span>
          </button>
        </div>
      )}
    </div>
  );
}


