import { EventSettings, Participant, RaffleState } from '../types';

// Historique des tirages, stocké dans event.extraData.raffleWinners
export interface RaffleDraw {
  participantId: string;
  name: string;
  email: string;
  postalCode: string;
  at: number;
  status: 'gagnant' | 'absent'; // « absent » : non présent à l'annonce, un nouveau tirage a été fait
}

export function getRaffleDraws(event: EventSettings): RaffleDraw[] {
  const draws = event.extraData?.raffleWinners;
  if (Array.isArray(draws)) return draws;
  // Événements antérieurs : seul le dernier gagnant était conservé
  if (event.extraData?.raffleWinnerId) {
    return [
      {
        participantId: event.extraData.raffleWinnerId,
        name: event.extraData.raffleWinnerName || '',
        email: event.extraData.raffleWinnerEmail || '',
        postalCode: event.extraData.raffleWinnerPostal || '',
        at: event.extraData.raffleWinnerAt || Date.now(),
        status: 'gagnant'
      }
    ];
  }
  return [];
}

// Une personne déjà tirée (gagnante ou absente) ne peut pas être tirée de nouveau
export function getEligibleParticipants(participants: Participant[], draws: RaffleDraw[]): Participant[] {
  const drawnIds = new Set(draws.map((d) => d.participantId));
  return participants.filter((p) => p.name && !drawnIds.has(p.id));
}

// État d'animation du tirage, mémorisé par navigateur pour survivre au rechargement de l'écran public
const IDLE_RAFFLE: RaffleState = { status: 'idle', winnerId: null, spinStartTime: null };

export function readStoredRaffle(eventId: string): RaffleState {
  try {
    const saved = JSON.parse(localStorage.getItem(`insertech_raffle_state_${eventId}`) || 'null');
    if (saved && (saved.status === 'spinning' || saved.status === 'celebrating') && saved.winnerId) {
      return saved;
    }
  } catch (e) {
    // Ignorer si corrompu
  }
  return IDLE_RAFFLE;
}

export function storeRaffle(eventId: string, state: RaffleState) {
  try {
    localStorage.setItem(`insertech_raffle_state_${eventId}`, JSON.stringify(state));
  } catch (e) {
    // Ignorer quota localStorage
  }
}
