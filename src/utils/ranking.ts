import { Participant } from '../types';

// Un temps n'est valide que s'il est strictement positif (les 0 hérités sont des scores non saisis)
export function hasValidTime(p: Pick<Participant, 'timeMs'>): boolean {
  return typeof p.timeMs === 'number' && p.timeMs > 0;
}

// Participants classés, du meilleur temps au moins bon
export function getRankedParticipants(participants: Participant[]): Participant[] {
  return participants.filter(hasValidTime).sort((a, b) => a.timeMs! - b.timeMs!);
}

// Ordre d'affichage « tous » : classés d'abord par temps, puis en attente du plus récent au plus ancien
export function compareByRank(a: Participant, b: Participant): number {
  const aHasTime = hasValidTime(a);
  const bHasTime = hasValidTime(b);
  if (aHasTime && bHasTime) return a.timeMs! - b.timeMs!;
  if (aHasTime) return -1;
  if (bHasTime) return 1;
  return (b.registeredAt || 0) - (a.registeredAt || 0);
}

// Rang de chaque participant classé (ex æquo partagent le même rang), calculé une seule fois
export function buildRankMap(participants: Participant[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const ranked = getRankedParticipants(participants);
  ranked.forEach((p, idx) => {
    const previous = ranked[idx - 1];
    ranks.set(p.id, previous && previous.timeMs === p.timeMs ? ranks.get(previous.id)! : idx + 1);
  });
  return ranks;
}
