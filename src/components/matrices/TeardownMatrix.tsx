import React, { useState, useEffect, useRef } from 'react';
import { EventSettings, Participant, TrackState, RaffleState, SyncMessage } from '../../types';
import { db, notifySync, registerSyncListener } from '../../db';
import { networkManager } from '../../network';
import Stopwatch, { formatTime } from '../shared/Stopwatch';
import Leaderboard from '../shared/Leaderboard';
import RaffleSpinner from '../shared/RaffleSpinner';
import { 
  UserPlus, Play, Square, RotateCcw, Award, Trash2, Check, RefreshCw, Sparkles, User, Mail, MapPin, Grid, Timer
} from 'lucide-react';

interface TeardownMatrixProps {
  event: EventSettings;
  activeTab: 'admin' | 'public';
}

export default function TeardownMatrix({ event, activeTab }: TeardownMatrixProps) {
  // 1. States
  const [participants, setParticipants] = useState<Participant[]>([]);
  
  // État des 5 pistes (géré en local et synchronisé via le networkManager)
  const [tracks, setTracks] = useState<Record<number, TrackState>>({
    1: { trackId: 1, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0 },
    2: { trackId: 2, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0 },
    3: { trackId: 3, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0 },
    4: { trackId: 4, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0 },
    5: { trackId: 5, participantId: null, participantName: null, isRunning: false, startTime: null, elapsedBeforeStart: 0 }
  });

  const [raffle, setRaffle] = useState<RaffleState>({
    status: 'idle',
    winnerId: null,
    spinStartTime: null,
  });

  // Formulaire d'ajout de participant
  const [newParticipantName, setNewParticipantName] = useState('');
  const [newParticipantEmail, setNewParticipantEmail] = useState('');
  const [newParticipantPostal, setNewParticipantPostal] = useState('');
  const [raffleDisplayValue, setRaffleDisplayValue] = useState<string>('');

  useEffect(() => {
    if (raffle.status === 'spinning' && participants.length > 0) {
      const interval = setInterval(() => {
        const eligible = participants.filter(p => p.name);
        if (eligible.length > 0) {
          const randomIndex = Math.floor(Math.random() * eligible.length);
          setRaffleDisplayValue(eligible[randomIndex].name);
        }
      }, 80);
      return () => clearInterval(interval);
    } else if (raffle.status === 'celebrating' && raffle.winnerId) {
      const winner = participants.find(p => p.id === raffle.winnerId);
      setRaffleDisplayValue(winner ? winner.name : 'Tirage complété');
    }
  }, [raffle.status, raffle.winnerId, participants]);

  // Charger les participants
  const loadParticipants = async () => {
    try {
      const data = await db.participants.where('eventId').equals(event.id).toArray();
      setParticipants(data.sort((a, b) => b.registeredAt - a.registeredAt));
    } catch (e) {
      console.error(e);
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

    // S'abonner aux événements réseau de chronomètre PeerJS
    networkManager.onTracksSync = (updatedTracks) => {
      setTracks({ ...updatedTracks });
    };

    networkManager.onCelebration = (payload) => {
      // Intégrer les célébrations si nécessaire
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
        setRaffle(prev => ({ ...prev, status: 'celebrating' }));
      } else {
        const timer = setTimeout(() => {
          setRaffle(prev => ({ ...prev, status: 'celebrating' }));
        }, timeLeft);
        return () => clearTimeout(timer);
      }
    }
  }, [raffle.status, raffle.spinStartTime]);

  // Transition du gagnant célébré (celebrating) vers le retour aux scores (idle) après 10s
  useEffect(() => {
    if (raffle.status === 'celebrating') {
      const timer = setTimeout(() => {
        resetRaffle();
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [raffle.status]);

  // ACTIONS CHRONOMÈTRES CONCURRENTS (P2P)
  const handleStartTimer = (trackId: number) => {
    const startTime = Date.now();
    networkManager.sendChronoAction({
      type: 'TIMER_START',
      trackId,
      startTime,
      elapsedBeforeStart: tracks[trackId].elapsedBeforeStart
    });
  };

  const handleStopTimer = (trackId: number) => {
    const track = tracks[trackId];
    if (!track.isRunning || track.startTime === null) return;
    const elapsed = Date.now() - track.startTime + track.elapsedBeforeStart;
    
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

  const handleAssignParticipant = (trackId: number, participantId: string | null) => {
    let participantName: string | null = null;
    if (participantId) {
      const p = participants.find(part => part.id === participantId);
      if (p) participantName = p.name;
    }

    networkManager.sendChronoAction({
      type: 'TRACK_ASSIGN',
      trackId,
      participantId,
      participantName
    });
  };

  const handleSaveTrackTime = async (trackId: number) => {
    const track = tracks[trackId];
    if (!track.participantId) return;

    let finalTime = track.elapsedBeforeStart;
    if (track.isRunning && track.startTime !== null) {
      finalTime = Date.now() - track.startTime + track.elapsedBeforeStart;
    }

    try {
      const participant = await db.participants.get(track.participantId);
      if (participant) {
        participant.timeMs = finalTime;
        
        // Sauvegarder dans la base avec synchronisation réseau
        await networkManager.writeToDatabase('participants', 'put', participant);
        
        // Libérer la piste
        handleAssignParticipant(trackId, null);
        loadParticipants();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ACTIONS TIRAGE AU SORT (RAFFLE)
  const startRaffle = async () => {
    const list = participants.filter(p => p.name);
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

    // 1. Démarrer le tirage sur le réseau P2P
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
    // 0. Mettre à jour l'état local de l'onglet émetteur
    setRaffle({ status: 'idle', winnerId: null, spinStartTime: null });

    // 1. Réinitialiser sur le réseau P2P
    networkManager.sendChronoAction({ type: 'RAFFLE_RESET' });

    // 2. Notifier les onglets locaux hors P2P
    const channel = new BroadcastChannel(`insertech_teardown_sync_${event.id}`);
    channel.postMessage({ type: 'RAFFLE_RESET' });
    channel.close();
  };

  // ACTIONS PARTICIPANTS
  const addParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParticipantName.trim()) return;

    const newP: Participant = {
      id: 'p-' + Math.random().toString(36).substring(2, 11),
      eventId: event.id,
      name: newParticipantName.trim(),
      email: newParticipantEmail.trim(),
      postalCode: newParticipantPostal.trim() || undefined,
      timeMs: null,
      registeredAt: Date.now()
    };

    try {
      await networkManager.writeToDatabase('participants', 'put', newP);
      setNewParticipantName('');
      setNewParticipantEmail('');
      setNewParticipantPostal('');
      await loadParticipants();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteParticipant = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce participant ?')) return;
    try {
      await networkManager.writeToDatabase('participants', 'delete', id);
      await loadParticipants();
    } catch (e) {
      console.error(e);
    }
  };

  // Rendu des Chronomètres Individuels Adaptatifs sur l'Écran Public
  const activeTracks = Object.values(tracks).filter(t => t.participantId !== null);

  // Rendu de l'écran public de projection
  if (activeTab === 'public') {
    // Si un tirage au sort (Raffle) est en cours
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

    // Calcul de la structure de grille adaptative pour l'Écran Public
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
        <div className="text-center py-4 bg-[#24123d]/40 rounded-3xl border border-purple-950/40 max-w-2xl mx-auto shadow">
          <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider flex justify-center items-center gap-2">
            <Timer className="text-primary animate-pulse" size={20} />
            <span>Kiosque-concours d'Assemblage en Direct</span>
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-1">Les temps de démontage / remontage s'affichent en temps réel.</p>
        </div>

        {activeTracks.length === 0 ? (
          // Mode Attente / Aucun chronomètre en cours
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-5xl mx-auto">
            <div className="lg:col-span-8 bg-[#24123d]/40 border border-purple-950 p-10 rounded-3xl text-center space-y-4">
              <div className="w-16 h-16 bg-purple-950 border border-purple-800 rounded-full flex items-center justify-center text-primary mx-auto">
                <Timer size={28} className="animate-pulse" />
              </div>
              <h3 className="text-xl font-display font-bold text-white uppercase">Prêt pour le prochain départ</h3>
              <p className="text-sm text-slate-400 font-sans max-w-sm mx-auto">
                Veuillez vous présenter à la table d'assemblage pour enregistrer votre nom et lancer le défi !
              </p>
            </div>
            <div className="lg:col-span-4">
              <Leaderboard participants={participants} />
            </div>
          </div>
        ) : (
          // Mode Course active
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Les chronos en cours */}
            <div className="lg:col-span-8">
              <div className={`grid ${gridColsClass} gap-6`}>
                {activeTracks.map((track) => (
                  <PublicTrackBlock
                    key={track.trackId}
                    track={track}
                    heightClass={blockHeightClass}
                    isSingle={activeTracks.length === 1}
                  />
                ))}
              </div>
            </div>

            {/* Le tableau des champions */}
            <div className="lg:col-span-4">
              <Leaderboard participants={participants} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Rendu de l'écran Organisateur (Admin)
  return (
    <div className="space-y-6">
      {/* Raffle status reset section */}
      {raffle.status !== 'idle' && (
        <div className="bg-primary/10 border border-primary/30 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            <Sparkles className="text-primary animate-spin shrink-0" size={18} />
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-bold text-primary tracking-widest block leading-none">
                {raffle.status === 'spinning' ? "Tirage en cours sur l'écran public" : "Gagnant sélectionné"}
              </span>
              <span className="font-bold text-white text-xs block mt-1 truncate">
                {raffle.status === 'spinning' ? (
                  <span className="flex items-center gap-1.5 text-slate-300">
                    Sélection : <span className="font-mono text-primary font-black animate-pulse">{raffleDisplayValue}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-primary font-black">
                    🏆 {raffleDisplayValue}
                  </span>
                )}
              </span>
            </div>
          </div>
          <button
            onClick={resetRaffle}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-red-950/40 border border-red-900/60 text-xs font-bold font-display uppercase text-red-300 hover:text-white hover:bg-red-900 transition cursor-pointer"
          >
            Fermer le tirage
          </button>
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-8 items-start transition-all duration-500 ${
        raffle.status === 'spinning' ? 'opacity-40 pointer-events-none scale-[0.99] filter blur-[1px]' : ''
      }`}>
        {/* Colonne Gauche : Inscriptions & Liste */}
      <div className="lg:col-span-4 space-y-6">
        {/* Ajouter un participant */}
        <div className="bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
          <h3 className="text-base font-bold font-display text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <UserPlus size={18} className="text-primary" />
            <span>Nouveau Participant</span>
          </h3>

          <form onSubmit={addParticipant} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-300 block">Nom complet</label>
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
              <label className="text-[10px] font-bold uppercase text-slate-300 block">Adresse courriel</label>
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
              <label className="text-[10px] font-bold uppercase text-slate-300 block">Code postal</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 text-slate-500" size={14} />
                <input
                  type="text"
                  value={newParticipantPostal}
                  onChange={(e) => setNewParticipantPostal(e.target.value)}
                  placeholder="H2W 1Y4"
                  className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl pl-9 pr-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 transition cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Inscrire</span>
            </button>
          </form>
        </div>

        {/* Résultat du tirage au sort (s'il a été effectué) */}
        {event.extraData?.raffleWinnerName && (
          <div className="bg-primary/10 border border-primary/30 p-5 rounded-3xl space-y-2 relative overflow-hidden animate-fade-in-up">
            <div className="absolute right-2 -bottom-2 opacity-10 text-primary">
              <Award size={80} />
            </div>
            <span className="text-[9px] uppercase font-black text-primary tracking-widest block">🏆 Gagnant du tirage au sort</span>
            <h4 className="text-sm font-bold text-white leading-tight font-display">{event.extraData.raffleWinnerName}</h4>
            <div className="text-[10px] text-slate-400 font-sans space-y-0.5">
              {event.extraData.raffleWinnerEmail && <p>Courriel : {event.extraData.raffleWinnerEmail}</p>}
              {event.extraData.raffleWinnerPostal && <p>Code postal : {event.extraData.raffleWinnerPostal}</p>}
              <p className="text-[9px] text-slate-500 mt-1">
                Tiré le {new Date(event.extraData.raffleWinnerAt).toLocaleString('fr-CA')}
              </p>
            </div>
          </div>
        )}

        {/* Liste des participants */}
        <div className="bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
          <h3 className="text-base font-bold font-display text-white uppercase tracking-wider mb-4">
            Participants Inscrits ({participants.length})
          </h3>

          {participants.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6 font-sans">Aucun participant inscrit.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {participants.map((p) => {
                const hasTime = p.timeMs !== null && p.timeMs > 0;
                const isAssigned = Object.values(tracks).some(t => t.participantId === p.id);

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition ${
                      isAssigned
                        ? 'bg-primary/10 border-primary text-white font-bold'
                        : 'bg-[#180A2b]/40 border-purple-950 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold truncate">{p.name}</h4>
                      <p className="text-[9px] text-slate-400 truncate font-sans">
                        {hasTime ? `Fini en ${formatTime(p.timeMs!)}` : isAssigned ? 'En course' : 'En attente'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => deleteParticipant(p.id)}
                        disabled={isAssigned}
                        className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Colonne Droite : Les 5 pistes d'arbitrage */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] tracking-wider uppercase font-black text-primary font-sans">Arbitrage Multi-Pistes</span>
            <h2 className="text-xl font-bold font-display text-white uppercase">Gestion des 5 chronomètres</h2>
          </div>

          <button
            onClick={startRaffle}
            disabled={participants.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
          >
            <Sparkles size={14} />
            <span>Lancer un tirage</span>
          </button>
        </div>

        {/* Liste des 5 pistes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.values(tracks).map((track) => {
            // Filtrer les participants non encore classés et non assignés
            const availableParticipants = participants.filter(
              p => p.timeMs === null && !Object.values(tracks).some(t => t.participantId === p.id)
            );

            return (
              <AdminTrackBlock
                key={track.trackId}
                track={track}
                availableParticipants={availableParticipants}
                onAssign={(pId) => handleAssignParticipant(track.trackId, pId)}
                onStart={() => handleStartTimer(track.trackId)}
                onStop={() => handleStopTimer(track.trackId)}
                onReset={() => handleResetTimer(track.trackId)}
                onSave={() => handleSaveTrackTime(track.trackId)}
              />
            );
          })}
        </div>
      </div>
    </div>
    </div>
  );
}

// COMPOSANT COMPLEMENTAIRE : Bloc de Piste de l'Arbitre (Admin)
interface AdminTrackBlockProps {
  track: TrackState;
  availableParticipants: Participant[];
  onAssign: (pId: string | null) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onSave: () => void;
}

function AdminTrackBlock({
  track,
  availableParticipants,
  onAssign,
  onStart,
  onStop,
  onReset,
  onSave
}: AdminTrackBlockProps) {
  return (
    <div className="p-5 rounded-2xl bg-[#24123d]/60 border border-purple-900/40 shadow-lg space-y-4">
      {/* En-tête de piste */}
      <div className="flex items-center justify-between pb-2 border-b border-purple-950">
        <span className="text-xs font-extrabold font-display text-primary uppercase">
          Piste {track.trackId}
        </span>
        {track.participantId && (
          <button
            onClick={() => onAssign(null)}
            disabled={track.isRunning}
            className="text-[9px] px-2 py-0.5 rounded bg-purple-950 text-slate-400 hover:text-white border border-purple-900/40 disabled:opacity-40 cursor-pointer"
          >
            Libérer
          </button>
        )}
      </div>

      {track.participantId ? (
        // Participant assigné
        <div className="space-y-4">
          <div>
            <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">En course</span>
            <h4 className="font-bold text-white text-base font-display uppercase truncate">{track.participantName}</h4>
          </div>

          <Stopwatch
            state={track}
            onStart={onStart}
            onStop={onStop}
            onReset={onReset}
          />

          <button
            onClick={onSave}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] transition cursor-pointer"
          >
            <Check size={14} />
            <span>Enregistrer le temps</span>
          </button>
        </div>
      ) : (
        // Aucun participant assigné
        <div className="py-6 text-center space-y-3">
          <User className="text-slate-600 mx-auto" size={24} />
          <p className="text-xs text-slate-400 font-sans">Aucun participant en course.</p>
          
          <select
            onChange={(e) => onAssign(e.target.value)}
            defaultValue=""
            className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
          >
            <option value="" disabled>Attribuer un participant...</option>
            {availableParticipants.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// COMPOSANT COMPLEMENTAIRE : Bloc de Piste de l'Écran Public
interface PublicTrackBlockProps {
  track: TrackState;
  heightClass: string;
  isSingle?: boolean;
}

function PublicTrackBlock({ track, heightClass, isSingle = false }: PublicTrackBlockProps) {
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

  return (
    <div className={`p-6 rounded-3xl bg-[#24123d]/60 border border-purple-900/40 shadow-lg flex flex-col justify-between ${heightClass} ${
      track.isRunning ? 'border-primary' : 'border-purple-900/40'
    }`}>
      {/* Piste et Nom */}
      <div>
        <span className="text-[10px] uppercase font-black text-primary tracking-widest font-sans">
          Piste {track.trackId}
        </span>
        <h3 className={`font-display font-bold uppercase text-white truncate mt-1 ${isSingle ? 'text-4xl' : 'text-xl'}`}>
          {track.participantName}
        </h3>
      </div>

      {/* Chronomètre défilant */}
      <div className="flex items-end justify-between mt-4">
        <div className={`font-mono font-bold tracking-wider text-white tabular-nums ${isSingle ? 'text-7xl sm:text-8xl text-primary' : 'text-4xl sm:text-5xl'}`}>
          {formatTime(time)}
        </div>
        
        {track.isRunning ? (
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 font-bold uppercase animate-pulse font-sans">En cours</span>
        ) : (
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-purple-950 text-slate-500 border border-purple-900/40 font-bold uppercase font-sans">Stop</span>
        )}
      </div>
    </div>
  );
}
