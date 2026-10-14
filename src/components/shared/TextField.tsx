import React from 'react';

export const fieldLabelClass = 'text-micro font-bold uppercase text-app-text-muted block';
export const fieldInputClass =
  'w-full bg-app-input border border-app-input-border rounded-xl px-2.5 py-1.5 text-app-text text-xs focus:outline-none focus:border-primary transition';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' }>;
  error?: string | null;
  className?: string;
  inputClassName?: string;
}

// Champ avec libellé lié, icône alignée et message d'erreur annoncé
export default function TextField({ id, label, icon: Icon, error, className = '', inputClassName = '', ...inputProps }: TextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className={`space-y-0.5 ${className}`}>
      <label htmlFor={id} className={fieldLabelClass}>
        {label}
      </label>
      <div className="relative">
        {Icon && <Icon size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-muted pointer-events-none" aria-hidden="true" />}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
          className={`${fieldInputClass} min-h-9 ${Icon ? 'pl-8' : ''} ${inputClassName}`}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
