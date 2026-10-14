import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'motion/react';

interface ThemeToggleProps {
  isLightTheme: boolean;
  onToggle: () => void;
  className?: string;
}

export default function ThemeToggle({
  isLightTheme,
  onToggle,
  className = ''
}: ThemeToggleProps) {
  const label = isLightTheme ? 'Passer au thème sombre' : 'Passer au thème clair';

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={onToggle}
      title={label}
      aria-label={label}
      className={`flex items-center justify-center p-2 rounded-xl bg-app-card border border-app-card-border text-app-text hover:text-primary hover:border-primary/50 transition cursor-pointer shadow-sm ${className}`}
    >
      <motion.div
        key={isLightTheme ? 'sun' : 'moon'}
        initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 30, opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {isLightTheme ? <Moon size={14} /> : <Sun size={14} />}
      </motion.div>
    </motion.button>
  );
}
