import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ClipboardList,
  Wrench,
  HandHeart,
  GraduationCap,
  Timer,
  MonitorSmartphone,
  ArrowLeft,
  Calendar,
  MapPin,
  Check,
  Plus
} from 'lucide-react';
import type { EventSettings, Technician, WorkRole } from '../../types';
import { db } from '../../db';
import { networkManager } from '../../network';
import {
  WORK_ROLE_LABELS,
  getEffectivePinLock,
  readMobileVolunteerName,
  saveMobileTechId,
  saveMobileVolunteerName
} from '../../utils/modeLock';
import BrandLogo from '../shared/BrandLogo';
import PinDialog from './PinDialog';
import { showToast } from '../shared/Toast';

interface MobileOnboardingWizardProps {
  activeEvents: EventSettings[];
  selectedEvent: EventSettings;
  onSelectEvent: (evt: EventSettings) => void;
  initialStep?: 'event' | 'role' | 'volunteer';
  onComplete: (result: { event: EventSettings; role: WorkRole; volunteerName: string; techId?: string }) => void;
  onLeaveSession: () => void;
}

interface RoleOptionDef {
  role: WorkRole;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

function getRolesForEvent(eventType: EventSettings['type']): RoleOptionDef[] {
  if (eventType === 'reparothon') {
    return [
      { role: 'accueil', description: 'Inscrire les visiteurs et leurs appareils (1 question/écran).', icon: ClipboardList },
      { role: 'reparateur', description: 'Prendre un appareil, suivre les 4 étapes et consulter le lexique.', icon: Wrench },
      { role: 'assistant', description: "Répondre aux demandes d'aide et orienter les visiteurs.", icon: HandHeart },
      { role: 'kiosque_formulaire', description: 'Tablette libre-service pour les visiteurs (verrouillable PIN).', icon: MonitorSmartphone },
      { role: 'admin', description: 'Contrôle complet, carte des tables et gestion multi-événements (PIN).', icon: ShieldCheck }
    ];
  }
  if (eventType === 'kiosque_concours') {
    return [
      { role: 'juge', description: 'Chronométrer jusqu’à 2 joueurs devant vous et lancer un départ commun.', icon: Timer },
      { role: 'accueil', description: 'Gérer les inscriptions et accueillir les participants.', icon: ClipboardList },
      { role: 'kiosque_formulaire', description: 'Tablette libre-service pour l’inscription au concours (verrouillable PIN).', icon: MonitorSmartphone },
      { role: 'admin', description: 'Toutes les pistes, tirage au sort, prix et exports (PIN).', icon: ShieldCheck }
    ];
  }
  if (eventType === 'install_fest_linux') {
    return [
      { role: 'accueil', description: 'Accueillir les visiteurs et suivre les installations.', icon: ClipboardList },
      { role: 'reparateur', description: 'Installer Linux sur les ordinateurs des participants.', icon: Wrench },
      { role: 'kiosque_formulaire', description: 'Formulaire d’inscription seul pour les visiteurs (verrouillable PIN).', icon: MonitorSmartphone },
      { role: 'admin', description: 'Gestion complète des bénévoles et exports (PIN).', icon: ShieldCheck }
    ];
  }
  return [
    { role: 'formateur', description: 'Évaluer les participants Avant / Pendant / Après la formation.', icon: GraduationCap },
    { role: 'accueil', description: 'Inscrire les participants et confirmer les présences.', icon: ClipboardList },
    { role: 'kiosque_formulaire', description: 'Formulaire d’inscription seul pour les participants (verrouillable PIN).', icon: MonitorSmartphone },
    { role: 'admin', description: 'Gestion complète, bilan et exports (PIN).', icon: ShieldCheck }
  ];
}

export default function MobileOnboardingWizard({
  activeEvents,
  selectedEvent,
  onSelectEvent,
  initialStep,
  onComplete,
  onLeaveSession
}: MobileOnboardingWizardProps) {
  const hasMultipleEvents = activeEvents.length > 1;
  const [step, setStep] = useState<'event' | 'role' | 'volunteer'>(() => {
    if (initialStep) return initialStep;
    return hasMultipleEvents ? 'event' : 'role';
  });
  const [pendingRole, setPendingRole] = useState<WorkRole>('accueil');
  const [showAdminPin, setShowAdminPin] = useState(false);

  // Identification rapide (1 seul champ Nom, prénom ou surnom) — accepté même si introuvable dans la BD
  const [volunteerDisplayName, setVolunteerDisplayName] = useState(() => readMobileVolunteerName());
  const [nameError, setNameError] = useState('');

  // Fiche technique dédiée au Réparateur (Nom/surnom + Table + Capacités techniques)
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [techTable, setTechTable] = useState<string>('');
  const [techSpecs, setTechSpecs] = useState<string[]>(['laptop']);
  const [techSoftwareSpecs, setTechSoftwareSpecs] = useState<string[]>(['windows']);

  useEffect(() => {
    if (!hasMultipleEvents && step === 'event') {
      setStep('role');
    }
  }, [hasMultipleEvents, step]);

  useEffect(() => {
    if (pendingRole === 'reparateur') {
      db.technicians
        .where('eventId')
        .equals(selectedEvent.id)
        .toArray()
        .then((list) => setTechnicians(list))
        .catch(() => setTechnicians([]));
    }
  }, [pendingRole, selectedEvent.id]);

  const roleOptions = getRolesForEvent(selectedEvent.type);

  const handleChooseRole = (role: WorkRole) => {
    if (role === 'kiosque_formulaire') {
      onComplete({
        event: selectedEvent,
        role: 'kiosque_formulaire',
        volunteerName: readMobileVolunteerName() || 'Kiosque'
      });
      return;
    }
    if (role === 'admin') {
      setPendingRole('admin');
      setShowAdminPin(true);
      return;
    }
    setPendingRole(role);
    setNameError('');
    setStep('volunteer');
  };

  const handleQuickVolunteerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = volunteerDisplayName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      setNameError('Indiquez votre nom, prénom ou surnom.');
      document.getElementById('mob-vol-displayName')?.focus();
      return;
    }
    saveMobileVolunteerName(cleaned);
    onComplete({
      event: selectedEvent,
      role: pendingRole,
      volunteerName: cleaned
    });
  };

  const handlePickExistingTech = (tech: Technician) => {
    saveMobileTechId(tech.id);
    saveMobileVolunteerName(tech.name);
    onComplete({
      event: selectedEvent,
      role: 'reparateur',
      volunteerName: tech.name,
      techId: tech.id
    });
  };

  const handleCreateTech = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = volunteerDisplayName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      showToast('Indiquez votre nom, prénom ou surnom.', 'warning');
      document.getElementById('mob-tech-name')?.focus();
      return;
    }
    const newTech: Technician = {
      id: 'tech-' + Math.random().toString(36).substring(2, 11),
      eventId: selectedEvent.id,
      name: cleaned,
      specialties: techSpecs,
      softwareSpecialties: techSoftwareSpecs,
      tableNumber: techTable ? Number(techTable) : null,
      status: 'libre',
      currentTicketId: null,
      createdAt: Date.now()
    };
    await networkManager.writeToDatabase('technicians', 'put', newTech);
    handlePickExistingTech(newTech);
  };

  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col">
      <header className="flex items-center justify-between gap-4 px-4 sm:px-6 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] border-b-4 border-primary bg-app-header">
        <button
          type="button"
          onClick={onLeaveSession}
          title="Menu principal"
          aria-label="Menu principal"
          className="flex items-center gap-3 min-w-0 text-left cursor-pointer hover:opacity-90 transition"
        >
          <BrandLogo />
          <div className="min-w-0">
            <p className="text-micro uppercase font-bold text-primary">
              {step === 'event' ? 'Étape 1 • Événement' : step === 'role' ? 'Étape 2 • Votre rôle' : 'Étape 3 • Identification'}
            </p>
            <h1 className="font-display font-black uppercase text-base sm:text-lg truncate">
              {selectedEvent.name}
            </h1>
          </div>
        </button>

        {step !== 'event' && (
          <button
            type="button"
            onClick={() => {
              if (step === 'volunteer') setStep('role');
              else if (step === 'role' && hasMultipleEvents) setStep('event');
              else onLeaveSession();
            }}
            className="min-h-11 px-3.5 py-2 rounded-xl bg-app-input border border-app-card-border text-xs font-bold font-display uppercase flex items-center gap-1.5 cursor-pointer hover:border-primary/60"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Retour</span>
          </button>
        )}
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 sm:p-8 flex flex-col justify-center gap-6">
        {/* ÉTAPE 1 : ÉVÉNEMENT EN COURS (affichée uniquement si > 1 événement actif) */}
        {step === 'event' && (
          <section className="space-y-4">
            <h2 className="font-display font-black uppercase tracking-wider text-xl text-center">
              1. Quel événement rejoignez-vous ?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeEvents.map((evt) => {
                const isSelected = evt.id === selectedEvent.id;
                return (
                  <button
                    key={evt.id}
                    type="button"
                    onClick={() => {
                      onSelectEvent(evt);
                      setStep('role');
                    }}
                    className={`min-h-28 p-5 rounded-3xl border-2 text-left flex flex-col justify-between gap-2 cursor-pointer transition shadow-sm ${
                      isSelected
                        ? 'bg-primary/15 border-primary text-app-text'
                        : 'bg-app-card border-app-card-border hover:border-primary/60 text-app-text'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-display font-black uppercase text-lg leading-tight">{evt.name}</span>
                      <span className="text-micro uppercase font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
                        {evt.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-app-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={12} className="text-primary" />
                        {evt.date}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} className="text-primary" />
                        {evt.location}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ÉTAPE 2 : CHOIX DU RÔLE */}
        {step === 'role' && (
          <section className="space-y-4">
            <div className="text-center space-y-1">
              <h2 className="font-display font-black uppercase tracking-wider text-xl">
                Quel est votre rôle aujourd'hui ?
              </h2>
              <p className="text-xs text-app-text-muted">
                L'interface et les boutons de l'en-tête s'adapteront automatiquement à votre tâche.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {roleOptions.map(({ role, description, icon: Icon }) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleChooseRole(role)}
                  className="min-h-28 p-5 rounded-3xl bg-app-card border-2 border-app-card-border hover:border-primary focus-visible:border-primary text-left flex items-start gap-4 transition cursor-pointer shadow-sm"
                >
                  <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Icon size={26} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <span className="font-display font-black uppercase tracking-wider text-base block text-app-text">
                      {WORK_ROLE_LABELS[role]}
                    </span>
                    <span className="text-xs text-app-text-muted block leading-snug">{description}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ÉTAPE 3A : FICHE RÉPARATEUR (Nom/surnom + Table + Capacités techniques) */}
        {step === 'volunteer' && pendingRole === 'reparateur' && (
          <section className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
            <div>
              <span className="text-micro uppercase font-black tracking-widest text-primary block">
                Profil Animateur Réparateur
              </span>
              <h2 className="font-display font-bold uppercase text-xl text-app-text">
                Votre nom et vos capacités techniques
              </h2>
            </div>

            {technicians.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-app-text-muted">Profils déjà enregistrés</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {technicians.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handlePickExistingTech(t)}
                      className="min-h-14 p-3.5 rounded-2xl bg-app-input border border-app-card-border hover:border-primary text-left flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div>
                        <span className="font-bold text-sm text-app-text block">{t.name}</span>
                        <span className="text-micro text-app-text-muted">
                          {t.tableNumber ? `Table ${t.tableNumber} • ` : ''}
                          {[...t.specialties, ...(t.softwareSpecialties || [])].join(', ') || 'Polyvalent'}
                        </span>
                      </div>
                      <Check size={16} className="text-primary shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleCreateTech} className="space-y-4 pt-3 border-t border-app-card-border">
              <p className="text-xs font-bold uppercase text-primary">Ou entrer rapidement votre nom et capacités</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mob-tech-name" className="text-micro font-bold uppercase text-app-text-muted block mb-1">
                    Nom, prénom ou surnom *
                  </label>
                  <input
                    id="mob-tech-name"
                    type="text"
                    required
                    value={volunteerDisplayName}
                    onChange={(e) => setVolunteerDisplayName(e.target.value)}
                    placeholder="Ex. Gabriel Roy ou Gab"
                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-app-input border border-app-input-border text-sm text-app-text"
                  />
                </div>
                <div>
                  <label htmlFor="mob-tech-table" className="text-micro font-bold uppercase text-app-text-muted block mb-1">
                    Table assignée
                  </label>
                  <select
                    id="mob-tech-table"
                    value={techTable}
                    onChange={(e) => setTechTable(e.target.value)}
                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-app-input border border-app-input-border text-sm text-app-text cursor-pointer"
                  >
                    <option value="">Mobile / Pas de table</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        Table {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-micro font-bold uppercase text-app-text-muted block">Spécialités matérielles</span>
                <div className="flex flex-wrap gap-2">
                  {['laptop', 'pc_tour', 'cellulaire', 'tablette', 'autre'].map((spec) => {
                    const active = techSpecs.includes(spec);
                    return (
                      <button
                        key={spec}
                        type="button"
                        onClick={() =>
                          setTechSpecs(active ? techSpecs.filter((s) => s !== spec) : [...techSpecs, spec])
                        }
                        className={`min-h-11 px-3.5 py-2 rounded-xl text-xs font-bold uppercase border cursor-pointer ${
                          active ? 'bg-primary text-secondary border-primary' : 'bg-app-input text-app-text-muted border-app-card-border'
                        }`}
                      >
                        {spec.replace('_', ' ')}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-micro font-bold uppercase text-app-text-muted block">Spécialités logicielles / OS</span>
                <div className="flex flex-wrap gap-2">
                  {['windows', 'mac', 'linux', 'android_ios'].map((spec) => {
                    const active = techSoftwareSpecs.includes(spec);
                    return (
                      <button
                        key={spec}
                        type="button"
                        onClick={() =>
                          setTechSoftwareSpecs(
                            active ? techSoftwareSpecs.filter((s) => s !== spec) : [...techSoftwareSpecs, spec]
                          )
                        }
                        className={`min-h-11 px-3.5 py-2 rounded-xl text-xs font-bold uppercase border cursor-pointer ${
                          active ? 'bg-primary text-secondary border-primary' : 'bg-app-input text-app-text-muted border-app-card-border'
                        }`}
                      >
                        {spec.replace('_', '/')}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-12 px-5 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                <span>Démarrer en tant que Réparateur</span>
              </button>
            </form>
          </section>
        )}

        {/* ÉTAPE 3B : IDENTIFICATION RAPIDE BÉNÉVOLE (1 seul champ Nom/surnom, même si introuvable en BD) */}
        {step === 'volunteer' && pendingRole !== 'reparateur' && (
          <section className="max-w-lg w-full mx-auto bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
            <div>
              <span className="text-micro uppercase font-black tracking-widest text-primary block">
                Identification rapide • {WORK_ROLE_LABELS[pendingRole]}
              </span>
              <h2 className="font-display font-bold uppercase text-xl text-app-text">
                Comment doit-on vous appeler aujourd'hui ?
              </h2>
              <p className="text-xs text-app-text-muted mt-1">
                Entrez simplement votre nom, prénom ou surnom — aucune fiche complète requise.
              </p>
            </div>

            <form onSubmit={handleQuickVolunteerSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="mob-vol-displayName"
                  className="text-micro font-bold uppercase tracking-wider text-app-text-muted block mb-1"
                >
                  Nom, prénom ou surnom *
                </label>
                <input
                  id="mob-vol-displayName"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  value={volunteerDisplayName}
                  onChange={(e) => {
                    setVolunteerDisplayName(e.target.value);
                    setNameError('');
                  }}
                  placeholder="Ex. Marc ou Julie Martin"
                  maxLength={100}
                  className="w-full min-h-12 px-4 py-2.5 rounded-xl bg-app-input border border-app-input-border text-base text-app-text focus:outline-none focus:border-primary"
                />
                {nameError && (
                  <p role="alert" className="text-xs font-bold text-danger mt-1">
                    {nameError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full min-h-14 px-5 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase tracking-wider text-sm cursor-pointer shadow-lg"
              >
                Confirmer et ouvrir mon espace ({WORK_ROLE_LABELS[pendingRole]})
              </button>
            </form>
          </section>
        )}
      </main>

      <PinDialog
        isOpen={showAdminPin}
        pinLock={getEffectivePinLock(selectedEvent)}
        onClose={() => setShowAdminPin(false)}
        onUnlocked={() => {
          setShowAdminPin(false);
          setPendingRole('admin');
          setNameError('');
          setStep('volunteer');
        }}
      />
    </div>
  );
}
