import React from 'react';
import { motion } from 'motion/react';
import logoInsertechImage from '../../assets/logo-insertech.png';

interface BrandLogoProps {
  size?: 'md' | 'lg';
  alt?: string;
}

// Pastille du logo Insertech, identique dans les en-têtes régie et public
export default function BrandLogo({ size = 'md', alt = 'Insertech' }: BrandLogoProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.04 }}
      className={`${size === 'lg' ? 'h-10 sm:h-11 px-3' : 'h-10 px-2.5'} py-1 rounded-2xl bg-white border-2 border-primary/60 shadow-md shadow-primary/20 shrink-0 flex items-center justify-center`}
    >
      <img src={logoInsertechImage} alt={alt} className={`h-full w-auto ${size === 'lg' ? 'max-h-8' : 'max-h-7'} object-contain`} />
    </motion.div>
  );
}
