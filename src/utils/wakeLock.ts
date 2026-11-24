// Empêche la mise en veille de l'écran sur le Laptop serveur (Screen Wake Lock API).
// Sans effet bloquant si le navigateur ou le contexte ne le supporte pas.
export function startScreenWakeLock(): () => void {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return () => {};
  }

  let sentinel: { release: () => Promise<void> } | null = null;
  let stopped = false;

  const acquire = async () => {
    if (stopped || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
    try {
      sentinel = await (navigator as any).wakeLock.request('screen');
    } catch {
      // Silencieux : batterie faible ou navigateur restreint
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      acquire();
    }
  };

  void acquire();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    stopped = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
    sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
