import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { parseTimeInputToMs } from '../../utils/time';
import { showToast } from './Toast';

interface InlineTimeEditorProps {
  initialValue: string;
  participantName: string;
  onSubmit: (ms: number) => void;
  onCancel: () => void;
}

// Saisie ou correction d'un temps (MM:SS.cc ou secondes), Entrée pour valider et Échap pour annuler
export default function InlineTimeEditor({ initialValue, participantName, onSubmit, onCancel }: InlineTimeEditorProps) {
  const [value, setValue] = useState(initialValue);

  const submit = () => {
    const ms = parseTimeInputToMs(value);
    if (ms) onSubmit(ms);
    else showToast('Format attendu : MM:SS.cc ou secondes', 'warning');
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="01:24.50"
        aria-label={`Temps de ${participantName} (MM:SS.cc ou secondes)`}
        className="flex-1 min-w-0 min-h-9 bg-app-input border border-primary rounded-lg px-2 py-1 text-app-text font-mono text-xs focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
      />
      <button
        type="button"
        onClick={submit}
        aria-label="Valider le temps"
        className="min-h-9 min-w-9 flex items-center justify-center rounded-lg bg-primary text-secondary cursor-pointer"
      >
        <Check size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Annuler la saisie du temps"
        className="min-h-9 min-w-9 flex items-center justify-center rounded-lg bg-app-input text-app-text-muted hover:text-app-text cursor-pointer"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
