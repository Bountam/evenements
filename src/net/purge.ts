// Effacement des anciens événements sur une tablette (plan v1.9, étape 2) : les données d'un événement
// quitté restent jusqu'à la fin de sa journée, puis sont effacées dès que ses envois en attente sont partis.

export function dateLocale(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// list : événement → jour (AAAA-MM-JJ) où la tablette l'a quitté
export function evenementsAEffacer(
  list: Record<string, string>,
  aujourdHui: string,
  courant: string | null,
  enAttente: Set<string>
): { effacer: string[]; garder: Record<string, string> } {
  const effacer: string[] = [];
  const garder: Record<string, string> = {};
  for (const [eventId, jour] of Object.entries(list)) {
    if (eventId === courant) continue; // revenu sur cet événement : plus rien à effacer
    if (jour < aujourdHui && !enAttente.has(eventId)) effacer.push(eventId);
    else garder[eventId] = jour;
  }
  return { effacer, garder };
}
