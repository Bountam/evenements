import React, { useState } from 'react';
import { Participant } from '../../types';
import { formatTime } from './Stopwatch';
import { Trophy, Clock, Medal, RotateCcw, Edit3, Check, X, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LeaderboardProps {
  participants: Participant[];
  highlightId?: string | null;
  isAdmin?: boolean;
  onResetScore?: (participantId: string) => void;
  onUpdateScore?: (participantId: string, newTimeMs: number) => void;
  onSendToTrack?: (participantId: string) => void;
}

export function parseTimeInputToMs(input: string): number | null {
  const clean = input.trim();
  if (!clean) return null;

  // Format MM:SS.cc ou MM:SS
  if (clean.includes(':')) {
    const [minPart, secPart] = clean.split(':');
    const minutes = parseInt(minPart, 10);
    const secondsFloat = parseFloat(secPart.replace(',', '.'));
    if (isNaN(minutes) || isNaN(secondsFloat) || minutes < 0 || secondsFloat < 0) return null;
    return Math.round((minutes * 60 + secondsFloat) * 1000);
  }

  // Format secondes (ex: "45.5" ou "82")
  const secondsOnly = parseFloat(clean.replace(',', '.'));
  if (!isNaN(secondsOnly) && secondsOnly > 0) {
    return Math.round(secondsOnly * 1000);
  }

  return null;
}

export default function Leaderboard({
  participants,
  highlightId = null,
  isAdmin = false,
  onResetScore,
  onUpdateScore,
  onSendToTrack
}: LeaderboardProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Filtrer les participants qui ont complété le défi (temps strictement positif) et trier par temps croissant
  const rankedParticipants = participants
    .filter((p) => typeof p.timeMs === 'number' && p.timeMs > 0)
    .sort((a, b) => a.timeMs! - b.timeMs!);

  const startEditing = (p: Participant) => {
    setEditingId(p.id);
    setEditValue(formatTime(p.timeMs || 0));
  };

  const saveEdit = (participantId: string) => {
    const parsedMs = parseTimeInputToMs(editValue);
    if (parsedMs !== null && parsedMs > 0 && onUpdateScore) {
      onUpdateScore(participantId, parsedMs);
      setEditingId(null);
    }
  };

  const getRankBadge = (index: number) => {
    switch (index) {
      case 0:
        return (
          <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-secondary font-black shadow-lg shadow-yellow-500/20 shrink-0">
            <Trophy size={16} />
          </div>
        );
      case 1:
        return (
          <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-secondary font-black shadow-lg shadow-slate-300/20 shrink-0">
            <Medal size={16} />
          </div>
        );
      case 2:
        return (
          <div className="w-8 h-8 rounded-full bg-amber-700 flex items-center justify-center text-white font-black shadow-lg shadow-amber-700/20 shrink-0">
            <Medal size={16} />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-purple-950/60 border border-purple-900/60 flex items-center justify-center text-slate-400 font-bold text-xs shrink-0">
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
          {rankedParticipants.length} {rankedParticipants.length > 1 ? 'temps enregistrés' : 'temps enregistré'}
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
              const isEditing = editingId === participant.id;

              return (
                <motion.div
                  key={participant.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className={`flex items-center justify-between p-3.5 rounded-xl transition gap-2 ${
                    isHighlighted
                      ? 'bg-primary/20 border-2 border-primary shadow shadow-primary/10'
                      : 'bg-[#180A2b]/50 border border-purple-950 hover:border-purple-900'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getRankBadge(index)}

                    <div className="min-w-0">
                      <h4 className="font-bold text-white font-sans text-sm truncate">{participant.name}</h4>
                      {participant.postalCode && (
                        <p className="text-[10px] text-slate-400 mt-0.5 font-sans uppercase">
                          Code postal : {participant.postalCode}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Temps chronométré + actions admin */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder="01:23.45"
                          className="w-24 bg-[#180A2b] border border-primary rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(participant.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => saveEdit(participant.id)}
                          title="Valider le nouveau temps"
                          className="p-1 rounded bg-primary text-secondary hover:scale-105 cursor-pointer"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          title="Annuler"
                          className="p-1 rounded bg-purple-950 text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border ${
                            index === 0
                              ? 'score-badge-gold bg-primary/15 border-primary/40 text-primary'
                              : 'score-badge-standard bg-purple-950/60 border-purple-900/60 text-white'
                          }`}
                        >
                          <Clock size={12} className={index === 0 ? 'text-primary' : 'text-slate-400'} />
                          <span
                            className={`font-mono font-extrabold text-base tabular-nums ${
                              index === 0 ? 'text-primary' : 'text-white'
                            }`}
                          >
                            {formatTime(participant.timeMs!)}
                          </span>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-1 ml-1 pl-2 border-l border-purple-900/60">
                            {onSendToTrack && (
                              <button
                                onClick={() => onSendToTrack(participant.id)}
                                title="Nouvelle tentative (envoyer sur une piste libre)"
                                className="p-1 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition cursor-pointer"
                              >
                                <Play size={12} />
                              </button>
                            )}
                            {onUpdateScore && (
                              <button
                                onClick={() => startEditing(participant)}
                                title="Corriger / modifier ce temps manuellement"
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-purple-900/40 transition cursor-pointer"
                              >
                                <Edit3 size={12} />
                              </button>
                            )}
                            {onResetScore && (
                              <button
                                onClick={() => onResetScore(participant.id)}
                                title="Effacer ce temps (remettre en attente)"
                                className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                              >
                                <RotateCcw size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
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
