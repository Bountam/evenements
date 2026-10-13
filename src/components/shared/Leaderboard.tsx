import React, { useState } from 'react';
import { Participant } from '../../types';
import { formatTime } from './Stopwatch';
import { Trophy, Clock, Medal, RotateCcw, Edit3, Check, X, Play, Crown, Sparkles } from 'lucide-react';
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

  // Sur l'écran public, n'afficher que les participants à partir du 4e rang pour éviter le doublon avec le podium Top 3
  const pursuitParticipants = isAdmin ? rankedParticipants : rankedParticipants.slice(3);

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
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-amber-950 dark:text-purple-950 flex items-center justify-center font-black shadow-md shrink-0 border-2 border-amber-600/60 dark:border-yellow-300">
            <Trophy size={16} />
          </div>
        );
      case 1:
        return (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 dark:text-purple-950 flex items-center justify-center font-black shadow-md shrink-0 border-2 border-slate-400">
            <Medal size={16} />
          </div>
        );
      case 2:
        return (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100 flex items-center justify-center font-black shadow-md shrink-0 border-2 border-amber-500">
            <Medal size={16} />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-app-card border-2 border-app-card-border flex items-center justify-center text-app-text-muted font-bold text-xs shrink-0">
            {index + 1}
          </div>
        );
    }
  };

  return (
    <div className="bg-[#24123d]/60 border border-purple-900/40 p-5 sm:p-6 rounded-3xl shadow-lg flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-purple-950/60 shrink-0">
        <h3 className="text-base sm:text-lg font-bold font-display text-white uppercase tracking-wider flex items-center gap-2">
          <Trophy className="text-primary animate-bounce shrink-0" size={20} />
          <span>Tableau des Champions</span>
        </h3>
        <span className="text-xs font-semibold text-slate-400 font-sans">
          {rankedParticipants.length} {rankedParticipants.length > 1 ? 'temps enregistrés' : 'temps enregistré'}
        </span>
      </div>

      {rankedParticipants.length === 0 ? (
        <div className="text-center py-12 my-auto">
          <Clock className="text-slate-600 mx-auto mb-3" size={36} />
          <p className="text-sm text-slate-400 font-sans">Aucun temps n'a encore été enregistré pour cette activité.</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* PODIUM OLYMPIQUE 3D ANIMÉ (Top 3) */}
          <div className="grid grid-cols-3 items-end gap-2 sm:gap-4 pt-1 pb-4 mb-3 border-b border-app-card-border shrink-0">
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
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-300 text-secondary flex items-center justify-center font-black shadow mb-1 border border-slate-400">
                    <Medal size={16} />
                  </div>
                  <span className="text-xs sm:text-sm font-extrabold text-app-text truncate max-w-full px-1">
                    {secondPlace.name}
                  </span>
                  <span className="font-mono text-xs sm:text-sm font-black text-app-text mt-0.5 tabular-nums">
                    {formatTime(secondPlace.timeMs!)}
                  </span>
                  {bestTimeMs !== null && (
                    <span className="text-[10px] font-mono text-app-text-muted mb-1.5 font-bold">
                      {formatDelta(secondPlace.timeMs! - bestTimeMs)}
                    </span>
                  )}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 68 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.12 }}
                    className="podium-pillar-silver w-full rounded-t-2xl bg-gradient-to-b from-slate-300/35 to-slate-400/20 border-t-2 border-x border-slate-400/70 flex items-center justify-center shadow-md"
                  >
                    <span className="font-display font-black text-xl text-slate-900 dark:text-slate-100">2e</span>
                  </motion.div>
                </motion.div>
              ) : (
                <div className="w-full h-16 rounded-t-2xl border border-dashed border-app-card-border flex items-center justify-center opacity-40">
                  <span className="text-xs font-display uppercase text-app-text-muted">2e</span>
                </div>
              )}
            </div>

            {/* 1re Place (Or - Centre Surélevé avec Halo) */}
            <div className="flex flex-col items-center relative">
              {/* Halo lumineux subtil d'arrière-plan */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-44 h-44 rounded-full bg-amber-400/15 dark:bg-amber-400/20 blur-2xl pointer-events-none -z-10" />

              {firstPlace && (
                <motion.div
                  key={`podium-1-${firstPlace.id}-${firstPlace.timeMs}`}
                  initial={{ opacity: 0, scale: 0.9, y: 14 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 18 }}
                  className="w-full flex flex-col items-center text-center relative z-0"
                >
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-yellow-400 text-secondary flex items-center justify-center font-black shadow-xl shadow-yellow-400/30 mb-1 border-2 border-yellow-200"
                  >
                    <Crown size={22} />
                  </motion.div>
                  <span className="text-sm sm:text-base md:text-lg font-black text-app-text truncate max-w-full px-1">
                    {firstPlace.name}
                  </span>
                  <span className="score-badge-gold px-3 py-0.5 rounded-xl font-mono text-sm sm:text-base font-black mt-1 mb-1.5 tabular-nums shadow-sm">
                    {formatTime(firstPlace.timeMs!)}
                  </span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 96 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 20, delay: 0.05 }}
                    className="podium-pillar-gold podium-shimmer w-full rounded-t-2xl bg-gradient-to-b from-yellow-400/40 via-yellow-500/25 to-primary/10 border-t-2 border-x border-yellow-400/80 flex flex-col items-center justify-center shadow-lg"
                  >
                    <span className="font-display font-black text-2xl sm:text-3xl text-amber-950 dark:text-yellow-300 leading-none">1er</span>
                    <span className="text-[10px] uppercase font-black tracking-widest text-amber-950 dark:text-primary mt-0.5">
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
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-amber-700 text-white flex items-center justify-center font-black shadow mb-1 border border-amber-600">
                    <Medal size={16} />
                  </div>
                  <span className="text-xs sm:text-sm font-extrabold text-app-text truncate max-w-full px-1">
                    {thirdPlace.name}
                  </span>
                  <span className="font-mono text-xs sm:text-sm font-black text-app-text mt-0.5 tabular-nums">
                    {formatTime(thirdPlace.timeMs!)}
                  </span>
                  {bestTimeMs !== null && (
                    <span className="text-[10px] font-mono text-app-text-muted mb-1.5 font-bold">
                      {formatDelta(thirdPlace.timeMs! - bestTimeMs)}
                    </span>
                  )}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 50 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.2 }}
                    className="podium-pillar-bronze w-full rounded-t-2xl bg-gradient-to-b from-amber-600/40 to-amber-900/20 border-t-2 border-x border-amber-600/70 flex items-center justify-center shadow-md"
                  >
                    <span className="font-display font-black text-lg text-amber-950 dark:text-amber-300">3e</span>
                  </motion.div>
                </motion.div>
              ) : (
                <div className="w-full h-12 rounded-t-2xl border border-dashed border-app-card-border flex items-center justify-center opacity-40">
                  <span className="text-xs font-display uppercase text-app-text-muted">3e</span>
                </div>
              )}
            </div>
          </div>

          {/* LISTE DYNAMIQUE DES PARTICIPANTS (Poursuite : 4e rang et suivants) */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {pursuitParticipants.length === 0 ? (
              <div className="py-6 px-4 rounded-2xl bg-app-card/40 border border-dashed border-app-card-border text-center flex flex-col items-center justify-center my-auto">
                <Sparkles size={24} className="text-primary mb-2 animate-pulse" />
                <h5 className="text-xs sm:text-sm font-bold text-app-text font-display uppercase tracking-wide">
                  Places disponibles dans le classement
                </h5>
                <p className="text-[11px] text-app-text-muted mt-1 max-w-xs">
                  Venez établir un temps à la table d'assemblage pour inscrire votre nom parmi les meilleurs !
                </p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {pursuitParticipants.map((participant, index) => {
                  const isHighlighted = participant.id === highlightId;
                  const isEditing = editingId === participant.id;
                  const actualRank = isAdmin ? index + 1 : index + 4;
                  const deltaMs =
                    bestTimeMs !== null && participant.timeMs! > bestTimeMs
                      ? participant.timeMs! - bestTimeMs
                      : 0;

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
                      className={`flex items-center justify-between p-3 rounded-xl transition gap-2 ${
                        isHighlighted
                          ? 'bg-primary/20 border-2 border-primary shadow-md shadow-primary/15'
                          : 'bg-app-card border border-app-card-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {getRankBadge(actualRank - 1)}

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-app-text font-sans text-xs sm:text-sm truncate">
                              {participant.name}
                            </h4>
                            {actualRank === 1 && (
                              <span className="text-[9px] px-2 py-0.5 rounded-md bg-amber-500/15 dark:bg-yellow-500/20 text-amber-950 dark:text-yellow-300 border border-amber-600/40 dark:border-yellow-500/30 font-display uppercase font-black shrink-0">
                                Record
                              </span>
                            )}
                          </div>
                          {participant.postalCode && (
                            <span className="text-[10px] text-app-text-muted font-sans uppercase block mt-0.5">
                              {participant.postalCode}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Temps chronométré + Écart à droite + actions admin */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              placeholder="01:23.45"
                              className="w-24 bg-app-input border border-primary rounded-lg px-2 py-1 text-app-text font-mono text-xs focus:outline-none"
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
                            {/* Écart de temps déplacé à droite dans un badge dédié */}
                            {deltaMs > 0 && (
                              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-950 dark:text-amber-300 border border-amber-600/40 dark:border-amber-500/30 shrink-0">
                                {formatDelta(deltaMs)}
                              </span>
                            )}

                            <div
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border ${
                                actualRank === 1
                                  ? 'score-badge-gold bg-primary/15 border-primary/40 text-primary'
                                  : 'score-badge-standard border-app-card-border'
                              }`}
                            >
                              <Clock size={12} className={actualRank === 1 ? 'text-primary' : 'text-app-text-muted'} />
                              <span
                                className={`font-mono font-extrabold text-sm sm:text-base tabular-nums ${
                                  actualRank === 1 ? 'text-primary' : 'text-app-text'
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}

