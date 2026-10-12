/**
 * Utilitaires de sécurité et d'assainissement de données (Défense en profondeur)
 * Insertech Événements
 */

/**
 * Neutralise les attaques par injection de formules CSV (DDE / CSV Injection).
 * Si la valeur commence par =, +, -, @, tabulation ou retour chariot,
 * elle est préfixée par une apostrophe simple (') pour forcer l'interprétation en texte pur dans Excel/LibreOffice.
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (str.length === 0) return '';

  // Vérification des caractères déclencheurs de formule
  const formulaTriggers = ['=', '+', '-', '@', '\t', '\r'];
  let safeStr = str;
  if (formulaTriggers.some(trigger => safeStr.startsWith(trigger))) {
    safeStr = "'" + safeStr;
  }

  // Échappement standard RFC 4180 pour les guillemets et séparateurs
  if (safeStr.includes(';') || safeStr.includes(',') || safeStr.includes('"') || safeStr.includes('\n')) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }

  return safeStr;
}

/**
 * Neutralise les métacaractères réservés LaTeX pour prévenir les erreurs de compilation
 * et les injections de macros malveillantes (\write18, \input, etc.).
 */
export function escapeLatex(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.length === 0) return '';

  return str
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([%&$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\[/g, '{[}')
    .replace(/\]/g, '{]}');
}

/**
 * Assainit un nom de fichier pour le stockage ou les titres dérivés.
 * Supprime les caractères de contrôle, les balises potentielles et les caractères non sécurisés.
 */
export function sanitizeFileName(name: string): string {
  if (!name) return 'evenement';
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim()
    .substring(0, 100) || 'evenement';
}

/**
 * Borne et valide strictement une valeur numérique (poids, notes de satisfaction, etc.).
 */
export function clampNumber(
  value: any,
  min: number,
  max: number,
  defaultValue: number
): number {
  if (value === null || value === undefined || value === '') return defaultValue;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return Number(parsed.toFixed(2));
}

/**
 * Assainit les chaînes de texte libres pour prévenir l'injection de scripts ou balises HTML
 */
export function sanitizeText(text: string | null | undefined, maxLength = 1000): string {
  if (!text) return '';
  return String(text)
    .replace(/<[^>]*>?/gm, '') // Supprime les balises HTML éventuelles
    .trim()
    .substring(0, maxLength);
}
