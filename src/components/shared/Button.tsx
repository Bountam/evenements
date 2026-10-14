import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'icon' | 'icon-sm';

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-secondary font-black font-display uppercase tracking-wider shadow-md shadow-primary/20',
  secondary: 'bg-app-card border border-app-card-border text-app-text hover:border-primary/60 shadow-sm',
  ghost: 'text-app-text-muted hover:text-app-text hover:bg-app-input',
  danger: 'border border-danger/40 text-danger hover:bg-danger/10'
};

// Cibles tactiles : md et icon respectent 44 px (WCAG 2.5.5), sm et icon-sm 36 px pour les barres denses
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-xs',
  md: 'min-h-11 px-4 py-2 text-xs',
  icon: 'min-h-11 min-w-11 p-2',
  'icon-sm': 'min-h-9 min-w-9 p-2'
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  return <button type={type} className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...rest} />;
}
