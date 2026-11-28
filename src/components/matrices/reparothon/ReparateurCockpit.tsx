import React, { useEffect, useState } from 'react';
import {
  Wrench,
  BookOpen,
  HandHeart,
  Megaphone,
  Check,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Plus,
  Star,
  Timer,
  Zap
} from 'lucide-react';
import type { EventSettings, FollowUpType, RepairTicket, Technician, TicketStatus } from '../../../types';
import { networkManager } from '../../../network';
import {
  FOLLOW_UP_LABELS,
  REPAIR_ACTIONS_CATALOG,
  REPLACEMENT_PARTS_OPTIONS,
  getLexiconEntriesForSymptoms
} from '../../../utils/repairLexicon';
import Modal from '../../shared/Modal';
import { showToast } from '../../shared/Toast';
import DiagnosticDecisionTree from './DiagnosticDecisionTree';
import IfixitGuidesPanel from './IfixitGuidesPanel';

interface ReparateurCockpitProps {
  event: EventSettings;
  tickets: RepairTicket[];
  technicians: Technician[];
  preselectedTechId?: string;
  onReload: () => Promise<void>;
  onCelebrate: (payload: { visitorName: string; objectName: string; techName: string; weightKg: number }) => void;
}

export default function ReparateurCockpit({
  event,
  tickets,
  technicians,
  preselectedTechId,
  onReload,
  onCelebrate
}: ReparateurCockpitProps) {
  const storageKey = `insertech_active_tech_${event.id}`;
  const [selectedTechId, setSelectedTechId] = useState<string>(
    () => preselectedTechId || localStorage.getItem(storageKey) || ''
  );

  useEffect(() => {
    if (preselectedTechId && technicians.some((t) => t.id === preselectedTechId)) {
      setSelectedTechId(preselectedTechId);
    }
  }, [preselectedTechId, technicians]);

  const [activeTicketId, setActiveTicketId] = useState<string>('');
  const [showLexicon, setShowLexicon] = useState(false);
  const [showReportWizard, setShowReportWizard] = useState(false);
  const [guideFocusKeyword, setGuideFocusKeyword] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedTechId) localStorage.setItem(storageKey, selectedTechId);
  }, [selectedTechId, storageKey]);

  const activeTech = technicians.find((t) => t.id === selectedTechId) || null;
  const myActiveTickets = activeTech
    ? tickets.filter((t) => t.assignedTechId === activeTech.id && ['assigne', 'en_cours'].includes(t.status))
    : [];

  const activeTicket =
    myActiveTickets.find((t) => t.id === activeTicketId) || myActiveTickets[0] || null;

  useEffect(() => {
    setShowReportWizard(false);
    setReportSubStep(1);
    setGuideFocusKeyword(null);
  }, [activeTicket?.id]);

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
        repairStage: 'diagnostic'
      }
    };
    await networkManager.writeToDatabase('tickets', 'put', updated);
    await networkManager.writeToDatabase('technicians', 'put', {
      ...activeTech,
      status: 'occupe',
      currentTicketId: updated.id
    });
    setActiveTicketId(updated.id);
    setShowReportWizard(false);
    setReportSubStep(1);
    setReportActions([]);
    setReportNote('');
    setFollowUpType('aucune');
    await onReload();
  };

  const toggleDiagnosticCheck = async (checkId: string) => {
    if (!activeTicket) return;
    const current = Array.isArray(activeTicket.extraData?.diagnosticChecks)
      ? activeTicket.extraData.diagnosticChecks
      : [];
    const next = current.includes(checkId)
      ? current.filter((id: string) => id !== checkId)
      : [...current, checkId];
    await networkManager.writeToDatabase('tickets', 'put', {
      ...activeTicket,
      updatedAt: Date.now(),
      extraData: { ...activeTicket.extraData, diagnosticChecks: next }
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

  const persistTicketCompletion = async (
    statusToSave: TicketStatus,
    followUpToSave: FollowUpType,
    toastLabel: string
  ) => {
    if (!activeTicket || !activeTech) return;
    const now = Date.now();
    const updated: RepairTicket = {
      ...activeTicket,
      status: statusToSave,
      resultRemarks: reportNote.trim(),
      updatedAt: now,
      extraData: {
        ...activeTicket.extraData,
        completedAt: now,
        repairStage: 'rapport',
        actionsPerformed: reportActions,
        followUpType: followUpToSave,
        followUpPart: followUpToSave === 'piece_rechange' ? followUpPart : '',
        followUpDetail: followUpToSave === 'boutique_insertech' ? followUpDetail : '',
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
    if (statusToSave === 'repare' || statusToSave === 'semi_repare') {
      onCelebrate({
        visitorName: activeTicket.visitorName,
        objectName: activeTicket.objectName,
        techName: activeTech.name,
        weightKg: activeTicket.weightKg || 1.5
      });
    }
    showToast(toastLabel, 'success');
    setActiveTicketId('');
    setShowReportWizard(false);
    setReportSubStep(1);
    await onReload();
  };

  const handleSaveFinalReport = async () => {
    await persistTicketCompletion(reportStatus, followUpType, 'Rapport de réparation enregistré !');
  };

  const handleQuickValidate = async () => {
    await persistTicketCompletion('repare', 'aucune', 'Appareil validé comme réparé !');
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
                const waitMin = Math.max(0, Math.round((nowMs - t.createdAt) / 60000));
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
        <p className="text-center text-xs text-app-text-muted pt-1">
          Un visiteur souhaite devenir bénévole ? Orientez-le vers <strong className="text-app-text">l'Accueil</strong>, un <strong className="text-app-text">Assistant</strong> ou un <strong className="text-app-text">Administrateur</strong>.
        </p>
      </div>
    );
  }

  const lexiconEntries = getLexiconEntriesForSymptoms(activeTicket.extraData?.symptoms || []);
  const diagnosticChecks: string[] = Array.isArray(activeTicket.extraData?.diagnosticChecks)
    ? activeTicket.extraData.diagnosticChecks
    : [];
  const serviceStartMs = activeTicket.extraData?.serviceStartedAt || activeTicket.updatedAt || activeTicket.createdAt;
  const elapsedMinutes = Math.max(0, Math.round((nowMs - serviceStartMs) / 60000));

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

      {/* FICHE TECHNIQUE PERMANENTE TOUJOURS VISIBLE DÈS LE DÉPART */}
      <section
        aria-label="Fiche technique de l'appareil"
        className="bg-app-card border border-app-card-border p-4 sm:p-5 rounded-3xl shadow-lg space-y-3.5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-micro uppercase font-black text-primary">
                {activeTech.name} {activeTech.tableNumber ? `• Table ${activeTech.tableNumber}` : ''}
              </span>
              <span
                className={`text-micro px-2 py-0.5 rounded-full font-mono font-bold inline-flex items-center gap-1 border ${
                  elapsedMinutes > 45
                    ? 'bg-danger/15 border-danger/40 text-danger'
                    : elapsedMinutes >= 25
                      ? 'bg-warning/15 border-warning/40 text-warning'
                      : 'bg-success/15 border-success/40 text-success'
                }`}
              >
                <Timer size={11} aria-hidden="true" />
                <span>{elapsedMinutes} min</span>
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-display font-black uppercase text-app-text">
              {activeTicket.objectName}
            </h3>
            <p className="text-xs sm:text-sm text-app-text">
              Participant : <strong>{activeTicket.visitorName}</strong>
              {activeTicket.extraData?.contact?.pronouns ? ` (${activeTicket.extraData.contact.pronouns})` : ''}
              {' · '}
              <span className="uppercase font-semibold text-app-text-muted">
                {activeTicket.objectCategory.replace('_', ' ')} · {activeTicket.operatingSystem}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCallTable}
              className="min-h-11 px-3.5 py-2 rounded-xl bg-primary/15 border border-primary text-primary font-display font-black uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <Megaphone size={15} aria-hidden="true" />
              <span>Appeler Table {activeTech.tableNumber || '?'}</span>
            </button>
            <button
              type="button"
              onClick={handleRequestHelp}
              className="min-h-11 px-3.5 py-2 rounded-xl bg-warning/15 border border-warning/40 text-warning font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <HandHeart size={15} aria-hidden="true" />
              <span>Assistant</span>
            </button>
            <button
              type="button"
              onClick={() => setShowLexicon(true)}
              className="min-h-11 px-3.5 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <BookOpen size={15} aria-hidden="true" />
              <span>Lexique</span>
            </button>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-app-input border border-app-card-border">
          <span className="text-micro uppercase font-black text-app-text-muted block">Symptôme noté à l'accueil</span>
          <p className="text-sm font-semibold text-app-text mt-0.5">
            {activeTicket.initialDiagnosis || 'Aucun symptôme précisé.'}
          </p>
        </div>
      </section>

      {!showReportWizard ? (
        <>
          {/* DIAGNOSTIC INTERACTIF OUI / NON + POINTS DE CONTRÔLE */}
          <DiagnosticDecisionTree
            ticket={activeTicket}
            checkedIds={diagnosticChecks}
            onToggleCheck={toggleDiagnosticCheck}
            onSelectGuideKeyword={(kw) => setGuideFocusKeyword(kw)}
          />

          {/* GUIDES PERTINENTS EN LIGNE / HORS-LIGNE (DIRECTEMENT SOUS LE DIAGNOSTIC) */}
          <IfixitGuidesPanel
            ticket={activeTicket}
            embedded
            focusKeyword={guideFocusKeyword}
          />

          {/* CLÔTURE DIRECTE EN BAS DU PARCOURS */}
          <div className="pt-2 flex flex-col sm:flex-row justify-end gap-3">
            <button
              type="button"
              onClick={handleQuickValidate}
              className="min-h-14 px-6 py-3 rounded-2xl bg-success/15 border-2 border-success/60 text-success font-display font-black uppercase text-sm cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <Zap size={18} aria-hidden="true" />
              <span>Valider rapidement (Réparé)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setReportSubStep(1);
                setShowReportWizard(true);
              }}
              className="min-h-14 px-7 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase text-sm cursor-pointer inline-flex items-center justify-center gap-2 shadow-lg"
            >
              <CheckCircle size={18} aria-hidden="true" />
              <span>Clôturer et faire le rapport</span>
            </button>
          </div>
        </>
      ) : (
        /* RAPPORT FINAL EN 3 QUESTIONS (1 À LA FOIS) + RACCOURCI VALIDER RAPIDEMENT */
        <div className="bg-app-card border border-app-card-border p-5 sm:p-6 rounded-3xl shadow-lg space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-micro uppercase font-black text-primary" aria-live="polite">
              Rapport final • Question {reportSubStep} sur 3
            </span>
            <button
              type="button"
              onClick={() => setShowReportWizard(false)}
              className="min-h-9 px-3 py-1 rounded-xl bg-app-input border border-app-card-border text-xs font-display font-bold uppercase text-app-text-muted hover:text-app-text cursor-pointer inline-flex items-center gap-1"
            >
              <ArrowLeft size={13} aria-hidden="true" />
              <span>Revenir à la fiche</span>
            </button>
          </div>

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
              <div className="pt-2 border-t border-app-card-border flex justify-end">
                <button
                  type="button"
                  onClick={handleQuickValidate}
                  className="min-h-12 px-5 py-2.5 rounded-2xl bg-success/15 border-2 border-success/60 text-success font-display font-black uppercase text-xs sm:text-sm cursor-pointer inline-flex items-center gap-2"
                >
                  <Zap size={16} aria-hidden="true" />
                  <span>Valider rapidement</span>
                </button>
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
                      {selected && <Check size={16} aria-hidden="true" />}
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
                  <ArrowRight size={18} aria-hidden="true" />
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
                  <CheckCircle size={18} aria-hidden="true" />
                  <span>Enregistrer le rapport</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Orientation bénévolat : le réparateur réfère vers Accueil, Assistant ou Admin */}
      <p className="text-center text-xs text-app-text-muted pt-2">
        Un visiteur souhaite devenir bénévole ? Orientez-le vers <strong className="text-app-text">l'Accueil</strong>, un <strong className="text-app-text">Assistant</strong> ou un <strong className="text-app-text">Administrateur</strong>.
      </p>

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
