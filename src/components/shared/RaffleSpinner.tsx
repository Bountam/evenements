import React, { useState, useEffect } from 'react';
import { Participant, RaffleState } from '../../types';
import { Sparkles, Trophy, Shuffle, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { networkManager } from '../../network';
import { RAFFLE_DURATION_MS } from '../../utils/raffle';
import { motion, AnimatePresence } from 'motion/react';

interface RaffleSpinnerProps {
  state: RaffleState;
  participants: Participant[];
  candidates?: Participant[]; // Noms qui défilent (éligibles) ; le gagnant est cherché parmi tous les participants
  onStartRaffle: () => void;
  onResetRaffle: () => void;
  readOnly?: boolean;
}

export default function RaffleSpinner({
  state,
  participants,
  candidates,
  onStartRaffle,
  onResetRaffle,
  readOnly = false
}: RaffleSpinnerProps) {
  const [displayName, setDisplayName] = useState<string>('Prêt pour le tirage');
  const [tickKey, setTickKey] = useState<number>(0);
  const [progress, setProgress] = useState(0);

  // Repli sur tous les participants si le seul éligible restant vient d'être tiré
  const namedCandidates = (candidates || participants).filter(p => p.name);
  const eligibleParticipants = namedCandidates.length > 0 ? namedCandidates : participants.filter(p => p.name);
  const findWinner = () => participants.find(p => p.id === state.winnerId);

  // Gérer l'animation du défilement
  useEffect(() => {
    if (state.status === 'spinning' && state.spinStartTime && eligibleParticipants.length > 0) {
      let intervalId: number;
      const duration = RAFFLE_DURATION_MS;
      
      const animate = () => {
        const elapsed = networkManager.now() - state.spinStartTime!;
        const remaining = duration - elapsed;
        
        if (remaining <= 0) {
          setProgress(100);
          // Trouver le vainqueur
          const winner = findWinner();
          setDisplayName(winner ? winner.name : 'Tirage terminé');
          setTickKey(prev => prev + 1);
        } else {
          // Calculer le pourcentage de progression
          const percent = (elapsed / duration) * 100;
          setProgress(percent);

          // Ralentissement exponentiel du défilement
          const delay = Math.max(55, 55 + Math.pow(percent / 10, 2.5));
          
          setDisplayName(() => {
            const randomIndex = Math.floor(Math.random() * eligibleParticipants.length);
            return eligibleParticipants[randomIndex].name;
          });
          setTickKey(prev => prev + 1);

          intervalId = window.setTimeout(animate, delay);
        }
      };

      animate();

      return () => {
        if (intervalId) clearTimeout(intervalId);
      };
    } else if (state.status === 'celebrating') {
      setProgress(100);
      const winner = findWinner();
      setDisplayName(winner ? winner.name : 'Tirage terminé');
      
      // Lancer les confettis une fois (uniquement si le composant est actif)
      const duration = 3 * 1000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          disableForReducedMotion: true,
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#9ecd33', '#480A94', '#ffffff']
        });
        confetti({
          disableForReducedMotion: true,
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
    <div className="relative overflow-hidden flex flex-col items-center justify-center p-6 bg-app-card border border-app-card-border rounded-3xl shadow-lg h-full min-h-[340px]">
      <div className="text-kiosk-caption uppercase font-black tracking-widest text-app-text-muted mb-2 font-sans flex items-center gap-1.5 relative z-10">
        <Sparkles size={12} className="text-primary" />
        <span>Tirage Au Sort Éco-Concours</span>
      </div>

      {state.status === 'idle' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-6 flex-1 flex flex-col justify-center items-center relative z-10"
        >
          <motion.div
            animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.05, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="w-16 h-16 bg-app-input border border-app-card-border rounded-2xl flex items-center justify-center text-primary mb-4 shadow-lg shadow-primary/10"
          >
            <Shuffle size={28} />
          </motion.div>
          <p className="text-sm text-app-text-muted max-w-xs font-sans mb-6">
            Sélectionnez un gagnant au hasard parmi les {eligibleParticipants.length} participants inscrits.
          </p>
          
          {!readOnly && (
            <button
              onClick={onStartRaffle}
              disabled={eligibleParticipants.length === 0}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider hover:scale-105 active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-lg shadow-primary/20"
            >
              <Shuffle size={16} />
              <span>Lancer le tirage</span>
            </button>
          )}
        </motion.div>
      )}

      {state.status === 'spinning' && (
        <div className="w-full flex-1 flex flex-col justify-center items-center py-4 relative z-10">
          {/* Fenêtre de cylindre 3D (Slot-Machine Reel) */}
          <div
            className="relative h-[clamp(8rem,14vw,14rem)] w-full max-w-5xl rounded-2xl bg-app-input border-2 border-primary/50 shadow-inner flex items-center justify-center overflow-hidden px-4"
            style={{ perspective: '600px' }}
          >
            {/* Ombres haut/bas donnant l'effet de courbure de cylindre */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-app-input to-transparent z-20" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-app-input to-transparent z-20" />

            <AnimatePresence mode="popLayout">
              <motion.h2
                key={tickKey}
                initial={{ y: 40, opacity: 0, rotateX: -65, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, rotateX: 0, scale: 1 }}
                exit={{ y: -40, opacity: 0, rotateX: 65, scale: 0.9 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="text-[clamp(2rem,5vw,5.5rem)] leading-tight font-display font-bold text-primary tracking-wide uppercase text-center line-clamp-2"
              >
                {displayName}
              </motion.h2>
            </AnimatePresence>
          </div>

          {/* Jauge de progression du tirage */}
          <div className="w-full max-w-2xl bg-app-input rounded-full h-3 border border-app-card-border overflow-hidden mt-6 p-0.5">
            <div 
              className="bg-gradient-to-r from-secondary via-purple-500 to-primary h-full rounded-full transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-kiosk-caption text-app-text-muted font-sans mt-2 uppercase tracking-widest font-bold">
            Ralentissement du tambour ({Math.round(progress)}%)...
          </span>
        </div>
      )}

      {state.status === 'celebrating' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="text-center py-4 flex-1 flex flex-col justify-center items-center w-full relative z-10"
        >
          {/* Anneaux d'onde de choc dorés/lime autour du trophée */}
          <div className="relative flex items-center justify-center mb-4">
            <motion.span
              animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
              className="absolute w-16 h-16 rounded-full border-2 border-primary pointer-events-none"
            />
            <motion.span
              animate={{ scale: [1, 2.6], opacity: [0.4, 0] }}
              transition={{ duration: 1.8, delay: 0.4, repeat: Infinity, ease: 'easeOut' }}
              className="absolute w-16 h-16 rounded-full border border-yellow-400 pointer-events-none"
            />
            <motion.div
              animate={{ y: [0, -6, 0], rotate: [0, -5, 5, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="w-16 h-16 bg-primary/20 border-2 border-primary rounded-full flex items-center justify-center text-primary shadow-xl shadow-primary/30 relative z-10"
            >
              <Trophy size={28} />
            </motion.div>
          </div>
          
          <span className="text-kiosk-body uppercase font-black text-primary tracking-widest font-sans">
            🎉 Félicitations au gagnant ! 🎉
          </span>
          
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
            role="status"
            className="min-h-[84px] max-w-full flex items-center justify-center px-6 py-3 rounded-2xl bg-primary/15 border-2 border-primary/50 mt-3 podium-shimmer shadow-lg"
          >
            <h2 className="text-[clamp(3rem,8vw,9rem)] leading-none font-display font-bold text-app-text uppercase tracking-wider line-clamp-2 text-balance">
              {displayName}
            </h2>
          </motion.div>
          
          {!readOnly && (
            <button
              onClick={onResetRaffle}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-app-input text-app-text font-bold font-display uppercase tracking-wider border border-app-card-border hover:border-primary transition mt-6 cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Recommencer</span>
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}

