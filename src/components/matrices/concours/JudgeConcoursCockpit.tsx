import React, { useMemo, useState } from 'react';
import {
  UserPlus,
  Play,
  Square,
  Trophy,
  Gift,
  RotateCcw,
  Users,
  Timer,
  Check,
  X
} from 'lucide-react';
import type { EventSettings, Participant, TrackState } from '../../../types';
import type { ContestPrizes } from '../../../utils/prizes';
import { formatTime } from '../../shared/Stopwatch';
import { useTrackElapsed } from '../../../hooks/useTrackElapsed';
import { buildRankMap, getRankedParticipants } from '../../../utils/ranking';
import { networkManager } from '../../../network';
import Modal from '../../shared/Modal';
import ContactForm from '../../shared/ContactForm';
import { showToast } from '../../shared/Toast';
import {
  ContactDraft,
  ContactErrors,
  buildContactInfo,
  emptyContactDraft,
  firstContactError,
  fullName,
  validateContact
} from '../../../utils/contact';

interface CompletedChallengeResult {
  trackId: number;
  participantId: string;
  participantName: string;
  elapsedMs: number;
  rank: number;
  totalRanked: number;
}

interface JudgeTrackCardProps {
  slotLabel: string;
  track: TrackState;
  onStopAndFinish: (track: TrackState) => void;
  onRelease: (trackId: number) => void;
}

