import React, { useState, useEffect, useRef, useMemo } from 'react';
import { EventSettings, Participant, TrackState, RaffleState } from '../../types';
import { db, registerSyncListener } from '../../db';
import { networkManager } from '../../network';
import Stopwatch, { formatTime } from '../shared/Stopwatch';
import Leaderboard, { parseTimeInputToMs } from '../shared/Leaderboard';
import RaffleSpinner from '../shared/RaffleSpinner';
import { showToast } from '../shared/Toast';
import PrizeEditorModal, { PrizeImage } from '../shared/PrizeEditorModal';
import { ContestPrizes, getContestPrizes, serializeContestPrizes } from '../../utils/prizes';
import { RaffleDraw, getRaffleDraws, getEligibleParticipants, readStoredRaffle, storeRaffle } from '../../utils/raffle';
import confetti from 'canvas-confetti';
import {
  UserPlus,
  Play,
  RotateCcw,
  Award,
  Trash2,
  Check,
  Sparkles,
  User,
  Mail,
  MapPin,
  Timer,
  Trophy,
  Search,
  Edit3,
  X,
  PlusCircle,
  MinusCircle,
  Clock,
  Users,
  HardDrive,
  Laptop,
  Gift,
  Zap,
  Square,
  Settings2
} from 'lucide-react';

interface TeardownMatrixProps {
  event: EventSettings;
  activeTab: 'admin' | 'public';
}

// Fanfare sonore Web Audio API lors d'un nouveau record (1re place)
function playRecordFanfare() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // Do5, Mi5, Sol5, Do6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.11);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.11 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.11);
      osc.stop(ctx.currentTime + idx * 0.11 + 0.35);
    });
  } catch (e) {
    // Ignorer si l'audio est bloqué par le navigateur
  }
}

interface PrizeShowcaseCardProps {
  badgeText: string;
  badgeClass: string;
  tag?: string;
  title: string;
  imageSrc: string;
  imageAlt: string;
  imageKind: keyof ContestPrizes;
  description: string;
  gradientClass: string;
  borderClass: string;
}

function PrizeShowcaseCard({
  badgeText,
  badgeClass,
  tag,
  title,
  imageSrc,
  imageAlt,
  imageKind,
  description,
  gradientClass,
  borderClass
}: PrizeShowcaseCardProps) {
  return (
    <div className={`bg-gradient-to-br ${gradientClass} via-app-card to-app-card border-2 ${borderClass} p-2.5 rounded-2xl shadow-sm flex flex-col justify-between relative overflow-hidden group`}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white p-1 border border-slate-200/90 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
          <PrizeImage
            src={imageSrc}
            alt={imageAlt}
            kind={imageKind}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`px-1.5 py-0.2 rounded ${badgeClass} text-[8px] font-black uppercase font-display tracking-wider block w-fit`}>
              {badgeText}
            </span>
            {tag && <span className="text-[8px] font-bold font-mono text-primary">{tag}</span>}
          </div>
          <h4 className="text-xs font-black text-app-text font-display uppercase tracking-tight leading-tight truncate mt-0.5">
            {title}
          </h4>
        </div>
      </div>
      <p className="text-[10px] text-app-text-muted leading-tight font-sans line-clamp-2">
        {description}
      </p>
    </div>
  );
}

