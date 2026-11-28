// Préférences d'accessibilité persistées localement (WCAG AA/AAA & FALC)

export interface A11yPrefs {
  largeText: boolean;
  highContrast: boolean;
}

const STORAGE_KEY = 'insertech_a11y_prefs';
const CHANGE_EVENT = 'insertech:a11y-change';

const DEFAULT_PREFS: A11yPrefs = {
  largeText: false,
  highContrast: false,
};

export function readA11yPrefs(): A11yPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<A11yPrefs> | null;
    return {
      largeText: Boolean(parsed?.largeText),
      highContrast: Boolean(parsed?.highContrast),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function applyA11yPrefsToDom(prefs: A11yPrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('a11y-large-text', prefs.largeText);
  root.classList.toggle('a11y-high-contrast', prefs.highContrast);
}

export function saveA11yPrefs(prefs: A11yPrefs): void {
  applyA11yPrefsToDom(prefs);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent<A11yPrefs>(CHANGE_EVENT, { detail: prefs }));
  } catch {
    // Stockage plein ou bloqué — les classes DOM restent appliquées pour la session
  }
}

export function toggleA11yPref(key: keyof A11yPrefs): A11yPrefs {
  const current = readA11yPrefs();
  const next: A11yPrefs = {
    ...current,
    [key]: !current[key],
  };
  saveA11yPrefs(next);
  return next;
}

export function subscribeA11yPrefs(listener: (prefs: A11yPrefs) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = (e: Event) => {
    const custom = e as CustomEvent<A11yPrefs>;
    listener(custom.detail ?? readA11yPrefs());
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      const next = readA11yPrefs();
      applyA11yPrefsToDom(next);
      listener(next);
    }
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
