import React from 'react';
import { Calendar, MapPin, Building } from 'lucide-react';

interface EventMetaBadgesProps {
  date: string;
  location: string;
  partner?: string;
  className?: string;
}

export default function EventMetaBadges({
  date,
  location,
  partner,
  className = ''
}: EventMetaBadgesProps) {
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('fr-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div className={`flex items-center gap-3 text-xs text-app-text-muted font-medium flex-wrap ${className}`}>
      <span className="flex items-center gap-1 shrink-0" title={`Date de l'événement : ${formattedDate}`}>
        <Calendar size={12} className="text-primary shrink-0" />
        <span>{formattedDate}</span>
      </span>

      <span className="flex items-center gap-1 max-w-[180px] sm:max-w-[260px] truncate" title={`Lieu : ${location}`}>
        <MapPin size={12} className="text-primary shrink-0" />
        <span className="truncate">{location}</span>
      </span>

      {partner && (
        <span className="flex items-center gap-1 max-w-[160px] sm:max-w-[220px] truncate text-app-text" title={`Partenaire coorganisateur : ${partner}`}>
          <Building size={12} className="text-primary shrink-0" />
          <span className="truncate">{partner}</span>
        </span>
      )}
    </div>
  );
}