function JudgeTrackCard({ slotLabel, track, onStopAndFinish, onRelease }: JudgeTrackCardProps) {
  const elapsed = useTrackElapsed(track);
  return (
    <div className="bg-app-card border-2 border-primary/50 p-5 rounded-3xl shadow-lg flex flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-micro uppercase font-black tracking-widest text-primary block">
            {slotLabel} • Piste {track.trackId}
          </span>
          <h3 className="text-xl font-display font-bold uppercase text-app-text">
            {track.participantName}
          </h3>
        </div>
        {!track.isRunning && (
          <button
            type="button"
            onClick={() => onRelease(track.trackId)}
            aria-label={`Retirer ${track.participantName}`}
            title="Retirer ce joueur de la manche"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-app-input border border-app-card-border text-app-text-muted hover:text-danger cursor-pointer"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="py-4 px-3 rounded-2xl bg-app-input border border-app-card-border text-center">
        <span className="font-mono text-4xl sm:text-5xl font-black tracking-wider text-app-text tabular-nums">
          {formatTime(elapsed)}
        </span>
      </div>

      {track.isRunning ? (
        <button
          type="button"
          onClick={() => onStopAndFinish(track)}
          className="w-full min-h-16 px-5 py-3 rounded-2xl bg-danger text-white font-display font-black uppercase tracking-wider text-base hover:opacity-90 active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-2.5 shadow-lg"
        >
          <Square size={20} fill="currentColor" aria-hidden="true" />
          <span>Arrêter {track.participantName}</span>
        </button>
      ) : (
        <div className="text-center text-xs font-bold uppercase text-primary py-2 rounded-xl bg-primary/10 border border-primary/30">
          Prêt au départ
        </div>
      )}
    </div>
  );
}

interface JudgeConcoursCockpitProps {
  event: EventSettings;
  participants: Participant[];
  tracks: Record<number, TrackState>;
  prizes: ContestPrizes;
  judgeId: string;
  judgeName: string;
  onSaveTimeForParticipant: (participantId: string, timeMs: number) => Promise<void>;
}

export default function JudgeConcoursCockpit({
  event,
  participants,
  tracks,
  prizes,
  judgeId,
  judgeName,
  onSaveTimeForParticipant
}: JudgeConcoursCockpitProps) {
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(() => emptyContactDraft('contest'));
  const [contactErrors, setContactErrors] = useState<ContactErrors>({});
  const [formResetKey, setFormResetKey] = useState(0);
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([]);
  const [joinedTrackIds, setJoinedTrackIds] = useState<number[]>([]);
  const [results, setResults] = useState<CompletedChallengeResult[]>([]);

  // Pistes contrôlées par CET animateur juge (max 2 joueurs à la fois)
  const myTracks = useMemo(
    () =>
      Object.values(tracks)
        .filter((t) => t.participantId && t.eventId === event.id && t.judgeId === judgeId)
        .sort((a, b) => a.trackId - b.trackId)
        .slice(0, 2),
    [tracks, event.id, judgeId]
  );

  // Bassin des autres joueurs prêts chez d'autres animateurs (départ commun)
  const otherReadyTracks = useMemo(
    () =>
      Object.values(tracks)
        .filter(
          (t) =>
            t.participantId &&
            t.eventId === event.id &&
            t.judgeId !== judgeId &&
            !t.isRunning &&
            t.elapsedBeforeStart === 0
        )
        .sort((a, b) => a.trackId - b.trackId),
    [tracks, event.id, judgeId]
  );

  // Bassin des participants inscrits disponibles pour un jumelage ou une nouvelle manche
  const activeTrackParticipantIds = useMemo(
    () => new Set(Object.values(tracks).map((t) => t.participantId).filter(Boolean) as string[]),
    [tracks]
  );

  const availablePoolParticipants = useMemo(
    () => participants.filter((p) => !activeTrackParticipantIds.has(p.id)),
    [participants, activeTrackParticipantIds]
  );

  const myReadyTracks = myTracks.filter((t) => !t.isRunning && t.elapsedBeforeStart === 0);
  const myRunningTracks = myTracks.filter((t) => t.isRunning);
  const canAddMorePlayers = myTracks.length + results.length < 2;

  const findFreeTrack = (): TrackState | undefined =>
    Object.values(tracks)
      .sort((a, b) => a.trackId - b.trackId)
      .find((t) => t.participantId === null);

  const assignToFreeTrack = (participant: Participant) => {
    if (myTracks.length >= 2) {
      showToast('Vous contrôlez déjà le maximum de 2 joueurs simultanés.', 'warning');
      return false;
    }
    const free = findFreeTrack();
    if (!free) {
      showToast('Toutes les pistes sont actuellement occupées.', 'warning');
      return false;
    }
    networkManager.sendChronoAction({
      type: 'TRACK_ASSIGN',
      trackId: free.trackId,
      participantId: participant.id,
      participantName: participant.name,
      eventId: event.id,
      judgeId,
      judgeName
    });
    return true;
  };

  // Inscription directe du joueur assis devant le juge (pas de file d'attente intermédiaire)
  const handleRegisterAndSeat = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateContact(contactDraft, 'contest');
    setContactErrors(errors);
    const firstErr = firstContactError(errors);
    if (firstErr) {
      document.getElementById(`juge-${firstErr === 'contact' ? 'phone' : firstErr}`)?.focus();
      return;
    }
    const now = Date.now();
    const contact = buildContactInfo(contactDraft, 'contest', 'kiosque_concours', now);
    const name = fullName(contact);

    const newParticipant: Participant = {
      id: 'part-' + Math.random().toString(36).substring(2, 11),
      eventId: event.id,
      name,
      email: contact.email,
      postalCode: contact.postalCode || undefined,
      timeMs: null,
      registeredAt: now,
      extraData: {
        contact,
        ...(contact.consent.activity ? { consentContact: true, consentAt: contact.consent.activity } : {})
      }
    };

    await networkManager.writeToDatabase('participants', 'put', newParticipant);
    setContactDraft(emptyContactDraft('contest'));
    setContactErrors({});
    setFormResetKey((k) => k + 1);
    setShowRegisterModal(false);

    if (assignToFreeTrack(newParticipant)) {
      showToast(`${name} est prêt devant vous !`, 'success');
    }
  };

  const toggleJoinTrack = (trackId: number) => {
    setJoinedTrackIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]
    );
  };

  const togglePoolParticipant = (id: string) => {
    setSelectedPoolIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleStartBatch = () => {
    // 1. Assigner d'abord les joueurs choisis depuis le bassin (si des pistes sont libres pour suivre la partie)
    const assignedFromPoolTrackIds: number[] = [];
    const freeTracks = Object.values(tracks)
      .sort((a, b) => a.trackId - b.trackId)
      .filter((t) => t.participantId === null);

    let freeIdx = 0;
    for (const pid of selectedPoolIds) {
      const p = participants.find((part) => part.id === pid);
      const slot = freeTracks[freeIdx];
      if (!p || !slot) break;
      networkManager.sendChronoAction({
        type: 'TRACK_ASSIGN',
        trackId: slot.trackId,
        participantId: p.id,
        participantName: p.name,
        eventId: event.id,
        judgeId: 'bassin',
        judgeName: 'Bassin commun'
      });
      assignedFromPoolTrackIds.push(slot.trackId);
      freeIdx++;
    }

    const myIds = myReadyTracks.map((t) => t.trackId);
    const otherIds = otherReadyTracks
      .filter((t) => joinedTrackIds.includes(t.trackId))
      .map((t) => t.trackId);

    const allToStart = Array.from(new Set([...myIds, ...otherIds, ...assignedFromPoolTrackIds]));
    if (allToStart.length === 0) {
      showToast('Inscrivez au moins 1 joueur devant vous avant de démarrer.', 'warning');
      return;
    }

    networkManager.sendChronoAction({
      type: 'TIMER_START_BATCH',
      trackIds: allToStart,
      startTime: networkManager.now()
    });
    setSelectedPoolIds([]);
    setJoinedTrackIds([]);
  };

  const handleStopAndFinish = async (track: TrackState) => {
    if (!track.participantId || !track.isRunning || track.startTime === null) return;
    const elapsedMs = Math.max(1, Math.round(networkManager.now() - track.startTime + track.elapsedBeforeStart));

    networkManager.sendChronoAction({
      type: 'TIMER_STOP',
      trackId: track.trackId,
      elapsed: elapsedMs
    });

    await onSaveTimeForParticipant(track.participantId, elapsedMs);

    // Calculer immédiatement la place cumulée à afficher dans le résumé de fin de défi
    const updatedList = participants.map((p) => {
      if (p.id !== track.participantId) return p;
      const best = typeof p.timeMs === 'number' && p.timeMs > 0 ? Math.min(p.timeMs, elapsedMs) : elapsedMs;
      return { ...p, timeMs: best };
    });
    const rankMap = buildRankMap(updatedList);
    const ranked = getRankedParticipants(updatedList);
    const rank = rankMap.get(track.participantId) || ranked.length || 1;

    setResults((prev) => [
      ...prev.filter((r) => r.participantId !== track.participantId),
      {
        trackId: track.trackId,
        participantId: track.participantId!,
        participantName: track.participantName || 'Joueur',
        elapsedMs,
        rank,
        totalRanked: ranked.length
      }
    ]);
  };

  const handleReleaseTrack = (trackId: number) => {
    networkManager.sendChronoAction({
      type: 'TRACK_ASSIGN',
      trackId,
      participantId: null,
      participantName: null,
      eventId: event.id,
      judgeId: null,
      judgeName: null
    });
  };

  const handleNewCompetition = () => {
    myTracks.forEach((t) => {
      if (!t.isRunning) handleReleaseTrack(t.trackId);
    });
    setResults([]);
    setSelectedPoolIds([]);
    setJoinedTrackIds([]);
  };

  const totalCompetitorsToStart =
    myReadyTracks.length +
    otherReadyTracks.filter((t) => joinedTrackIds.includes(t.trackId)).length +
    selectedPoolIds.length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* En-tête du Juge (2 joueurs max) */}
      <div className="bg-app-card border border-app-card-border p-4 sm:p-5 rounded-3xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-micro font-black uppercase tracking-widest text-primary block">
            Animateur Juge • {judgeName}
          </span>
          <h2 className="text-xl font-display font-bold uppercase text-app-text">
            Mes joueurs devant moi ({myTracks.length}/2)
          </h2>
        </div>
        {canAddMorePlayers && myRunningTracks.length === 0 && (
          <button
            type="button"
            onClick={() => setShowRegisterModal(true)}
            className="min-h-12 px-5 py-2.5 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-xs sm:text-sm cursor-pointer flex items-center gap-2 shadow-md"
          >
            <UserPlus size={18} />
            <span>+ Inscrire un joueur devant moi</span>
          </button>
        )}
      </div>

      {/* Zone des 2 emplacements actifs (1 ou 2 joueurs max) */}
      {myTracks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {myTracks.map((track, idx) => (
            <JudgeTrackCard
              key={track.trackId}
              slotLabel={`Joueur ${idx + 1}`}
              track={track}
              onStopAndFinish={handleStopAndFinish}
              onRelease={handleReleaseTrack}
            />
          ))}
        </div>
      )}

      {/* État vide : inciter à inscrire le premier joueur */}
      {myTracks.length === 0 && results.length === 0 && (
        <div className="bg-app-card border-2 border-dashed border-app-card-border p-8 rounded-3xl text-center space-y-4">
          <Timer size={42} className="text-primary mx-auto" />
          <div className="space-y-1">
            <h3 className="text-lg font-display font-bold uppercase text-app-text">
              Aucun joueur devant vous pour l'instant
            </h3>
            <p className="text-xs text-app-text-muted max-w-md mx-auto">
              Inscrivez 1 ou 2 joueurs assis devant vous pour démarrer le défi et les arrêter séparément.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRegisterModal(true)}
            className="min-h-14 px-6 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer inline-flex items-center gap-2 shadow-lg"
          >
            <UserPlus size={18} />
            <span>Inscrire mon 1er joueur</span>
          </button>
        </div>
      )}

      {/* Départ commun : autres animateurs + bassin de joueurs prêts */}
      {myReadyTracks.length > 0 && myRunningTracks.length === 0 && (
        <div className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-primary" />
              <h3 className="text-base font-display font-bold uppercase text-app-text">
                Bassin de départ commun (optionnel)
              </h3>
            </div>
            <span className="text-xs text-app-text-muted">
              Jumelez un, plusieurs ou aucun autre joueur prêt
            </span>
          </div>

          {otherReadyTracks.length > 0 && (
            <div className="space-y-2">
              <p className="text-micro font-bold uppercase text-primary">
                Prêts chez d'autres animateurs ({otherReadyTracks.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {otherReadyTracks.map((t) => {
                  const checked = joinedTrackIds.includes(t.trackId);
                  return (
                    <button
                      key={t.trackId}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleJoinTrack(t.trackId)}
                      className={`min-h-12 p-3 rounded-2xl border-2 text-left flex items-center justify-between gap-2 cursor-pointer transition ${
                        checked
                          ? 'bg-primary/15 border-primary text-app-text'
                          : 'bg-app-input border-app-card-border text-app-text-muted'
                      }`}
                    >
                      <div>
                        <span className="text-sm font-bold block text-app-text">{t.participantName}</span>
                        <span className="text-micro block">
                          Avec {t.judgeName || 'un autre animateur'} • Piste {t.trackId}
                        </span>
                      </div>
                      {checked && <Check size={18} className="text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {availablePoolParticipants.length > 0 && (
            <div className="space-y-2">
              <p className="text-micro font-bold uppercase text-app-text-muted">
                Autres participants inscrits dans le bassin ({availablePoolParticipants.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {availablePoolParticipants.slice(0, 8).map((p) => {
                  const checked = selectedPoolIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => togglePoolParticipant(p.id)}
                      className={`min-h-11 px-3.5 py-2 rounded-xl border text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 ${
                        checked
                          ? 'bg-primary text-secondary border-primary'
                          : 'bg-app-input text-app-text border-app-card-border'
                      }`}
                    >
                      {checked && <Check size={14} />}
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleStartBatch}
            className="w-full min-h-16 px-6 py-3.5 rounded-2xl bg-primary text-secondary font-display font-black uppercase tracking-wider text-base cursor-pointer flex items-center justify-center gap-2.5 shadow-xl"
          >
            <Play size={22} fill="currentColor" />
            <span>
              {totalCompetitorsToStart > myReadyTracks.length
                ? `Départ commun (${totalCompetitorsToStart} joueurs)`
                : myReadyTracks.length === 2
                  ? 'Démarrer mes 2 joueurs'
                  : 'Démarrer le chronomètre'}
            </span>
          </button>
        </div>
      )}

      {/* Écran Fin de Défi : Temps effectué, Place cumulée, Rappel des prix et Nouvelle compétition */}
      {results.length > 0 && (
        <div className="bg-app-card border-2 border-primary p-5 sm:p-6 rounded-3xl shadow-xl space-y-5">
          <div className="flex items-center gap-2.5">
            <Trophy size={22} className="text-primary" />
            <h3 className="text-xl font-display font-black uppercase text-app-text">
              Résultat du défi
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {results.map((res) => (
              <div
                key={res.participantId}
                className="p-4 rounded-2xl bg-app-input border border-app-card-border space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-bold uppercase text-base text-app-text">
                    {res.participantName}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-primary text-secondary font-display font-black text-xs uppercase">
                    Place #{res.rank} / {res.totalRanked}
                  </span>
                </div>
                <div className="font-mono text-3xl font-black text-primary tabular-nums">
                  {formatTime(res.elapsedMs)}
                </div>
              </div>
            ))}
          </div>

          {/* Rappel des prix */}
          <div className="p-4 rounded-2xl bg-app-input border border-app-card-border space-y-2">
            <div className="flex items-center gap-2 text-xs font-display font-bold uppercase text-primary">
              <Gift size={15} />
              <span>Rappel des prix à gagner</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-app-card border border-app-card-border">
                <span className="text-micro font-bold uppercase text-app-text-muted block">Meilleur chrono</span>
                <strong className="text-app-text">{prizes.best.title}</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-app-card border border-app-card-border">
                <span className="text-micro font-bold uppercase text-app-text-muted block">Tirage parmi tous</span>
                <strong className="text-app-text">{prizes.raffle.title}</strong>
              </div>
            </div>
          </div>

          {myRunningTracks.length === 0 && (
            <button
              type="button"
              onClick={handleNewCompetition}
              className="w-full min-h-14 px-6 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase tracking-wider text-sm cursor-pointer flex items-center justify-center gap-2 shadow-lg"
            >
              <RotateCcw size={18} />
              <span>Nouvelle compétition</span>
            </button>
          )}
        </div>
      )}

      {/* Modale d'inscription directe devant le juge */}
      <Modal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title="Inscrire un joueur devant vous"
        icon={UserPlus}
      >
        <form onSubmit={handleRegisterAndSeat} className="space-y-4" noValidate>
          <ContactForm
            idPrefix="juge"
            mode="contest"
            stepped
            resetKey={formResetKey}
            value={contactDraft}
            onChange={(next) => {
              setContactDraft(next);
              setContactErrors({});
            }}
            errors={contactErrors}
            renderSubmitActions={() => (
              <button
                type="submit"
                className="min-h-12 px-5 py-2.5 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer"
              >
                Inscrire et placer devant moi
              </button>
            )}
          />
        </form>
      </Modal>
    </div>
  );
}
