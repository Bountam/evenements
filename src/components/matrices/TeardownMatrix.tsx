import React, { useState, useEffect, useRef } from 'react';
import { EventSettings, Participant, TrackState, RaffleState } from '../../types';
import { db, registerSyncListener } from '../../db';
import { networkManager } from '../../network';
import Stopwatch, { formatTime } from '../shared/Stopwatch';
import Leaderboard, { parseTimeInputToMs } from '../shared/Leaderboard';
import RaffleSpinner from '../shared/RaffleSpinner';
import { showToast } from '../shared/Toast';
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
  Users
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

export default function TeardownMatrix({ event, activeTab }: TeardownMatrixProps) {
  // 1. États principaux
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [lastSavedParticipantId, setLastSavedParticipantId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [participantFilter, setParticipantFilter] = useState<'all' | 'waiting' | 'ranked'>('all');
  const [manualScoreParticipantId, setManualScoreParticipantId] = useState<string | null>(null);
  const [manualScoreInput, setManualScoreInput] = useState<string>('');

  // État des 5 pistes (géré en local et synchronisé via networkManager + BroadcastChannel)
  const [tracks, setTracks] = useState<Record<number, TrackState>>(() => ({
    ...networkManager.tracksState
  }));

  const [raffle, setRaffle] = useState<RaffleState>({
    status: 'idle',
    winnerId: null,
    spinStartTime: null
  });

  // Formulaire d'ajout de participant
  const [newParticipantName, setNewParticipantName] = useState('');
  const [newParticipantEmail, setNewParticipantEmail] = useState('');
  const [newParticipantPostal, setNewParticipantPostal] = useState('');
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
      if (payload && payload.participantName) {
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
      const elapsed = Date.now() - raffle.spinStartTime;
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
    const startTime = Date.now();
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
    const elapsed = Math.max(1, Date.now() - track.startTime + track.elapsedBeforeStart);

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
      const currentElapsed = Date.now() - track.startTime + track.elapsedBeforeStart;
      const newElapsed = Math.max(0, currentElapsed + deltaMs);
      networkManager.sendChronoAction({
        type: 'TIMER_START',
        trackId,
        startTime: Date.now(),
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
      participantName
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
      finalTime = Date.now() - track.startTime + track.elapsedBeforeStart;
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
  const startRaffle = async () => {
    const list = participants.filter((p) => p.name);
    if (list.length === 0) return;

    const randomIndex = Math.floor(Math.random() * list.length);
    const winner = list[randomIndex];
    const spinStartTime = Date.now();

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

    // 2. Enregistrer le gagnant dans l'événement pour la sauvegarde JSON et l'affichage admin
    try {
      const currentEvent = await db.events.get(event.id);
      if (currentEvent) {
        currentEvent.extraData = {
          ...currentEvent.extraData,
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

  const resetRaffle = () => {
    setRaffle({ status: 'idle', winnerId: null, spinStartTime: null });
    networkManager.sendChronoAction({ type: 'RAFFLE_RESET' });

    const channel = new BroadcastChannel(`insertech_teardown_sync_${event.id}`);
    channel.postMessage({ type: 'RAFFLE_RESET' });
    channel.close();
  };

  // ACTIONS PARTICIPANTS
  const addParticipant = async (e: React.FormEvent, autoAssignTrack: boolean = false) => {
    e.preventDefault();
    if (!newParticipantName.trim()) {
      showToast('Veuillez saisir le nom du participant.', 'warning');
      return;
    }

    const newP: Participant = {
      id: 'p-' + Math.random().toString(36).substring(2, 11),
      eventId: event.id,
      name: newParticipantName.trim(),
      email: newParticipantEmail.trim(),
      postalCode: newParticipantPostal.trim().toUpperCase() || undefined,
      timeMs: null,
      registeredAt: Date.now()
    };

    try {
      await networkManager.writeToDatabase('participants', 'put', newP);
      setParticipants((prev) => [newP, ...prev]);
      setNewParticipantName('');
      setNewParticipantEmail('');
      setNewParticipantPostal('');

      if (autoAssignTrack) {
        const freeTrack = Object.values(tracks).find((t) => t.participantId === null);
        if (freeTrack) {
          networkManager.sendChronoAction({
            type: 'TRACK_ASSIGN',
            trackId: freeTrack.trackId,
            participantId: newP.id,
            participantName: newP.name
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
  const averageTimeMs =
    rankedParticipants.length > 0
      ? Math.round(
          rankedParticipants.reduce((acc, p) => acc + (p.timeMs || 0), 0) / rankedParticipants.length
        )
      : null;

  // Filtrage de la liste des participants
  const filteredParticipants = participants.filter((p) => {
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
  });

  // Rendu des Chronomètres Individuels Adaptatifs sur l'Écran Public
  const activeTracks = Object.values(tracks).filter((t) => t.participantId !== null);

  // ============================================================================
  // RENDU DE L'ÉCRAN PUBLIC DE PROJECTION
  // ============================================================================
  if (activeTab === 'public') {
    if (raffle.status !== 'idle') {
      return (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl text-center space-y-4 shadow-lg">
            <h2 className="text-2xl font-display font-bold text-white uppercase tracking-wider">
              Tirage au Sort en Direct
            </h2>
            <p className="text-xs text-slate-400 font-sans">
              Un ordinateur reconditionné Insertech est en jeu parmi les participants !
            </p>
          </div>
          <RaffleSpinner
            state={raffle}
            participants={participants}
            onStartRaffle={startRaffle}
            onResetRaffle={resetRaffle}
            readOnly={true}
          />
        </div>
      );
    }

    let gridColsClass = 'grid-cols-1';
    let blockHeightClass = 'min-h-[220px]';

    if (activeTracks.length === 2) {
      gridColsClass = 'grid-cols-1 md:grid-cols-2';
    } else if (activeTracks.length === 3 || activeTracks.length === 4) {
      gridColsClass = 'grid-cols-1 md:grid-cols-2';
      blockHeightClass = 'min-h-[160px]';
    } else if (activeTracks.length === 5) {
      gridColsClass = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
      blockHeightClass = 'min-h-[150px]';
    }

    return (
      <div className="space-y-8">
        <div className="text-center py-4 bg-[#24123d]/40 rounded-3xl border border-purple-950/40 max-w-3xl mx-auto shadow px-4">
          <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider flex justify-center items-center gap-2">
            <Timer className="text-primary animate-pulse" size={20} />
            <span>Kiosque-Concours : Montage & Démontage en Direct</span>
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-1">
            {bestParticipant
              ? `Record actuel à battre : ${formatTime(bestParticipant.timeMs!)} par ${bestParticipant.name} 🏆`
              : 'Les temps de démontage et remontage s\'affichent en temps réel.'}
          </p>
        </div>

        {activeTracks.length === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-5xl mx-auto">
            <div className="lg:col-span-7 bg-[#24123d]/40 border border-purple-950 p-10 rounded-3xl text-center space-y-4">
              <div className="w-16 h-16 bg-purple-950 border border-purple-800 rounded-full flex items-center justify-center text-primary mx-auto">
                <Timer size={28} className="animate-pulse" />
              </div>
              <h3 className="text-xl font-display font-bold text-white uppercase">
                Prêt pour le prochain départ
              </h3>
              <p className="text-sm text-slate-400 font-sans max-w-sm mx-auto">
                Présentez-vous à la table d'assemblage pour enregistrer votre nom et tenter de battre le meilleur temps !
              </p>
              {bestParticipant && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary/10 border border-primary/30 text-primary text-xs font-bold mt-2">
                  <Trophy size={14} />
                  <span>
                     Champion actuel : {bestParticipant.name} ({formatTime(bestParticipant.timeMs!)})
                  </span>
                </div>
              )}
            </div>
            <div className="lg:col-span-5">
              <Leaderboard participants={participants} highlightId={lastSavedParticipantId} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8">
              <div className={`grid ${gridColsClass} gap-6`}>
                {activeTracks.map((track) => (
                  <PublicTrackBlock
                    key={track.trackId}
                    track={track}
                    heightClass={blockHeightClass}
                    isSingle={activeTracks.length === 1}
                    bestTimeMs={bestParticipant?.timeMs ?? null}
                  />
                ))}
              </div>
            </div>

            <div className="lg:col-span-4">
              <Leaderboard participants={participants} highlightId={lastSavedParticipantId} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // RENDU DE L'ÉCRAN ORGANISATEUR (ADMIN / ARBITRAGE)
  // ============================================================================
  return (
    <div className="space-y-6">
      {/* Bandeau de statistiques en temps réel */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#24123d]/60 border border-purple-900/40 p-4 rounded-2xl flex items-center gap-3.5 shadow">
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            <Users size={18} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Participants</span>
            <span className="text-xl font-display font-bold text-white">{participants.length}</span>
          </div>
        </div>

        <div className="bg-[#24123d]/60 border border-purple-900/40 p-4 rounded-2xl flex items-center gap-3.5 shadow">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Check size={18} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Scores Validés</span>
            <span className="text-xl font-display font-bold text-white">
              {rankedParticipants.length}{' '}
              <span className="text-xs font-sans text-slate-400 font-normal">
                / {participants.length}
              </span>
            </span>
          </div>
        </div>

        <div className="bg-[#24123d]/60 border border-purple-900/40 p-4 rounded-2xl flex items-center gap-3.5 shadow">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center text-yellow-400 shrink-0">
            <Trophy size={18} />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Record Actuel</span>
            <span className="text-lg font-mono font-bold text-primary block truncate">
              {bestParticipant ? formatTime(bestParticipant.timeMs!) : '--:--.--'}
            </span>
            {bestParticipant && (
              <span className="text-[10px] text-slate-400 truncate block">{bestParticipant.name}</span>
            )}
          </div>
        </div>

        <div className="bg-[#24123d]/60 border border-purple-900/40 p-4 rounded-2xl flex items-center gap-3.5 shadow">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
            <Clock size={18} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Temps Moyen</span>
            <span className="text-lg font-mono font-bold text-white">
              {averageTimeMs ? formatTime(averageTimeMs) : '--:--.--'}
            </span>
          </div>
        </div>
      </div>

      {/* Bandeau de contrôle du tirage au sort lorsqu'il est actif */}
      {raffle.status !== 'idle' && (
        <div className="bg-primary/10 border border-primary/30 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            <Sparkles className="text-primary animate-spin shrink-0" size={18} />
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-bold text-primary tracking-widest block leading-none">
                {raffle.status === 'spinning'
                  ? "Tirage en cours sur l'écran public"
                  : 'Gagnant sélectionné sur l\'écran public'}
              </span>
              <span className="font-bold text-white text-xs block mt-1 truncate">
                {raffle.status === 'spinning' ? (
                  <span className="flex items-center gap-1.5 text-slate-300">
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
          <button
            onClick={resetRaffle}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-red-950/60 border border-red-900/60 text-xs font-bold font-display uppercase text-red-300 hover:text-white hover:bg-red-900 transition cursor-pointer"
          >
            Fermer le tirage et revenir aux chronos
          </button>
        </div>
      )}

      <div
        className={`grid grid-cols-1 lg:grid-cols-12 gap-8 items-start transition-all duration-500 ${
          raffle.status === 'spinning' ? 'opacity-40 pointer-events-none scale-[0.99]' : ''
        }`}
      >
        {/* Colonne Gauche : Inscription & Liste des participants */}
        <div className="lg:col-span-4 space-y-6">
          {/* Ajouter un participant */}
          <div className="bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
            <h3 className="text-base font-bold font-display text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <UserPlus size={18} className="text-primary" />
              <span>Nouveau Participant</span>
            </h3>

            <form onSubmit={(e) => addParticipant(e, false)} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-300 block">
                  Nom complet *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-slate-500" size={14} />
                  <input
                    type="text"
                    required
                    value={newParticipantName}
                    onChange={(e) => setNewParticipantName(e.target.value)}
                    placeholder="Jean Tremblay"
                    className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl pl-9 pr-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-300 block">
                  Adresse courriel
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-slate-500" size={14} />
                  <input
                    type="email"
                    value={newParticipantEmail}
                    onChange={(e) => setNewParticipantEmail(e.target.value)}
                    placeholder="jean.t@email.com"
                    className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl pl-9 pr-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-300 block">
                  Code postal
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-slate-500" size={14} />
                  <input
                    type="text"
                    value={newParticipantPostal}
                    onChange={(e) => setNewParticipantPostal(e.target.value)}
                    placeholder="H2W 1Y4"
                    className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl pl-9 pr-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-purple-950 border border-primary/40 text-primary font-bold font-display uppercase tracking-wider text-xs hover:bg-primary hover:text-secondary transition cursor-pointer"
                >
                  <UserPlus size={14} />
                  <span>Inscrire</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => addParticipant(e as any, true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 transition cursor-pointer"
                  title="Inscrire et envoyer directement sur la première piste libre"
                >
                  <Play size={14} fill="currentColor" />
                  <span>Inscrire + Piste</span>
                </button>
              </div>
            </form>
          </div>

          {/* Résultat du tirage au sort (s'il a été effectué) */}
          {event.extraData?.raffleWinnerName && (
            <div className="bg-primary/10 border border-primary/30 p-5 rounded-3xl space-y-2 relative overflow-hidden">
              <div className="absolute right-2 -bottom-2 opacity-10 text-primary">
                <Award size={80} />
              </div>
              <span className="text-[9px] uppercase font-black text-primary tracking-widest block">
                🏆 Dernier gagnant du tirage au sort
              </span>
              <h4 className="text-sm font-bold text-white leading-tight font-display">
                {event.extraData.raffleWinnerName}
              </h4>
              <div className="text-[10px] text-slate-400 font-sans space-y-0.5">
                {event.extraData.raffleWinnerEmail && (
                  <p>Courriel : {event.extraData.raffleWinnerEmail}</p>
                )}
                {event.extraData.raffleWinnerPostal && (
                  <p>Code postal : {event.extraData.raffleWinnerPostal}</p>
                )}
                <p className="text-[9px] text-slate-500 mt-1">
                  Tiré le {new Date(event.extraData.raffleWinnerAt).toLocaleString('fr-CA')}
                </p>
              </div>
            </div>
          )}

          {/* Liste des participants avec recherche et actions rapides */}
          <div className="bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold font-display text-white uppercase tracking-wider">
                Participants ({filteredParticipants.length}/{participants.length})
              </h3>
            </div>

            {/* Barre de recherche et filtres */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-500" size={13} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un participant..."
                  className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl pl-8 pr-3 py-1.5 text-white text-xs focus:outline-none focus:border-primary transition"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {(['all', 'waiting', 'ranked'] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    onClick={() => setParticipantFilter(filterKey)}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer border ${
                      participantFilter === filterKey
                        ? 'bg-primary text-secondary border-primary'
                        : 'bg-[#180A2b]/60 text-slate-400 border-purple-950 hover:text-white'
                    }`}
                  >
                    {filterKey === 'all'
                      ? 'Tous'
                      : filterKey === 'waiting'
                        ? 'En attente'
                        : 'Classés'}
                  </button>
                ))}
              </div>
            </div>

            {filteredParticipants.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 font-sans">
                Aucun participant correspondant.
              </p>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {filteredParticipants.map((p) => {
                  const hasTime = typeof p.timeMs === 'number' && p.timeMs > 0;
                  const assignedTrack = Object.values(tracks).find((t) => t.participantId === p.id);
                  const isAssigned = Boolean(assignedTrack);
                  const isManualEditing = manualScoreParticipantId === p.id;

                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-xl border transition space-y-2 ${
                        isAssigned
                          ? 'bg-primary/10 border-primary text-white'
                          : hasTime
                            ? 'bg-[#180A2b]/70 border-purple-900/50 text-slate-200'
                            : 'bg-[#180A2b]/40 border-purple-950 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold truncate">{p.name}</h4>
                          <p className="text-[10px] text-slate-400 truncate font-sans">
                            {isAssigned ? (
                              <span className="text-primary font-bold">
                                ⏱️ En course (Piste {assignedTrack?.trackId})
                              </span>
                            ) : hasTime ? (
                              <span className="font-mono text-primary font-semibold">
                                ✓ {formatTime(p.timeMs!)}
                              </span>
                            ) : (
                              'En attente de passage'
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {!isAssigned && (
                            <button
                              onClick={() => handleQuickSendToTrack(p.id)}
                              title={
                                hasTime
                                  ? 'Nouvelle tentative (envoyer sur une piste libre)'
                                  : 'Envoyer sur une piste libre'
                              }
                              className="p-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary hover:text-secondary transition cursor-pointer"
                            >
                              <Play size={12} fill="currentColor" />
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
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-purple-900/50 transition cursor-pointer"
                          >
                            <Edit3 size={12} />
                          </button>

                          {hasTime && !isAssigned && (
                            <button
                              onClick={() => handleResetParticipantScore(p.id)}
                              title="Réinitialiser le score (remettre en attente)"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10 transition cursor-pointer"
                            >
                              <RotateCcw size={12} />
                            </button>
                          )}

                          <button
                            onClick={() => deleteParticipant(p.id)}
                            disabled={isAssigned}
                            title="Supprimer le participant"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Zone de saisie manuelle de score */}
                      {isManualEditing && (
                        <div className="pt-2 border-t border-purple-900/40 flex items-center gap-1.5">
                          <input
                            type="text"
                            value={manualScoreInput}
                            onChange={(e) => setManualScoreInput(e.target.value)}
                            placeholder="Ex: 01:24.50 ou 84.5"
                            className="flex-1 bg-[#180A2b] border border-primary/60 rounded-lg px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-primary"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const ms = parseTimeInputToMs(manualScoreInput);
                                if (ms) handleUpdateScoreManually(p.id, ms);
                                else showToast('Format attendu : MM:SS.cc (ex: 01:15.40) ou secondes (ex: 75.4)', 'warning');
                              }
                              if (e.key === 'Escape') setManualScoreParticipantId(null);
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              const ms = parseTimeInputToMs(manualScoreInput);
                              if (ms) handleUpdateScoreManually(p.id, ms);
                              else showToast('Format attendu : MM:SS.cc (ex: 01:15.40) ou secondes (ex: 75.4)', 'warning');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-primary text-secondary font-bold text-[10px] uppercase cursor-pointer"
                          >
                            Valider
                          </button>
                          <button
                            onClick={() => setManualScoreParticipantId(null)}
                            className="p-1 rounded-lg bg-purple-950 text-slate-400 hover:text-white cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Colonne Droite : Les 5 pistes d'arbitrage + Tableau des Champions */}
        <div className="lg:col-span-8 space-y-8">
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] tracking-wider uppercase font-black text-primary font-sans">
                  Arbitrage Multi-Pistes • Montage & Démontage
                </span>
                <h2 className="text-xl font-bold font-display text-white uppercase">
                  Gestion des 5 Chronomètres
                </h2>
              </div>

              <button
                onClick={startRaffle}
                disabled={participants.length === 0}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer shadow-md"
              >
                <Sparkles size={14} />
                <span>Lancer un tirage au sort ({participants.length})</span>
              </button>
            </div>

            {/* Grille des 5 pistes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.values(tracks).map((track) => {
                // Participants qui ne sont pas déjà en course sur une piste
                const assignableParticipants = participants.filter(
                  (p) => !Object.values(tracks).some((t) => t.participantId === p.id)
                );

                return (
                  <AdminTrackBlock
                    key={track.trackId}
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
                );
              })}
            </div>
          </div>

          {/* Tableau des Champions directement visible et éditable par l'arbitre */}
          <Leaderboard
            participants={participants}
            highlightId={lastSavedParticipantId}
            isAdmin={true}
            onResetScore={handleResetParticipantScore}
            onUpdateScore={handleUpdateScoreManually}
            onSendToTrack={handleQuickSendToTrack}
          />
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
  const waitingParticipants = assignableParticipants.filter(
    (p) => p.timeMs === null || p.timeMs <= 0
  );
  const retryParticipants = assignableParticipants.filter(
    (p) => typeof p.timeMs === 'number' && p.timeMs > 0
  );

  const hasElapsed = track.isRunning || track.elapsedBeforeStart > 0;

  return (
    <div
      className={`relative overflow-hidden p-5 rounded-2xl bg-[#24123d]/60 border shadow-lg space-y-4 transition-all duration-300 ${
        track.isRunning
          ? 'border-primary shadow-primary/15'
          : track.participantId
            ? 'border-purple-700/60'
            : 'border-purple-900/40'
      }`}
    >
      {/* Faisceau lumineux supérieur de statut de piste */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 transition-all duration-500 ${
          track.isRunning
            ? 'bg-gradient-to-r from-primary via-emerald-400 to-primary animate-pulse'
            : track.participantId
              ? 'bg-gradient-to-r from-purple-500 to-primary/60'
              : 'bg-transparent'
        }`}
      />

      {/* En-tête de piste */}
      <div className="flex items-center justify-between pb-2 border-b border-purple-950">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold font-display text-primary uppercase">
            Piste {track.trackId}
          </span>
          {track.isRunning ? (
            <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 font-bold uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
              <span>En course</span>
            </span>
          ) : track.participantId ? (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/50 font-bold uppercase">
              Prêt
            </span>
          ) : null}
        </div>
        {track.participantId && (
          <button
            onClick={() => onAssign(null)}
            disabled={track.isRunning}
            className="text-[9px] px-2.5 py-0.5 rounded bg-purple-950 text-slate-400 hover:text-white border border-purple-900/40 disabled:opacity-40 cursor-pointer transition"
          >
            Libérer la piste
          </button>
        )}
      </div>

      {track.participantId ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                Participant en piste
              </span>
              <h4 className="font-bold text-white text-base font-display uppercase truncate">
                {track.participantName}
              </h4>
            </div>
          </div>

          <Stopwatch
            state={track}
            onStart={onStart}
            onStop={onStop}
            onReset={onReset}
            bestTimeMs={bestTimeMs}
          />

          {/* Boutons rapides de pénalité / bonus d'arbitrage */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[9px] uppercase font-bold text-slate-400">
              Ajustement / Pénalité :
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onAdjustTime(-5000)}
                disabled={!hasElapsed}
                title="Retirer 5 secondes (bonus)"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-950/50 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/60 text-[10px] font-mono font-bold disabled:opacity-30 cursor-pointer transition"
              >
                <MinusCircle size={11} />
                <span>5s</span>
              </button>
              <button
                type="button"
                onClick={() => onAdjustTime(5000)}
                disabled={!hasElapsed}
                title="Ajouter 5 secondes de pénalité (ex: vis oubliée)"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-950/50 border border-amber-700/40 text-amber-300 hover:bg-amber-900/60 text-[10px] font-mono font-bold disabled:opacity-30 cursor-pointer transition"
              >
                <PlusCircle size={11} />
                <span>5s</span>
              </button>
              <button
                type="button"
                onClick={() => onAdjustTime(10000)}
                disabled={!hasElapsed}
                title="Ajouter 10 secondes de pénalité (ex: pièce mal montée)"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-950/50 border border-red-700/40 text-red-300 hover:bg-red-900/60 text-[10px] font-mono font-bold disabled:opacity-30 cursor-pointer transition"
              >
                <PlusCircle size={11} />
                <span>10s</span>
              </button>
            </div>
          </div>

          <button
            onClick={onSave}
            disabled={!hasElapsed}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer shadow-md"
          >
            <Check size={15} />
            <span>
              {track.isRunning ? 'Arrêter & Enregistrer le score' : 'Enregistrer le score'}
            </span>
          </button>
        </div>
      ) : (
        <div className="py-6 text-center space-y-3">
          <User className="text-slate-600 mx-auto" size={24} />
          <p className="text-xs text-slate-400 font-sans">Piste libre — aucun participant en course.</p>

          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onAssign(e.target.value);
            }}
            className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-primary transition cursor-pointer"
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
      )}
    </div>
  );
}

// ============================================================================
// COMPOSANT : Bloc de Piste de l'Écran Public
// ============================================================================
interface PublicTrackBlockProps {
  track: TrackState;
  heightClass: string;
  isSingle?: boolean;
  bestTimeMs?: number | null;
}

function PublicTrackBlock({
  track,
  heightClass,
  isSingle = false,
  bestTimeMs = null
}: PublicTrackBlockProps) {
  const [time, setTime] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (track.isRunning && track.startTime !== null) {
      const tick = () => {
        setTime(Date.now() - track.startTime! + track.elapsedBeforeStart);
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

  let paceBarColor = 'bg-primary';
  let paceLabel = 'En avance sur le record 🏆';
  if (paceRatio >= 1) {
    paceBarColor = 'bg-rose-500';
    paceLabel = `Record dépassé (+${((time - bestTimeMs!) / 1000).toFixed(2)}s)`;
  } else if (paceRatio >= 0.75) {
    paceBarColor = 'bg-amber-400 animate-pulse';
    paceLabel = 'Zone critique du record ⚡';
  }

  return (
    <div
      className={`relative overflow-hidden p-6 rounded-3xl bg-[#24123d]/60 border shadow-lg flex flex-col justify-between ${heightClass} ${
        track.isRunning ? 'border-primary shadow-primary/15' : 'border-purple-900/40'
      }`}
    >
      {/* Faisceau lumineux supérieur */}
      <div
        className={`absolute top-0 left-0 right-0 h-1.5 transition-all duration-500 ${
          track.isRunning
            ? 'bg-gradient-to-r from-primary via-emerald-400 to-primary animate-pulse'
            : 'bg-gradient-to-r from-purple-600/50 to-primary/40'
        }`}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] uppercase font-black text-primary tracking-widest font-sans">
            Piste {track.trackId}
          </span>
          <h3
            className={`font-display font-bold uppercase text-white truncate mt-1 ${
              isSingle ? 'text-4xl' : 'text-xl'
            }`}
          >
            {track.participantName}
          </h3>
        </div>

        {track.isRunning ? (
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 font-bold uppercase animate-pulse font-sans shrink-0">
            En cours
          </span>
        ) : (
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-purple-950 text-slate-400 border border-purple-900/40 font-bold uppercase font-sans shrink-0">
            Prêt / Stop
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div
          className={`stopwatch-lcd px-4 py-2.5 rounded-2xl bg-purple-950/80 border border-primary/20 font-mono font-bold tracking-wider tabular-nums text-center ${
            isSingle ? 'text-6xl sm:text-8xl' : 'text-3xl sm:text-5xl'
          }`}
        >
          <span className={track.isRunning ? 'text-primary stopwatch-digits-running' : 'text-white stopwatch-digits-idle'}>
            {formatTime(time)}
          </span>
        </div>

        {showPaceGauge && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
              <span className="text-slate-300">{paceLabel}</span>
              <span className="font-mono text-slate-400">Record : {formatTime(bestTimeMs!)}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-purple-950/90 border border-purple-900/60 overflow-hidden p-0.5">
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

