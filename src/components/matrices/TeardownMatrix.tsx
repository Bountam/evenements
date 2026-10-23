import React, { useState, useEffect, useRef, useMemo } from 'react';
import { EventSettings, Participant, TrackState, RaffleState } from '../../types';
import { db, registerSyncListener } from '../../db';
import { networkManager } from '../../network';
import Stopwatch, { formatTime } from '../shared/Stopwatch';
import Leaderboard from '../shared/Leaderboard';
import RaffleSpinner from '../shared/RaffleSpinner';
import { showToast } from '../shared/Toast';
import { confirmDialog } from '../shared/ConfirmDialog';
import PrizeEditorModal, { PrizeImage } from '../shared/PrizeEditorModal';
import { ContestPrizes, getContestPrizes, serializeContestPrizes } from '../../utils/prizes';
import { RaffleDraw, getRaffleDraws, getEligibleParticipants, readStoredRaffle, storeRaffle, RAFFLE_DURATION_MS } from '../../utils/raffle';
import { hasValidTime, getRankedParticipants, compareByRank, buildRankMap } from '../../utils/ranking';
import { useTrackElapsed } from '../../hooks/useTrackElapsed';
import PrizeCard from '../shared/PrizeCard';
import RankBadge from '../shared/RankBadge';
import StatTile from '../shared/StatTile';
import RecordChip from '../shared/RecordChip';
import InlineTimeEditor from '../shared/InlineTimeEditor';
import TextField from '../shared/TextField';
import confetti from 'canvas-confetti';
import {
  UserPlus,
  Play,
  RotateCcw,
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
  PlusCircle,
  MinusCircle,
  Clock,
  Users,
  Gift,
  Zap,
  Pause,
  Settings2,
  Medal
} from 'lucide-react';

