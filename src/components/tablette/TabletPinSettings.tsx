import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { EventSettings } from '../../types';
import { createPinLock, isValidPin, readEventPinLock } from '../../utils/modeLock';
import { showToast } from '../shared/Toast';
import Button from '../shared/Button';

interface TabletPinSettingsProps {
  event: EventSettings;
  onSave: (updated: EventSettings) => Promise<void>;
}

// Réglage du PC hôte : code à 4 chiffres qui protège la sortie d'un mode verrouillé sur les tablettes.
// Seule l'empreinte (sel + SHA-256) est enregistrée dans l'activité, puis envoyée aux tablettes par la synchro.
export default function TabletPinSettings({ event, onSave }: TabletPinSettingsProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const hasPin = Boolean(readEventPinLock(event));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPin(code)) {
      setError('Le code doit compter exactement 4 chiffres.');
      return;
    }
    setSaving(true);
    try {
      const verrouillage = await createPinLock(code);
      await onSave({ ...event, extraData: { ...(event.extraData || {}), verrouillage } });
      setCode('');
      setError('');
      showToast('Code de déverrouillage enregistré et envoyé aux tablettes connectées.', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer le code.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-app-input border border-app-card-border p-3.5 rounded-xl space-y-2" noValidate>
      <label htmlFor="tablet-pin" className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-app-text-muted">
        <KeyRound size={12} className="text-primary" aria-hidden="true" />
        Code de déverrouillage des tablettes
      </label>
      <div className="flex gap-2">
        <input
          id="tablet-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]*"
          maxLength={4}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
            setError('');
          }}
          placeholder={hasPin ? '••••' : '4 chiffres'}
          aria-describedby="tablet-pin-help"
          className="flex-grow min-w-0 bg-app-card border border-app-input-border rounded-xl px-3 py-2 text-app-text text-sm font-mono tracking-widest focus:outline-none focus:border-primary"
        />
        <Button type="submit" size="sm" variant="primary" disabled={saving}>
          {hasPin ? 'Changer' : 'Définir'}
        </Button>
      </div>
      <p id="tablet-pin-help" className="text-[10px] text-app-text-muted">
        {hasPin
          ? 'Un code est défini pour cette activité. Le nouveau code remplace l’ancien sur les tablettes connectées.'
          : 'Sans code, les tablettes ne peuvent pas verrouiller leur mode.'}
      </p>
      {error && <p role="alert" className="text-xs font-bold text-danger">{error}</p>}
    </form>
  );
}
