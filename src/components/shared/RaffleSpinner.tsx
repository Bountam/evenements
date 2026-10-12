import React, { useState, useEffect } from 'react';
import { Participant, RaffleState } from '../../types';
import { Sparkles, Trophy, Shuffle, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';

interface RaffleSpinnerProps {
  state: RaffleState;
  participants: Participant[];
  onStartRaffle: () => void;
  onResetRaffle: () => void;
  readOnly?: boolean;
}

export default function RaffleSpinner({
  state,
  participants,
  onStartRaffle,
  onResetRaffle,
  readOnly = false
}: RaffleSpinnerProps) {
  const [displayName, setDisplayName] = useState<string>('Prêt pour le tirage');
  const [progress, setProgress] = useState(0);

  const eligibleParticipants = participants.filter(p => p.name);

  // Gérer l'animation du défilement
  useEffect(() => {
    if (state.status === 'spinning' && state.spinStartTime && eligibleParticipants.length > 0) {
      let intervalId: number;
      const duration = 10000; // 10 secondes strictes
      
      const animate = () => {
        const elapsed = Date.now() - state.spinStartTime!;
        const remaining = duration - elapsed;
        
        if (remaining <= 0) {
          setProgress(100);
          // Trouver le vainqueur
          const winner = eligibleParticipants.find(p => p.id === state.winnerId);
          setDisplayName(winner ? winner.name : 'Tirage terminé');
        } else {
          // Calculer le pourcentage de progression
          const percent = (elapsed / duration) * 100;
          setProgress(percent);

          // Ralentissement exponentiel du défilement
          // Plus le temps passe, plus l'intervalle de défilement s'allonge
          const delay = Math.max(50, 50 + Math.pow(percent / 10, 2.5));
          
          setDisplayName(() => {
            const randomIndex = Math.floor(Math.random() * eligibleParticipants.length);
            return eligibleParticipants[randomIndex].name;
          });

          intervalId = window.setTimeout(animate, delay);
        }
      };

      animate();

      return () => {
        if (intervalId) clearTimeout(intervalId);
      };
    } else if (state.status === 'celebrating') {
      setProgress(100);
      const winner = eligibleParticipants.find(p => p.id === state.winnerId);
      setDisplayName(winner ? winner.name : 'Tirage terminé');
      
      // Lancer les confettis une fois (uniquement si le composant est actif)
      const duration = 3 * 1000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#9ecd33', '#480A94', '#ffffff']
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#9ecd33', '#480A94', '#ffffff']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      
      frame();
    } else {
      setProgress(0);
      setDisplayName('Prêt pour le tirage');
    }
  }, [state.status, state.spinStartTime, state.winnerId, participants.length]);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[#24123d]/60 border border-purple-900/40 rounded-3xl shadow-lg h-full min-h-[320px]">
      <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2 font-sans flex items-center gap-1.5">
        <Sparkles size={12} className="text-primary" />
        <span>Tirage Au Sort Éco-Concours</span>
      </div>

      {state.status === 'idle' && (
        <div className="text-center py-6 flex-1 flex flex-col justify-center items-center">
          <div className="w-16 h-16 bg-purple-950/80 border border-purple-800/40 rounded-full flex items-center justify-center text-primary mb-4 animate-pulse">
            <Shuffle size={28} />
          </div>
          <p className="text-sm text-slate-300 max-w-xs font-sans mb-6">
            Sélectionnez un gagnant au hasard parmi les {eligibleParticipants.length} participants inscrits.
          </p>
          
          {!readOnly && (
            <button
              onClick={onStartRaffle}
              disabled={eligibleParticipants.length === 0}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider hover:scale-105 active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <Shuffle size={16} />
              <span>Lancer le tirage</span>
            </button>
          )}
        </div>
      )}

      {state.status === 'spinning' && (
        <div className="w-full flex-1 flex flex-col justify-center items-center py-4">
          {/* Nom qui défile rapidement */}
          <div className="h-28 flex items-center justify-center text-center px-4 w-full">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-primary tracking-wide uppercase line-clamp-2 animate-pulse">
              {displayName}
            </h2>
          </div>

          {/* Jauge de progression du tirage */}
          <div className="w-full max-w-sm bg-purple-950 rounded-full h-2.5 border border-purple-900/60 overflow-hidden mt-6">
            <div 
              className="bg-gradient-to-r from-secondary to-primary h-full transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <span className="text-[10px] text-slate-400 font-sans mt-2">Recherche du vainqueur en cours...</span>
        </div>
      )}

      {state.status === 'celebrating' && (
        <div className="text-center py-4 flex-1 flex flex-col justify-center items-center w-full">
          <div className="w-16 h-16 bg-primary/20 border-2 border-primary rounded-full flex items-center justify-center text-primary mb-4 animate-bounce">
            <Trophy size={28} />
          </div>
          
          <span className="text-[10px] uppercase font-black text-primary tracking-widest font-sans">
            Félicitations au gagnant !
          </span>
          
          <div className="min-h-[80px] flex items-center justify-center px-4 w-full mt-2">
            <h2 className="text-4xl sm:text-5xl font-display font-bold text-white uppercase tracking-wider line-clamp-2">
              {displayName}
            </h2>
          </div>
          
          {!readOnly && (
            <button
              onClick={onResetRaffle}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-purple-950 text-purple-300 font-bold font-display uppercase tracking-wider border border-purple-900/60 hover:text-white hover:border-purple-600 transition mt-6 cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Recommencer</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
