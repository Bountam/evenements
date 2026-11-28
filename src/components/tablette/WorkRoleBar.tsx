import React, { useState } from 'react';
import { ShieldCheck, ClipboardList, Wrench, HandHeart, GraduationCap, ArrowLeftRight } from 'lucide-react';
import type { EventSettings, WorkRole } from '../../types';
import { WORK_ROLE_LABELS, getEffectivePinLock } from '../../utils/modeLock';
import Modal from '../shared/Modal';
import PinDialog from './PinDialog';

interface WorkRoleBarProps {
  event: EventSettings;
  activeRole: WorkRole;
  onSelectRole: (role: WorkRole) => void;
  isTablet?: boolean;
}

interface RoleCardDef {
  role: WorkRole;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const REPAROTHON_ROLES: RoleCardDef[] = [
  { role: 'admin', description: 'Vue Map, 2e appareil, multi-événements et tous les réglages.', icon: ShieldCheck },
  { role: 'accueil', description: 'Inscrire les appareils (1 question/écran) et gérer la file.', icon: ClipboardList },
  { role: 'reparateur', description: 'Prendre un appareil compatible, piste 4 étapes et lexique.', icon: Wrench },
  { role: 'assistant', description: "Répondre aux demandes d'aide et accompagner aux tables.", icon: HandHeart }
];

const GENERIC_ROLES: RoleCardDef[] = [
  { role: 'admin', description: 'Tous les contrôles, multi-événements et exports.', icon: ShieldCheck },
  { role: 'formateur', description: 'Évaluation Avant / Pendant / Après des formés.', icon: GraduationCap },
  { role: 'accueil', description: 'Inscriptions et présences des participants.', icon: ClipboardList }
];

export default function WorkRoleBar({ event, activeRole, onSelectRole, isTablet = false }: WorkRoleBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAdminPin, setPendingAdminPin] = useState(false);

  const roles = event.type === 'reparothon' ? REPAROTHON_ROLES : GENERIC_ROLES;

  const handlePick = (role: WorkRole) => {
    if (role === 'admin' && isTablet && activeRole !== 'admin') {
      const pinLock = getEffectivePinLock(event);
      if (pinLock) {
        setIsOpen(false);
        setPendingAdminPin(true);
        return;
      }
    }
    onSelectRole(role);
    setIsOpen(false);
  };

  return (
    <>
      <div className="bg-app-card border border-app-card-border rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-micro uppercase font-black tracking-wider text-primary bg-primary/15 border border-primary/30 px-2.5 py-1 rounded-full shrink-0">
            Rôle actif
          </span>
          <span className="text-sm font-display font-bold uppercase text-app-text truncate">
            {WORK_ROLE_LABELS[activeRole]}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="min-h-11 px-4 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs hover:border-primary/60 transition-colors cursor-pointer flex items-center gap-2"
        >
          <ArrowLeftRight size={15} className="text-primary" aria-hidden="true" />
          <span>Changer mon rôle</span>
        </button>
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Choisir mon rôle terrain" icon={ArrowLeftRight}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {roles.map(({ role, description, icon: Icon }) => {
            const isSelected = activeRole === role;
            return (
              <button
                key={role}
                type="button"
                aria-pressed={isSelected}
                onClick={() => handlePick(role)}
                className={`min-h-24 p-4 rounded-2xl border-2 flex flex-col items-start justify-center gap-1.5 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-primary text-secondary border-primary font-black shadow-lg'
                    : 'bg-app-input text-app-text border-app-card-border hover:border-primary/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={24} className={isSelected ? 'text-secondary' : 'text-primary'} />
                  <span className="text-sm font-display font-bold uppercase">{WORK_ROLE_LABELS[role]}</span>
                </div>
                <span className="text-xs font-sans opacity-85 leading-snug">{description}</span>
              </button>
            );
          })}
        </div>
      </Modal>

      <PinDialog
        isOpen={pendingAdminPin}
        pinLock={getEffectivePinLock(event)}
        eventId={event?.id}
        onClose={() => setPendingAdminPin(false)}
        onUnlocked={() => {
          setPendingAdminPin(false);
          onSelectRole('admin');
        }}
      />
    </>
  );
}
