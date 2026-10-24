import React, { useState, useEffect } from 'react';
import { EventSettings, RepairTicket, Technician, DeviceCategory, PartnerLogo } from '../../types';
import { db, registerSyncListener } from '../../db';
import { networkManager } from '../../network';
import { DoughnutChart } from '../shared/LazyCharts';
import { Plus, Users, Trash2, Search, Award, X, RotateCcw, Check, Settings } from 'lucide-react';
import confetti from 'canvas-confetti';
import { showToast } from '../shared/Toast';
import { confirmDialog } from '../shared/ConfirmDialog';
import { fieldLabelClass, fieldInputClass } from '../shared/TextField';
import {
  DEFAULT_DISTROS, PREVIOUS_OS_OPTIONS, DEVICE_OPTIONS, INSTALL_STATUS_LABELS, MAX_COMPUTERS_PER_VOLUNTEER,
  getEventDistros, previousOSLabel, deviceLabel, toOperatingSystem, isInstallActive, isInstallDone, isInstallFailed
} from '../../utils/installFest';

interface InstallFestMatrixProps {
  event: EventSettings;
  activeTab: 'accueil' | 'techniciens' | 'public';
}

interface InstallCelebration {
  kind: 'installfest';
  visitorName: string;
  objectName: string;
  techName: string;
  distro: string;
}

const OTHER_DISTRO = '__autre__';
const cardClass = 'bg-app-card border border-app-card-border p-4 sm:p-6 rounded-3xl shadow-lg';
const titleClass = 'text-base font-bold font-display text-app-text uppercase tracking-wider';
const chipBase = 'text-micro px-2 py-0.5 rounded-full font-bold uppercase border';

const statusChipClass = (t: RepairTicket) =>
  isInstallDone(t) ? 'bg-primary/20 text-primary border-primary/30'
  : isInstallFailed(t) ? 'bg-danger/20 text-danger border-danger/30'
  : isInstallActive(t) ? 'bg-warning/20 text-warning border-warning/40'
  : 'bg-app-input text-app-text-muted border-app-card-border';

const DISTRO_COLORS = ['#9ecd33', '#480A94', '#f59e0b', '#38bdf8', '#ef4444', '#a3e635', '#c084fc', '#64748b', '#f472b6'];

const playCelebrationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    [261.63, 329.63, 392.0, 523.25].forEach((freq, index) => {
      const start = now + index * 0.15;
      const duration = index === 3 ? 0.45 : 0.15;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gainNode.gain.setValueAtTime(0, start);
      gainNode.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    });
  } catch (err) {
    console.warn('Erreur fanfare audio :', err);
  }
};

