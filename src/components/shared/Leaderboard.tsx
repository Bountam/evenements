import React from 'react';
import { Participant } from '../../types';
import { formatTime } from './Stopwatch';
import { Trophy, Clock, Medal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LeaderboardProps {
  participants: Participant[];
  highlightId?: string | null;
}

export default function Leaderboard({ participants, highlightId = null }: LeaderboardProps) {
  // Filtrer les participants qui ont complété le défi (temps non nul) et trier par temps croissant
  const rankedParticipants = participants
    .filter((p) => p.timeMs !== null && p.timeMs > 0)
    .sort((a, b) => a.timeMs! - b.timeMs!);

  const getRankBadge = (index: number) => {
    switch (index) {
      case 0:
        return (
          <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-secondary font-black shadow-lg shadow-yellow-500/20">
            <Trophy size={16} />
          </div>
        );
      case 1:
        return (
          <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-secondary font-black shadow-lg shadow-slate-300/20">
            <Medal size={16} />
          </div>
        );
      case 2:
        return (
          <div className="w-8 h-8 rounded-full bg-amber-700 flex items-center justify-center text-white font-black shadow-lg shadow-amber-700/20">
            <Medal size={16} />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-purple-950/60 border border-purple-900/60 flex items-center justify-center text-slate-400 font-bold text-xs">
            {index + 1}
          </div>
        );
    }
  };

  return (
    <div className="bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-purple-950/60">
        <h3 className="text-lg font-bold font-display text-white uppercase tracking-wider flex items-center gap-2">
          <Trophy className="text-primary animate-bounce" size={20} />
          <span>Tableau des Champions</span>
        </h3>
        <span className="text-xs font-semibold text-slate-400 font-sans">
          {rankedParticipants.length} temps enregistrés
        </span>
      </div>

      {rankedParticipants.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="text-slate-600 mx-auto mb-3" size={32} />
          <p className="text-sm text-slate-400 font-sans">Aucun temps n'a encore été enregistré pour cette activité.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          <AnimatePresence mode="popLayout">
            {rankedParticipants.map((participant, index) => {
              const isHighlighted = participant.id === highlightId;
              
              return (
                <motion.div
                  key={participant.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className={`flex items-center justify-between p-3.5 rounded-xl transition ${
                    isHighlighted
                      ? 'bg-primary/20 border-2 border-primary shadow shadow-primary/10'
                      : 'bg-[#180A2b]/50 border border-purple-950 hover:border-purple-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Badge de position */}
                    {getRankBadge(index)}

                    {/* Nom du participant */}
                    <div>
                      <h4 className="font-bold text-white font-sans text-sm">{participant.name}</h4>
                      {participant.postalCode && (
                        <p className="text-[10px] text-slate-400 mt-0.5 font-sans uppercase">Code postal : {participant.postalCode}</p>
                      )}
                    </div>
                  </div>

                  {/* Temps chronométré */}
                  <div className="flex items-center gap-2">
                    <Clock size={12} className={index === 0 ? 'text-primary' : 'text-slate-500'} />
                    <span className={`font-mono font-bold text-base tabular-nums ${index === 0 ? 'text-primary' : 'text-slate-200'}`}>
                      {formatTime(participant.timeMs!)}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