export default function TeardownMatrix({ event, activeTab }: TeardownMatrixProps) {
  // 1. États principaux
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [lastSavedParticipantId, setLastSavedParticipantId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [participantFilter, setParticipantFilter] = useState<'all' | 'waiting' | 'ranked'>('all');
  const [manualScoreParticipantId, setManualScoreParticipantId] = useState<string | null>(null);
  const [manualScoreInput, setManualScoreInput] = useState<string>('');

  // État des 5 pistes (géré en local et synchronisé via networkManager + BroadcastChannel)
  const [rawTracks, setTracks] = useState<Record<number, TrackState>>(() => ({
    ...networkManager.tracksState
  }));

  // Les pistes sont partagées entre tous les événements : une piste assignée par un autre
  // événement est affichée comme libre ici (aucune écriture, simple filtre d'affichage)
  const tracks = useMemo(() => {
    const ownIds = new Set(participants.map((p) => p.id));
    const result: Record<number, TrackState> = {};
    Object.values(rawTracks).forEach((t) => {
      const belongsHere =
        !t.participantId || (t.eventId ? t.eventId === event.id : ownIds.has(t.participantId));
      result[t.trackId] = belongsHere
        ? t
        : { trackId: t.trackId, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0, eventId: null };
    });
    return result;
  }, [rawTracks, participants, event.id]);

  const prizes = getContestPrizes(event);
  const [isPrizeEditorOpen, setIsPrizeEditorOpen] = useState(false);

  const [raffle, setRaffle] = useState<RaffleState>(() => readStoredRaffle(event.id));

  // Mémoriser le tirage en cours (l'écran public le retrouve après un rechargement).
  // Dépend seulement de `raffle` : au changement d'événement, l'état est d'abord rechargé avant d'être réécrit
  useEffect(() => {
    storeRaffle(event.id, raffle);
  }, [raffle]);

  // Historique des tirages et participants encore éligibles
  const raffleDraws = getRaffleDraws(event);
  const eligibleForRaffle = getEligibleParticipants(participants, raffleDraws);

  // Formulaire d'ajout de participant
  const [newParticipantName, setNewParticipantName] = useState('');
  const [newParticipantEmail, setNewParticipantEmail] = useState('');
  const [newParticipantPostal, setNewParticipantPostal] = useState('');
  const [newParticipantConsent, setNewParticipantConsent] = useState(false);
  const [raffleDisplayValue, setRaffleDisplayValue] = useState<string>('');

  useEffect(() => {
    if (raffle.status === 'spinning' && participants.length > 0) {
      const interval = setInterval(() => {
        const eligible = participants.filter((p) => p.name);
        if (eligible.length > 0) {
          const randomIndex = Math.floor(Math.random() * eligible.length);
          setRaffleDisplayValue(eligible[randomIndex].name);
        }
      }, 80);
      return () => clearInterval(interval);
    } else if (raffle.status === 'celebrating' && raffle.winnerId) {
      const winner = participants.find((p) => p.id === raffle.winnerId);
      setRaffleDisplayValue(winner ? winner.name : 'Tirage complété');
    }
  }, [raffle.status, raffle.winnerId, participants]);

  // Charger les participants depuis IndexedDB
  const loadParticipants = async () => {
    try {
      const data = await db.participants.where('eventId').equals(event.id).toArray();
      // Assainir les éventuels anciens scores à 0 enregistrés par erreur (les remettre à null)
      const cleanedData: Participant[] = [];
      for (const p of data) {
        if (p.timeMs !== null && p.timeMs <= 0) {
          const fixed = { ...p, timeMs: null };
          await db.participants.put(fixed);
          cleanedData.push(fixed);
        } else {
          cleanedData.push(p);
        }
      }
      setParticipants(cleanedData.sort((a, b) => b.registeredAt - a.registeredAt));
    } catch (e) {
      console.error('Erreur chargement participants :', e);
    }
  };

  useEffect(() => {
    loadParticipants();
    setRaffle(readStoredRaffle(event.id));

    // S'abonner aux synchros de base locale
    const unsubscribeSync = registerSyncListener(() => {
      loadParticipants();
    });

    // S'abonner aux messages de synchronisation inter-onglets locaux (BroadcastChannel)
    const localChannel = new BroadcastChannel(`insertech_teardown_sync_${event.id}`);
    const handleLocalMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'RAFFLE_START') {
        setRaffle({
          status: 'spinning',
          winnerId: e.data.winnerId,
          spinStartTime: e.data.spinStartTime
        });
      } else if (e.data && e.data.type === 'RAFFLE_RESET') {
        setRaffle({
          status: 'idle',
          winnerId: null,
          spinStartTime: null
        });
      }
    };
    localChannel.addEventListener('message', handleLocalMessage);

    // S'abonner aux événements réseau et inter-onglets de chronomètre
    networkManager.onTracksSync = (updatedTracks) => {
      setTracks({ ...updatedTracks });
    };

    networkManager.onCelebration = (payload) => {
      if (payload && (payload.participantName || payload.visitorName)) {
        confetti({
          particleCount: 70,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#9ecd33', '#480A94', '#ffffff']
        });
      }
    };

    // S'abonner aux événements réseau de tirage au sort (Raffle) P2P
    networkManager.onRaffleAction = (action) => {
      if (action.type === 'RAFFLE_START') {
        setRaffle({
          status: 'spinning',
          winnerId: action.winnerId,
          spinStartTime: action.spinStartTime
        });
      } else if (action.type === 'RAFFLE_RESET') {
        setRaffle({
          status: 'idle',
          winnerId: null,
          spinStartTime: null
        });
      }
    };

    // Charger les pistes existantes depuis le network manager
    setTracks({ ...networkManager.tracksState });

    return () => {
      unsubscribeSync();
      networkManager.onTracksSync = null;
      networkManager.onCelebration = null;
      networkManager.onRaffleAction = null;
      localChannel.removeEventListener('message', handleLocalMessage);
      localChannel.close();
    };
  }, [event.id]);

  // Transition automatique pour le tirage au sort (de spinning à celebrating après 10s)
  useEffect(() => {
    if (raffle.status === 'spinning' && raffle.spinStartTime) {
      const elapsed = networkManager.now() - raffle.spinStartTime;
      const timeLeft = 10000 - elapsed;

      if (timeLeft <= 0) {
        setRaffle((prev) => ({ ...prev, status: 'celebrating' }));
      } else {
        const timer = setTimeout(() => {
          setRaffle((prev) => ({ ...prev, status: 'celebrating' }));
        }, timeLeft);
        return () => clearTimeout(timer);
      }
    }
  }, [raffle.status, raffle.spinStartTime]);

  // ACTIONS CHRONOMÈTRES CONCURRENTS (P2P + Multi-fenêtres)
  const handleStartTimer = (trackId: number) => {
    const track = tracks[trackId];
    if (!track || !track.participantId) {
      showToast('Veuillez attribuer un participant à la piste avant de démarrer.', 'warning');
      return;
    }
    const startTime = networkManager.now();
    networkManager.sendChronoAction({
      type: 'TIMER_START',
      trackId,
      startTime,
      elapsedBeforeStart: track.elapsedBeforeStart
    });
  };

  const handleStopTimer = (trackId: number) => {
    const track = tracks[trackId];
    if (!track || !track.isRunning || track.startTime === null) return;
    const elapsed = Math.max(1, networkManager.now() - track.startTime + track.elapsedBeforeStart);

    networkManager.sendChronoAction({
      type: 'TIMER_STOP',
      trackId,
      elapsed
    });
  };

  const handleResetTimer = (trackId: number) => {
    networkManager.sendChronoAction({
      type: 'TIMER_RESET',
      trackId
    });
  };

  // Ajuster le temps d'une piste (pénalité +5s / +10s pour vis oubliée, ou bonus -5s)
  const handleAdjustTrackTime = (trackId: number, deltaMs: number) => {
    const track = tracks[trackId];
    if (!track || !track.participantId) return;

    if (track.isRunning && track.startTime !== null) {
      const currentElapsed = networkManager.now() - track.startTime + track.elapsedBeforeStart;
      const newElapsed = Math.max(0, currentElapsed + deltaMs);
      networkManager.sendChronoAction({
        type: 'TIMER_START',
        trackId,
        startTime: networkManager.now(),
        elapsedBeforeStart: newElapsed
      });
    } else {
      const newElapsed = Math.max(0, track.elapsedBeforeStart + deltaMs);
      networkManager.sendChronoAction({
        type: 'TIMER_STOP',
        trackId,
        elapsed: newElapsed
      });
    }

    const label = deltaMs > 0 ? `+${deltaMs / 1000}s (pénalité)` : `${deltaMs / 1000}s (bonus)`;
    showToast(`Piste ${trackId} ajustée : ${label}`, 'info');
  };

  const handleAssignParticipant = (trackId: number, participantId: string | null) => {
    if (participantId) {
      // Vérifier si ce participant est déjà sur une autre piste
      const alreadyOnTrack = Object.values(tracks).find(
        (t) => t.trackId !== trackId && t.participantId === participantId
      );
      if (alreadyOnTrack) {
        showToast(`Ce participant est déjà assigné à la Piste ${alreadyOnTrack.trackId}.`, 'warning');
        return;
      }
    }

    let participantName: string | null = null;
    if (participantId) {
      const p = participants.find((part) => part.id === participantId);
      if (p) participantName = p.name;
    }

    networkManager.sendChronoAction({
      type: 'TRACK_ASSIGN',
      trackId,
      participantId,
      participantName,
      eventId: event.id
    });
  };

  // Assigner rapidement un participant à la première piste libre
  const handleQuickSendToTrack = (participantId: string) => {
    const alreadyOnTrack = Object.values(tracks).find((t) => t.participantId === participantId);
    if (alreadyOnTrack) {
      showToast(`Déjà en course sur la Piste ${alreadyOnTrack.trackId}.`, 'info');
      return;
    }

    const freeTrack = Object.values(tracks).find((t) => t.participantId === null);
    if (!freeTrack) {
      showToast('Toutes les 5 pistes sont actuellement occupées !', 'warning');
      return;
    }

    handleAssignParticipant(freeTrack.trackId, participantId);
    const p = participants.find((part) => part.id === participantId);
    showToast(`${p?.name || 'Participant'} envoyé sur la Piste ${freeTrack.trackId}`, 'success');
  };

  // ENREGISTREMENT FIABLE D'UN SCORE DEPUIS UNE PISTE
  const handleSaveTrackTime = async (trackId: number) => {
    const track = tracks[trackId];
    if (!track || !track.participantId) {
      showToast('Aucun participant assigné sur cette piste.', 'warning');
      return;
    }

    // Calculer le temps final (si le chrono tournait encore, on calcule le temps exact à l'instant du clic)
    let finalTime = track.elapsedBeforeStart;
    if (track.isRunning && track.startTime !== null) {
      finalTime = networkManager.now() - track.startTime + track.elapsedBeforeStart;
    }
    finalTime = Math.round(finalTime);

    if (finalTime <= 0) {
      showToast('Impossible d\'enregistrer un temps à 00:00.00. Démarrez d\'abord le chronomètre !', 'warning');
      return;
    }

    try {
      // Chercher dans IndexedDB puis en repli dans l'état React
      let participant = await db.participants.get(track.participantId);
      if (!participant) {
        participant = participants.find((p) => p.id === track.participantId);
      }

      if (!participant) {
        showToast('Participant introuvable dans la base.', 'error');
        return;
      }

      // Vérifier si le participant avait déjà un meilleur temps
      const previousBest =
        typeof participant.timeMs === 'number' && participant.timeMs > 0 ? participant.timeMs : null;

      if (previousBest !== null && finalTime > previousBest) {
        const overwrite = confirm(
          `${participant.name} possède déjà un meilleur temps (${formatTime(previousBest)}).\n\n` +
            `Nouveau temps : ${formatTime(finalTime)}.\n` +
            `Voulez-vous remplacer son record par ce nouveau temps ? (Annuler = conserver ${formatTime(previousBest)})`
        );
        if (!overwrite) {
          handleAssignParticipant(trackId, null);
          showToast(`Meilleur temps conservé pour ${participant.name} (${formatTime(previousBest)})`, 'info');
          return;
        }
      }

      // Vérifier si ce temps bat le record général (1re place du classement)
      const existingScores = participants
        .filter((p) => p.id !== participant!.id && typeof p.timeMs === 'number' && p.timeMs > 0)
        .map((p) => p.timeMs!);
      const currentBestOverall = existingScores.length > 0 ? Math.min(...existingScores) : Infinity;
      const isNewRecord = finalTime < currentBestOverall;

      const updatedParticipant: Participant = {
        ...participant,
        timeMs: finalTime
      };

      // Sauvegarder dans IndexedDB + synchroniser P2P
      await networkManager.writeToDatabase('participants', 'put', updatedParticipant);

      // Mettre à jour l'état React immédiatement sans attendre le prochain cycle
      setParticipants((prev) =>
        prev.map((p) => (p.id === updatedParticipant.id ? updatedParticipant : p))
      );
      setLastSavedParticipantId(updatedParticipant.id);

      // Libérer la piste
      handleAssignParticipant(trackId, null);

      // Célébration si nouveau record n°1 !
      if (isNewRecord) {
        playRecordFanfare();
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#9ecd33', '#480A94', '#ffffff']
        });
        networkManager.sendChronoAction({
          type: 'PEER_CELEBRATION',
          payload: {
            ticketId: updatedParticipant.id,
            visitorName: updatedParticipant.name,
            deviceCategory: formatTime(finalTime),
            weightKg: 0
          }
        });
        showToast(
          `🏆 NOUVEAU RECORD ! ${updatedParticipant.name} prend la 1re place en ${formatTime(finalTime)} !`,
          'success'
        );
      } else {
        showToast(
          `Temps enregistré pour ${updatedParticipant.name} : ${formatTime(finalTime)}`,
          'success'
        );
      }

      await loadParticipants();
    } catch (e) {
      console.error('Erreur lors de la sauvegarde du score :', e);
      showToast('Erreur lors de l\'enregistrement du score.', 'error');
    }
  };

  // Modifier ou saisir manuellement le score d'un participant
  const handleUpdateScoreManually = async (participantId: string, newTimeMs: number) => {
    if (newTimeMs <= 0) {
      showToast('Veuillez saisir un temps valide supérieur à 0.', 'warning');
      return;
    }

    try {
      let participant = await db.participants.get(participantId);
      if (!participant) {
        participant = participants.find((p) => p.id === participantId);
      }
      if (!participant) return;

      const updatedParticipant: Participant = {
        ...participant,
        timeMs: Math.round(newTimeMs)
      };

      await networkManager.writeToDatabase('participants', 'put', updatedParticipant);
      setParticipants((prev) =>
        prev.map((p) => (p.id === participantId ? updatedParticipant : p))
      );
      setLastSavedParticipantId(participantId);
      setManualScoreParticipantId(null);
      setManualScoreInput('');
      showToast(`Score mis à jour pour ${participant.name} : ${formatTime(newTimeMs)}`, 'success');
      await loadParticipants();
    } catch (e) {
      console.error(e);
      showToast('Erreur lors de la mise à jour du score.', 'error');
    }
  };

  // Réinitialiser le score d'un participant (le remettre en attente)
  const handleResetParticipantScore = async (participantId: string) => {
    const participant = participants.find((p) => p.id === participantId);
    if (!participant) return;
    if (!confirm(`Effacer le temps de ${participant.name} (${formatTime(participant.timeMs || 0)}) ?`)) {
      return;
    }

    try {
      const updatedParticipant: Participant = {
        ...participant,
        timeMs: null
      };
      await networkManager.writeToDatabase('participants', 'put', updatedParticipant);
      setParticipants((prev) =>
        prev.map((p) => (p.id === participantId ? updatedParticipant : p))
      );
      showToast(`Score de ${participant.name} réinitialisé.`, 'info');
      await loadParticipants();
    } catch (e) {
      console.error(e);
    }
  };

  // ACTIONS TIRAGE AU SORT (RAFFLE)
  // markLastAbsent : le dernier gagnant n'était pas présent, il est marqué absent avant un nouveau tirage
  const startRaffle = async (markLastAbsent: boolean = false) => {
    let currentEvent: EventSettings | undefined;
    try {
      currentEvent = await db.events.get(event.id);
    } catch (e) {
      console.error('Erreur lecture événement :', e);
    }
    const draws: RaffleDraw[] = [...getRaffleDraws(currentEvent || event)];
    if (markLastAbsent && draws.length > 0) {
      draws[draws.length - 1] = { ...draws[draws.length - 1], status: 'absent' };
    }

    const list = getEligibleParticipants(participants, draws);
    if (list.length === 0) {
      showToast('Tous les participants ont déjà été tirés au sort.', 'warning');
      return;
    }

    const randomIndex = Math.floor(Math.random() * list.length);
    const winner = list[randomIndex];
    const spinStartTime = networkManager.now();

    // 0. Mettre à jour l'état local de l'onglet émetteur
    setRaffle({
      status: 'spinning',
      winnerId: winner.id,
      spinStartTime
    });

    // 1. Démarrer le tirage sur le réseau P2P + inter-onglets
    networkManager.sendChronoAction({
      type: 'RAFFLE_START',
      spinStartTime,
      winnerId: winner.id
    });

    // 2. Ajouter le gagnant à l'historique de l'événement (sauvegarde JSON et affichage admin)
    try {
      if (currentEvent) {
        draws.push({
          participantId: winner.id,
          name: winner.name,
          email: winner.email || '',
          postalCode: winner.postalCode || '',
          at: Date.now(),
          status: 'gagnant'
        });
        currentEvent.extraData = {
          ...currentEvent.extraData,
          raffleWinners: draws,
          // Champs du dernier gagnant conservés pour la compatibilité des exports existants
          raffleWinnerId: winner.id,
          raffleWinnerName: winner.name,
          raffleWinnerEmail: winner.email || '',
          raffleWinnerPostal: winner.postalCode || '',
          raffleWinnerAt: Date.now()
        };
        await networkManager.writeToDatabase('events', 'put', currentEvent);
      }
    } catch (e) {
      console.error('Erreur écriture vainqueur tirage :', e);
    }

    // 3. Notifier les onglets locaux hors P2P
    const channel = new BroadcastChannel(`insertech_teardown_sync_${event.id}`);
    channel.postMessage({
      type: 'RAFFLE_START',
      spinStartTime,
      winnerId: winner.id
    });
    channel.close();
  };

  // Effacer l'historique (par exemple après un tirage d'essai) : tout le monde redevient éligible
  const clearRaffleHistory = async () => {
    if (!confirm('Effacer l\'historique des tirages ? Tous les participants redeviendront éligibles.')) return;
    try {
      const currentEvent = (await db.events.get(event.id)) || event;
      const {
        raffleWinnerId,
        raffleWinnerName,
        raffleWinnerEmail,
        raffleWinnerPostal,
        raffleWinnerAt,
        ...rest
      } = currentEvent.extraData || {};
      await networkManager.writeToDatabase('events', 'put', {
        ...currentEvent,
        extraData: { ...rest, raffleWinners: [] }
      });
      showToast('Historique des tirages effacé.', 'info');
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de l'effacement de l'historique.", 'error');
    }
  };

  const resetRaffle = () => {
    setRaffle({ status: 'idle', winnerId: null, spinStartTime: null });
    networkManager.sendChronoAction({ type: 'RAFFLE_RESET' });

    const channel = new BroadcastChannel(`insertech_teardown_sync_${event.id}`);
    channel.postMessage({ type: 'RAFFLE_RESET' });
    channel.close();
  };

  // PRIX DU CONCOURS (propres à l'événement)
  const handleSavePrizes = async (updated: ContestPrizes) => {
    try {
      const currentEvent = (await db.events.get(event.id)) || event;
      await networkManager.writeToDatabase('events', 'put', {
        ...currentEvent,
        extraData: { ...currentEvent.extraData, contestPrizes: serializeContestPrizes(updated) }
      });
      showToast('Prix du concours enregistrés.', 'success');
    } catch (e) {
      console.error('Erreur enregistrement des prix :', e);
      showToast("Erreur lors de l'enregistrement des prix.", 'error');
      throw e;
    }
  };

  // ACTIONS PARTICIPANTS
  const addParticipant = async (e: React.FormEvent, autoAssignTrack: boolean = false) => {
    e.preventDefault();
    if (!newParticipantName.trim()) {
      showToast('Veuillez saisir le nom du participant.', 'warning');
      return;
    }

    // Loi 25 : pas de coordonnées sans consentement explicite
    const hasContactInfo = newParticipantEmail.trim() !== '' || newParticipantPostal.trim() !== '';
    if (hasContactInfo && !newParticipantConsent) {
      showToast('Cochez le consentement ou retirez le courriel et le code postal.', 'warning');
      return;
    }

    // Prévenir les inscriptions en double (une seule chance au tirage par personne)
    const nameKey = normalizeName(newParticipantName);
    const emailKey = newParticipantEmail.trim().toLowerCase();
    const duplicate = participants.find(
      (p) => normalizeName(p.name) === nameKey || (emailKey !== '' && (p.email || '').trim().toLowerCase() === emailKey)
    );
    if (
      duplicate &&
      !confirm(
        `${duplicate.name}${duplicate.email ? ` (${duplicate.email})` : ''} est déjà inscrit.\n\n` +
          `Pour une nouvelle tentative, utilisez plutôt le bouton ▶ à côté de son nom dans la file.\n\n` +
          `Inscrire quand même un nouveau participant ?`
      )
    ) {
      return;
    }

    const newP: Participant = {
      id: 'p-' + Math.random().toString(36).substring(2, 11),
      eventId: event.id,
      name: newParticipantName.trim(),
      email: newParticipantEmail.trim(),
      postalCode: newParticipantPostal.trim().toUpperCase() || undefined,
      timeMs: null,
      registeredAt: Date.now(),
      ...(hasContactInfo ? { extraData: { consentContact: true, consentAt: Date.now() } } : {})
    };

    try {
      await networkManager.writeToDatabase('participants', 'put', newP);
      setParticipants((prev) => [newP, ...prev]);
      setNewParticipantName('');
      setNewParticipantEmail('');
      setNewParticipantPostal('');
      setNewParticipantConsent(false);

      if (autoAssignTrack) {
        const freeTrack = Object.values(tracks).find((t) => t.participantId === null);
        if (freeTrack) {
          networkManager.sendChronoAction({
            type: 'TRACK_ASSIGN',
            trackId: freeTrack.trackId,
            participantId: newP.id,
            participantName: newP.name,
            eventId: event.id
          });
          showToast(`${newP.name} inscrit et assigné à la Piste ${freeTrack.trackId} !`, 'success');
        } else {
          showToast(`${newP.name} inscrit (toutes les pistes sont occupées).`, 'info');
        }
      } else {
        showToast(`${newP.name} inscrit avec succès !`, 'success');
      }

      await loadParticipants();
    } catch (e) {
      console.error(e);
      showToast('Erreur lors de l\'inscription du participant.', 'error');
    }
  };

  const deleteParticipant = async (id: string) => {
    const target = participants.find((p) => p.id === id);
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${target?.name || 'ce participant'} ?`)) return;
    try {
      await networkManager.writeToDatabase('participants', 'delete', id);
      setParticipants((prev) => prev.filter((p) => p.id !== id));
      showToast('Participant supprimé.', 'info');
      await loadParticipants();
    } catch (e) {
      console.error(e);
    }
  };

  // Calcul des statistiques en temps réel
  const rankedParticipants = participants
    .filter((p) => typeof p.timeMs === 'number' && p.timeMs > 0)
    .sort((a, b) => a.timeMs! - b.timeMs!);
  const bestParticipant = rankedParticipants.length > 0 ? rankedParticipants[0] : null;
  const secondParticipant = rankedParticipants.length > 1 ? rankedParticipants[1] : null;
  const thirdParticipant = rankedParticipants.length > 2 ? rankedParticipants[2] : null;
  const averageTimeMs =
    rankedParticipants.length > 0
      ? Math.round(
          rankedParticipants.reduce((acc, p) => acc + (p.timeMs || 0), 0) / rankedParticipants.length
        )
      : null;

  // Inscrits au statut "En attente" non assignés sur une piste en direct
  // (ordre d'arrivée : le premier inscrit passe en premier)
  const waitingForLiveRace = participants
    .filter(
      (p) =>
        (p.timeMs === null || p.timeMs <= 0) &&
        !Object.values(tracks).some((t) => t.participantId === p.id)
    )
    .sort((a, b) => a.registeredAt - b.registeredAt);

  // Filtrage et tri de la liste des participants
  const filteredParticipants = participants
    .filter((p) => {
      const matchesSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.email && p.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.postalCode && p.postalCode.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      const hasValidTime = typeof p.timeMs === 'number' && p.timeMs > 0;
      if (participantFilter === 'waiting') return !hasValidTime;
      if (participantFilter === 'ranked') return hasValidTime;
      return true;
    })
    .sort((a, b) => {
      const aHasTime = typeof a.timeMs === 'number' && a.timeMs > 0;
      const bHasTime = typeof b.timeMs === 'number' && b.timeMs > 0;
      if (participantFilter === 'ranked') {
        return (a.timeMs || 0) - (b.timeMs || 0);
      }
      if (participantFilter === 'waiting') {
        return (a.registeredAt || 0) - (b.registeredAt || 0);
      }
      // 'all' : classés en tête triés par score, puis ceux en attente
      if (aHasTime && bHasTime) return a.timeMs! - b.timeMs!;
      if (aHasTime && !bHasTime) return -1;
      if (!aHasTime && bHasTime) return 1;
      return (b.registeredAt || 0) - (a.registeredAt || 0);
    });

  // Rendu des Chronomètres Individuels Adaptatifs sur l'Écran Public
  const activeTracks = Object.values(tracks).filter((t) => t.participantId !== null);

  // ============================================================================
  // RENDU DE L'ÉCRAN PUBLIC DE PROJECTION (Kiosque Plein Écran Adaptatif)
  // ============================================================================
  if (activeTab === 'public') {
    if (raffle.status !== 'idle') {
      return (
        <div className="h-full flex flex-col justify-center max-w-4xl mx-auto space-y-6 p-4">
          <div className="bg-app-card border border-app-card-border p-6 rounded-3xl text-center space-y-3 shadow-xl">
            <span className="px-3 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 text-xs font-black uppercase font-display tracking-widest inline-flex items-center gap-1.5">
              <Gift size={14} /> Grand Tirage au Sort Insertech
            </span>
            <h2 className="text-3xl font-display font-black text-app-text uppercase tracking-wider">
              Tirage au Sort en Direct
            </h2>
            <div className="flex items-center justify-center gap-3 py-1">
              <div className="w-12 h-12 rounded-xl bg-white p-1 border border-slate-200 shadow-sm shrink-0 flex items-center justify-center">
                <PrizeImage src={prizes.raffle.image} alt={prizes.raffle.title} kind="raffle" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-app-text">
                  {prizes.raffle.title}
                  {prizes.raffle.value && <span className="text-primary font-mono"> • Valeur {prizes.raffle.value}</span>}
                </p>
                <p className="text-xs text-app-text-muted">{prizes.raffle.description}</p>
              </div>
            </div>
          </div>
          <RaffleSpinner
            state={raffle}
            participants={participants}
            candidates={eligibleForRaffle}
            onStartRaffle={() => startRaffle()}
            onResetRaffle={resetRaffle}
            readOnly={true}
          />
        </div>
      );
    }

    return (
      <div className="min-h-full h-full flex flex-col justify-between overflow-visible lg:overflow-hidden gap-2.5 sm:gap-3.5 kiosk-auto-scroll">
        {/* Corps central adaptatif occupant tout l'écran */}
        <div className="flex-1 min-h-0">
          {activeTracks.length === 0 ? (
            /* ================================================================ */
            /* ÉTAT REPOS : TABLEAU DES CHAMPIONS PRIORITAIRE + VITRINE DES PRIX */
            /* ================================================================ */
            <div className="h-full grid grid-cols-12 gap-3 sm:gap-4 items-stretch">
              {/* Colonne Principale (65% largeur) : Tableau des Champions & Podium Olympique */}
              <div className="col-span-12 lg:col-span-7 xl:col-span-8 min-h-[380px] lg:h-full flex flex-col min-h-0">
                <Leaderboard participants={participants} highlightId={lastSavedParticipantId} />
              </div>

              {/* Colonne Droite (35% largeur) : Appel au Défi & Vitrine des 2 Prix */}
              <div className="col-span-12 lg:col-span-5 xl:col-span-4 min-h-[380px] lg:h-full flex flex-col justify-between gap-3 min-h-0">
                {/* Carte Appel au Défi avec compteur d'inscriptions intégré */}
                <div className="bg-gradient-to-br from-primary/15 via-app-card to-app-card border-2 border-primary/50 p-4 sm:p-5 rounded-3xl shadow-xl text-center flex flex-col items-center justify-center shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/40 text-primary flex items-center justify-center mb-2 shadow-md shadow-primary/20">
                    <Timer size={24} className="animate-pulse" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-display font-black text-app-text uppercase tracking-tight">
                    Prêt pour le prochain départ ?
                  </h3>
                  <p className="text-xs sm:text-sm text-app-text-muted font-sans mt-0.5 max-w-xs leading-relaxed">
                    Présentez-vous à la table d'assemblage pour tenter d'établir le meilleur chrono !
                  </p>

                  {/* Badge Record du moment */}
                  {bestParticipant && (
                    <div className="mt-2.5 w-full py-1.5 px-3 rounded-2xl bg-primary/10 border border-primary/30 text-app-text flex items-center justify-center gap-2 shadow-sm">
                      <Trophy size={15} className="text-yellow-400 shrink-0" />
                      <span className="text-xs font-black uppercase tracking-wide truncate">
                        Record : <span className="font-mono text-sm underline text-primary">{formatTime(bestParticipant.timeMs!)}</span> ({bestParticipant.name})
                      </span>
                    </div>
                  )}

                  {/* Compteur intégré : Inscriptions du jour */}
                  <div className="mt-2.5 w-full py-1.5 px-3 rounded-2xl bg-app-card/80 border border-app-card-border flex items-center justify-between text-xs shadow-sm">
                    <span className="flex items-center gap-1.5 font-bold text-app-text">
                      <Users size={14} className="text-primary" />
                      <span>Inscriptions du jour</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 font-mono font-black text-xs shadow-sm">
                      {participants.length}
                    </span>
                  </div>
                </div>

                {/* Vitrine officielle des 2 Prix en jeu avec photos agrandies */}
                <div className="grid grid-cols-1 gap-2.5 flex-1 min-h-0">
                  {/* Prix #1 : Meilleur chrono */}
                  <div className="bg-gradient-to-br from-amber-500/10 via-app-card to-app-card border-2 border-amber-500/40 p-3 sm:p-3.5 rounded-3xl shadow-md flex items-center gap-3.5 relative overflow-hidden group">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl bg-white p-2 border border-slate-200/90 flex items-center justify-center shrink-0 shadow-md overflow-hidden">
                      <PrizeImage
                        src={prizes.best.image}
                        alt={prizes.best.title}
                        kind="best"
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/50 text-[9px] font-black uppercase font-display tracking-wider shadow-sm">
                          1er Prix
                        </span>
                        <span className="text-[10px] font-bold text-app-text-muted uppercase">Meilleur chrono</span>
                        {prizes.best.value && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/40 text-[9px] font-black font-mono">
                            Valeur {prizes.best.value}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm sm:text-base font-black text-app-text font-display uppercase tracking-tight mt-0.5 leading-tight truncate">
                        {prizes.best.title}
                      </h4>
                      <p className="text-[11px] text-app-text-muted mt-0.5 leading-snug line-clamp-2">
                        {prizes.best.description}
                      </p>
                    </div>
                  </div>

                  {/* Prix de participation : tirage au sort parmi tous les participants */}
                  <div className="bg-gradient-to-br from-purple-500/10 via-app-card to-app-card border-2 border-primary/50 p-3 sm:p-3.5 rounded-3xl shadow-md flex items-center gap-3.5 relative overflow-hidden group">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-2xl bg-white p-2 border border-slate-200/90 flex items-center justify-center shrink-0 shadow-md overflow-hidden">
                      <PrizeImage
                        src={prizes.raffle.image}
                        alt={prizes.raffle.title}
                        kind="raffle"
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-md bg-purple-500/25 text-purple-200 border border-purple-400/50 text-[9px] font-black uppercase font-display tracking-wider shadow-sm">
                          Tirage au sort
                        </span>
                        {prizes.raffle.value && (
                          <span className="px-1.5 py-0.2 rounded bg-primary/20 text-primary border border-primary/40 text-[9px] font-black font-mono">
                            Valeur {prizes.raffle.value}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm sm:text-base font-black text-app-text font-display uppercase tracking-tight mt-0.5 leading-tight truncate">
                        {prizes.raffle.title}
                      </h4>
                      <p className="text-[11px] text-app-text-muted mt-0.5 leading-snug line-clamp-2">
                        {prizes.raffle.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ================================================================ */
            /* ÉTAT EN COURSE : PISTES EN DIRECT (65%) + PODIUM & PRIX (35%)   */
            /* ================================================================ */
            <div className="h-full grid grid-cols-12 gap-3 sm:gap-4 items-stretch">
              {/* Colonne Gauche (65%) : Bannière Live + Grille Dynamique + Prochains Départs */}
              <div className="col-span-12 lg:col-span-7 xl:col-span-8 min-h-[360px] lg:h-full flex flex-col justify-between gap-2.5 min-h-0">
                {/* 1. Bannière d'en-tête Live */}
                <div className="bg-app-card border border-app-card-border px-3.5 py-2 rounded-2xl shadow-sm flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="relative flex h-3 w-3 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    <span className="font-display font-black text-xs sm:text-sm uppercase tracking-wider text-red-500 flex items-center gap-1.5 truncate">
                      <span>Course en direct</span>
                      <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-[10px] font-mono font-bold text-red-400">
                        {activeTracks.length} piste{activeTracks.length > 1 ? 's' : ''} active{activeTracks.length > 1 ? 's' : ''}
                      </span>
                    </span>
                  </div>

                  {bestParticipant ? (
                    <div className="flex items-center gap-1.5 shrink-0 bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-xl text-app-text shadow-sm">
                      <Trophy size={13} className="text-yellow-400 shrink-0" />
                      <span className="text-xs uppercase font-black tracking-wide">
                        Temps à battre : <span className="font-mono text-sm underline text-primary">{formatTime(bestParticipant.timeMs!)}</span>
                        <span className="text-[11px] font-bold text-app-text-muted hidden md:inline ml-1">({bestParticipant.name})</span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0 bg-primary/15 border border-primary/30 px-2.5 py-1 rounded-xl text-primary text-xs font-black uppercase">
                      <Sparkles size={13} />
                      <span>Établissez le 1er record !</span>
                    </div>
                  )}
                </div>

                {/* 2. Grille dynamique auto-adaptative selon le nombre de pistes actives (N) */}
                <div className="flex-1 min-h-0">
                  {/* N = 1 : 1 carte géante occupant toute la zone (effet duel contre la montre) */}
                  {activeTracks.length === 1 && (
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="w-full h-full max-w-4xl mx-auto">
                        <PublicTrackBlock
                          track={activeTracks[0]}
                          isSingle={true}
                          bestTimeMs={bestParticipant?.timeMs ?? null}
                          secondTimeMs={secondParticipant?.timeMs ?? null}
                          thirdTimeMs={thirdParticipant?.timeMs ?? null}
                        />
                      </div>
                    </div>
                  )}

                  {/* N = 2, 3 ou 4 : Grille 2 colonnes réactive et équilibrée */}
                  {activeTracks.length >= 2 && activeTracks.length <= 4 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full items-stretch">
                      {activeTracks.map((track) => (
                        <PublicTrackBlock
                          key={track.trackId}
                          track={track}
                          isSingle={false}
                          bestTimeMs={bestParticipant?.timeMs ?? null}
                          secondTimeMs={secondParticipant?.timeMs ?? null}
                          thirdTimeMs={thirdParticipant?.timeMs ?? null}
                        />
                      ))}

                      {/* N = 3 : 4e case invitation proactive pour combler le vide */}
                      {activeTracks.length === 3 && (
                        <div className="relative overflow-hidden p-4 rounded-3xl bg-gradient-to-br from-primary/15 via-app-card to-app-card border-2 border-dashed border-primary/50 flex flex-col items-center justify-center text-center shadow-md">
                          <div className="w-11 h-11 rounded-2xl bg-primary/20 text-primary border border-primary/40 flex items-center justify-center mb-1.5 shadow-sm">
                            <Zap size={22} className="animate-bounce text-primary" />
                          </div>
                          <span className="text-[10px] uppercase font-black tracking-widest text-primary font-display">
                            Prochain Départ
                          </span>
                          <h4 className="font-display font-black text-sm sm:text-base text-app-text uppercase mt-0.5">
                            Pistes 4 & 5 disponibles !
                          </h4>
                          <p className="text-xs text-app-text-muted mt-0.5 max-w-[200px]">
                            Présentez-vous à l'animateur pour participer à la prochaine vague !
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* N = 5 : 3 cartes en haut + 2 cartes centrées en bas */}
                  {activeTracks.length === 5 && (
                    <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 h-full items-stretch">
                      {activeTracks.slice(0, 3).map((track) => (
                        <div key={track.trackId} className="sm:col-span-2 h-full">
                          <PublicTrackBlock
                            track={track}
                            isSingle={false}
                            bestTimeMs={bestParticipant?.timeMs ?? null}
                            secondTimeMs={secondParticipant?.timeMs ?? null}
                            thirdTimeMs={thirdParticipant?.timeMs ?? null}
                          />
                        </div>
                      ))}
                      {activeTracks.slice(3, 5).map((track) => (
                        <div key={track.trackId} className="sm:col-span-3 h-full">
                          <PublicTrackBlock
                            track={track}
                            isSingle={false}
                            bestTimeMs={bestParticipant?.timeMs ?? null}
                            secondTimeMs={secondParticipant?.timeMs ?? null}
                            thirdTimeMs={thirdParticipant?.timeMs ?? null}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Bandeau File d'attente / Prochains Départs */}
                {waitingForLiveRace.length > 0 ? (
                  <div className="bg-app-card border border-app-card-border px-3.5 py-1.5 rounded-2xl shadow-sm flex items-center gap-2.5 shrink-0 overflow-hidden">
                    <div className="flex items-center gap-1.5 text-primary shrink-0 font-display font-black text-xs uppercase tracking-wide">
                      <Clock size={13} className="shrink-0 animate-pulse" />
                      <span>Prochains au départ :</span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
                      {waitingForLiveRace.slice(0, 6).map((wp, idx) => (
                        <span
                          key={wp.id}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-app-input border border-app-card-border text-xs font-bold text-app-text shadow-sm"
                        >
                          <span className="text-[10px] font-mono text-primary font-black">#{idx + 1}</span>
                          <span className="truncate max-w-[120px]">{wp.name}</span>
                        </span>
                      ))}
                      {waitingForLiveRace.length > 6 && (
                        <span className="text-[10px] text-app-text-muted font-bold shrink-0">
                          +{waitingForLiveRace.length - 6} autre{waitingForLiveRace.length - 6 > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-app-card border border-app-card-border px-3.5 py-1.5 rounded-2xl shadow-sm flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-primary font-display font-black text-xs uppercase">
                      <Zap size={13} className="animate-bounce" />
                      <span>Pistes disponibles pour la prochaine vague !</span>
                    </div>
                    <span className="text-xs text-app-text-muted font-sans font-medium">
                      Présentez-vous à l'animateur pour inscrire votre nom et participer au tirage !
                    </span>
                  </div>
                )}
              </div>

              {/* Colonne Droite (35%) : Tableau des Champions + Vitrine permanente des 2 Prix */}
              <div className="col-span-12 lg:col-span-5 xl:col-span-4 min-h-[360px] lg:h-full flex flex-col gap-2.5 min-h-0">
                {/* Tableau des Champions (Podium compacté pour cohabiter harmonieusement avec les 2 prix) */}
                <div className="flex-1 min-h-[190px] flex flex-col">
                  <Leaderboard participants={participants} highlightId={lastSavedParticipantId} compact={true} />
                </div>

                {/* Vitrine officielle permanente des 2 Prix (côte à côte en 2 colonnes sans superposition) */}
                <div className="grid grid-cols-2 gap-2.5 shrink-0">
                  <PrizeShowcaseCard
                    badgeText="1er Prix"
                    badgeClass="bg-amber-500/20 text-amber-300 border border-amber-400/50"
                    tag={prizes.best.value || undefined}
                    title={prizes.best.shortTitle || prizes.best.title}
                    imageSrc={prizes.best.image}
                    imageAlt={prizes.best.title}
                    imageKind="best"
                    description={prizes.best.description}
                    gradientClass="from-amber-500/10"
                    borderClass="border-amber-500/40"
                  />
                  <PrizeShowcaseCard
                    badgeText="Tirage"
                    badgeClass="bg-purple-500/25 text-purple-200 border border-purple-400/50"
                    tag={prizes.raffle.value || undefined}
                    title={prizes.raffle.shortTitle || prizes.raffle.title}
                    imageSrc={prizes.raffle.image}
                    imageAlt={prizes.raffle.title}
                    imageKind="raffle"
                    description={prizes.raffle.description}
                    gradientClass="from-purple-500/10"
                    borderClass="border-primary/50"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Ruban Défilant Continu (Ticker de tous les participants et leurs scores) */}
        <PublicParticipantsTicker participants={participants} eventName={event.name} prizes={prizes} />
      </div>
    );
  }

  // ============================================================================
  // RENDU DE L'ÉCRAN ORGANISATEUR (ADMIN / ARBITRAGE)
  // ============================================================================
  return (
    <div className="space-y-3">
      {/* Bandeau de contrôle du tirage au sort lorsqu'il est actif */}
      {raffle.status !== 'idle' && (
        <div className="bg-primary/10 border border-primary/30 p-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            <Sparkles className="text-primary animate-spin shrink-0" size={18} />
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-bold text-primary tracking-widest block leading-none">
                {raffle.status === 'spinning'
                  ? "Tirage en cours sur l'écran public"
                  : 'Gagnant sélectionné sur l\'écran public'}
              </span>
              <span className="font-bold text-app-text text-xs block mt-0.5 truncate">
                {raffle.status === 'spinning' ? (
                  <span className="flex items-center gap-1.5 text-app-text-muted">
                    Défilement :{' '}
                    <span className="font-mono text-primary font-black animate-pulse">
                      {raffleDisplayValue}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-primary font-black text-sm">
                    🏆 {raffleDisplayValue}
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full sm:w-auto">
          {raffle.status === 'celebrating' && (
            <button
              onClick={() => startRaffle(true)}
              disabled={eligibleForRaffle.length === 0}
              title="Marquer cette personne absente et tirer un autre nom"
              className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-app-input border border-app-card-border text-xs font-bold font-display uppercase text-app-text hover:border-primary disabled:opacity-40 transition cursor-pointer"
            >
              Absent ? Retirer un autre nom
            </button>
          )}
          <button
            onClick={resetRaffle}
            className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-red-950/60 border border-red-900/60 text-xs font-bold font-display uppercase text-red-300 hover:text-white hover:bg-red-900 transition cursor-pointer"
          >
            Fermer le tirage et revenir aux chronos
          </button>
          </div>
        </div>
      )}

      <PrizeEditorModal
        isOpen={isPrizeEditorOpen}
        prizes={prizes}
        onClose={() => setIsPrizeEditorOpen(false)}
        onSave={handleSavePrizes}
      />

      {/* Cockpit 3 Colonnes Zéro-Scroll */}
      <div
        className={`grid grid-cols-12 gap-3.5 items-start transition-all duration-500 ${
          raffle.status === 'spinning' ? 'opacity-40 pointer-events-none scale-[0.99]' : ''
        }`}
      >
        {/* ================================================================ */}
        {/* COLONNE 1 (GAUCHE ~25%) : Inscription & Tirage au sort           */}
        {/* ================================================================ */}
        <div className="col-span-12 lg:col-span-3 space-y-3">
          {/* Formulaire Nouveau Participant compacté */}
          <div className="bg-app-card border border-app-card-border p-3.5 rounded-2xl shadow-sm">
            <h3 className="text-xs font-bold font-display text-app-text uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <UserPlus size={15} className="text-primary" />
              <span>Nouveau Participant</span>
            </h3>

            <form onSubmit={(e) => addParticipant(e, false)} className="space-y-2">
              <div className="space-y-0.5">
                <label className="text-[9px] font-bold uppercase text-app-text-muted block">
                  Nom complet *
                </label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2 text-app-text-muted" size={12} />
                  <input
                    type="text"
                    required
                    value={newParticipantName}
                    onChange={(e) => setNewParticipantName(e.target.value)}
                    placeholder="Jean Tremblay"
                    className="w-full bg-app-input border border-app-input-border rounded-xl pl-8 pr-2.5 py-1.5 text-app-text text-xs focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              {/* Courriel et Code Postal sur la même ligne (responsive mobile) */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                <div className="sm:col-span-3 space-y-0.5">
                  <label className="text-[9px] font-bold uppercase text-app-text-muted block">
                    Courriel
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-2 text-app-text-muted" size={12} />
                    <input
                      type="email"
                      value={newParticipantEmail}
                      onChange={(e) => setNewParticipantEmail(e.target.value)}
                      placeholder="jean@email.com"
                      className="w-full bg-app-input border border-app-input-border rounded-xl pl-7 pr-2 py-1.5 text-app-text text-xs focus:outline-none focus:border-primary transition"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2 space-y-0.5">
                  <label className="text-[9px] font-bold uppercase text-app-text-muted block">
                    Code postal
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-2 top-2 text-app-text-muted" size={12} />
                    <input
                      type="text"
                      value={newParticipantPostal}
                      onChange={(e) => setNewParticipantPostal(e.target.value)}
                      placeholder="H2W 1Y4"
                      className="w-full bg-app-input border border-app-input-border rounded-xl pl-6 pr-2 py-1.5 text-app-text text-xs focus:outline-none focus:border-primary transition uppercase"
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-1.5 text-[10px] leading-snug text-app-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={newParticipantConsent}
                  onChange={(e) => setNewParticipantConsent(e.target.checked)}
                  className="mt-0.5 accent-[var(--color-primary)] cursor-pointer"
                />
                <span>
                  La personne accepte que son courriel et son code postal servent uniquement à la joindre pour ce concours.
                  {(newParticipantEmail.trim() || newParticipantPostal.trim()) && !newParticipantConsent && (
                    <span className="text-amber-500 font-bold"> Requis si un courriel ou un code postal est saisi.</span>
                  )}
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="submit"
                  className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-app-input border border-app-card-border text-app-text hover:text-white hover:border-primary text-xs font-bold font-display uppercase tracking-wider transition cursor-pointer"
                  title="Inscrire [Entrée]"
                  aria-label="Inscrire le participant"
                >
                  <UserPlus size={14} />
                  <span>Inscrire</span>
                  <span className="text-[9px] text-app-text-muted font-mono hidden sm:inline">[↵]</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => addParticipant(e as any, true)}
                  className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-primary text-secondary font-black font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 transition cursor-pointer shadow-sm"
                  title="Inscrire et assigner directement à la première piste libre"
                  aria-label="Inscrire et assigner à la première piste libre"
                >
                  <Play size={14} fill="currentColor" />
                  <span>+ Piste libre</span>
                </button>
              </div>
            </form>
          </div>

          {/* Bloc Tirage au sort unifié */}
          <div className="bg-app-card border border-app-card-border p-3.5 rounded-2xl shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-primary font-display flex items-center gap-1.5">
                <Gift size={13} /> Tirage au Sort
              </span>
              <span className="text-[10px] font-mono text-app-text-muted" title="Participants pas encore tirés au sort">
                {eligibleForRaffle.length} éligible{eligibleForRaffle.length > 1 ? 's' : ''} / {participants.length}
              </span>
            </div>

            <button
              onClick={() => startRaffle()}
              disabled={eligibleForRaffle.length === 0}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-primary to-lime-400 text-secondary font-black font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer shadow-md"
            >
              <Sparkles size={13} />
              <span>Lancer le tirage ({eligibleForRaffle.length})</span>
            </button>

            {/* Dernier tirage et historique */}
            {raffleDraws.length > 0 ? (
              <div className="space-y-1.5">
                {(() => {
                  const last = raffleDraws[raffleDraws.length - 1];
                  return (
                    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/30 space-y-1 relative overflow-hidden">
                      <span className="text-[8px] uppercase font-black text-primary tracking-wider block">
                        {last.status === 'gagnant' ? '🏆 Dernier gagnant du tirage' : 'Dernier tiré (absent)'}
                      </span>
                      <h4 className={`text-xs font-bold font-display truncate ${last.status === 'gagnant' ? 'text-app-text' : 'text-app-text-muted line-through'}`}>
                        {last.name}
                      </h4>
                      <div className="text-[9px] text-app-text-muted space-y-0.5 font-sans">
                        {last.email && <p className="truncate">Courriel : {last.email}</p>}
                        {last.postalCode && <p>Code postal : {last.postalCode}</p>}
                        <p className="text-[8px] text-app-text-muted/70 pt-0.5">
                          Tiré à {new Date(last.at).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {last.status === 'gagnant' && (
                        <button
                          type="button"
                          onClick={() => startRaffle(true)}
                          disabled={eligibleForRaffle.length === 0}
                          title="Marquer cette personne absente et tirer un autre nom"
                          className="w-full mt-1 py-1 px-2 rounded-lg bg-app-input border border-app-card-border text-[9px] font-bold uppercase text-app-text-muted hover:text-app-text hover:border-primary disabled:opacity-40 transition cursor-pointer"
                        >
                          Absent ? Retirer un autre nom
                        </button>
                      )}
                    </div>
                  );
                })()}

                {raffleDraws.length > 1 && (
                  <ul className="text-[9px] font-sans space-y-0.5 max-h-24 overflow-y-auto pr-1">
                    {raffleDraws
                      .slice(0, -1)
                      .reverse()
                      .map((d) => (
                        <li key={`${d.participantId}-${d.at}`} className="flex items-center justify-between gap-2 text-app-text-muted">
                          <span className={`truncate ${d.status === 'absent' ? 'line-through' : 'text-app-text'}`}>{d.name}</span>
                          <span className="shrink-0">{d.status === 'absent' ? 'absent' : 'gagnant'}</span>
                        </li>
                      ))}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={clearRaffleHistory}
                  className="w-full text-[9px] text-app-text-muted hover:text-red-400 underline cursor-pointer"
                >
                  Effacer l'historique des tirages
                </button>
              </div>
            ) : (
              <p className="text-[9px] text-app-text-muted text-center font-sans truncate">
                Prix : {prizes.raffle.title}
              </p>
            )}

            <button
              type="button"
              onClick={() => setIsPrizeEditorOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-app-input border border-app-card-border text-app-text-muted hover:text-app-text hover:border-primary text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
            >
              <Settings2 size={12} />
              <span>Modifier les prix</span>
            </button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* COLONNE 2 (CENTRE ~50%) : Stat-bar KPIs + Les 5 Pistes           */}
        {/* ================================================================ */}
        <div className="col-span-12 lg:col-span-6 space-y-3">
          {/* Bandeau de statistiques compact (stat-bar en 1 ligne) */}
          <div className="bg-app-card border border-app-card-border px-3.5 py-2 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-2.5 text-xs">
            {/* Participants */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                <Users size={13} />
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-app-text-muted block leading-none">Participants</span>
                <span className="text-xs font-display font-black text-app-text">{participants.length}</span>
              </div>
            </div>

            <div className="hidden sm:block h-5 w-px bg-app-card-border" />

            {/* Scores validés */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <Check size={13} />
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-app-text-muted block leading-none">Scores validés</span>
                <span className="text-xs font-display font-black text-app-text">
                  {rankedParticipants.length}{' '}
                  <span className="text-[9px] font-sans text-app-text-muted font-normal">/ {participants.length}</span>
                </span>
              </div>
            </div>

            <div className="hidden sm:block h-5 w-px bg-app-card-border" />

            {/* Record actuel */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Trophy size={13} />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] uppercase font-bold text-app-text-muted block leading-none">Record actuel</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-mono font-black text-primary">
                    {bestParticipant ? formatTime(bestParticipant.timeMs!) : '--:--.--'}
                  </span>
                  {bestParticipant && (
                    <span className="text-[9px] text-app-text-muted font-medium truncate max-w-[80px]">
                      ({bestParticipant.name})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden sm:block h-5 w-px bg-app-card-border" />

            {/* Temps moyen */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                <Clock size={13} />
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-app-text-muted block leading-none">Temps moyen</span>
                <span className="text-xs font-mono font-bold text-app-text">
                  {averageTimeMs ? formatTime(averageTimeMs) : '--:--.--'}
                </span>
              </div>
            </div>
          </div>

          {/* Grille des 5 pistes d'arbitrage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Object.values(tracks).map((track, idx) => {
              const assignableParticipants = participants.filter(
                (p) => !Object.values(tracks).some((t) => t.participantId === p.id)
              );

              // La 5e piste s'étale sur les 2 colonnes pour un équilibre parfait
              const isFifthTrack = Object.values(tracks).length === 5 && idx === 4;

              return (
                <div key={track.trackId} className={isFifthTrack ? 'sm:col-span-2' : ''}>
                  <AdminTrackBlock
                    track={track}
                    assignableParticipants={assignableParticipants}
                    bestTimeMs={bestParticipant?.timeMs ?? null}
                    onAssign={(pId) => handleAssignParticipant(track.trackId, pId)}
                    onStart={() => handleStartTimer(track.trackId)}
                    onStop={() => handleStopTimer(track.trackId)}
                    onReset={() => handleResetTimer(track.trackId)}
                    onAdjustTime={(deltaMs) => handleAdjustTrackTime(track.trackId, deltaMs)}
                    onSave={() => handleSaveTrackTime(track.trackId)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* ================================================================ */}
        {/* COLONNE 3 (DROITE ~25%) : File d'attente & Classement Unifiés    */}
        {/* ================================================================ */}
        <div className="col-span-12 lg:col-span-3">
          <div className="bg-app-card border border-app-card-border p-3.5 rounded-2xl shadow-sm space-y-2.5 flex flex-col h-full min-h-[350px] lg:max-h-[calc(100vh-140px)]">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-xs font-bold font-display text-app-text uppercase tracking-wider flex items-center gap-1.5">
                <span>File & Classement</span>
                <span className="text-[10px] font-mono font-bold text-primary px-1.5 py-0.2 rounded-md bg-primary/15">
                  {filteredParticipants.length}/{participants.length}
                </span>
              </h3>
            </div>

            {/* Barre de recherche et 3 onglets de filtres */}
            <div className="space-y-1.5 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 text-app-text-muted" size={12} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher nom, courriel..."
                  className="w-full bg-app-input border border-app-input-border rounded-xl pl-7 pr-2.5 py-1 text-app-text text-xs focus:outline-none focus:border-primary transition"
                />
              </div>
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-app-input border border-app-card-border">
                {(['waiting', 'ranked', 'all'] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    onClick={() => setParticipantFilter(filterKey)}
                    className={`flex-1 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition cursor-pointer ${
                      participantFilter === filterKey
                        ? 'bg-primary text-secondary font-black shadow-sm'
                        : 'text-app-text-muted hover:text-app-text'
                    }`}
                  >
                    {filterKey === 'waiting'
                      ? 'En attente'
                      : filterKey === 'ranked'
                        ? 'Classés'
                        : 'Tous'}
                  </button>
                ))}
              </div>
            </div>

            {/* Liste déroulante interne uniquement */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[350px]">
              {filteredParticipants.length === 0 ? (
                <p className="text-xs text-app-text-muted text-center py-8 font-sans">
                  Aucun participant correspondant.
                </p>
              ) : (
                filteredParticipants.map((p) => {
                  const hasTime = typeof p.timeMs === 'number' && p.timeMs > 0;
                  const assignedTrack = Object.values(tracks).find((t) => t.participantId === p.id);
                  const isAssigned = Boolean(assignedTrack);
                  const isManualEditing = manualScoreParticipantId === p.id;

                  // Rang calculé parmi les classés
                  const rankIndex = hasTime
                    ? rankedParticipants.findIndex((rp) => rp.id === p.id) + 1
                    : null;

                  return (
                    <div
                      key={p.id}
                      className={`p-2 rounded-xl border transition space-y-1 ${
                        isAssigned
                          ? 'bg-primary/10 border-primary text-app-text'
                          : hasTime
                            ? 'bg-app-input/90 border-app-card-border text-app-text'
                            : 'bg-app-card/60 border-app-card-border/60 text-app-text-muted'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {rankIndex !== null ? (
                              <span
                                className={`font-mono font-black text-[9px] px-1.5 py-0.2 rounded ${
                                  rankIndex === 1
                                    ? 'bg-amber-400 text-slate-950'
                                    : rankIndex === 2
                                      ? 'bg-slate-200 text-slate-950'
                                      : rankIndex === 3
                                        ? 'bg-amber-700 text-amber-100'
                                        : 'bg-primary/20 text-primary font-bold'
                                }`}
                              >
                                #{rankIndex}
                              </span>
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                            )}
                            <h4 className="text-xs font-bold text-app-text truncate">{p.name}</h4>
                          </div>
                          <div className="text-[10px] font-sans mt-0.5">
                            {isAssigned ? (
                              <span className="text-primary font-bold">
                                ⏱️ En course (Piste {assignedTrack?.trackId})
                              </span>
                            ) : hasTime ? (
                              <span className="font-mono text-primary font-bold">
                                ✓ {formatTime(p.timeMs!)}
                              </span>
                            ) : (
                              <span className="text-app-text-muted italic">En attente</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          {!isAssigned && (
                            <button
                              onClick={() => handleQuickSendToTrack(p.id)}
                              title={
                                hasTime
                                  ? 'Nouvelle tentative (envoyer sur piste libre)'
                                  : 'Envoyer sur une piste libre'
                              }
                              className="p-1 rounded-lg bg-primary/15 text-primary hover:bg-primary hover:text-secondary transition cursor-pointer"
                            >
                              <Play size={11} fill="currentColor" />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              if (isManualEditing) {
                                setManualScoreParticipantId(null);
                              } else {
                                setManualScoreParticipantId(p.id);
                                setManualScoreInput(hasTime ? formatTime(p.timeMs!) : '');
                              }
                            }}
                            title="Saisir ou corriger le temps manuellement"
                            className="p-1 rounded-lg text-app-text-muted hover:text-app-text hover:bg-app-card-border/50 transition cursor-pointer"
                          >
                            <Edit3 size={11} />
                          </button>

                          {hasTime && !isAssigned && (
                            <button
                              onClick={() => handleResetParticipantScore(p.id)}
                              title="Réinitialiser le score"
                              className="p-1 rounded-lg text-app-text-muted hover:text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                            >
                              <RotateCcw size={11} />
                            </button>
                          )}

                          <button
                            onClick={() => deleteParticipant(p.id)}
                            disabled={isAssigned}
                            title="Supprimer le participant"
                            className="p-1 rounded-lg text-app-text-muted hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      {/* Zone de saisie manuelle de score inline */}
                      {isManualEditing && (
                        <div className="pt-1.5 border-t border-app-card-border flex items-center gap-1">
                          <input
                            type="text"
                            value={manualScoreInput}
                            onChange={(e) => setManualScoreInput(e.target.value)}
                            placeholder="01:24.50"
                            className="flex-1 bg-app-input border border-primary rounded-lg px-2 py-0.5 text-app-text font-mono text-xs focus:outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const ms = parseTimeInputToMs(manualScoreInput);
                                if (ms) handleUpdateScoreManually(p.id, ms);
                                else showToast('Format attendu : MM:SS.cc ou secondes', 'warning');
                              }
                              if (e.key === 'Escape') setManualScoreParticipantId(null);
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              const ms = parseTimeInputToMs(manualScoreInput);
                              if (ms) handleUpdateScoreManually(p.id, ms);
                              else showToast('Format attendu : MM:SS.cc ou secondes', 'warning');
                            }}
                            className="px-2 py-0.5 rounded-lg bg-primary text-secondary font-bold text-[9px] uppercase cursor-pointer"
                          >
                            OK
                          </button>
                          <button
                            onClick={() => setManualScoreParticipantId(null)}
                            className="p-0.5 rounded-lg text-app-text-muted hover:text-app-text cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPOSANT : Bloc de Piste de l'Arbitre (Admin)
// ============================================================================
interface AdminTrackBlockProps {
  track: TrackState;
  assignableParticipants: Participant[];
  bestTimeMs: number | null;
  onAssign: (pId: string | null) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onAdjustTime: (deltaMs: number) => void;
  onSave: () => void;
}

function AdminTrackBlock({
  track,
  assignableParticipants,
  bestTimeMs,
  onAssign,
  onStart,
  onStop,
  onReset,
  onAdjustTime,
  onSave
}: AdminTrackBlockProps) {
  const waitingParticipants = assignableParticipants
    .filter((p) => p.timeMs === null || p.timeMs <= 0)
    .sort((a, b) => a.registeredAt - b.registeredAt);
  const retryParticipants = assignableParticipants.filter(
    (p) => typeof p.timeMs === 'number' && p.timeMs > 0
  );

  // Chronométrage interne fluide et ultra-réactif
  const [time, setTime] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (track.isRunning && track.startTime !== null) {
      const tick = () => {
        setTime(networkManager.now() - track.startTime! + track.elapsedBeforeStart);
      };
      tick();
      intervalRef.current = window.setInterval(tick, 10);
    } else {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setTime(track.elapsedBeforeStart);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [track.isRunning, track.startTime, track.elapsedBeforeStart]);

  const hasElapsed = track.isRunning || time > 0;

  // ==========================================================================
  // ÉTAT 1 : PISTE LIBRE (Aucun participant) - Ultra-compact
  // ==========================================================================
  if (!track.participantId) {
    return (
      <div className="relative overflow-hidden p-3 rounded-2xl bg-app-card/60 border-2 border-dashed border-purple-800/40 hover:border-purple-600/60 transition-all flex flex-col justify-between gap-2 shadow-sm min-h-[92px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black font-display text-primary uppercase">
              Piste {track.trackId}
            </span>
            <span className="text-[9px] px-2 py-0.2 rounded-full bg-app-input text-app-text-muted border border-app-card-border font-bold uppercase">
              Libre
            </span>
          </div>
          <span className="text-[10px] text-app-text-muted flex items-center gap-1">
            <User size={11} />
            <span>En attente</span>
          </span>
        </div>

        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onAssign(e.target.value);
          }}
          className="w-full bg-app-input border border-app-input-border rounded-xl px-2.5 py-1.5 text-app-text text-xs focus:outline-none focus:border-primary transition cursor-pointer"
        >
          <option value="" disabled>
            Attribuer un participant à la Piste {track.trackId}...
          </option>
          {waitingParticipants.length > 0 && (
            <optgroup label="En attente (1er passage)">
              {waitingParticipants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {retryParticipants.length > 0 && (
            <optgroup label="Déjà classés (Nouvelle tentative)">
              {retryParticipants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Record : {formatTime(p.timeMs!)})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    );
  }

  // ==========================================================================
  // ÉTAT 2 : PRÊT AU DÉPART (Participant assigné, chrono non démarré)
  // ==========================================================================
  if (!track.isRunning && time === 0) {
    return (
      <div className="relative overflow-hidden p-3 rounded-2xl bg-app-card border-2 border-amber-500/60 shadow-md shadow-amber-500/5 transition-all flex flex-col justify-between gap-2 min-h-[120px]">
        {/* Faisceau lumineux ambre */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black font-display text-primary uppercase">
              Piste {track.trackId}
            </span>
            <span className="text-[9px] px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/40 font-bold uppercase">
              Prêt au départ
            </span>
          </div>

          <button
            onClick={() => onAssign(null)}
            className="text-[9px] px-2 py-0.5 rounded bg-app-input text-app-text-muted hover:text-white border border-app-card-border cursor-pointer transition"
          >
            Libérer
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-[9px] uppercase font-bold text-app-text-muted block leading-none mb-0.5">
              Participant
            </span>
            <h4 className="font-extrabold text-app-text text-sm sm:text-base font-display uppercase truncate">
              {track.participantName}
            </h4>
          </div>
          <span className="font-mono font-bold text-base text-app-text-muted tabular-nums">
            00:00.00
          </span>
        </div>

        <button
          onClick={onStart}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary text-secondary font-black font-display uppercase tracking-wider text-xs hover:scale-[1.01] active:scale-95 transition cursor-pointer shadow-md shadow-primary/20"
        >
          <Play size={13} fill="currentColor" />
          <span>Démarrer le chronomètre</span>
        </button>
      </div>
    );
  }

  // ==========================================================================
  // ÉTAT 3 : EN COURSE (Chrono actif) ou ARRÊTÉ AVEC TEMPS EN ATTENTE DE VALIDATION
  // ==========================================================================
  return (
    <div
      className={`relative overflow-hidden p-3 rounded-2xl bg-app-card border-2 shadow-lg transition-all flex flex-col justify-between gap-2 ${
        track.isRunning
          ? 'border-primary ring-2 ring-primary/20 shadow-primary/10'
          : 'border-emerald-500/70 shadow-emerald-500/10'
      }`}
    >
      {/* Faisceau lumineux supérieur */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 transition-all duration-500 ${
          track.isRunning
            ? 'bg-gradient-to-r from-primary via-emerald-400 to-primary animate-pulse'
            : 'bg-emerald-500'
        }`}
      />

      {/* En-tête de piste */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-black font-display text-primary uppercase">
            Piste {track.trackId}
          </span>
          {track.isRunning ? (
            <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.2 rounded-full bg-primary/20 text-primary border border-primary/40 font-bold uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
              <span>En course</span>
            </span>
          ) : (
            <span className="text-[9px] px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold uppercase">
              Temps arrêté
            </span>
          )}
        </div>

        <h4 className="font-bold text-app-text text-xs font-display uppercase truncate max-w-[130px]">
          {track.participantName}
        </h4>
      </div>

      {/* Grand Chronomètre digital */}
      <div
        className={`stopwatch-lcd py-1 px-3 rounded-xl bg-app-input border font-mono font-black text-2xl sm:text-3xl tracking-wider tabular-nums text-center shadow-inner ${
          track.isRunning
            ? 'text-primary border-primary/40'
            : 'text-emerald-400 border-emerald-500/40'
        }`}
      >
        {formatTime(time)}
      </div>

      {/* Barre d'ajustements / pénalités rapides */}
      <div className="flex items-center justify-between gap-1 text-[9px]">
        <span className="font-bold text-app-text-muted uppercase">Pénalités :</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onAdjustTime(-5000)}
            disabled={!hasElapsed}
            title="Retirer 5 secondes (bonus)"
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg bg-emerald-950/50 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/60 font-mono font-bold disabled:opacity-30 cursor-pointer transition"
          >
            <MinusCircle size={10} />
            <span>5s</span>
          </button>
          <button
            type="button"
            onClick={() => onAdjustTime(5000)}
            disabled={!hasElapsed}
            title="Ajouter 5 secondes de pénalité"
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg bg-amber-950/50 border border-amber-700/40 text-amber-300 hover:bg-amber-900/60 font-mono font-bold disabled:opacity-30 cursor-pointer transition"
          >
            <PlusCircle size={10} />
            <span>+5s</span>
          </button>
          <button
            type="button"
            onClick={() => onAdjustTime(10000)}
            disabled={!hasElapsed}
            title="Ajouter 10 secondes de pénalité"
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg bg-red-950/50 border border-red-700/40 text-red-300 hover:bg-red-900/60 font-mono font-bold disabled:opacity-30 cursor-pointer transition"
          >
            <PlusCircle size={10} />
            <span>+10s</span>
          </button>
        </div>
      </div>

      {/* Boutons d'actions selon l'état */}
      <div className="flex items-center gap-1.5 pt-0.5">
        {track.isRunning ? (
          <>
            <button
              onClick={onStop}
              title="Mettre en pause le chrono"
              className="px-2.5 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text-muted hover:text-white hover:bg-red-900/40 transition cursor-pointer"
            >
              <Square size={13} />
            </button>
            <button
              onClick={onSave}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black font-display uppercase tracking-wider text-xs hover:scale-[1.01] active:scale-95 transition cursor-pointer shadow-md shadow-red-600/20"
            >
              <Check size={13} />
              <span>Arrêter & Valider ({formatTime(time)})</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onStart}
              title="Reprendre le chronomètre"
              className="p-2 rounded-xl bg-primary/20 text-primary hover:bg-primary hover:text-secondary border border-primary/30 transition cursor-pointer"
            >
              <Play size={13} fill="currentColor" />
            </button>
            <button
              onClick={onReset}
              title="Réinitialiser à 00:00.00"
              className="p-2 rounded-xl bg-app-input text-app-text-muted hover:text-amber-400 border border-app-card-border transition cursor-pointer"
            >
              <RotateCcw size={13} />
            </button>
            <button
              onClick={onSave}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-secondary font-black font-display uppercase tracking-wider text-xs hover:scale-[1.01] active:scale-95 transition cursor-pointer shadow-md shadow-primary/20"
            >
              <Check size={13} />
              <span>Valider le score</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPOSANT : Bloc de Piste de l'Écran Public
// ============================================================================
interface PublicTrackBlockProps {
  track: TrackState;
  heightClass?: string;
  isSingle?: boolean;
  bestTimeMs?: number | null;
  secondTimeMs?: number | null;
  thirdTimeMs?: number | null;
}

function PublicTrackBlock({
  track,
  heightClass = 'h-full',
  isSingle = false,
  bestTimeMs = null,
  secondTimeMs = null,
  thirdTimeMs = null
}: PublicTrackBlockProps) {
  const [time, setTime] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (track.isRunning && track.startTime !== null) {
      const tick = () => {
        setTime(networkManager.now() - track.startTime! + track.elapsedBeforeStart);
      };
      tick();
      intervalRef.current = window.setInterval(tick, 10);
    } else {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setTime(track.elapsedBeforeStart);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [track.isRunning, track.startTime, track.elapsedBeforeStart]);

  const hasBestRecord = typeof bestTimeMs === 'number' && bestTimeMs > 0;
  const showPaceGauge = hasBestRecord && (track.isRunning || time > 0);
  const paceRatio = hasBestRecord ? time / bestTimeMs! : 0;
  const pacePercent = Math.min(100, Math.max(0, paceRatio * 100));

  // ========================================================================
  // 3 PHASES VISUELLES DYNAMIQUES DE COURSE
  // ========================================================================
  let borderClass = 'border-primary shadow-primary/20 ring-2 ring-primary/20';
  let beamClass = 'bg-gradient-to-r from-primary via-emerald-400 to-primary animate-pulse';
  let digitsClass = 'text-primary stopwatch-digits-running';
  let paceBarColor = 'bg-primary shadow-sm shadow-primary/30';
  let paceLabel = 'En route vers le record 🏆';

  if (!hasBestRecord) {
    paceLabel = 'En route pour établir le 1er record ! ⚡';
  } else if (paceRatio >= 1) {
    // Phase 3 : Record 1re place dépassé -> Objectif 2e ou 3e place (Podium) & Tirage au sort !
    borderClass = 'border-purple-500 shadow-purple-500/20 ring-2 ring-purple-500/30';
    beamClass = 'bg-gradient-to-r from-purple-500 via-indigo-400 to-primary';
    digitsClass = 'text-purple-300 dark:text-purple-200';
    paceBarColor = 'bg-gradient-to-r from-purple-500 to-primary';

    if (secondTimeMs && time < secondTimeMs) {
      paceLabel = `En course pour la 2e place (${formatTime(secondTimeMs)}) 🥈 & Tirage 🎁`;
    } else if (thirdTimeMs && time < thirdTimeMs) {
      paceLabel = `En course pour le Podium 3e place (${formatTime(thirdTimeMs)}) 🥉 & Tirage 🎁`;
    } else {
      paceLabel = 'En course pour le Podium & Tirage au sort 🎁';
    }
  } else if (paceRatio >= 0.8) {
    // Phase 2 : Zone critique (80% à 100% du record)
    borderClass = 'border-amber-400 shadow-amber-500/25 ring-2 ring-amber-400/40';
    beamClass = 'bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 animate-pulse';
    digitsClass = 'text-amber-400';
    paceBarColor = 'bg-amber-400 animate-pulse';
    const remainingSec = Math.max(0, (bestTimeMs! - time) / 1000).toFixed(1);
    paceLabel = `Zone critique du record ⚡ - Moins de ${remainingSec}s !`;
  }

  return (
    <div
      className={`relative overflow-hidden p-4 sm:p-5 rounded-3xl bg-app-card border shadow-lg flex flex-col justify-between ${heightClass} ${
        track.isRunning ? borderClass : 'border-app-card-border'
      }`}
    >
      {/* Faisceau lumineux supérieur */}
      <div
        className={`absolute top-0 left-0 right-0 h-1.5 transition-all duration-500 ${
          track.isRunning ? beamClass : 'bg-gradient-to-r from-primary/30 to-purple-600/30'
        }`}
      />

      {/* En-tête de la carte */}
      <div className="flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <span className="text-[10px] sm:text-xs uppercase font-black text-primary tracking-widest font-sans flex items-center gap-1.5">
            <Zap size={12} className={track.isRunning ? 'animate-bounce text-primary' : ''} />
            Piste {track.trackId}
          </span>
          <h3
            className={`font-display font-black uppercase text-app-text truncate mt-0.5 leading-tight ${
              isSingle ? 'text-3xl sm:text-5xl lg:text-6xl' : 'text-lg sm:text-2xl md:text-3xl'
            }`}
          >
            {track.participantName}
          </h3>
        </div>

        {track.isRunning ? (
          <span className="text-[10px] sm:text-xs px-3 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 font-black uppercase animate-pulse font-sans shrink-0">
            En direct
          </span>
        ) : (
          <span className="text-[10px] sm:text-xs px-2.5 py-1 rounded-full bg-app-input text-app-text-muted border border-app-card-border font-bold uppercase font-sans shrink-0">
            Prêt / Arrêté
          </span>
        )}
      </div>

      {/* Zone Chronomètre Géant LCD */}
      <div className="my-auto py-2 space-y-2">
        <div
          className={`stopwatch-lcd py-2 sm:py-3.5 px-4 rounded-2xl bg-app-input border border-primary/30 font-mono font-black tracking-wider tabular-nums text-center shadow-inner flex items-center justify-center ${
            isSingle
              ? 'text-6xl sm:text-7xl md:text-8xl lg:text-9xl'
              : 'text-4xl sm:text-5xl md:text-6xl lg:text-7xl'
          }`}
        >
          <span className={track.isRunning ? digitsClass : 'text-app-text stopwatch-digits-idle'}>
            {formatTime(time)}
          </span>
        </div>

        {/* Jauge de rythme dynamique et épaisse (10px) */}
        {showPaceGauge && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
              <span className="text-app-text truncate mr-2">{paceLabel}</span>
              <span className="font-mono text-app-text-muted shrink-0">
                Record : {formatTime(bestTimeMs!)}
              </span>
            </div>
            <div className="w-full h-2.5 sm:h-3 rounded-full bg-app-input border border-app-card-border overflow-hidden p-0.5 shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-75 ${paceBarColor}`}
                style={{ width: `${pacePercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// COMPOSANT : Ruban Défilant Continu des Participants (Ticker Marquee)
// ============================================================================
interface PublicParticipantsTickerProps {
  participants: Participant[];
  eventName?: string;
  prizes: ContestPrizes;
}

function PublicParticipantsTicker({ participants, eventName, prizes }: PublicParticipantsTickerProps) {
  // Trier les participants : ceux avec un temps valide d'abord (du meilleur au moins bon), puis inscrits récents
  const sorted = [...participants].sort((a, b) => {
    const aHasTime = typeof a.timeMs === 'number' && a.timeMs > 0;
    const bHasTime = typeof b.timeMs === 'number' && b.timeMs > 0;
    if (aHasTime && bHasTime) return a.timeMs! - b.timeMs!;
    if (aHasTime && !bHasTime) return -1;
    if (!aHasTime && bHasTime) return 1;
    return b.registeredAt - a.registeredAt;
  });

  if (sorted.length === 0) {
    return (
      <div className="shrink-0 h-10 sm:h-11 rounded-2xl bg-app-card/80 border border-app-card-border shadow-sm flex items-center justify-center px-4 text-xs font-semibold text-app-text-muted">
        <Sparkles size={14} className="text-primary mr-2 animate-pulse" />
        <span>Soyez le premier participant à relever le défi et inscrire votre nom au classement !</span>
      </div>
    );
  }

  // Duplication pour assurer une boucle fluide sans saut visuel
  const displayItems = sorted.length < 8 ? [...sorted, ...sorted, ...sorted, ...sorted] : [...sorted, ...sorted];

  return (
    <div className="shrink-0 h-10 sm:h-11 rounded-2xl bg-app-card/95 border border-app-card-border shadow-md backdrop-blur-md flex items-center overflow-hidden">
      {/* Badge fixe gauche avec conteneur opaque et ombre portée masquante */}
      <div className="shrink-0 h-full flex items-center bg-app-card pl-2.5 sm:pl-3.5 pr-3 z-20 shadow-[15px_0_15px_-4px_rgba(0,0,0,0.35)] border-r border-app-card-border/60">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/20 border border-primary/40 text-primary font-display font-black text-xs uppercase tracking-wider shadow-sm">
          <Users size={13} className="shrink-0" />
          <span className="hidden sm:inline">Tous les participants</span>
          <span className="text-[11px] font-mono px-1 rounded bg-primary/25">({sorted.length})</span>
        </div>
      </div>

      {/* Ruban défilant avec fondu progressif masqué avant le badge */}
      <div
        className="flex-1 overflow-hidden relative h-full flex items-center"
        style={{
          maskImage: 'linear-gradient(to right, transparent 0px, black 32px, black calc(100% - 32px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0px, black 32px, black calc(100% - 32px), transparent 100%)'
        }}
      >
        <div className="animate-ticker flex items-center gap-2 sm:gap-3 py-1">
          {displayItems.map((p, idx) => {
            const hasTime = typeof p.timeMs === 'number' && p.timeMs > 0;
            // Calculer le rang parmi ceux qui ont un temps
            const rankIndex = hasTime
              ? sorted.filter((sp) => typeof sp.timeMs === 'number' && sp.timeMs! < p.timeMs!).length + 1
              : null;

            // Insérer une puce événementielle spéciale toutes les 4 personnes
            const isEventDivider = idx > 0 && idx % 4 === 0;

            return (
              <React.Fragment key={`${p.id}-${idx}`}>
                {isEventDivider && (
                  <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-xl bg-primary/10 border border-primary/30 text-[11px] font-black uppercase text-primary tracking-wide shadow-sm">
                    {idx % 8 === 0 ? (
                      <>
                        <Trophy size={12} className="text-amber-500 shrink-0" />
                        <span>1er Prix : {prizes.best.shortTitle || prizes.best.title}</span>
                      </>
                    ) : (
                      <>
                        <Gift size={12} className="text-purple-400 shrink-0" />
                        <span>Tirage : {prizes.raffle.shortTitle || prizes.raffle.title}</span>
                      </>
                    )}
                  </div>
                )}

                <div className="shrink-0 flex items-center gap-2 px-3 py-1 rounded-xl bg-app-input border border-app-card-border shadow-sm text-xs">
                  {rankIndex !== null ? (
                    <span
                      className={`font-mono font-black px-2 py-0.5 rounded-md text-[10px] ${
                        rankIndex === 1
                          ? 'bg-amber-500/25 text-amber-300 border border-amber-400/60 shadow-sm'
                          : rankIndex === 2
                          ? 'bg-slate-300/20 text-slate-200 border border-slate-300/50 shadow-sm'
                          : rankIndex === 3
                          ? 'bg-amber-600/30 text-amber-300 border border-amber-500/60 shadow-sm'
                          : 'bg-primary/20 text-primary border border-primary/40'
                      }`}
                    >
                      #{rankIndex}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-bold">⭐</span>
                  )}

                  <span className="font-bold text-app-text truncate max-w-[140px]">{p.name}</span>

                  {hasTime ? (
                    <span className="font-mono font-black text-primary tabular-nums">
                      {formatTime(p.timeMs!)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-app-text-muted italic">En attente</span>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// Nom normalisé pour la détection de doublons (casse, accents et espaces ignorés)
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