export default function InstallFestMatrix({ event, activeTab }: InstallFestMatrixProps) {
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [distros, setDistros] = useState<string[]>(getEventDistros(event));

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'attente' | 'cours' | 'termine' | 'echec'>('all');

  // Formulaire d'inscription
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [category, setCategory] = useState<DeviceCategory>('laptop');
  const [brandModel, setBrandModel] = useState('');
  const [previousOS, setPreviousOS] = useState('windows_10');
  const [distro, setDistro] = useState(distros[0] || DEFAULT_DISTROS[0]);
  const [otherDistro, setOtherDistro] = useState('');
  const [dualBoot, setDualBoot] = useState(false);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Bénévoles et réglages
  const [newTechName, setNewTechName] = useState('');
  const [newTechTable, setNewTechTable] = useState('');
  const [newDistro, setNewDistro] = useState('');

  const [activeCelebration, setActiveCelebration] = useState<InstallCelebration | null>(null);
  const [activeLogoIndex, setActiveLogoIndex] = useState(0);

  const loadData = async () => {
    try {
      const [dbTickets, dbTechs, dbEvent] = await Promise.all([
        db.tickets.where('eventId').equals(event.id).toArray(),
        db.technicians.where('eventId').equals(event.id).toArray(),
        db.events.get(event.id)
      ]);
      setTickets(dbTickets.sort((a, b) => a.createdAt - b.createdAt));
      setTechnicians(dbTechs.sort((a, b) => a.createdAt - b.createdAt));
      setDistros(getEventDistros(dbEvent || event));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = registerSyncListener(() => { loadData(); });
    return () => unsubscribe();
  }, [event.id]);

  // La distribution choisie par défaut suit la liste de l'événement
  useEffect(() => {
    if (distro !== OTHER_DISTRO && !distros.includes(distro)) setDistro(distros[0] || OTHER_DISTRO);
  }, [distros]);

  const showCelebration = (payload: InstallCelebration) => {
    setActiveCelebration(payload);
    playCelebrationSound();
    confetti({ particleCount: 80, spread: 80, origin: { y: 0.6 }, colors: ['#9ecd33', '#480A94', '#ffffff'] });
    setTimeout(() => setActiveCelebration(null), 8000);
  };

  // Célébrations venant des autres fenêtres (écran projeté) et des tablettes
  useEffect(() => {
    const channel = new BroadcastChannel(`insertech_installfest_sync_${event.id}`);
    channel.onmessage = (e) => {
      if (e.data?.type === 'CELEBRATION') showCelebration(e.data.payload);
    };
    networkManager.onCelebration = (payload) => {
      if (payload?.kind === 'installfest') showCelebration(payload);
    };
    return () => {
      channel.close();
      networkManager.onCelebration = null;
    };
  }, [event.id]);

  const partnerLogos: PartnerLogo[] = event.extraData?.partnerLogos || [];
  useEffect(() => {
    if (activeTab === 'public' && partnerLogos.length > 1) {
      const interval = setInterval(() => setActiveLogoIndex(prev => (prev + 1) % partnerLogos.length), 4000);
      return () => clearInterval(interval);
    }
  }, [activeTab, partnerLogos.length]);

  const activeLoad = (techId: string, list: RepairTicket[] = tickets) =>
    list.filter(t => isInstallActive(t) && t.assignedTechId === techId).length;

  // Un bénévole est « occupé » quand il a atteint son maximum d'ordinateurs
  const syncTechStatus = async (techId: string | null) => {
    if (!techId) return;
    const tech = await db.technicians.get(techId);
    if (!tech) return;
    const eventTickets = await db.tickets.where('eventId').equals(event.id).toArray();
    const active = eventTickets.filter(t => isInstallActive(t) && t.assignedTechId === techId);
    const status = tech.status === 'en_pause' ? 'en_pause' : active.length >= MAX_COMPUTERS_PER_VOLUNTEER ? 'occupe' : 'libre';
    await networkManager.writeToDatabase('technicians', 'put', {
      ...tech,
      status,
      currentTicketId: active[0]?.id || null
    });
  };

  // INSCRIPTION
  const handleAddTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorName.trim()) {
      setFormError('Entrez le nom de la personne.');
      return;
    }
    // Loi 25 : pas de courriel sans consentement explicite
    if (visitorEmail.trim() && !consent) {
      setFormError('Cochez le consentement ou retirez le courriel.');
      return;
    }
    const chosenDistro = distro === OTHER_DISTRO ? otherDistro.trim() : distro;
    if (!chosenDistro) {
      setFormError('Précisez la distribution choisie.');
      return;
    }
    setFormError(null);

    const now = Date.now();
    const ticket: RepairTicket = {
      id: 'tkt-' + Math.random().toString(36).substring(2, 11),
      eventId: event.id,
      visitorName: visitorName.trim(),
      visitorEmail: visitorEmail.trim() || undefined,
      objectName: brandModel.trim() || deviceLabel(category),
      objectCategory: category,
      operatingSystem: toOperatingSystem(previousOS),
      initialDiagnosis: notes.trim(),
      status: 'en_attente',
      assignedTechId: null,
      assignedTechName: null,
      resultRemarks: '',
      weightKg: 0,
      createdAt: now,
      updatedAt: now,
      extraData: {
        distro: chosenDistro,
        previousOS,
        dualBoot,
        dataBackup: false,
        ...(visitorEmail.trim() ? { consentContact: true, consentAt: now } : {})
      }
    };

    try {
      await networkManager.writeToDatabase('tickets', 'put', ticket);
      setVisitorName('');
      setVisitorEmail('');
      setConsent(false);
      setBrandModel('');
      setOtherDistro('');
      setDualBoot(false);
      setNotes('');
      showToast(`${ticket.visitorName} est inscrit·e (${chosenDistro}).`, 'success');
      await loadData();
    } catch (err) {
      console.error(err);
      showToast("Impossible d'enregistrer l'inscription.", 'error');
    }
  };

  const updateTicket = async (ticketId: string, change: (t: RepairTicket) => RepairTicket) => {
    const ticket = await db.tickets.get(ticketId);
    if (!ticket) return null;
    const updated = { ...change(ticket), updatedAt: Date.now() };
    await networkManager.writeToDatabase('tickets', 'put', updated);
    return { before: ticket, after: updated };
  };

  const handleAssign = async (ticketId: string, techId: string) => {
    const tech = technicians.find(t => t.id === techId);
    if (!tech) return;
    if (activeLoad(techId) >= MAX_COMPUTERS_PER_VOLUNTEER) {
      showToast(`${tech.name} a déjà ${MAX_COMPUTERS_PER_VOLUNTEER} ordinateurs.`, 'warning');
      return;
    }
    try {
      const res = await updateTicket(ticketId, t => ({ ...t, status: 'en_cours', assignedTechId: tech.id, assignedTechName: tech.name }));
      if (res?.before.assignedTechId && res.before.assignedTechId !== tech.id) await syncTechStatus(res.before.assignedTechId);
      await syncTechStatus(tech.id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRequeue = async (ticketId: string) => {
    try {
      const res = await updateTicket(ticketId, t => ({ ...t, status: 'en_attente', assignedTechId: null, assignedTechName: null }));
      await syncTechStatus(res?.before.assignedTechId || null);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleFinish = async (ticketId: string, success: boolean) => {
    try {
      const res = await updateTicket(ticketId, t => ({
        ...t,
        status: success ? 'repare' : 'non_reparable',
        assignedTechId: null,
        assignedTechName: null,
        extraData: { ...t.extraData, installedBy: t.assignedTechName || t.extraData?.installedBy || '' }
      }));
      if (!res) return;
      await syncTechStatus(res.before.assignedTechId);
      if (success) {
        const payload: InstallCelebration = {
          kind: 'installfest',
          visitorName: res.after.visitorName,
          objectName: res.after.objectName,
          techName: res.before.assignedTechName || 'un bénévole',
          distro: res.after.extraData?.distro || 'Linux'
        };
        networkManager.sendChronoAction({ type: 'PEER_CELEBRATION', payload });
        const channel = new BroadcastChannel(`insertech_installfest_sync_${event.id}`);
        channel.postMessage({ type: 'CELEBRATION', payload });
        channel.close();
        showCelebration(payload);
      }
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleFlag = async (ticketId: string, flag: 'dualBoot' | 'dataBackup') => {
    try {
      await updateTicket(ticketId, t => ({ ...t, extraData: { ...t.extraData, [flag]: !t.extraData?.[flag] } }));
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveRemarks = async (ticketId: string, remarks: string) => {
    const current = tickets.find(t => t.id === ticketId);
    if (!current || current.resultRemarks === remarks) return;
    try {
      await updateTicket(ticketId, t => ({ ...t, resultRemarks: remarks }));
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTicket = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Supprimer cette inscription ?',
      message: 'Cette suppression est définitive.',
      confirmLabel: 'Supprimer',
      tone: 'destructive'
    });
    if (!confirmed) return;
    try {
      const ticket = await db.tickets.get(id);
      await networkManager.writeToDatabase('tickets', 'delete', id);
      await syncTechStatus(ticket?.assignedTechId || null);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // BÉNÉVOLES
  const handleAddTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTechName.trim()) return;
    const tech: Technician = {
      id: 'tech-' + Math.random().toString(36).substring(2, 11),
      eventId: event.id,
      name: newTechName.trim(),
      specialties: [],
      tableNumber: newTechTable.trim() ? parseInt(newTechTable) : null,
      status: 'libre',
      currentTicketId: null,
      createdAt: Date.now()
    };
    try {
      await networkManager.writeToDatabase('technicians', 'put', tech);
      setNewTechName('');
      setNewTechTable('');
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTech = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Retirer ce bénévole ?',
      message: 'Ses ordinateurs en cours retourneront dans la file d\'attente.',
      confirmLabel: 'Retirer',
      tone: 'destructive'
    });
    if (!confirmed) return;
    try {
      const active = tickets.filter(t => isInstallActive(t) && t.assignedTechId === id);
      for (const t of active) {
        await networkManager.writeToDatabase('tickets', 'put', { ...t, status: 'en_attente', assignedTechId: null, assignedTechName: null, updatedAt: Date.now() });
      }
      await networkManager.writeToDatabase('technicians', 'delete', id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTogglePause = async (tech: Technician) => {
    try {
      const paused = tech.status !== 'en_pause';
      await networkManager.writeToDatabase('technicians', 'put', {
        ...tech,
        status: paused ? 'en_pause' : activeLoad(tech.id) >= MAX_COMPUTERS_PER_VOLUNTEER ? 'occupe' : 'libre'
      });
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // DISTRIBUTIONS (propres à l'événement)
  const saveDistros = async (list: string[]) => {
    try {
      const currentEvent = (await db.events.get(event.id)) || event;
      await networkManager.writeToDatabase('events', 'put', {
        ...currentEvent,
        extraData: { ...currentEvent.extraData, installDistros: list }
      });
      setDistros(list.length > 0 ? list : DEFAULT_DISTROS);
    } catch (e) {
      console.error(e);
      showToast("Impossible d'enregistrer la liste des distributions.", 'error');
    }
  };

  const handleAddDistro = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newDistro.trim();
    if (!name) return;
    if (distros.some(d => d.toLowerCase() === name.toLowerCase())) {
      showToast('Cette distribution est déjà dans la liste.', 'warning');
      return;
    }
    await saveDistros([...distros, name]);
    setNewDistro('');
  };

  // STATISTIQUES
  const total = tickets.length;
  const doneCount = tickets.filter(isInstallDone).length;
  const failedCount = tickets.filter(isInstallFailed).length;
  const activeCount = tickets.filter(isInstallActive).length;
  const waitingCount = tickets.filter(t => t.status === 'en_attente').length;
  const finishedCount = doneCount + failedCount;
  const successRate = finishedCount > 0 ? Math.round((doneCount / finishedCount) * 100) : 0;

  const distroCounts = new Map<string, number>();
  tickets.filter(isInstallDone).forEach(t => {
    const name = t.extraData?.distro || 'Autre';
    distroCounts.set(name, (distroCounts.get(name) || 0) + 1);
  });

  const renderCelebration = () => activeCelebration && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/90 backdrop-blur-md animate-fade-in p-4">
      <div className="glass-panel p-6 sm:p-10 rounded-3xl max-w-2xl text-center space-y-6 border-4 border-primary animate-bounce">
        <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center text-primary mx-auto">
          <Award size={64} />
        </div>
        <span className="text-xs font-black uppercase text-primary tracking-widest font-sans block">Une seconde vie !</span>
        <h2 className="text-4xl sm:text-5xl font-display font-bold text-app-text uppercase tracking-wider">Linux installé !</h2>
        <p className="text-lg text-app-text-muted font-sans leading-relaxed">
          Le <span className="text-primary font-bold">{activeCelebration.objectName}</span> de{' '}
          <span className="font-semibold text-app-text">{activeCelebration.visitorName}</span> tourne maintenant sous{' '}
          <span className="text-primary font-bold">{activeCelebration.distro}</span>, grâce à{' '}
          <span className="font-semibold text-app-text">{activeCelebration.techName}</span> !
        </p>
      </div>
    </div>
  );

  // ÉCRAN PUBLIC
  if (activeTab === 'public') {
    const distroLabels = Array.from(distroCounts.keys());
    const doughnutData = {
      labels: distroLabels,
      datasets: [{
        data: distroLabels.map(d => distroCounts.get(d) || 0),
        backgroundColor: distroLabels.map((_, i) => DISTRO_COLORS[i % DISTRO_COLORS.length]),
        borderColor: 'rgba(24, 10, 43, 0.8)',
        borderWidth: 2
      }]
    };
    const queue = tickets.filter(t => t.status === 'en_attente' || isInstallActive(t));

    return (
      <div className="space-y-8 relative">
        {renderCelebration()}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {[
            { label: 'Ordinateurs inscrits', value: total, color: 'text-app-text' },
            { label: 'Linux installés', value: doneCount, color: 'text-primary' },
            { label: 'En installation', value: activeCount, color: 'text-warning' },
            { label: 'Taux de succès', value: `${successRate}%`, color: 'text-primary' }
          ].map(kpi => (
            <div key={kpi.label} className="bg-app-card border border-app-card-border p-4 sm:p-5 rounded-2xl text-center shadow-lg">
              <span className="text-micro uppercase font-black tracking-widest text-app-text-muted font-sans block mb-1">{kpi.label}</span>
              <div className={`text-2xl sm:text-3xl md:text-4xl font-display font-bold tabular-nums ${kpi.color}`}>{kpi.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
          <div className={`lg:col-span-8 ${cardClass}`}>
            <h3 className={`${titleClass} text-lg mb-4 pb-2 border-b border-app-card-border`}>
              File d'attente et installations ({waitingCount} en attente)
            </h3>
            {queue.length === 0 ? (
              <p className="text-sm text-app-text-muted text-center py-12 font-sans">Aucun ordinateur en attente pour le moment.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {queue.slice(0, 10).map(t => (
                  <div key={t.id} className="p-4 rounded-xl bg-app-input border border-app-card-border flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-bold text-app-text text-sm truncate">{t.visitorName}</h4>
                      <p className="text-xs text-app-text-muted mt-0.5 truncate">{t.objectName} → {t.extraData?.distro}</p>
                    </div>
                    <span className={`${chipBase} shrink-0 ${statusChipClass(t)} ${t.status === 'en_attente' ? 'animate-pulse' : ''}`}>
                      {t.status === 'en_attente' ? 'Attente' : t.assignedTechName}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`lg:col-span-4 ${cardClass} flex flex-col justify-center`}>
            {distroLabels.length === 0 ? (
              <p className="text-sm text-app-text-muted text-center py-12 font-sans">Les distributions installées apparaîtront ici.</p>
            ) : (
              <div className="max-h-72 aspect-square mx-auto w-full flex items-center justify-center">
                <DoughnutChart data={doughnutData} title="Distributions installées" />
              </div>
            )}
          </div>
        </div>

        {partnerLogos.length > 0 && (
          <div
            tabIndex={0}
            role="region"
            aria-label="Partenaires de l'événement"
            className="bg-app-card border border-app-card-border p-4 rounded-2xl flex items-center justify-between gap-4 mt-8 focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            <span className="text-micro uppercase font-black tracking-widest text-app-text-muted font-sans shrink-0">Nos précieux partenaires</span>
            <div className="flex-1 overflow-hidden relative h-12 max-w-md mx-auto flex items-center justify-center">
              {partnerLogos.map((logo, idx) => (
                <div
                  key={logo.id}
                  className={`absolute inset-0 flex items-center justify-center p-1 transition-all duration-700 transform ${
                    idx === activeLogoIndex ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-12 scale-95 pointer-events-none'
                  }`}
                >
                  <img src={logo.data} alt={logo.name} className="max-h-10 max-w-full object-contain filter drop-shadow" />
                </div>
              ))}
            </div>
            <span className="text-micro font-sans text-app-text-muted shrink-0 font-bold">{activeLogoIndex + 1} / {partnerLogos.length}</span>
          </div>
        )}
      </div>
    );
  }

  // ACCUEIL : inscription et suivi des installations
  if (activeTab === 'accueil') {
    const query = searchQuery.trim().toLowerCase();
    const filtered = tickets.filter(t => {
      const matchesSearch = !query || [t.visitorName, t.objectName, t.extraData?.distro, t.assignedTechName, t.initialDiagnosis]
        .some(v => typeof v === 'string' && v.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'attente' && t.status === 'en_attente')
        || (statusFilter === 'cours' && isInstallActive(t))
        || (statusFilter === 'termine' && isInstallDone(t))
        || (statusFilter === 'echec' && isInstallFailed(t));
      return matchesSearch && matchesStatus;
    });
    const availableTechs = technicians.filter(tech => tech.status !== 'en_pause' && activeLoad(tech.id) < MAX_COMPUTERS_PER_VOLUNTEER);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {renderCelebration()}

        <div className={`lg:col-span-4 ${cardClass}`}>
          <h3 className={`${titleClass} mb-4 flex items-center gap-2`}>
            <Plus size={18} className="text-primary" />
            <span>Nouvelle inscription</span>
          </h3>

          <form onSubmit={handleAddTicket} className="space-y-3" noValidate>
            <div className="space-y-0.5">
              <label htmlFor="if-name" className={fieldLabelClass}>Nom de la personne</label>
              <input id="if-name" type="text" value={visitorName} onChange={e => setVisitorName(e.target.value)} placeholder="Ex. Martine Bouchard" className={`${fieldInputClass} min-h-9`} />
            </div>

            <div className="space-y-0.5">
              <label htmlFor="if-email" className={fieldLabelClass}>Courriel (facultatif)</label>
              <input id="if-email" type="email" value={visitorEmail} onChange={e => setVisitorEmail(e.target.value)} placeholder="martine@email.com" className={`${fieldInputClass} min-h-9`} />
            </div>
            {visitorEmail.trim() && (
              <label className="flex items-start gap-2 text-xs text-app-text cursor-pointer">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 accent-primary" />
                <span>La personne accepte qu'on conserve son courriel pour la recontacter (Loi 25).</span>
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <label htmlFor="if-device" className={fieldLabelClass}>Appareil</label>
                <select id="if-device" value={category} onChange={e => setCategory(e.target.value as DeviceCategory)} className={`${fieldInputClass} min-h-9`}>
                  {DEVICE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div className="space-y-0.5">
                <label htmlFor="if-model" className={fieldLabelClass}>Marque et modèle</label>
                <input id="if-model" type="text" value={brandModel} onChange={e => setBrandModel(e.target.value)} placeholder="Ex. Lenovo T450" className={`${fieldInputClass} min-h-9`} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <label htmlFor="if-prev-os" className={fieldLabelClass}>OS précédent</label>
                <select id="if-prev-os" value={previousOS} onChange={e => setPreviousOS(e.target.value)} className={`${fieldInputClass} min-h-9`}>
                  {PREVIOUS_OS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div className="space-y-0.5">
                <label htmlFor="if-distro" className={fieldLabelClass}>Distribution choisie</label>
                <select id="if-distro" value={distro} onChange={e => setDistro(e.target.value)} className={`${fieldInputClass} min-h-9`}>
                  {distros.map(d => <option key={d} value={d}>{d}</option>)}
                  <option value={OTHER_DISTRO}>Autre…</option>
                </select>
              </div>
            </div>
            {distro === OTHER_DISTRO && (
              <div className="space-y-0.5">
                <label htmlFor="if-distro-other" className={fieldLabelClass}>Quelle distribution ?</label>
                <input id="if-distro-other" type="text" value={otherDistro} onChange={e => setOtherDistro(e.target.value)} placeholder="Ex. Pop!_OS" className={`${fieldInputClass} min-h-9`} />
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-app-text cursor-pointer">
              <input type="checkbox" checked={dualBoot} onChange={e => setDualBoot(e.target.checked)} className="accent-primary" />
              <span>Double démarrage (conserver le système actuel)</span>
            </label>

            <div className="space-y-0.5">
              <label htmlFor="if-notes" className={fieldLabelClass}>Notes</label>
              <textarea id="if-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Ex. Garder les photos du bureau." className={`${fieldInputClass} resize-none`} />
            </div>

            {formError && <p role="alert" className="text-xs font-bold text-danger">{formError}</p>}

            <button type="submit" className="w-full min-h-11 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 transition cursor-pointer">
              <Plus size={14} />
              <span>Inscrire</span>
            </button>
          </form>
        </div>

        <div className={`lg:col-span-8 ${cardClass}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-app-card-border">
            <h3 className={titleClass}>
              Ordinateurs ({filtered.length}{filtered.length !== tickets.length ? ` / ${tickets.length}` : ''})
            </h3>
            <div className="relative max-w-xs w-full">
              <Search size={14} className="absolute left-3 top-2.5 text-app-text-muted" />
              <input
                type="text"
                aria-label="Rechercher"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher (nom, modèle, distribution)…"
                className={`${fieldInputClass} pl-8`}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {([
              { id: 'all', label: `Tous (${total})` },
              { id: 'attente', label: `En attente (${waitingCount})` },
              { id: 'cours', label: `En installation (${activeCount})` },
              { id: 'termine', label: `Terminés (${doneCount})` },
              { id: 'echec', label: `Échecs (${failedCount})` }
            ] as const).map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                aria-pressed={statusFilter === f.id}
                className={`text-micro px-2.5 py-1 rounded-full font-bold uppercase transition cursor-pointer border ${
                  statusFilter === f.id ? 'bg-primary text-secondary border-primary' : 'bg-app-input text-app-text-muted border-app-card-border hover:text-app-text'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {technicians.length === 0 && (
            <p className="text-xs text-warning font-sans mb-3">Ajoutez les bénévoles dans l'onglet « Bénévoles » pour pouvoir assigner les ordinateurs.</p>
          )}

          {filtered.length === 0 ? (
            <p className="text-xs text-app-text-muted text-center py-8 font-sans">
              {tickets.length === 0 ? 'Aucune inscription pour cet événement.' : 'Aucune inscription ne correspond à vos critères.'}
            </p>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {filtered.map(t => (
                <div key={t.id} className="p-4 rounded-xl bg-app-input border border-app-card-border space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-app-text text-sm">{t.visitorName}</h4>
                        <span className={`${chipBase} ${statusChipClass(t)}`}>
                          {INSTALL_STATUS_LABELS[t.status]}
                          {isInstallActive(t) && t.assignedTechName ? ` · ${t.assignedTechName}` : ''}
                        </span>
                      </div>
                      <p className="text-xs text-app-text-muted font-sans">
                        {deviceLabel(t.objectCategory)} · {t.objectName} · {previousOSLabel(t.extraData?.previousOS)}
                        {' → '}<span className="text-primary font-bold">{t.extraData?.distro}</span>
                      </p>
                      {isInstallDone(t) && t.extraData?.installedBy && (
                        <p className="text-xs text-app-text-muted font-sans">Installé par {t.extraData.installedBy}</p>
                      )}
                      {t.initialDiagnosis && <p className="text-xs italic text-app-text-muted">« {t.initialDiagnosis} »</p>}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {(t.status === 'en_attente' || isInstallActive(t)) && availableTechs.length > 0 && (
                        <select
                          aria-label={`Assigner l'ordinateur de ${t.visitorName}`}
                          value=""
                          onChange={e => handleAssign(t.id, e.target.value)}
                          className={`${fieldInputClass} w-auto min-h-9`}
                        >
                          <option value="" disabled>{isInstallActive(t) ? 'Changer de bénévole…' : 'Assigner à…'}</option>
                          {availableTechs.filter(tech => tech.id !== t.assignedTechId).map(tech => (
                            <option key={tech.id} value={tech.id}>
                              {tech.name}{tech.tableNumber ? ` (table ${tech.tableNumber})` : ''} · {activeLoad(tech.id)}/{MAX_COMPUTERS_PER_VOLUNTEER}
                            </option>
                          ))}
                        </select>
                      )}
                      {isInstallActive(t) && (
                        <>
                          <button onClick={() => handleFinish(t.id, true)} className="min-h-9 px-3 rounded-lg bg-primary text-secondary text-xs font-bold font-display uppercase flex items-center gap-1 cursor-pointer">
                            <Check size={12} /> Terminé
                          </button>
                          <button onClick={() => handleFinish(t.id, false)} className="min-h-9 px-3 rounded-lg border border-danger/40 text-danger text-xs font-bold font-display uppercase cursor-pointer hover:bg-danger/10">
                            Échec
                          </button>
                        </>
                      )}
                      {t.status !== 'en_attente' && (
                        <button onClick={() => handleRequeue(t.id)} title="Remettre en attente" aria-label={`Remettre ${t.visitorName} en attente`} className="min-h-9 min-w-9 p-2 rounded-lg text-app-text-muted hover:text-app-text hover:bg-app-card cursor-pointer">
                          <RotateCcw size={13} />
                        </button>
                      )}
                      <button onClick={() => handleDeleteTicket(t.id)} aria-label={`Supprimer l'inscription de ${t.visitorName}`} className="min-h-9 min-w-9 p-2 rounded-lg text-app-text-muted hover:text-danger hover:bg-danger/10 cursor-pointer">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t border-app-card-border">
                    <label className="flex items-center gap-1.5 text-xs text-app-text cursor-pointer">
                      <input type="checkbox" checked={!!t.extraData?.dualBoot} onChange={() => handleToggleFlag(t.id, 'dualBoot')} className="accent-primary" />
                      Double démarrage
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-app-text cursor-pointer">
                      <input type="checkbox" checked={!!t.extraData?.dataBackup} onChange={() => handleToggleFlag(t.id, 'dataBackup')} className="accent-primary" />
                      Données sauvegardées
                    </label>
                    <input
                      key={`${t.id}-${t.updatedAt}`}
                      type="text"
                      aria-label={`Remarques pour ${t.visitorName}`}
                      defaultValue={t.resultRemarks}
                      onBlur={e => handleSaveRemarks(t.id, e.target.value.trim())}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      placeholder="Remarques (pilotes, problème rencontré…)"
                      className={`${fieldInputClass} flex-1 min-w-48`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // BÉNÉVOLES et réglages des distributions
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
      {renderCelebration()}

      <div className="lg:col-span-4 space-y-6">
        <div className={cardClass}>
          <h3 className={`${titleClass} mb-4 flex items-center gap-2`}>
            <Users size={18} className="text-primary" />
            <span>Ajouter un bénévole</span>
          </h3>
          <form onSubmit={handleAddTech} className="space-y-3">
            <div className="space-y-0.5">
              <label htmlFor="if-tech-name" className={fieldLabelClass}>Nom</label>
              <input id="if-tech-name" type="text" required value={newTechName} onChange={e => setNewTechName(e.target.value)} placeholder="Ex. Gabriel Roy" className={`${fieldInputClass} min-h-9`} />
            </div>
            <div className="space-y-0.5">
              <label htmlFor="if-tech-table" className={fieldLabelClass}>Table</label>
              <select id="if-tech-table" value={newTechTable} onChange={e => setNewTechTable(e.target.value)} className={`${fieldInputClass} min-h-9`}>
                <option value="">Aucune table</option>
                {Array.from({ length: 15 }, (_, i) => i + 1).map(n => <option key={n} value={n}>Table {n}</option>)}
              </select>
            </div>
            <button type="submit" className="w-full min-h-11 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs cursor-pointer">
              <Plus size={14} />
              <span>Ajouter</span>
            </button>
          </form>
        </div>

        <div className={cardClass}>
          <h3 className={`${titleClass} mb-1 flex items-center gap-2`}>
            <Settings size={18} className="text-primary" />
            <span>Distributions proposées</span>
          </h3>
          <p className="text-xs text-app-text-muted mb-3">Liste propre à cet événement, offerte dans le formulaire d'inscription.</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {distros.map(d => (
              <span key={d} className="inline-flex items-center gap-1 text-xs bg-app-input border border-app-card-border text-app-text pl-2.5 pr-1 py-0.5 rounded-full">
                {d}
                <button
                  type="button"
                  onClick={() => saveDistros(distros.filter(x => x !== d))}
                  aria-label={`Retirer ${d}`}
                  className="p-1 rounded-full text-app-text-muted hover:text-danger cursor-pointer"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={handleAddDistro} className="flex gap-2">
            <input type="text" aria-label="Nouvelle distribution" value={newDistro} onChange={e => setNewDistro(e.target.value)} placeholder="Ex. Linux Lite" className={`${fieldInputClass} min-h-9`} />
            <button type="submit" className="min-h-9 px-3 rounded-xl bg-app-card border border-app-card-border text-app-text text-xs font-bold hover:border-primary/60 cursor-pointer">Ajouter</button>
          </form>
          <button type="button" onClick={() => saveDistros(DEFAULT_DISTROS)} className="mt-2 text-xs text-app-text-muted underline cursor-pointer hover:text-app-text">
            Rétablir la liste par défaut
          </button>
        </div>
      </div>

      <div className={`lg:col-span-8 ${cardClass}`}>
        <h3 className={`${titleClass} mb-1 pb-2 border-b border-app-card-border`}>Bénévoles ({technicians.length})</h3>
        <p className="text-xs text-app-text-muted mb-4">Tous les bénévoles installent ; chacun peut avoir jusqu'à {MAX_COMPUTERS_PER_VOLUNTEER} ordinateurs à la fois.</p>

        {technicians.length === 0 ? (
          <p className="text-xs text-app-text-muted text-center py-8 font-sans">Aucun bénévole enregistré.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {technicians.map(tech => {
              const mine = tickets.filter(t => isInstallActive(t) && t.assignedTechId === tech.id);
              const doneByTech = tickets.filter(t => isInstallDone(t) && t.extraData?.installedBy === tech.name).length;
              const paused = tech.status === 'en_pause';
              return (
                <div key={tech.id} className="p-4 rounded-xl bg-app-input border border-app-card-border flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-app-text text-sm flex items-center gap-1.5">
                        <span>{tech.name}</span>
                        {tech.tableNumber && (
                          <span className="text-micro text-primary bg-primary/10 border border-primary/30 px-1.5 py-0.5 rounded font-mono font-bold">Table {tech.tableNumber}</span>
                        )}
                      </h4>
                      <button
                        onClick={() => handleTogglePause(tech)}
                        className={`${chipBase} cursor-pointer ${
                          paused ? 'bg-danger/20 text-danger border-danger/30'
                          : mine.length >= MAX_COMPUTERS_PER_VOLUNTEER ? 'bg-warning/20 text-warning border-warning/40'
                          : 'bg-primary/20 text-primary border-primary/30'
                        }`}
                        title={paused ? 'Reprendre' : 'Mettre en pause'}
                      >
                        {paused ? 'En pause' : `${mine.length}/${MAX_COMPUTERS_PER_VOLUNTEER} ordinateurs`}
                      </button>
                    </div>
                    {mine.length > 0 ? (
                      <ul className="text-xs text-app-text-muted space-y-0.5">
                        {mine.map(t => <li key={t.id}>• {t.visitorName} : {t.objectName} → {t.extraData?.distro}</li>)}
                      </ul>
                    ) : (
                      <p className="text-xs text-app-text-muted">{paused ? 'En pause' : 'Disponible'}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-app-card-border">
                    <span className="text-xs text-app-text-muted font-sans">{doneByTech} installation{doneByTech > 1 ? 's' : ''} réussie{doneByTech > 1 ? 's' : ''}</span>
                    <button onClick={() => handleDeleteTech(tech.id)} aria-label={`Retirer ${tech.name}`} className="p-2 rounded-lg text-app-text-muted hover:text-danger hover:bg-danger/10 cursor-pointer">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
