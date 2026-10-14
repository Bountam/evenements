import React from 'react';
import { Participant } from '../../types';
import { formatTime } from './Stopwatch';
import { Trophy, Clock, Medal, Crown, Sparkles } from 'lucide-react';
import { getRankedParticipants } from '../../utils/ranking';
import { motion, AnimatePresence } from 'motion/react';

interface LeaderboardProps {
  participants: Participant[];
  highlightId?: string | null;
  compact?: boolean;
}

function formatDelta(deltaMs: number): string {
  if (deltaMs <= 0) return '+0.00s';
  const totalSeconds = deltaMs / 1000;
  if (totalSeconds < 60) {
    return `+${totalSeconds.toFixed(2)}s`;
  }
  return `+${formatTime(deltaMs)}`;
}

function getRankBadge(index: number) {
  switch (index) {
    case 0:
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0 border-2 border-yellow-200">
          <Trophy size={16} />
        </div>
      );
    case 1:
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950 flex items-center justify-center font-black shadow-md shrink-0 border-2 border-slate-200">
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
}

interface PodiumStepProps {
  rank: 1 | 2 | 3;
  participant: Participant | null;
  bestTimeMs: number | null;
  compact: boolean;
}

function PodiumStep({ rank, participant, bestTimeMs, compact }: PodiumStepProps) {
  const configs = {
    1: {
      label: '1er',
      height: compact ? 52 : 96,
      delay: 0.05,
      pillarClass: 'podium-pillar-gold podium-shimmer bg-gradient-to-b from-yellow-400/40 via-yellow-500/25 to-primary/10 border-t-2 border-x border-yellow-400/80',
      textClass: 'text-yellow-300 font-black',
      badgeClass: 'score-badge-gold',
      medalIcon: <Crown size={compact ? 16 : 22} />,
      iconBoxClass: `${compact ? 'w-8 h-8 sm:w-9 sm:h-9' : 'w-11 h-11 sm:w-12 sm:h-12'} rounded-full bg-yellow-400 text-secondary flex items-center justify-center font-black shadow-xl shadow-yellow-400/30 mb-1 border-2 border-yellow-200`,
      halo: true
    },
    2: {
      label: '2e',
      height: compact ? 36 : 68,
      delay: 0.1,
      pillarClass: 'podium-pillar-silver bg-gradient-to-b from-slate-300/35 to-slate-400/20 border-t-2 border-x border-slate-400/70',
      textClass: 'text-slate-100 font-black',
      badgeClass: 'score-badge-standard',
      medalIcon: <Medal size={compact ? 13 : 16} />,
      iconBoxClass: `${compact ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-8 h-8 sm:w-9 sm:h-9'} rounded-full bg-slate-300 text-secondary flex items-center justify-center font-black shadow mb-1 border border-slate-400`,
      halo: false
    },
    3: {
      label: '3e',
      height: compact ? 26 : 50,
      delay: 0.18,
      pillarClass: 'podium-pillar-bronze bg-gradient-to-b from-amber-600/40 to-amber-900/20 border-t-2 border-x border-amber-600/70',
      textClass: 'text-warning font-black',
      badgeClass: 'score-badge-standard',
      medalIcon: <Medal size={compact ? 13 : 16} />,
      iconBoxClass: `${compact ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-8 h-8 sm:w-9 sm:h-9'} rounded-full bg-amber-700 text-white flex items-center justify-center font-black shadow mb-1 border border-amber-600`,
      halo: false
    }
  };

  const cfg = configs[rank];

  return (
    <div className={`flex flex-col items-center ${cfg.halo ? 'relative' : ''}`}>
      {cfg.halo && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 sm:w-44 h-32 sm:h-44 rounded-full bg-warning/15 blur-2xl pointer-events-none -z-10" />
      )}
      {participant ? (
        <motion.div
          key={`podium-${rank}-${participant.id}-${participant.timeMs}`}
          initial={{ opacity: 0, y: 12, scale: rank === 1 ? 0.9 : 1 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: cfg.delay, type: 'spring', stiffness: 260, damping: 20 }}
          className="w-full flex flex-col items-center text-center relative z-0"
        >
          {rank === 1 ? (
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className={cfg.iconBoxClass}
            >
              {cfg.medalIcon}
            </motion.div>
          ) : (
            <div className={cfg.iconBoxClass}>{cfg.medalIcon}</div>
          )}

          <span
            className={`${compact ? 'text-kiosk-caption' : 'text-kiosk-body'} font-extrabold text-app-text line-clamp-2 max-w-full px-1 leading-tight`}
            title={participant.name}
          >
            {participant.name}
          </span>

          <span
            className={`${rank === 1 ? cfg.badgeClass : ''} font-mono ${compact ? 'text-kiosk-caption' : 'text-kiosk-body'} font-black text-app-text mt-0.5 tabular-nums ${rank === 1 ? (compact ? 'px-2 py-0.5' : 'px-3 py-0.5') + ' rounded-xl mb-1 shadow-sm' : ''}`}
          >
            {formatTime(participant.timeMs!)}
          </span>

          {rank !== 1 && bestTimeMs !== null && (
            <span className="text-kiosk-caption font-mono text-app-text-muted mb-1 font-bold">
              {formatDelta(participant.timeMs! - bestTimeMs)}
            </span>
          )}

          <motion.div
            initial={{ height: 0 }}
            animate={{ height: cfg.height }}
            transition={{ type: 'spring', stiffness: 220, damping: 22, delay: cfg.delay }}
            className={`${cfg.pillarClass} w-full rounded-t-xl sm:rounded-t-2xl flex flex-col items-center justify-center shadow-md`}
          >
            <span
              className={`font-display font-black ${
                rank === 1
                  ? compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
                  : compact ? 'text-base sm:text-lg' : 'text-xl'
              } ${cfg.textClass} leading-none`}
            >
              {cfg.label}
            </span>
            {rank === 1 && !compact && (
              <span className="text-kiosk-caption uppercase font-black tracking-widest text-primary mt-0.5">
                Record
              </span>
            )}
          </motion.div>
        </motion.div>
      ) : (
        <div
          className={`w-full ${compact ? (rank === 1 ? 'h-14' : 'h-10') : (rank === 1 ? 'h-20' : 'h-16')} rounded-t-xl border border-dashed border-app-card-border flex items-center justify-center opacity-40`}
        >
          <span className="text-xs font-display uppercase text-app-text-muted">{cfg.label}</span>
        </div>
      )}
    </div>
  );
}