interface TeardownMatrixProps {
  event: EventSettings;
  activeTab: 'pistes' | 'participants' | 'tirage' | 'public';
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

export default function TeardownMatrix({ event, activeTab }: TeardownMatrixProps) {
  // 1. États principaux
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [lastSavedParticipantId, setLastSavedParticipantId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [participantFilter, setParticipantFilter] = useState<'all' | 'waiting' | 'ranked'>('all');
  const [manualScoreParticipantId, setManualScoreParticipantId] = useState<string | null>(null);

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

  // Formulaire d'ajout de participant. Le brouillon est gardé sur l'appareil jusqu'à l'inscription :
  // un rechargement, une fermeture ou une reconnexion ne fait plus perdre une saisie pas encore enregistrée
  const draftKey = `insertech_participant_draft_${event.id}`;
  const [initialDraft] = useState(() => readParticipantDraft(draftKey));
  const [newParticipantName, setNewParticipantName] = useState(initialDraft.name);
  const [newParticipantEmail, setNewParticipantEmail] = useState(initialDraft.email);
  const [newParticipantPostal, setNewParticipantPostal] = useState(initialDraft.postal);
  const [newParticipantConsent, setNewParticipantConsent] = useState(initialDraft.consent);
  useEffect(() => {
    writeParticipantDraft(draftKey, {
      name: newParticipantName,
      email: newParticipantEmail,
      postal: newParticipantPostal,
      consent: newParticipantConsent
    });
  }, [draftKey, newParticipantName, newParticipantEmail, newParticipantPostal, newParticipantConsent]);
  const [formError, setFormError] = useState<{ field: 'name' | 'consent'; message: string } | null>(null);
  const raffleWinnerName = participants.find((p) => p.id === raffle.winnerId)?.name || 'Tirage complété';

  // Focus clavier pendant le tirage : le cockpit devient inert, le focus passe au bandeau,
  // puis revient au bouton « Lancer le tirage » quand le bandeau disparaît
  const raffleBannerRef = useRef<HTMLDivElement>(null);
  const previousRaffleStatus = useRef(raffle.status);
  useEffect(() => {
    const previous = previousRaffleStatus.current;
    previousRaffleStatus.current = raffle.status;
    if (activeTab === 'public' || previous === raffle.status) return;
    const active = document.activeElement;
    const focusLost = !active || active === document.body || Boolean(active.closest('[inert]'));
    if (raffle.status === 'idle') {
      if (focusLost) document.getElementById('launch-raffle')?.focus();
    } else if (focusLost) {
      raffleBannerRef.current?.focus();
    }
  }, [raffle.status, activeTab]);

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
          disableForReducedMotion: true,
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
      const timeLeft = RAFFLE_DURATION_MS - elapsed;

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
    const track = tracks[trackId];
    const previousElapsed =
      track?.isRunning && track.startTime !== null
        ? networkManager.now() - track.startTime + track.elapsedBeforeStart
        : track?.elapsedBeforeStart ?? 0;
    networkManager.sendChronoAction({
      type: 'TIMER_RESET',
      trackId
    });
    if (previousElapsed > 0) {
      showToast(`Chrono de la piste ${trackId} remis à zéro (${formatTime(previousElapsed)}).`, 'info', {
        label: 'Annuler',
        onClick: () => {
          const current = networkManager.tracksState[trackId];
          // Ne pas écraser une nouvelle course démarrée entre-temps
          if (!current || current.participantId !== track?.participantId || current.isRunning || current.elapsedBeforeStart > 0) {
            showToast(`Le chrono de la piste ${trackId} a changé, impossible d'annuler.`, 'warning');
            return;
          }
          networkManager.sendChronoAction({ type: 'TIMER_STOP', trackId, elapsed: previousElapsed });
        }
      });
    }
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

  // Libérer une piste depuis la régie, avec « Annuler » pour réattribuer le même participant
  const handleReleaseTrack = (trackId: number) => {
    const track = tracks[trackId];
    if (!track?.participantId) return;
    const { participantId, participantName } = track;
    handleAssignParticipant(trackId, null);
    showToast(`Piste ${trackId} libérée (${participantName}).`, 'info', {
      label: 'Annuler',
      onClick: () => {
        // La piste a pu être réattribuée entre-temps : ne rien écraser
        if (networkManager.tracksState[trackId]?.participantId) {
          showToast(`La piste ${trackId} est déjà occupée.`, 'warning');
          return;
        }
        networkManager.sendChronoAction({
          type: 'TRACK_ASSIGN',
          trackId,
          participantId,
          participantName,
          eventId: event.id
        });
      }
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
        const overwrite = await confirmDialog({
          title: 'Remplacer le meilleur temps ?',
          message:
            `${participant.name} possède déjà un meilleur temps (${formatTime(previousBest)}).\n` +
            `Nouveau temps : ${formatTime(finalTime)}.`,
          confirmLabel: 'Remplacer',
          cancelLabel: `Conserver ${formatTime(previousBest)}`
        });
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
          disableForReducedMotion: true,
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
          `Nouveau record ! ${updatedParticipant.name} prend la 1re place en ${formatTime(finalTime)} !`,
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
    const confirmed = await confirmDialog({
      title: 'Effacer ce temps ?',
      message: `Le temps de ${participant.name} (${formatTime(participant.timeMs || 0)}) sera effacé et le participant repassera en attente.`,
      confirmLabel: 'Effacer le temps',
      tone: 'destructive'
    });
    if (!confirmed) return;

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
    const confirmed = await confirmDialog({
      title: "Effacer l'historique des tirages ?",
      message: 'Tous les participants redeviendront éligibles au tirage au sort.',
      confirmLabel: "Effacer l'historique",
      tone: 'destructive'
    });
    if (!confirmed) return;
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
      setFormError({ field: 'name', message: 'Veuillez saisir le nom du participant.' });
      document.getElementById('participant-name')?.focus();
      return;
    }

    // Loi 25 : pas de coordonnées sans consentement explicite
    const hasContactInfo = newParticipantEmail.trim() !== '' || newParticipantPostal.trim() !== '';
    if (hasContactInfo && !newParticipantConsent) {
      setFormError({ field: 'consent', message: 'Cochez le consentement ou retirez le courriel et le code postal.' });
      return;
    }
    setFormError(null);

    // Prévenir les inscriptions en double (une seule chance au tirage par personne)
    const nameKey = normalizeName(newParticipantName);
    const emailKey = newParticipantEmail.trim().toLowerCase();
    const duplicate = participants.find(
      (p) => normalizeName(p.name) === nameKey || (emailKey !== '' && (p.email || '').trim().toLowerCase() === emailKey)
    );
    if (
      duplicate &&
      !(await confirmDialog({
        title: 'Participant déjà inscrit',
        message:
          `${duplicate.name}${duplicate.email ? ` (${duplicate.email})` : ''} est déjà inscrit.\n` +
          `Pour une nouvelle tentative, utilisez plutôt le bouton « Envoyer en piste » à côté de son nom dans la file.`,
        confirmLabel: 'Inscrire quand même'
      }))
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
    const confirmed = await confirmDialog({
      title: 'Supprimer ce participant ?',
      message: `${target?.name || 'Ce participant'} et son temps seront retirés de l'événement.`,
      confirmLabel: 'Supprimer',
      tone: 'destructive'
    });
    if (!confirmed) return;
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
  const rankedParticipants = getRankedParticipants(participants);
  const rankMap = buildRankMap(participants);
  const bestParticipant = rankedParticipants.length > 0 ? rankedParticipants[0] : null;
  const secondParticipant = rankedParticipants.length > 1 ? rankedParticipants[1] : null;
  const thirdParticipant = rankedParticipants.length > 2 ? rankedParticipants[2] : null;
  const podiumTimes: PodiumTimes = {
    best: bestParticipant?.timeMs ?? null,
    second: secondParticipant?.timeMs ?? null,
    third: thirdParticipant?.timeMs ?? null
  };
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
        !hasValidTime(p) &&
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

      if (participantFilter === 'waiting') return !hasValidTime(p);
      if (participantFilter === 'ranked') return hasValidTime(p);
      return true;
    })
    .sort((a, b) => {
      if (participantFilter === 'ranked') return (a.timeMs || 0) - (b.timeMs || 0);
      if (participantFilter === 'waiting') return (a.registeredAt || 0) - (b.registeredAt || 0);
      return compareByRank(a, b);
    });

  // Rendu des Chronomètres Individuels Adaptatifs sur l'Écran Public
  const activeTracks = Object.values(tracks).filter((t) => t.participantId !== null);
  const assignableParticipants = participants.filter(
    (p) => !Object.values(tracks).some((t) => t.participantId === p.id)
  );
  const freeTrackIds = Object.values(tracks)
    .filter((t) => t.participantId === null)
    .map((t) => t.trackId);

  // ============================================================================
  // RENDU DE L'ÉCRAN PUBLIC DE PROJECTION (Kiosque Plein Écran Adaptatif)
  // ============================================================================
  if (activeTab === 'public') {
    if (raffle.status !== 'idle') {
      return (
        <div className="h-full flex flex-col justify-center w-full max-w-7xl mx-auto space-y-6 p-4">
          <div className="bg-app-card border border-app-card-border p-6 rounded-3xl text-center space-y-3 shadow-xl">
            <h2 className="text-3xl font-display font-black text-app-text uppercase tracking-wider inline-flex items-center gap-2.5">
              <Gift size={26} className="text-primary" aria-hidden="true" />
              Tirage au sort en direct
            </h2>
            <div className="flex items-center justify-center gap-3 py-1">
              <div className="w-20 h-20 xl:w-24 xl:h-24 rounded-xl bg-white p-1.5 border border-slate-200 shadow-sm shrink-0 flex items-center justify-center">
                <PrizeImage src={prizes.raffle.image} alt={prizes.raffle.title} kind="raffle" />
              </div>
              <div className="text-left">
                <p className="text-kiosk-title font-black text-app-text">
                  {prizes.raffle.title}
                  {prizes.raffle.value && <span className="text-primary font-mono"> • Valeur {prizes.raffle.value}</span>}
                </p>
                <p className="text-kiosk-caption text-app-text-muted">{prizes.raffle.description}</p>
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
                  <p className="text-kiosk-body text-app-text-muted font-sans mt-0.5 max-w-md leading-relaxed">
                    Présentez-vous à la table d'assemblage pour tenter d'établir le meilleur chrono !
                  </p>

                  {/* Badge Record du moment */}
                  {bestParticipant && (
                    <RecordChip label="Record" timeMs={bestParticipant.timeMs!} name={bestParticipant.name} className="mt-2.5 w-full justify-center" />
                  )}

                  {/* Compteur intégré : Inscriptions du jour */}
                  <div className="mt-2.5 w-full py-1.5 px-3 rounded-2xl bg-app-card/80 border border-app-card-border flex items-center justify-between text-kiosk-caption shadow-sm">
                    <span className="flex items-center gap-1.5 font-bold text-app-text">
                      <Users size={14} className="text-primary" />
                      <span>Inscriptions du jour</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 font-mono font-black text-kiosk-caption shadow-sm">
                      {participants.length}
                    </span>
                  </div>
                </div>

                {/* Vitrine officielle des 2 Prix en jeu avec photos agrandies */}
                <div className="grid grid-cols-1 gap-2.5 flex-1 min-h-0">
                  <PrizeCard kind="best" prize={prizes.best} size="lg" />
                  <PrizeCard kind="raffle" prize={prizes.raffle} size="lg" />
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
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="relative flex h-3 w-3 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-danger"></span>
                    </span>
                    <span className="font-display font-black text-kiosk-caption uppercase tracking-wider text-danger flex items-center gap-1.5 whitespace-nowrap">
                      <span>Course en direct</span>
                      <span className="px-2 py-0.5 rounded-full bg-danger/15 border border-danger/30 text-kiosk-caption font-mono font-bold text-danger">
                        {activeTracks.length} piste{activeTracks.length > 1 ? 's' : ''} active{activeTracks.length > 1 ? 's' : ''}
                      </span>
                    </span>
                  </div>

                  {bestParticipant ? (
                    <RecordChip label="Temps à battre" timeMs={bestParticipant.timeMs!} name={bestParticipant.name} />
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0 bg-primary/15 border border-primary/30 px-2.5 py-1 rounded-xl text-primary text-kiosk-caption font-black uppercase">
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
                          podiumTimes={podiumTimes}
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
                          podiumTimes={podiumTimes}
                        />
                      ))}

                      {/* N = 3 : 4e case invitation proactive pour combler le vide */}
                      {activeTracks.length === 3 && (
                        <div className="relative overflow-hidden p-4 rounded-3xl bg-gradient-to-br from-primary/15 via-app-card to-app-card border-2 border-dashed border-primary/50 flex flex-col items-center justify-center text-center shadow-md">
                          <div className="w-11 h-11 rounded-2xl bg-primary/20 text-primary border border-primary/40 flex items-center justify-center mb-1.5 shadow-sm">
                            <Zap size={22} className="animate-bounce text-primary" />
                          </div>
                          <span className="text-kiosk-caption uppercase font-black tracking-widest text-primary font-display">
                            Prochain Départ
                          </span>
                          <h4 className="font-display font-black text-kiosk-title text-app-text uppercase mt-0.5">
                            {freeTrackIds.length > 1
                              ? `Pistes ${freeTrackIds.join(' & ')} disponibles !`
                              : `Piste ${freeTrackIds[0]} disponible !`}
                          </h4>
                          <p className="text-kiosk-caption text-app-text-muted mt-0.5 max-w-xs">
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
                            podiumTimes={podiumTimes}
                          />
                        </div>
                      ))}
                      {activeTracks.slice(3, 5).map((track) => (
                        <div key={track.trackId} className="sm:col-span-3 h-full">
                          <PublicTrackBlock
                            track={track}
                            isSingle={false}
                            podiumTimes={podiumTimes}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Bandeau File d'attente / Prochains Départs */}
                {waitingForLiveRace.length > 0 ? (
                  <div className="bg-app-card border border-app-card-border px-3.5 py-1.5 rounded-2xl shadow-sm flex items-center gap-2.5 shrink-0 overflow-hidden">
                    <div className="flex items-center gap-1.5 text-primary shrink-0 font-display font-black text-kiosk-caption uppercase tracking-wide">
                      <Clock size={13} className="shrink-0 animate-pulse" />
                      <span>Prochains au départ :</span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-hidden no-scrollbar py-0.5 flex-1 min-w-0">
                      {waitingForLiveRace.slice(0, 6).map((wp, idx) => (
                        <span
                          key={wp.id}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-app-input border border-app-card-border text-kiosk-caption font-bold text-app-text shadow-sm"
                        >
                          <span className="font-mono text-primary font-black">#{idx + 1}</span>
                          <span className="truncate max-w-[14rem]">{wp.name}</span>
                        </span>
                      ))}
                      {waitingForLiveRace.length > 6 && (
                        <span className="text-kiosk-caption text-app-text-muted font-bold shrink-0">
                          +{waitingForLiveRace.length - 6} autre{waitingForLiveRace.length - 6 > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-app-card border border-app-card-border px-3.5 py-1.5 rounded-2xl shadow-sm flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-primary font-display font-black text-kiosk-caption uppercase">
                      <Zap size={13} className="animate-bounce" />
                      <span>Pistes disponibles pour la prochaine vague !</span>
                    </div>
                    <span className="text-kiosk-caption text-app-text-muted font-sans font-medium">
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
                  <PrizeCard kind="best" prize={prizes.best} size="sm" />
                  <PrizeCard kind="raffle" prize={prizes.raffle} size="sm" />
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
      {/* Annonce du tirage pour les lecteurs d'écran (région présente avant le changement) */}
      <p role="status" className="sr-only">
        {raffle.status === 'spinning'
          ? "Tirage en cours sur l'écran public."
          : raffle.status === 'celebrating' && raffleWinnerName
            ? `Gagnant du tirage : ${raffleWinnerName}.`
            : ''}
      </p>

      {/* Bandeau de contrôle du tirage au sort lorsqu'il est actif */}
      {raffle.status !== 'idle' && (
        <div
          ref={raffleBannerRef}
          tabIndex={-1}
          role="region"
          aria-label="Tirage au sort en cours"
          className="focus:outline-none bg-primary/10 border border-primary/30 p-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            <Sparkles className="text-primary shrink-0" size={18} aria-hidden="true" />
            <div className="min-w-0">
              <span className="text-micro uppercase font-bold text-primary tracking-widest block leading-none">
                {raffle.status === 'spinning'
                  ? "Tirage en cours sur l'écran public"
                  : 'Gagnant sélectionné sur l\'écran public'}
              </span>
              <span className="font-bold text-app-text text-xs block mt-0.5 truncate">
                {raffle.status === 'spinning' ? (
                  <span className="text-app-text-muted">Le gagnant s'affiche à la fin du défilement…</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-primary font-black text-sm">
                    <Trophy size={14} aria-hidden="true" /> {raffleWinnerName}
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
            className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-danger/10 border border-danger/40 text-xs font-bold font-display uppercase text-danger hover:text-white hover:bg-danger/20 transition cursor-pointer"
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

      {/* Contenu de l'onglet de régie actif */}
      <div
        inert={raffle.status === 'spinning'}
        className={`grid grid-cols-12 gap-3.5 items-start transition-all duration-500 ${
          raffle.status === 'spinning' ? 'opacity-40 scale-[0.99]' : ''
        }`}
      >
        {/* ================================================================ */}
        {/* ONGLET PARTICIPANTS (gauche) : Inscription                      */}
        {/* ================================================================ */}
        {activeTab === 'participants' && (
        <div className="col-span-12 lg:col-span-4 space-y-3">
          {/* Formulaire Nouveau Participant compacté */}
          <div className="@container bg-app-card border border-app-card-border p-3.5 rounded-2xl shadow-sm">
            <h3 className="text-xs font-bold font-display text-app-text uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <UserPlus size={15} className="text-primary" />
              <span>Nouveau Participant</span>
            </h3>

            <form onSubmit={(e) => addParticipant(e, false)} className="space-y-2" noValidate>
              <TextField
                id="participant-name"
                label="Nom complet *"
                icon={User}
                type="text"
                autoComplete="name"
                required
                aria-required="true"
                value={newParticipantName}
                onChange={(e) => {
                  setNewParticipantName(e.target.value);
                  setFormError(null);
                }}
                placeholder="Jean Tremblay"
                aria-invalid={formError?.field === 'name' ? true : undefined}
                aria-describedby={formError?.field === 'name' ? 'participant-form-error' : undefined}
              />

              {/* Courriel et code postal côte à côte quand la colonne est assez large */}
              <div className="grid grid-cols-1 @xs:grid-cols-5 gap-2">
                <TextField
                  id="participant-email"
                  label="Courriel"
                  icon={Mail}
                  type="email"
                  autoComplete="email"
                  value={newParticipantEmail}
                  onChange={(e) => setNewParticipantEmail(e.target.value)}
                  placeholder="jean@email.com"
                  className="@xs:col-span-3"
                />
                <TextField
                  id="participant-postal"
                  label="Code postal"
                  icon={MapPin}
                  type="text"
                  autoComplete="postal-code"
                  value={newParticipantPostal}
                  onChange={(e) => setNewParticipantPostal(e.target.value)}
                  placeholder="H2W 1Y4"
                  className="@xs:col-span-2"
                  inputClassName="uppercase"
                />
              </div>

              <label className="flex items-start gap-1.5 text-micro leading-snug text-app-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={newParticipantConsent}
                  aria-invalid={formError?.field === 'consent'}
                  aria-describedby={formError?.field === 'consent' ? 'participant-form-error' : undefined}
                  onChange={(e) => {
                    setNewParticipantConsent(e.target.checked);
                    setFormError(null);
                  }}
                  className="mt-0.5 accent-[var(--color-primary)] cursor-pointer"
                />
                <span>
                  La personne accepte que son courriel et son code postal servent uniquement à la joindre pour ce concours.
                  {(newParticipantEmail.trim() || newParticipantPostal.trim()) && !newParticipantConsent && (
                    <span className="text-warning font-bold"> Requis si un courriel ou un code postal est saisi.</span>
                  )}
                </span>
              </label>

              {formError && (
                <p id="participant-form-error" role="alert" className="text-xs font-bold text-danger">
                  {formError.message}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="submit"
                  className="min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-app-input border border-app-card-border text-app-text hover:border-primary text-xs font-bold font-display uppercase tracking-wider transition cursor-pointer"
                  title="Inscrire [Entrée]"
                  aria-label="Inscrire le participant"
                >
                  <UserPlus size={14} />
                  <span>Inscrire</span>
                  <span className="text-micro text-app-text-muted font-mono hidden sm:inline">[↵]</span>
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
        </div>
        )}

        {/* ================================================================ */}
        {/* ONGLET TIRAGE : Tirage au sort, historique et prix               */}
        {/* ================================================================ */}
        {activeTab === 'tirage' && (
        <div className="col-span-12 w-full max-w-xl mx-auto">
          {/* Bloc Tirage au sort unifié */}
          <div className="bg-app-card border border-app-card-border p-3.5 rounded-2xl shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-micro uppercase font-bold text-primary font-display flex items-center gap-1.5">
                <Gift size={13} aria-hidden="true" /> Tirage au sort
              </h3>
              <span className="text-micro font-mono text-app-text-muted" title="Participants pas encore tirés au sort">
                {eligibleForRaffle.length} éligible{eligibleForRaffle.length > 1 ? 's' : ''} / {participants.length}
              </span>
            </div>

            <button
              id="launch-raffle"
              onClick={() => startRaffle()}
              disabled={eligibleForRaffle.length === 0}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-primary to-primary text-secondary font-black font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer shadow-md"
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
                      <span className="text-micro uppercase font-black text-primary tracking-wider flex items-center gap-1">
                        {last.status === 'gagnant' && <Trophy size={11} aria-hidden="true" />}
                        {last.status === 'gagnant' ? 'Dernier gagnant du tirage' : 'Dernier tiré (absent)'}
                      </span>
                      <h4 className={`text-xs font-bold font-display truncate ${last.status === 'gagnant' ? 'text-app-text' : 'text-app-text-muted line-through'}`}>
                        {last.name}
                      </h4>
                      <div className="text-micro text-app-text-muted space-y-0.5 font-sans">
                        {last.email && <p className="truncate">Courriel : {last.email}</p>}
                        {last.postalCode && <p>Code postal : {last.postalCode}</p>}
                        <p className="text-micro text-app-text-muted/70 pt-0.5">
                          Tiré à {new Date(last.at).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {last.status === 'gagnant' && (
                        <button
                          type="button"
                          onClick={() => startRaffle(true)}
                          disabled={eligibleForRaffle.length === 0}
                          title="Marquer cette personne absente et tirer un autre nom"
                          className="w-full mt-1 py-1 px-2 rounded-lg bg-app-input border border-app-card-border text-micro font-bold uppercase text-app-text-muted hover:text-app-text hover:border-primary disabled:opacity-40 transition cursor-pointer"
                        >
                          Absent ? Retirer un autre nom
                        </button>
                      )}
                    </div>
                  );
                })()}

                {raffleDraws.length > 1 && (
                  <ul className="text-micro font-sans space-y-0.5 max-h-24 overflow-y-auto pr-1">
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
                  className="w-full text-micro text-app-text-muted hover:text-danger underline cursor-pointer"
                >
                  Effacer l'historique des tirages
                </button>
              </div>
            ) : (
              <p className="text-micro text-app-text-muted text-center font-sans truncate">
                Prix : {prizes.raffle.title}
              </p>
            )}

            <button
              type="button"
              onClick={() => setIsPrizeEditorOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-app-input border border-app-card-border text-app-text-muted hover:text-app-text hover:border-primary text-micro font-bold uppercase tracking-wider transition cursor-pointer"
            >
              <Settings2 size={12} />
              <span>Modifier les prix</span>
            </button>
          </div>
        </div>
        )}

        {/* ================================================================ */}
        {/* ONGLET PISTES : Stat-bar KPIs + Les 5 Pistes                     */}
        {/* ================================================================ */}
        {activeTab === 'pistes' && (
        <div className="col-span-12 space-y-3">
          {/* Bandeau de statistiques compact (stat-bar en 1 ligne) */}
          <div className="bg-app-card border border-app-card-border px-3.5 py-2 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <StatTile icon={Users} label="Participants">
              <span className="text-sm font-display font-black text-app-text">{participants.length}</span>
            </StatTile>

            <div className="hidden sm:block h-5 w-px bg-app-card-border" aria-hidden="true" />

            <StatTile icon={Check} label="Scores validés" tone="info">
              <span className="text-sm font-display font-black text-app-text">
                {rankedParticipants.length}{' '}
                <span className="text-micro font-sans text-app-text-muted font-normal">/ {participants.length}</span>
              </span>
            </StatTile>

            <div className="hidden sm:block h-5 w-px bg-app-card-border" aria-hidden="true" />

            <StatTile icon={Trophy} label="Record actuel" tone="warning">
              <div className="flex items-baseline gap-1 min-w-0">
                <span className="text-sm font-mono font-black text-primary">
                  {bestParticipant ? formatTime(bestParticipant.timeMs!) : '--:--.--'}
                </span>
                {bestParticipant && (
                  <span className="text-micro text-app-text-muted font-medium truncate max-w-[6rem]">({bestParticipant.name})</span>
                )}
              </div>
            </StatTile>

            <div className="hidden sm:block h-5 w-px bg-app-card-border" aria-hidden="true" />

            <StatTile icon={Clock} label="Temps moyen" tone="accent">
              <span className="text-sm font-mono font-bold text-app-text">
                {averageTimeMs ? formatTime(averageTimeMs) : '--:--.--'}
              </span>
            </StatTile>
          </div>

          {/* Grille des pistes : autant de colonnes de 18rem que la largeur le permet */}
          <div className="@container">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-2.5">
            {Object.values(tracks).map((track, idx, all) => {
              // Sur 2 colonnes, une dernière piste seule occupe toute la ligne
              const isLoneLastTrack = all.length % 2 === 1 && idx === all.length - 1;

              return (
                <div
                  key={track.trackId}
                  className={isLoneLastTrack ? '@min-[36.625rem]:@max-[55.25rem]:col-span-2' : ''}
                >
                  <AdminTrackBlock
                    track={track}
                    assignableParticipants={assignableParticipants}
                    bestTimeMs={bestParticipant?.timeMs ?? null}
                    onAssign={(pId) => handleAssignParticipant(track.trackId, pId)}
                    onRelease={() => handleReleaseTrack(track.trackId)}
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
        </div>
        )}

        {/* ================================================================ */}
        {/* ONGLET PARTICIPANTS (droite) : File d'attente & Classement       */}
        {/* ================================================================ */}
        {activeTab === 'participants' && (
        <div className="col-span-12 lg:col-span-8 lg:self-stretch">
          <div className="bg-app-card border border-app-card-border p-3.5 rounded-2xl shadow-sm space-y-2.5 flex flex-col max-h-[70dvh] lg:max-h-none lg:sticky lg:top-[calc(var(--app-header-h,0px)+0.75rem)] lg:h-[calc(100dvh-var(--app-header-h,0px)-1.5rem)]">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-xs font-bold font-display text-app-text uppercase tracking-wider flex items-center gap-1.5">
                <span>File & Classement</span>
                <span className="text-micro font-mono font-bold text-primary px-1.5 py-0.5 rounded-md bg-primary/15">
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
                  aria-label="Rechercher un participant"
                  className="w-full bg-app-input border border-app-input-border rounded-xl pl-7 pr-2.5 py-1 text-app-text text-xs focus:outline-none focus:border-primary transition"
                />
              </div>
              <div role="group" aria-label="Filtrer la file" className="flex items-center gap-1 p-0.5 rounded-xl bg-app-input border border-app-card-border">
                {(['waiting', 'ranked', 'all'] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setParticipantFilter(filterKey)}
                    aria-pressed={participantFilter === filterKey}
                    className={`flex-1 py-1 rounded-lg text-micro font-bold uppercase tracking-wider transition cursor-pointer ${
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
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
              {filteredParticipants.length === 0 ? (
                participants.length === 0 ? (
                  <div className="text-center py-8 px-3 space-y-1.5">
                    <UserPlus size={22} className="mx-auto text-primary" aria-hidden="true" />
                    <p className="text-xs font-bold text-app-text">Aucun inscrit pour l'instant</p>
                    <p className="text-micro text-app-text-muted">Inscrivez le premier participant avec le formulaire d'inscription.</p>
                  </div>
                ) : searchQuery.trim() ? (
                  <div className="text-center py-8 px-3 space-y-2">
                    <p className="text-xs text-app-text-muted">
                      Aucun résultat pour « {searchQuery.trim()} ».
                    </p>
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="min-h-9 px-3 rounded-lg bg-app-input border border-app-card-border text-xs font-bold text-app-text hover:border-primary transition cursor-pointer"
                    >
                      Effacer la recherche
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8 px-3 space-y-2">
                    <p className="text-xs text-app-text-muted">
                      {participantFilter === 'waiting' ? 'Personne en attente : tout le monde a un temps.' : 'Aucun temps validé pour l\'instant.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setParticipantFilter('all')}
                      className="min-h-9 px-3 rounded-lg bg-app-input border border-app-card-border text-xs font-bold text-app-text hover:border-primary transition cursor-pointer"
                    >
                      Voir tous les participants
                    </button>
                  </div>
                )
              ) : (
                filteredParticipants.map((p) => {
                  const hasTime = hasValidTime(p);
                  const assignedTrack = Object.values(tracks).find((t) => t.participantId === p.id);
                  const isAssigned = Boolean(assignedTrack);
                  const isManualEditing = manualScoreParticipantId === p.id;

                  const rankIndex = rankMap.get(p.id) ?? null;

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
                              <RankBadge rank={rankIndex} className="text-micro" />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                            )}
                            <h4 className="text-xs font-bold text-app-text truncate">{p.name}</h4>
                          </div>
                          <div className="text-micro font-sans mt-0.5">
                            {isAssigned ? (
                              <span className="text-primary font-bold inline-flex items-center gap-1">
                                <Timer size={11} aria-hidden="true" />
                                En course (Piste {assignedTrack?.trackId})
                              </span>
                            ) : hasTime ? (
                              <span className="font-mono text-primary font-bold">
                                <span aria-hidden="true">✓ </span>
                                {formatTime(p.timeMs!)}
                              </span>
                            ) : (
                              <span className="text-app-text-muted italic">En attente</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {!isAssigned && (
                            <button
                              type="button"
                              onClick={() => handleQuickSendToTrack(p.id)}
                              title={
                                hasTime
                                  ? 'Nouvelle tentative (envoyer sur piste libre)'
                                  : 'Envoyer sur une piste libre'
                              }
                              aria-label={`${hasTime ? 'Nouvelle tentative' : 'Envoyer sur une piste libre'} : ${p.name}`}
                              className="p-2 rounded-lg bg-primary/15 text-primary hover:bg-primary hover:text-secondary transition cursor-pointer"
                            >
                              <Play size={14} fill="currentColor" aria-hidden="true" />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              if (isManualEditing) {
                                setManualScoreParticipantId(null);
                              } else {
                                setManualScoreParticipantId(p.id);
                              }
                            }}
                            title="Saisir ou corriger le temps manuellement"
                            aria-label={`Saisir ou corriger le temps de ${p.name}`}
                            aria-expanded={isManualEditing}
                            className="p-2 rounded-lg text-app-text-muted hover:text-app-text hover:bg-app-card-border/50 transition cursor-pointer"
                          >
                            <Edit3 size={14} aria-hidden="true" />
                          </button>

                          {hasTime && !isAssigned && (
                            <button
                              onClick={() => handleResetParticipantScore(p.id)}
                              title="Réinitialiser le score"
                              aria-label={`Effacer le temps de ${p.name}`}
                              className="p-2 rounded-lg text-app-text-muted hover:text-warning hover:bg-warning/10 transition cursor-pointer"
                            >
                              <RotateCcw size={14} aria-hidden="true" />
                            </button>
                          )}

                          <button
                            onClick={() => deleteParticipant(p.id)}
                            disabled={isAssigned}
                            title="Supprimer le participant"
                            aria-label={`Supprimer ${p.name}`}
                            className="ml-1.5 p-2 rounded-lg text-app-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {/* Zone de saisie manuelle de score inline */}
                      {isManualEditing && (
                        <div className="pt-1.5 border-t border-app-card-border">
                          <InlineTimeEditor
                            initialValue={hasTime ? formatTime(p.timeMs!) : ''}
                            participantName={p.name}
                            onSubmit={(ms) => handleUpdateScoreManually(p.id, ms)}
                            onCancel={() => setManualScoreParticipantId(null)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        )}
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
  onRelease: () => void;
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
  onRelease,
  onStart,
  onStop,
  onReset,
  onAdjustTime,
  onSave
}: AdminTrackBlockProps) {
  const waitingParticipants = assignableParticipants
    .filter((p) => !hasValidTime(p))
    .sort((a, b) => a.registeredAt - b.registeredAt);
  const retryParticipants = assignableParticipants.filter(hasValidTime);

  const time = useTrackElapsed(track);

  const hasElapsed = track.isRunning || time > 0;

  // Au clavier, parcourir la liste ne doit pas assigner la première personne survolée :
  // la sélection reste en attente jusqu'à Entrée ou au bouton « Attribuer »
  const [pendingAssignId, setPendingAssignId] = useState('');
  const isKeyboardSelect = useRef(false);

  // ==========================================================================
  // ÉTAT 1 : PISTE LIBRE (Aucun participant) - Ultra-compact
  // ==========================================================================
  if (!track.participantId) {
    return (
      <div
        role="group"
        aria-label={`Piste ${track.trackId}, libre`}
        className="relative overflow-hidden p-3 rounded-2xl bg-app-card/60 border-2 border-dashed border-app-card-border hover:border-primary/50 transition-all flex flex-col justify-between gap-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black font-display text-primary uppercase">
              Piste {track.trackId}
            </span>
            <span className="text-micro px-2 py-0.5 rounded-full bg-app-input text-app-text-muted border border-app-card-border font-bold uppercase">
              Libre
            </span>
          </div>
          <span className="text-micro text-app-text-muted flex items-center gap-1">
            <User size={11} />
            <span>En attente</span>
          </span>
        </div>

        <select
          value={pendingAssignId}
          aria-label={`Attribuer un participant à la piste ${track.trackId}`}
          onPointerDown={() => {
            isKeyboardSelect.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pendingAssignId) {
              e.preventDefault();
              onAssign(pendingAssignId);
              setPendingAssignId('');
            } else {
              isKeyboardSelect.current = true;
            }
          }}
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            if (isKeyboardSelect.current) {
              setPendingAssignId(value);
            } else {
              onAssign(value);
              setPendingAssignId('');
            }
          }}
          className="w-full min-h-11 bg-app-input border border-app-input-border rounded-xl px-2.5 py-1.5 text-app-text text-xs focus:outline-none focus:border-primary transition cursor-pointer"
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
        {pendingAssignId && (
          <button
            type="button"
            onClick={() => {
              onAssign(pendingAssignId);
              setPendingAssignId('');
            }}
            className="w-full min-h-11 rounded-xl bg-primary text-secondary font-black font-display uppercase tracking-wider text-xs cursor-pointer transition"
          >
            Attribuer à la piste {track.trackId}
          </button>
        )}
      </div>
    );
  }

  // ==========================================================================
  // ÉTAT 2 : PRÊT AU DÉPART (Participant assigné, chrono non démarré)
  // ==========================================================================
  if (!track.isRunning && time === 0) {
    return (
      <div
        role="group"
        aria-label={`Piste ${track.trackId}, prêt au départ`}
        className="@container relative overflow-hidden p-3 rounded-2xl bg-app-card border-2 border-warning/60 shadow-md shadow-warning/5 transition-all flex flex-col justify-between gap-2">
        {/* Faisceau lumineux ambre */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-warning via-warning/70 to-warning" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black font-display text-primary uppercase">
              Piste {track.trackId}
            </span>
            <span className="text-micro px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/40 font-bold uppercase">
              Prêt<span className="hidden @[17rem]:inline"> au départ</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onRelease}
            aria-label={`Libérer la piste ${track.trackId}`}
            className="min-h-10 text-xs font-bold px-3 py-1 rounded-lg bg-app-input text-app-text-muted hover:text-app-text hover:border-primary border border-app-card-border cursor-pointer transition"
          >
            Libérer
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-micro uppercase font-bold text-app-text-muted block leading-none mb-0.5">
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
          type="button"
          onClick={onStart}
          aria-label={`Démarrer le chronomètre, piste ${track.trackId}`}
          className="w-full min-h-11 flex items-center justify-center gap-2 py-2 rounded-xl bg-primary text-secondary font-black font-display uppercase tracking-wider text-xs hover:scale-[1.01] active:scale-95 transition cursor-pointer shadow-md shadow-primary/20"
        >
          <Play size={13} fill="currentColor" />
          <span>Démarrer<span className="hidden @[16rem]:inline"> le chronomètre</span></span>
        </button>
      </div>
    );
  }

  // ==========================================================================
  // ÉTAT 3 : EN COURSE (Chrono actif) ou ARRÊTÉ AVEC TEMPS EN ATTENTE DE VALIDATION
  // ==========================================================================
  return (
    <div
      role="group"
      aria-label={`Piste ${track.trackId}, ${track.isRunning ? 'en course' : 'temps arrêté'}`}
      className={`@container relative overflow-hidden p-3 rounded-2xl bg-app-card border-2 shadow-lg transition-all flex flex-col justify-between gap-2 ${
        track.isRunning
          ? 'border-primary ring-2 ring-primary/20 shadow-primary/10'
          : 'border-success/70 shadow-success/10'
      }`}
    >
      {/* Faisceau lumineux supérieur */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 transition-all duration-500 ${
          track.isRunning
            ? 'bg-gradient-to-r from-primary via-success to-primary animate-pulse'
            : 'bg-success'
        }`}
      />

      {/* En-tête de piste */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-black font-display text-primary uppercase">
            Piste {track.trackId}
          </span>
          {track.isRunning ? (
            <span className="inline-flex items-center gap-1 text-micro px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 font-bold uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
              <span>En course</span>
            </span>
          ) : (
            <span className="text-micro px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/40 font-bold uppercase">
              <span className="@[17rem]:hidden">Arrêté</span>
              <span className="hidden @[17rem]:inline">Temps arrêté</span>
            </span>
          )}
        </div>

        <h4 className="font-bold text-app-text text-xs font-display uppercase truncate min-w-0 max-w-[45cqi]">
          {track.participantName}
        </h4>
      </div>

      {/* Grand Chronomètre digital */}
      <div
        className={`stopwatch-lcd py-1 px-3 rounded-xl bg-app-input border font-mono font-black text-[clamp(1.5rem,12cqi,2.5rem)] tracking-wider tabular-nums text-center shadow-inner ${
          track.isRunning
            ? 'text-primary border-primary/40'
            : 'text-success border-success/40'
        }`}
      >
        {formatTime(time)}
      </div>

      {/* Barre d'ajustements / pénalités rapides */}
      <div className="flex items-center justify-between gap-1.5 text-xs">
        <span className="font-bold text-app-text-muted uppercase text-micro hidden @[15rem]:inline">Pénalités</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAdjustTime(-5000)}
            disabled={!hasElapsed}
            title="Retirer 5 secondes (bonus)"
            aria-label={`Retirer 5 secondes, piste ${track.trackId}`}
            className="min-h-11 min-w-11 flex items-center justify-center gap-1 px-2 rounded-lg bg-success/10 border border-success/40 text-success hover:bg-success/20 font-mono font-bold disabled:opacity-30 cursor-pointer transition"
          >
            <MinusCircle size={14} aria-hidden="true" />
            <span>5s</span>
          </button>
          <button
            type="button"
            onClick={() => onAdjustTime(5000)}
            disabled={!hasElapsed}
            title="Ajouter 5 secondes de pénalité"
            aria-label={`Ajouter 5 secondes de pénalité, piste ${track.trackId}`}
            className="min-h-11 min-w-11 flex items-center justify-center gap-1 px-2 rounded-lg bg-warning/10 border border-warning/40 text-warning hover:bg-warning/20 font-mono font-bold disabled:opacity-30 cursor-pointer transition"
          >
            <PlusCircle size={14} aria-hidden="true" />
            <span>5s</span>
          </button>
          <button
            type="button"
            onClick={() => onAdjustTime(10000)}
            disabled={!hasElapsed}
            title="Ajouter 10 secondes de pénalité"
            aria-label={`Ajouter 10 secondes de pénalité, piste ${track.trackId}`}
            className="min-h-11 min-w-11 flex items-center justify-center gap-1 px-2 rounded-lg bg-danger/10 border border-danger/40 text-danger hover:bg-danger/20 font-mono font-bold disabled:opacity-30 cursor-pointer transition"
          >
            <PlusCircle size={14} aria-hidden="true" />
            <span>10s</span>
          </button>
        </div>
      </div>

      {/* Boutons d'actions selon l'état */}
      <div className="flex items-center gap-1.5 pt-0.5">
        {track.isRunning ? (
          <>
            <button
              type="button"
              onClick={onStop}
              title="Mettre en pause le chrono"
              aria-label={`Mettre en pause le chrono, piste ${track.trackId}`}
              className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-app-input border border-app-card-border text-app-text-muted hover:text-app-text hover:border-primary transition cursor-pointer"
            >
              <Pause size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onSave}
              aria-label={`Arrêter et valider le temps, piste ${track.trackId}`}
              className="flex-1 min-h-11 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-secondary font-black font-display uppercase tracking-wider text-xs hover:scale-[1.01] active:scale-95 transition cursor-pointer shadow-md shadow-primary/20"
            >
              <Check size={14} aria-hidden="true" />
              <span>
                <span className="hidden @[16rem]:inline">Arrêter & </span>Valider
              </span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onStart}
              title="Reprendre le chronomètre"
              aria-label={`Reprendre le chrono, piste ${track.trackId}`}
              className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-primary/20 text-primary hover:bg-primary hover:text-secondary border border-primary/30 transition cursor-pointer"
            >
              <Play size={16} fill="currentColor" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onReset}
              title="Réinitialiser à 00:00.00"
              aria-label={`Réinitialiser le chrono à zéro, piste ${track.trackId}`}
              className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-app-input text-app-text-muted hover:text-warning border border-app-card-border transition cursor-pointer"
            >
              <RotateCcw size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onSave}
              aria-label={`Valider le score, piste ${track.trackId}`}
              className="flex-1 min-h-11 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-secondary font-black font-display uppercase tracking-wider text-xs hover:scale-[1.01] active:scale-95 transition cursor-pointer shadow-md shadow-primary/20"
            >
              <Check size={13} aria-hidden="true" />
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
interface PodiumTimes {
  best: number | null;
  second: number | null;
  third: number | null;
}

interface PublicTrackBlockProps {
  track: TrackState;
  isSingle?: boolean;
  podiumTimes: PodiumTimes;
}

function PublicTrackBlock({ track, isSingle = false, podiumTimes }: PublicTrackBlockProps) {
  const { best: bestTimeMs, second: secondTimeMs, third: thirdTimeMs } = podiumTimes;
  const time = useTrackElapsed(track);

  const hasBestRecord = typeof bestTimeMs === 'number' && bestTimeMs > 0;
  const showPaceGauge = hasBestRecord && (track.isRunning || time > 0);
  const paceRatio = hasBestRecord ? time / bestTimeMs! : 0;
  const pacePercent = Math.min(100, Math.max(0, paceRatio * 100));

  // ========================================================================
  // 3 PHASES VISUELLES DYNAMIQUES DE COURSE
  // ========================================================================
  let borderClass = 'border-primary shadow-primary/20 ring-2 ring-primary/20';
  let beamClass = 'bg-gradient-to-r from-primary via-success to-primary animate-pulse';
  let digitsClass = 'text-primary stopwatch-digits-running';
  let paceBarColor = 'bg-primary shadow-sm shadow-primary/30';
  let paceLabel = 'En route vers le record';
  let PaceIcon: typeof Trophy = Trophy;

  if (!hasBestRecord) {
    paceLabel = 'Premier record en jeu';
    PaceIcon = Zap;
  } else if (paceRatio >= 1) {
    // Phase 3 : Record 1re place dépassé -> Objectif 2e ou 3e place (Podium) & Tirage au sort !
    borderClass = 'border-accent shadow-accent/20 ring-2 ring-accent/30';
    beamClass = 'bg-gradient-to-r from-accent via-info to-primary';
    digitsClass = 'text-accent';
    paceBarColor = 'bg-gradient-to-r from-accent to-primary';

    if (secondTimeMs && time < secondTimeMs) {
      paceLabel = `Vise la 2e place (${formatTime(secondTimeMs)})`;
      PaceIcon = Medal;
    } else if (thirdTimeMs && time < thirdTimeMs) {
      paceLabel = `Vise la 3e place (${formatTime(thirdTimeMs)})`;
      PaceIcon = Medal;
    } else {
      paceLabel = 'Chaque participant est au tirage';
      PaceIcon = Gift;
    }
  } else if (paceRatio >= 0.8) {
    // Phase 2 : Zone critique (80% à 100% du record)
    borderClass = 'border-warning shadow-warning/25 ring-2 ring-warning/40';
    beamClass = 'bg-gradient-to-r from-warning via-warning/60 to-warning animate-pulse';
    digitsClass = 'text-warning';
    paceBarColor = 'bg-warning animate-pulse';
    const remainingSec = Math.max(0, (bestTimeMs! - time) / 1000).toFixed(1);
    paceLabel = `Record dans moins de ${remainingSec} s`;
    PaceIcon = Zap;
  }

  return (
    <div
      className={`@container relative overflow-hidden p-4 sm:p-5 rounded-3xl bg-app-card border shadow-lg flex flex-col justify-between h-full ${
        track.isRunning ? borderClass : 'border-app-card-border'
      }`}
    >
      {/* Faisceau lumineux supérieur */}
      <div
        className={`absolute top-0 left-0 right-0 h-1.5 transition-all duration-500 ${
          track.isRunning ? beamClass : 'bg-gradient-to-r from-primary/30 to-accent/30'
        }`}
      />

      {/* En-tête de la carte */}
      <div className="flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <span className="text-kiosk-caption uppercase font-black text-primary tracking-widest font-sans flex items-center gap-1.5">
            <Zap size={12} aria-hidden="true" />
            Piste {track.trackId}
          </span>
          <h3
            className={`font-display font-black uppercase text-app-text line-clamp-2 text-balance mt-0.5 leading-tight ${
              isSingle ? 'text-[clamp(1.5rem,6cqi,3.75rem)]' : 'text-[clamp(1.125rem,7cqi,1.875rem)]'
            }`}
          >
            {track.participantName}
          </h3>
        </div>

        {track.isRunning ? (
          <span className="text-kiosk-caption px-3 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 font-black uppercase font-sans shrink-0">
            En direct
          </span>
        ) : time === 0 ? (
          <span className="text-kiosk-caption px-2.5 py-1 rounded-full bg-warning/15 text-warning border border-warning/40 font-bold uppercase font-sans shrink-0">
            Prêt<span className="hidden @sm:inline"> au départ</span>
          </span>
        ) : (
          <span className="text-kiosk-caption px-2.5 py-1 rounded-full bg-success/15 text-success border border-success/40 font-bold uppercase font-sans shrink-0">
            <span className="hidden @sm:inline">Temps </span>final
          </span>
        )}
      </div>

      {/* Zone Chronomètre Géant LCD */}
      <div className="my-auto py-2 space-y-2">
        <div
          className="stopwatch-lcd py-2 sm:py-3.5 px-4 rounded-2xl bg-app-input border border-primary/30 font-mono font-black text-[clamp(2.5rem,15cqi,10rem)] leading-none tracking-wider tabular-nums text-center shadow-inner flex items-center justify-center"
        >
          <span className={track.isRunning ? digitsClass : time > 0 ? 'text-success' : 'text-app-text stopwatch-digits-idle'}>
            {formatTime(time)}
          </span>
        </div>

        {/* Jauge de rythme dynamique et épaisse (10px) */}
        {showPaceGauge && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-kiosk-caption font-black uppercase tracking-wider">
              <span className="text-app-text truncate mr-2 flex items-center gap-1.5 min-w-0">
                <PaceIcon size={14} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{paceLabel}</span>
              </span>
              <span className="font-mono text-app-text-muted shrink-0">
                <span className="hidden @md:inline">Record : </span>
                {formatTime(bestTimeMs!)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`Progression vers le record, piste ${track.trackId}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pacePercent)}
              className="w-full h-2.5 sm:h-3 rounded-full bg-app-input border border-app-card-border overflow-hidden p-0.5 shadow-inner"
            >
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
  const sorted = [...participants].sort(compareByRank);
  const rankMap = buildRankMap(participants);

  if (sorted.length === 0) {
    return (
      <div className="shrink-0 h-[clamp(3rem,4.5vh,4.5rem)] rounded-2xl bg-app-card/80 border border-app-card-border shadow-sm flex items-center justify-center px-4 text-kiosk-caption font-semibold text-app-text-muted">
        <Sparkles size={14} className="text-primary mr-2 animate-pulse" />
        <span>Soyez le premier participant à relever le défi et inscrire votre nom au classement !</span>
      </div>
    );
  }

  // Duplication pour assurer une boucle fluide sans saut visuel
  const displayItems = sorted.length < 8 ? [...sorted, ...sorted, ...sorted, ...sorted] : [...sorted, ...sorted];

  return (
    <div className="shrink-0 h-[clamp(3rem,4.5vh,4.5rem)] rounded-2xl bg-app-card/95 border border-app-card-border shadow-md backdrop-blur-md flex items-center overflow-hidden">
      {/* Badge fixe gauche avec conteneur opaque et ombre portée masquante */}
      <div className="shrink-0 h-full flex items-center bg-app-card pl-2.5 sm:pl-3.5 pr-3 z-20 shadow-[15px_0_15px_-4px_rgba(0,0,0,0.35)] border-r border-app-card-border/60">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/20 border border-primary/40 text-primary font-display font-black text-kiosk-caption uppercase tracking-wider shadow-sm">
          <Users size={13} className="shrink-0" />
          <span className="hidden sm:inline">Tous les participants</span>
          <span className="font-mono px-1 rounded bg-primary/25">({sorted.length})</span>
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
            const hasTime = hasValidTime(p);
            const rankIndex = rankMap.get(p.id) ?? null;

            // Insérer une puce événementielle spéciale toutes les 4 personnes
            const isEventDivider = idx > 0 && idx % 4 === 0;
            // Les copies servent seulement à la boucle visuelle : un lecteur d'écran lit la liste une fois
            const isLoopCopy = idx >= sorted.length;

            return (
              <React.Fragment key={`${p.id}-${idx}`}>
                {isEventDivider && (
                  <div
                    aria-hidden={isLoopCopy || undefined}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-xl bg-primary/10 border border-primary/30 text-kiosk-caption font-black uppercase text-primary tracking-wide shadow-sm"
                  >
                    {idx % 8 === 0 ? (
                      <>
                        <Trophy size={12} className="text-warning shrink-0" />
                        <span>1er Prix : {prizes.best.shortTitle || prizes.best.title}</span>
                      </>
                    ) : (
                      <>
                        <Gift size={12} className="text-accent shrink-0" />
                        <span>Tirage : {prizes.raffle.shortTitle || prizes.raffle.title}</span>
                      </>
                    )}
                  </div>
                )}

                <div
                  aria-hidden={isLoopCopy || undefined}
                  className="shrink-0 flex items-center gap-2 px-3 py-1 rounded-xl bg-app-input border border-app-card-border shadow-sm text-kiosk-caption"
                >
                  {rankIndex !== null ? (
                    <RankBadge rank={rankIndex} />
                  ) : (
                    <span className="p-1 rounded bg-primary/10 text-primary" aria-hidden="true">
                      <Clock size={12} />
                    </span>
                  )}

                  <span className="font-bold text-app-text truncate max-w-[16rem]">{p.name}</span>

                  {hasTime ? (
                    <span className="font-mono font-black text-primary tabular-nums">
                      {formatTime(p.timeMs!)}
                    </span>
                  ) : (
                    <span className="text-app-text-muted italic">En attente</span>
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

type ParticipantDraft = { name: string; email: string; postal: string; consent: boolean };

function readParticipantDraft(key: string): ParticipantDraft {
  const empty = { name: '', email: '', postal: '', consent: false };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved || typeof saved !== 'object') return empty;
    return {
      name: typeof saved.name === 'string' ? saved.name : '',
      email: typeof saved.email === 'string' ? saved.email : '',
      postal: typeof saved.postal === 'string' ? saved.postal : '',
      consent: saved.consent === true
    };
  } catch (e) {
    return empty;
  }
}

function writeParticipantDraft(key: string, draft: ParticipantDraft) {
  try {
    if (draft.name || draft.email || draft.postal || draft.consent) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch (e) {
    // Stockage indisponible (navigation privée) : le formulaire fonctionne sans brouillon
  }
}
