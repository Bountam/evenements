import React, { useState } from 'react';
import { Participant } from '../../types';
import { formatTime } from './Stopwatch';
import { Trophy, Clock, Medal, RotateCcw, Edit3, Check, X, Play, Crown } from 'lucide-react';
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

function formatDelta(deltaMs: number): string {
  if (deltaMs <= 0) return '+0.00s';
  const totalSeconds = deltaMs / 1000;
  if (totalSeconds < 60) {
    return `+${totalSeconds.toFixed(2)}s`;
  }
  return `+${formatTime(deltaMs)}`;
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

  const bestTimeMs = rankedParticipants.length > 0 ? rankedParticipants[0].timeMs! : null;
  const firstPlace = rankedParticipants[0] || null;
  const secondPlace = rankedParticipants[1] || null;
  const thirdPlace = rankedParticipants[2] || null;

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
          <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-secondary font-black shadow-lg shadow-yellow-500/30 shrink-0">
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
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-purple-950/60">
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
        <>
          {/* PODIUM OLYMPIQUE 3D ANIMÉ (Top 3) */}
          <div className="grid grid-cols-3 items-end gap-2 sm:gap-3 pt-2 pb-5 mb-5 border-b border-purple-950/60">
            {/* 2e Place (Argent - Gauche) */}
            <div className="flex flex-col items-center">
              {secondPlace ? (
                <motion.div
                  key={`podium-2-${secondPlace.id}-${secondPlace.timeMs}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 20 }}
                  className="w-full flex flex-col items-center text-center"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-300 text-secondary flex items-center justify-center font-black shadow mb-1.5">
                    <Medal size={14} />
                  </div>
                  <span className="text-xs font-bold text-white truncate max-w-full px-1">
                    {secondPlace.name}
                  </span>
                  <span className="font-mono text-[11px] font-extrabold text-slate-200 mt-0.5 tabular-nums">
                    {formatTime(secondPlace.timeMs!)}
                  </span>
                  {bestTimeMs !== null && (
                    <span className="text-[9px] font-mono text-slate-400 mb-1.5">
                      {formatDelta(secondPlace.timeMs! - bestTimeMs)}
                    </span>
                  )}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 56 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.12 }}
                    className="podium-pillar-silver w-full rounded-t-2xl bg-gradient-to-b from-slate-300/25 to-slate-400/10 border-t-2 border-x border-slate-300/50 flex items-center justify-center shadow-inner"
                  >
                    <span className="font-display font-black text-lg text-slate-200">2e</span>
                  </motion.div>
                </motion.div>
              ) : (
                <div className="w-full h-14 rounded-t-2xl border border-dashed border-purple-900/30 flex items-center justify-center opacity-40">
                  <span className="text-[10px] font-display uppercase text-slate-500">2e</span>
                </div>
              )}
            </div>

            {/* 1re Place (Or - Centre Surélevé) */}
            <div className="flex flex-col items-center">
              {firstPlace && (
                <motion.div
                  key={`podium-1-${firstPlace.id}-${firstPlace.timeMs}`}
                  initial={{ opacity: 0, scale: 0.9, y: 14 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 18 }}
                  className="w-full flex flex-col items-center text-center"
                >
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-9 h-9 rounded-full bg-yellow-400 text-secondary flex items-center justify-center font-black shadow-lg shadow-yellow-400/30 mb-1.5 border-2 border-white/60"
                  >
                    <Crown size={18} />
                  </motion.div>
                  <span className="text-xs sm:text-sm font-extrabold text-white truncate max-w-full px-1">
                    {firstPlace.name}
                  </span>
                  <span className="score-badge-gold px-2 py-0.5 rounded-md bg-primary/20 border border-primary/50 font-mono text-xs font-black text-primary mt-1 mb-2 tabular-nums">
                    {formatTime(firstPlace.timeMs!)}
                  </span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 82 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 20, delay: 0.05 }}
                    className="podium-pillar-gold podium-shimmer w-full rounded-t-2xl bg-gradient-to-b from-yellow-400/30 via-primary/20 to-primary/5 border-t-2 border-x border-yellow-400/70 flex flex-col items-center justify-center shadow-lg"
                  >
                    <span className="font-display font-black text-2xl text-yellow-300 leading-none">1er</span>
                    <span className="text-[8px] uppercase font-bold tracking-widest text-primary mt-0.5">
                      Record
                    </span>
                  </motion.div>
                </motion.div>
              )}
            </div>

            {/* 3e Place (Bronze - Droite) */}
            <div className="flex flex-col items-center">
              {thirdPlace ? (
                <motion.div
                  key={`podium-3-${thirdPlace.id}-${thirdPlace.timeMs}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.18, type: 'spring', stiffness: 260, damping: 20 }}
                  className="w-full flex flex-col items-center text-center"
                >
                  <div className="w-7 h-7 rounded-full bg-amber-700 text-white flex items-center justify-center font-black shadow mb-1.5">
                    <Medal size={14} />
                  </div>
                  <span className="text-xs font-bold text-white truncate max-w-full px-1">
                    {thirdPlace.name}
                  </span>
                  <span className="font-mono text-[11px] font-extrabold text-slate-200 mt-0.5 tabular-nums">
                    {formatTime(thirdPlace.timeMs!)}
                  </span>
                  {bestTimeMs !== null && (
                    <span className="text-[9px] font-mono text-slate-400 mb-1.5">
                      {formatDelta(thirdPlace.timeMs! - bestTimeMs)}
                    </span>
                  )}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 42 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.2 }}
                    className="podium-pillar-bronze w-full rounded-t-2xl bg-gradient-to-b from-amber-600/30 to-amber-900/10 border-t-2 border-x border-amber-600/50 flex items-center justify-center shadow-inner"
                  >
                    <span className="font-display font-black text-base text-amber-400">3e</span>
                  </motion.div>
                </motion.div>
              ) : (
                <div className="w-full h-11 rounded-t-2xl border border-dashed border-purple-900/30 flex items-center justify-center opacity-40">
                  <span className="text-[10px] font-display uppercase text-slate-500">3e</span>
                </div>
              )}
            </div>
          </div>

          {/* LISTE DYNAMIQUE FLIP COMPLÈTE */}
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            <AnimatePresence mode="popLayout">
              {rankedParticipants.map((participant, index) => {
                const isHighlighted = participant.id === highlightId;
                const isEditing = editingId === participant.id;
                const deltaMs =
                  index > 0 && bestTimeMs !== null ? participant.timeMs! - bestTimeMs : 0;

                return (
                  <motion.div
                    key={participant.id}
                    layout
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: isHighlighted ? [1, 1.02, 1] : 1
                    }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ type: 'spring', damping: 24, stiffness: 220 }}
                    className={`flex items-center justify-between p-3.5 rounded-xl transition gap-2 ${
                      isHighlighted
                        ? 'bg-primary/20 border-2 border-primary shadow-md shadow-primary/15'
                        : 'bg-[#180A2b]/50 border border-purple-950 hover:border-purple-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getRankBadge(index)}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white font-sans text-sm truncate">
                            {participant.name}
                          </h4>
                          {index === 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-display uppercase font-bold shrink-0">
                              Record
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {participant.postalCode && (
                            <span className="text-[10px] text-slate-400 font-sans uppercase">
                              {participant.postalCode}
                            </span>
                          )}
                          {index > 0 && deltaMs > 0 && (
                            <span className="text-[10px] font-mono text-slate-400">
                              ({formatDelta(deltaMs)})
                            </span>
                          )}
                        </div>
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
        </>
      )}
    </div>
  );
}

