// Saisie manuelle d'un temps : « MM:SS.cc », « MM:SS » ou un nombre de secondes
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
