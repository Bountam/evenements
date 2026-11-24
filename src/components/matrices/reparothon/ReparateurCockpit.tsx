import React, { useEffect, useState } from 'react';
import {
  Wrench, BookOpen, HandHeart, Megaphone, Check, CheckCircle, ArrowRight, ArrowLeft, Plus, Star
} from 'lucide-react';
import type { EventSettings, FollowUpType, RepairStage, RepairTicket, Technician, TicketStatus } from '../../../types';
import { networkManager } from '../../../network';
import {
  FOLLOW_UP_LABELS,
  REPAIR_ACTIONS_CATALOG,
  REPLACEMENT_PARTS_OPTIONS,
  getLexiconEntriesForSymptoms
} from '../../../utils/repairLexicon';
import Modal from '../../shared/Modal';
import { showToast } from '../../shared/Toast';

interface ReparateurCockpitProps {
  event: EventSettings;
  tickets: RepairTicket[];
  technicians: Technician[];
  onReload: () => Promise<void>;
  onCelebrate: (payload: { visitorName: string; objectName: string; techName: string; weightKg: number }) => void;
}

const STAGES: { id: RepairStage; label: string }[] = [
  { id: 'accueil_table', label: '1. Accueil' },
  { id: 'diagnostic', label: '2. Diagnostic' },
  { id: 'reparation', label: '3. Réparation' },
  { id: 'rapport', label: '4. Rapport' }
];