export default function Leaderboard({
  participants,
  highlightId = null,
  compact = false
}: LeaderboardProps) {
  const rankedParticipants = getRankedParticipants(participants);

  const bestTimeMs = rankedParticipants.length > 0 ? rankedParticipants[0].timeMs! : null;
  const firstPlace = rankedParticipants[0] || null;
  const secondPlace = rankedParticipants[1] || null;
  const thirdPlace = rankedParticipants[2] || null;

  // Le podium affiche le top 3 : la liste reprend à partir du 4e rang
  const pursuitParticipants = rankedParticipants.slice(3);

  return (
    <div className={`bg-app-card border border-app-card-border ${compact ? 'p-3 sm:p-4 rounded-2xl' : 'p-5 sm:p-6 rounded-3xl'} shadow-lg flex flex-col h-full min-h-0`}>
      <div className={`flex items-center justify-between ${compact ? 'mb-2 pb-2' : 'mb-4 pb-3'} border-b border-app-card-border shrink-0`}>
        <h3 className={`${compact ? 'text-kiosk-body' : 'text-kiosk-title'} font-bold font-display text-app-text uppercase tracking-wider flex items-center gap-2`}>
          <Trophy className="text-primary shrink-0" size={compact ? 16 : 20} aria-hidden="true" />
          <span>Tableau des Champions</span>
        </h3>
        <span className="text-kiosk-caption font-semibold text-app-text-muted font-sans">
          {rankedParticipants.length} {rankedParticipants.length > 1 ? 'temps enregistrés' : 'temps enregistré'}
        </span>
      </div>

      {rankedParticipants.length === 0 ? (
        <div className="text-center py-12 my-auto">
          <Clock className="text-app-text-muted mx-auto mb-3 opacity-60" size={36} />
          <p className="text-kiosk-body text-app-text-muted font-sans">Aucun temps n'a encore été enregistré pour cette activité.</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* PODIUM OLYMPIQUE 3D ANIMÉ (Top 3) */}
          {/* Ordre du DOM 1-2-3 pour les lecteurs d'écran ; la disposition visuelle reste 2-1-3 */}
          <ol
            aria-label="Podium"
            className={`grid grid-cols-3 items-end gap-1.5 sm:gap-3 pt-1 ${compact ? 'pb-2 mb-2' : 'pb-4 mb-3'} border-b border-app-card-border shrink-0`}
          >
            <li className="order-2">
              <PodiumStep rank={1} participant={firstPlace} bestTimeMs={bestTimeMs} compact={compact} />
            </li>
            <li className="order-1">
              <PodiumStep rank={2} participant={secondPlace} bestTimeMs={bestTimeMs} compact={compact} />
            </li>
            <li className="order-3">
              <PodiumStep rank={3} participant={thirdPlace} bestTimeMs={bestTimeMs} compact={compact} />
            </li>
          </ol>

          {/* LISTE DYNAMIQUE DES PARTICIPANTS (Poursuite : 4e rang et suivants) */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {pursuitParticipants.length === 0 ? (
              <div className="py-6 px-4 rounded-2xl bg-app-input/40 border border-dashed border-app-card-border text-center flex flex-col items-center justify-center my-auto">
                <Sparkles size={24} className="text-primary mb-2" aria-hidden="true" />
                <h5 className="text-kiosk-body font-bold text-app-text font-display uppercase tracking-wide">
                  Places disponibles dans le classement
                </h5>
                <p className="text-kiosk-caption text-app-text-muted mt-1 max-w-md">
                  Venez établir un temps à la table d'assemblage pour inscrire votre nom parmi les meilleurs !
                </p>
              </div>
            ) : (
              <ol start={4} className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {pursuitParticipants.map((participant, index) => {
                    const isHighlighted = participant.id === highlightId;
                    const rank = index + 4;
                    const deltaMs = bestTimeMs !== null ? participant.timeMs! - bestTimeMs : 0;

                    return (
                      <motion.li
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
                            : 'bg-app-card border border-app-card-border'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {getRankBadge(rank - 1)}
                          <h4
                            className={`font-bold text-app-text font-sans ${compact ? 'text-kiosk-caption' : 'text-kiosk-body'} truncate`}
                            title={participant.name}
                          >
                            {participant.name}
                          </h4>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {deltaMs > 0 && (
                            <span className="font-mono text-kiosk-caption font-bold px-2 py-0.5 rounded-md bg-warning/15 text-warning border border-warning/40 shrink-0">
                              {formatDelta(deltaMs)}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg border score-badge-standard border-app-card-border">
                            <Clock size={12} className="text-app-text-muted" aria-hidden="true" />
                            <span className="font-mono font-extrabold text-kiosk-body tabular-nums text-app-text">
                              {formatTime(participant.timeMs!)}
                            </span>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