export default function ReparateurCockpit({
  event,
  tickets,
  technicians,
  onReload,
  onCelebrate
}: ReparateurCockpitProps) {
  const storageKey = `insertech_active_tech_${event.id}`;
  const [selectedTechId, setSelectedTechId] = useState<string>(() => localStorage.getItem(storageKey) || '');
  const [activeTicketId, setActiveTicketId] = useState<string>('');
  const [showLexicon, setShowLexicon] = useState(false);

  // Création rapide de profil si besoin
  const [newName, setNewName] = useState('');
  const [newTable, setNewTable] = useState('');
  const [newSpecs, setNewSpecs] = useState<string[]>(['laptop']);

  // Rapport final en 3 écrans (1 question à la fois)
  const [reportSubStep, setReportSubStep] = useState<1 | 2 | 3>(1);
  const [reportStatus, setReportStatus] = useState<TicketStatus>('repare');
  const [reportActions, setReportActions] = useState<string[]>([]);
  const [reportNote, setReportNote] = useState('');
  const [followUpType, setFollowUpType] = useState<FollowUpType>('aucune');
  const [followUpPart, setFollowUpPart] = useState<string>(REPLACEMENT_PARTS_OPTIONS[0]);
  const [followUpDetail, setFollowUpDetail] = useState('');

  useEffect(() => {
    if (selectedTechId) localStorage.setItem(storageKey, selectedTechId);
  }, [selectedTechId, storageKey]);

  const activeTech = technicians.find((t) => t.id === selectedTechId) || null;
  const myActiveTickets = activeTech
    ? tickets.filter((t) => t.assignedTechId === activeTech.id && ['assigne', 'en_cours'].includes(t.status))
    : [];

  const activeTicket =
    myActiveTickets.find((t) => t.id === activeTicketId) || myActiveTickets[0] || null;

  const isCompatible = (t: RepairTicket, tech: Technician) => {
    if (tech.specialties.includes(t.objectCategory)) return true;
    const diag = `${t.initialDiagnosis || ''} ${(t.extraData?.symptoms || []).join(' ')}`.toLowerCase();
    return Boolean(tech.softwareSpecialties?.some((s) => diag.includes(s.toLowerCase())));
  };

  const waitingTickets = tickets
    .filter((t) => t.status === 'en_attente')
    .sort((a, b) => {
      const pA = a.extraData?.priority ? 1 : 0;
      const pB = b.extraData?.priority ? 1 : 0;
      if (pA !== pB) return pB - pA;
      if (activeTech) {
        const cA = isCompatible(a, activeTech) ? 1 : 0;
        const cB = isCompatible(b, activeTech) ? 1 : 0;
        if (cA !== cB) return cB - cA;
      }
      return a.createdAt - b.createdAt;
    });

  const handleQuickCreateTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const tech: Technician = {
      id: 'tech-' + Math.random().toString(36).substring(2, 10),
      eventId: event.id,
      name: newName.trim(),
      specialties: newSpecs.length > 0 ? newSpecs : ['laptop'],
      softwareSpecialties: ['linux', 'windows'],
      status: 'libre',
      currentTicketId: null,
      tableNumber: newTable ? Number(newTable) : null,
      createdAt: Date.now()
    };
    await networkManager.writeToDatabase('technicians', 'put', tech);
    setSelectedTechId(tech.id);
    setNewName('');
    setNewTable('');
    await onReload();
  };

  const handleTakeTicket = async (t: RepairTicket) => {
    if (!activeTech) return;
    const now = Date.now();
    const updated: RepairTicket = {
      ...t,
      status: 'en_cours',
      assignedTechId: activeTech.id,
      assignedTechName: activeTech.name,
      updatedAt: now,
      extraData: {
        ...t.extraData,
        assignedAt: now,
        serviceStartedAt: now,
        tableNumber: activeTech.tableNumber ?? null,
        repairStage: 'accueil_table'
      }
    };
    await networkManager.writeToDatabase('tickets', 'put', updated);
    await networkManager.writeToDatabase('technicians', 'put', {
      ...activeTech,
      status: 'occupe',
      currentTicketId: updated.id
    });
    setActiveTicketId(updated.id);
    setReportSubStep(1);
    setReportActions([]);
    setReportNote('');
    setFollowUpType('aucune');
    await onReload();
  };

  const updateStage = async (stage: RepairStage) => {
    if (!activeTicket) return;
    await networkManager.writeToDatabase('tickets', 'put', {
      ...activeTicket,
      updatedAt: Date.now(),
      extraData: { ...activeTicket.extraData, repairStage: stage }
    });
    await onReload();
  };

  const toggleDiagCheck = async (step: string) => {
    if (!activeTicket) return;
    const current = Array.isArray(activeTicket.extraData?.checkedDiagSteps)
      ? activeTicket.extraData.checkedDiagSteps
      : [];
    const next = current.includes(step) ? current.filter((s: string) => s !== step) : [...current, step];
    await networkManager.writeToDatabase('tickets', 'put', {
      ...activeTicket,
      updatedAt: Date.now(),
      extraData: { ...activeTicket.extraData, checkedDiagSteps: next }
    });
    await onReload();
  };

  const handleCallTable = async () => {
    if (!activeTicket || !activeTech) return;
    await networkManager.writeToDatabase('tickets', 'put', {
      ...activeTicket,
      updatedAt: Date.now(),
      extraData: {
        ...activeTicket.extraData,
        tableCallAt: Date.now(),
        tableNumber: activeTech.tableNumber ?? activeTicket.extraData?.tableNumber ?? null
      }
    });
    showToast('Appel envoyé sur l’Écran Public et aux Assistants.', 'success');
    await onReload();
  };

  const handleRequestHelp = async () => {
    if (!activeTicket) return;
    await networkManager.writeToDatabase('tickets', 'put', {
      ...activeTicket,
      updatedAt: Date.now(),
      extraData: {
        ...activeTicket.extraData,
        helpRequest: {
          active: true,
          reason: "Besoin d'un outil, d'une pièce ou d'un 2e avis",
          requestedAt: Date.now()
        }
      }
    });
    showToast('Demande envoyée aux Animateurs Assistants !', 'info');
    await onReload();
  };

  const handleSaveFinalReport = async () => {
    if (!activeTicket || !activeTech) return;
    const now = Date.now();
    const updated: RepairTicket = {
      ...activeTicket,
      status: reportStatus,
      resultRemarks: reportNote.trim(),
      updatedAt: now,
      extraData: {
        ...activeTicket.extraData,
        completedAt: now,
        actionsPerformed: reportActions,
        followUpType,
        followUpPart: followUpType === 'piece_rechange' ? followUpPart : '',
        followUpDetail: followUpType === 'boutique_insertech' ? followUpDetail : '',
        helpRequest: activeTicket.extraData?.helpRequest
          ? { ...activeTicket.extraData.helpRequest, active: false }
          : null
      }
    };
    await networkManager.writeToDatabase('tickets', 'put', updated);
    const remaining = myActiveTickets.filter((t) => t.id !== activeTicket.id);
    await networkManager.writeToDatabase('technicians', 'put', {
      ...activeTech,
      status: remaining.length > 0 ? 'occupe' : 'libre',
      currentTicketId: remaining[0]?.id ?? null
    });
    if (reportStatus === 'repare' || reportStatus === 'semi_repare') {
      onCelebrate({
        visitorName: activeTicket.visitorName,
        objectName: activeTicket.objectName,
        techName: activeTech.name,
        weightKg: activeTicket.weightKg || 1.5
      });
    }
    showToast('Rapport de réparation enregistré !', 'success');
    setActiveTicketId('');
    setReportSubStep(1);
    await onReload();
  };

  if (!activeTech) {
    return (
      <div className="max-w-3xl mx-auto bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
        <h3 className="text-lg font-display font-bold uppercase text-app-text flex items-center gap-2">
          <Wrench size={20} className="text-primary" aria-hidden="true" />
          <span>Qui êtes-vous aujourd'hui ?</span>
        </h3>
        {technicians.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {technicians.map((tech) => (
              <button
                key={tech.id}
                type="button"
                onClick={() => setSelectedTechId(tech.id)}
                className="min-h-16 p-4 rounded-2xl bg-app-input border-2 border-app-card-border hover:border-primary text-left cursor-pointer transition-colors"
              >
                <span className="font-display font-bold text-base text-app-text uppercase block">{tech.name}</span>
                <span className="text-xs text-app-text-muted">
                  {tech.tableNumber ? `Table ${tech.tableNumber}` : 'Sans table'} • {tech.specialties.join(', ')}
                </span>
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleQuickCreateTech} className="pt-4 border-t border-app-card-border space-y-3">
          <span className="text-xs font-display font-bold uppercase text-app-text-muted block">
            Ou créer mon poste rapidement :
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              placeholder="Votre prénom"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-app-input border border-app-input-border rounded-xl px-3 py-2.5 min-h-11 text-sm text-app-text"
            />
            <input
              type="number"
              placeholder="N° Table (ex. 3)"
              value={newTable}
              onChange={(e) => setNewTable(e.target.value)}
              className="bg-app-input border border-app-input-border rounded-xl px-3 py-2.5 min-h-11 text-sm text-app-text"
            />
            <button
              type="submit"
              className="min-h-11 px-4 py-2 rounded-xl bg-primary text-secondary font-display font-black uppercase text-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus size={15} aria-hidden="true" />
              <span>Rejoindre</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['laptop', 'pc_tour', 'cellulaire', 'tablette', 'autre'].map((spec) => {
              const active = newSpecs.includes(spec);
              return (
                <button
                  key={spec}
                  type="button"
                  onClick={() =>
                    setNewSpecs((prev) => (prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]))
                  }
                  className={`min-h-9 px-3 py-1 rounded-full text-xs font-bold uppercase cursor-pointer ${
                    active ? 'bg-primary text-secondary' : 'bg-app-input text-app-text-muted border border-app-card-border'
                  }`}
                >
                  {spec.replace('_', ' ')}
                </button>
              );
            })}
          </div>
        </form>
      </div>
    );
  }

  // File d'attente intelligente si aucun appareil actif
  if (!activeTicket) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-app-card border border-app-card-border p-4 rounded-2xl flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-sm font-display font-bold uppercase text-app-text">
              {activeTech.name} {activeTech.tableNumber ? `• Table ${activeTech.tableNumber}` : ''}
            </span>
            <p className="text-xs text-app-text-muted">Choisissez votre prochain appareil en fonction de vos compétences.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Numéro de table du réparateur"
              value={activeTech.tableNumber ?? ''}
              onChange={async (e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                await networkManager.writeToDatabase('technicians', 'put', { ...activeTech, tableNumber: val });
                await onReload();
                showToast(val ? `Table ${val} sélectionnée` : 'Mode mobile sélectionné', 'success');
              }}
              className="min-h-11 px-3 py-1.5 rounded-xl bg-app-input border border-app-card-border text-xs font-bold text-app-text cursor-pointer"
            >
              <option value="">Mobile</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  Table {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSelectedTechId('')}
              className="min-h-11 px-3 py-1.5 rounded-xl bg-app-input border border-app-card-border text-xs font-bold text-app-text-muted cursor-pointer"
            >
              Changer de profil
            </button>
          </div>
        </div>

        <div className="bg-app-card border border-app-card-border p-5 rounded-3xl shadow-lg space-y-3">
          <h3 className="text-base font-display font-bold uppercase text-app-text">
            File d'attente ({waitingTickets.length})
          </h3>
          {waitingTickets.length === 0 ? (
            <p className="text-sm text-app-text-muted py-8 text-center">Aucun appareil en attente pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {waitingTickets.map((t) => {
                const compat = isCompatible(t, activeTech);
                const waitMin = Math.max(0, Math.round((Date.now() - t.createdAt) / 60000));
                return (
                  <div
                    key={t.id}
                    className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      compat ? 'bg-primary/10 border-primary/50' : 'bg-app-input border-app-card-border'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {compat && (
                          <span className="text-micro bg-primary text-secondary px-2.5 py-0.5 rounded-full font-display font-black uppercase inline-flex items-center gap-1">
                            <Star size={11} aria-hidden="true" />
                            <span>Recommandé pour toi</span>
                          </span>
                        )}
                        <h4 className="font-display font-bold text-base text-app-text uppercase">{t.objectName}</h4>
                        <span className="text-micro bg-app-card border border-app-card-border px-2 py-0.5 rounded font-mono text-app-text-muted">
                          Attente : {waitMin} min
                        </span>
                      </div>
                      <p className="text-xs text-app-text-muted">
                        Participant : <strong className="text-app-text">{t.visitorName}</strong> • {t.initialDiagnosis}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTakeTicket(t)}
                      className="min-h-14 px-6 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer flex items-center justify-center gap-2 shrink-0"
                    >
                      <span>Prendre cet appareil</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentStage: RepairStage = activeTicket.extraData?.repairStage || 'accueil_table';
  const lexiconEntries = getLexiconEntriesForSymptoms(activeTicket.extraData?.symptoms || []);
  const checkedSteps: string[] = Array.isArray(activeTicket.extraData?.checkedDiagSteps)
    ? activeTicket.extraData.checkedDiagSteps
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Multi-appareils assignés par God Mode */}
      {myActiveTickets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {myActiveTickets.map((t, idx) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTicketId(t.id)}
              className={`min-h-11 px-4 py-2 rounded-xl font-display font-bold uppercase text-xs cursor-pointer border-2 ${
                t.id === activeTicket.id
                  ? 'bg-primary text-secondary border-primary'
                  : 'bg-app-card text-app-text border-app-card-border'
              }`}
            >
              Appareil #{idx + 1} : {t.objectName}
            </button>
          ))}
        </div>
      )}

      {/* En-tête Piste Temps Réel + Lexique + Demande Assistant */}
      <div className="bg-app-card border border-app-card-border p-4 rounded-3xl shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-micro uppercase font-black text-primary block">
              Piste Temps Réel • {activeTech.name} {activeTech.tableNumber ? `(Table ${activeTech.tableNumber})` : ''}
            </span>
            <h3 className="text-lg font-display font-bold uppercase text-app-text">
              {activeTicket.objectName} — {activeTicket.visitorName}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowLexicon(true)}
              className="min-h-11 px-3.5 py-2 rounded-xl bg-primary/15 border border-primary text-primary font-display font-bold uppercase text-xs cursor-pointer flex items-center gap-1.5"
            >
              <BookOpen size={15} aria-hidden="true" />
              <span>Lexique & Aide</span>
            </button>
            <button
              type="button"
              onClick={handleRequestHelp}
              className="min-h-11 px-3.5 py-2 rounded-xl bg-warning/15 border border-warning/40 text-warning font-display font-bold uppercase text-xs cursor-pointer flex items-center gap-1.5"
            >
              <HandHeart size={15} aria-hidden="true" />
              <span>Demander Assistant</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STAGES.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => updateStage(st.id)}
              className={`min-h-11 px-3 py-2 rounded-xl font-display font-bold uppercase text-xs cursor-pointer border ${
                currentStage === st.id
                  ? 'bg-primary text-secondary border-primary'
                  : 'bg-app-input text-app-text-muted border-app-card-border'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* ÉTAPE 1 : ACCUEIL À LA TABLE */}
      {currentStage === 'accueil_table' && (
        <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-4">
          <h4 className="text-lg font-display font-bold uppercase text-app-text">
            1. Accueil bienveillant à la table
          </h4>
          <p className="text-sm text-app-text">
            Accueillez chaleureusement <strong>{activeTicket.visitorName}</strong>
            {activeTicket.extraData?.contact?.pronouns ? ` (${activeTicket.extraData.contact.pronouns})` : ''}, et
            validez ensemble le symptôme noté : <strong>{activeTicket.initialDiagnosis}</strong>.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={handleCallTable}
              className="min-h-14 px-5 py-3 rounded-2xl bg-primary/15 border-2 border-primary text-primary font-display font-black uppercase text-sm cursor-pointer flex items-center justify-center gap-2"
            >
              <Megaphone size={18} aria-hidden="true" />
              <span>Appeler à la Table {activeTech.tableNumber || '?'}</span>
            </button>
            <button
              type="button"
              onClick={() => updateStage('diagnostic')}
              className="min-h-14 px-6 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Passer au diagnostic</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 2 : DIAGNOSTIC GUIDÉ */}
      {currentStage === 'diagnostic' && (
        <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-4">
          <h4 className="text-lg font-display font-bold uppercase text-app-text">2. Diagnostic étape par étape</h4>
          {lexiconEntries.map((entry) => (
            <div key={entry.problemId} className="space-y-2.5 p-4 rounded-2xl bg-app-input border border-app-card-border">
              <div className="font-display font-bold text-sm uppercase text-primary">{entry.problemId}</div>
              <p className="text-xs text-app-text">{entry.plainExplanation}</p>
              <p className="text-xs font-bold text-warning">Sécurité : {entry.safetyWarning}</p>
              <div className="space-y-2 pt-1">
                {entry.diagnosticSteps.map((step) => {
                  const checked = checkedSteps.includes(step);
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => toggleDiagCheck(step)}
                      className={`w-full min-h-12 px-4 py-2.5 rounded-xl border text-left text-xs font-bold cursor-pointer flex items-center justify-between gap-2 ${
                        checked
                          ? 'bg-primary text-secondary border-primary'
                          : 'bg-app-card text-app-text border-app-card-border'
                      }`}
                    >
                      <span>{step}</span>
                      {checked && <Check size={16} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => updateStage('accueil_table')}
              className="min-h-12 px-4 py-2 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              <span>Retour</span>
            </button>
            <button
              type="button"
              onClick={() => updateStage('reparation')}
              className="min-h-14 px-6 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer flex items-center gap-2"
            >
              <span>Passer à la réparation</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 3 : RÉPARATION */}
      {currentStage === 'reparation' && (
        <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-4">
          <h4 className="text-lg font-display font-bold uppercase text-app-text">3. Réparation & Pédagogie</h4>
          {lexiconEntries.map((entry) => (
            <div key={entry.problemId} className="space-y-2 p-4 rounded-2xl bg-app-input border border-app-card-border">
              <div className="font-display font-bold text-sm uppercase text-primary">{entry.problemId}</div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-app-text">
                {entry.repairSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="text-xs text-app-text-muted pt-1">{entry.whenToReferShopOrPart}</p>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={() => updateStage('diagnostic')}
              className="min-h-12 px-4 py-2 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              <span>Retour</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setReportSubStep(1);
                updateStage('rapport');
              }}
              className="min-h-14 px-6 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer flex items-center gap-2"
            >
              <span>Clôturer et faire le rapport</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 4 : RAPPORT FINAL EN 3 ÉCRANS */}
      {currentStage === 'rapport' && (
        <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
          <span className="text-micro uppercase font-black text-primary block">
            Rapport final • Question {reportSubStep} sur 3
          </span>

          {reportSubStep === 1 && (
            <div className="space-y-4">
              <h4 className="text-xl font-display font-bold uppercase text-app-text">Quel est le résultat ?</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: 'repare' as TicketStatus, label: 'Réparé !' },
                  { id: 'semi_repare' as TicketStatus, label: 'Semi-réparé' },
                  { id: 'non_reparable' as TicketStatus, label: 'Non réparable' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setReportStatus(opt.id);
                      setReportSubStep(2);
                    }}
                    className={`min-h-20 p-4 rounded-2xl border-2 font-display font-black uppercase text-base cursor-pointer ${
                      reportStatus === opt.id
                        ? 'bg-primary text-secondary border-primary'
                        : 'bg-app-input text-app-text border-app-card-border hover:border-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {reportSubStep === 2 && (
            <div className="space-y-4">
              <h4 className="text-xl font-display font-bold uppercase text-app-text">Actions réalisées</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {REPAIR_ACTIONS_CATALOG.map((act) => {
                  const selected = reportActions.includes(act);
                  return (
                    <button
                      key={act}
                      type="button"
                      onClick={() =>
                        setReportActions((prev) =>
                          prev.includes(act) ? prev.filter((a) => a !== act) : [...prev, act]
                        )
                      }
                      className={`min-h-12 px-4 py-2.5 rounded-2xl border-2 text-left text-xs font-bold cursor-pointer flex items-center justify-between ${
                        selected
                          ? 'bg-primary text-secondary border-primary'
                          : 'bg-app-input text-app-text border-app-card-border'
                      }`}
                    >
                      <span>{act}</span>
                      {selected && <Check size={16} />}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                placeholder="Note complémentaire (optionnel)"
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                className="w-full bg-app-input border border-app-input-border rounded-xl px-3.5 py-2.5 min-h-11 text-sm text-app-text"
              />
              <div className="flex justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setReportSubStep(1)}
                  className="min-h-12 px-4 py-2 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => setReportSubStep(3)}
                  className="min-h-14 px-6 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer flex items-center gap-2"
                >
                  <span>Continuer</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}

          {reportSubStep === 3 && (
            <div className="space-y-4">
              <h4 className="text-xl font-display font-bold uppercase text-app-text">
                Suite proposée au participant
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['aucune', 'piece_rechange', 'boutique_insertech', 'recyclage'] as FollowUpType[]).map((ft) => (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setFollowUpType(ft)}
                    className={`min-h-16 p-4 rounded-2xl border-2 text-left font-display font-bold uppercase text-xs sm:text-sm cursor-pointer ${
                      followUpType === ft
                        ? 'bg-primary text-secondary border-primary'
                        : 'bg-app-input text-app-text border-app-card-border'
                    }`}
                  >
                    {FOLLOW_UP_LABELS[ft]}
                  </button>
                ))}
              </div>

              {followUpType === 'piece_rechange' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  {REPLACEMENT_PARTS_OPTIONS.map((part) => (
                    <button
                      key={part}
                      type="button"
                      onClick={() => setFollowUpPart(part)}
                      className={`min-h-11 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                        followUpPart === part
                          ? 'bg-primary/20 text-primary border-primary'
                          : 'bg-app-input text-app-text border-app-card-border'
                      }`}
                    >
                      {part}
                    </button>
                  ))}
                </div>
              )}

              {followUpType === 'boutique_insertech' && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {['Atelier réparation Insertech', 'Achat reconditionné garanti'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setFollowUpDetail(opt)}
                      className={`min-h-11 px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                        followUpDetail === opt
                          ? 'bg-primary/20 text-primary border-primary'
                          : 'bg-app-input text-app-text border-app-card-border'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReportSubStep(2)}
                  className="min-h-12 px-4 py-2 rounded-2xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={handleSaveFinalReport}
                  className="min-h-14 px-8 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer flex items-center gap-2 shadow-xl"
                >
                  <CheckCircle size={18} />
                  <span>Enregistrer le rapport</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modale Lexique & Fiches hors-ligne */}
      <Modal isOpen={showLexicon} onClose={() => setShowLexicon(false)} title="Lexique & Fiches de réparation" icon={BookOpen}>
        <div className="space-y-4">
          {lexiconEntries.map((entry) => (
            <div key={entry.problemId} className="p-4 rounded-2xl bg-app-input border border-app-card-border space-y-2">
              <h4 className="font-display font-bold text-sm uppercase text-primary">{entry.problemId}</h4>
              <p className="text-xs text-app-text">{entry.plainExplanation}</p>
              <p className="text-xs font-bold text-warning">Sécurité : {entry.safetyWarning}</p>
              <p className="text-xs text-app-text-muted">{entry.whenToReferShopOrPart}</p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
