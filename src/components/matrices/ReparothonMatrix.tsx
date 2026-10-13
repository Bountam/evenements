import React, { useState, useEffect } from 'react';
import { EventSettings, RepairTicket, Technician, TicketStatus, DeviceCategory, OperatingSystem, PartnerLogo } from '../../types';
import { db, notifySync, registerSyncListener } from '../../db';
import { networkManager } from '../../network';
import { DoughnutChart, BarChart } from '../shared/Charts';
import { 
  Plus, Users, Wrench, Clock, CheckCircle, AlertTriangle, Play, Pause, Trash2, Check, LayoutGrid, Award, Info, RefreshCw, BarChart2, Search
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { showToast } from '../shared/Toast';
import { clampNumber } from '../../utils/security';

interface ReparothonMatrixProps {
  event: EventSettings;
  activeTab: 'accueil' | 'techniciens' | 'public';
}

export default function ReparothonMatrix({ event, activeTab }: ReparothonMatrixProps) {
  // 1. States
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  // États de recherche et filtrage des fiches
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // États Formulaires
  const [newVisitorName, setNewVisitorName] = useState('');
  const [newVisitorEmail, setNewVisitorEmail] = useState('');
  const [newObjectName, setNewObjectName] = useState('');
  const [newCategory, setNewCategory] = useState<DeviceCategory>('laptop');
  const [newOS, setNewOS] = useState<OperatingSystem>('windows');
  const [newDiagnosis, setNewDiagnosis] = useState('');
  const [newWeight, setNewWeight] = useState<number>(1.5);
  
  const [newTechName, setNewTechName] = useState('');
  const [newTechSpecs, setNewTechSpecs] = useState<string[]>([]);
  const [newTechTable, setNewTechTable] = useState('');
  const [newTechSoftwareSpecs, setNewTechSoftwareSpecs] = useState<string[]>([]);
  const [activeLogoIndex, setActiveLogoIndex] = useState(0);
  
  // Célébration locale
  const [activeCelebration, setActiveCelebration] = useState<{
    visitorName: string;
    objectName: string;
    techName: string;
    weightKg: number;
  } | null>(null);

  // Charger les données de Dexie
  const loadData = async () => {
    try {
      const dbTickets = await db.tickets.where('eventId').equals(event.id).toArray();
      const dbTechs = await db.technicians.where('eventId').equals(event.id).toArray();
      
      setTickets(dbTickets.sort((a, b) => b.createdAt - a.createdAt));
      setTechnicians(dbTechs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    
    // Écouter les mises à jour (multi-fenêtres)
    const unsubscribe = registerSyncListener(() => {
      loadData();
    });

    return () => unsubscribe();
  }, [event.id]);

  const playCelebrationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      // Arpège festif : C4, E4, G4, C5
      const notes = [261.63, 329.63, 392.00, 523.25];
      const durations = [0.15, 0.15, 0.15, 0.45];
      const startTimes = [0, 0.15, 0.3, 0.45];

      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + startTimes[index]);

        gainNode.gain.setValueAtTime(0, now + startTimes[index]);
        gainNode.gain.linearRampToValueAtTime(0.25, now + startTimes[index] + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + startTimes[index] + durations[index]);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + startTimes[index]);
        osc.stop(now + startTimes[index] + durations[index]);
      });
    } catch (err) {
      console.warn("Erreur fanfare audio :", err);
    }
  };

  // Écouter le BroadcastChannel pour des célébrations en direct sur l'écran public
  useEffect(() => {
    const channel = new BroadcastChannel(`insertech_reparothon_sync_${event.id}`);
    
    channel.onmessage = (e) => {
      if (e.data && e.data.type === 'CELEBRATION') {
        const payload = e.data.payload;
        setActiveCelebration(payload);
        
        // Jouer le son de victoire
        playCelebrationSound();

        // Confettis vert lime et violet
        confetti({
          particleCount: 80,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#9ecd33', '#480A94', '#ffffff']
        });

        setTimeout(() => {
          setActiveCelebration(null);
        }, 8000); // Célébration visible pendant 8s
      }
    };

    return () => channel.close();
  }, [event.id]);

  useEffect(() => {
    // Écouter les célébrations venant du réseau P2P
    networkManager.onCelebration = (payload) => {
      setActiveCelebration(payload);
      playCelebrationSound();
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#9ecd33', '#480A94', '#ffffff']
      });
      setTimeout(() => {
        setActiveCelebration(null);
      }, 8000);
    };
    return () => {
      networkManager.onCelebration = null;
    };
  }, []);

  const partnerLogos = event.extraData?.partnerLogos || [];

  useEffect(() => {
    if (activeTab === 'public' && partnerLogos.length > 1) {
      const interval = setInterval(() => {
        setActiveLogoIndex(prev => (prev + 1) % partnerLogos.length);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [activeTab, partnerLogos.length]);

  // ACTIONS TICKETS
  const handleAddTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVisitorName.trim() || !newObjectName.trim()) return;

    const newTicket: RepairTicket = {
      id: 'tkt-' + Math.random().toString(36).substring(2, 11),
      eventId: event.id,
      visitorName: newVisitorName.trim(),
      visitorEmail: newVisitorEmail.trim() || undefined,
      objectName: newObjectName.trim(),
      objectCategory: newCategory,
      operatingSystem: newOS,
      initialDiagnosis: newDiagnosis.trim(),
      status: 'en_attente',
      assignedTechId: null,
      assignedTechName: null,
      resultRemarks: '',
      weightKg: Number(newWeight) || 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      await networkManager.writeToDatabase('tickets', 'put', newTicket);
      setNewVisitorName('');
      setNewVisitorEmail('');
      setNewObjectName('');
      setNewDiagnosis('');
      setNewWeight(1.5);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignTicket = async (ticketId: string, techId: string) => {
    if (!techId) return;
    try {
      const ticket = await db.tickets.get(ticketId);
      const tech = await db.technicians.get(techId);

      if (ticket && tech) {
        // Mettre à jour le ticket
        ticket.status = 'assigne';
        ticket.assignedTechId = tech.id;
        ticket.assignedTechName = tech.name;
        ticket.updatedAt = Date.now();
        await networkManager.writeToDatabase('tickets', 'put', ticket);

        // Mettre à jour le tech
        tech.status = 'occupe';
        tech.currentTicketId = ticket.id;
        await networkManager.writeToDatabase('technicians', 'put', tech);

        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (ticketId: string, status: TicketStatus, remarks: string = '') => {
    try {
      const ticket = await db.tickets.get(ticketId);
      if (!ticket) return;

      const oldStatus = ticket.status;
      ticket.status = status;
      ticket.resultRemarks = remarks;
      ticket.updatedAt = Date.now();

      // Si le ticket est résolu ou abandonné, on libère le technicien
      const isResolved = ['repare', 'semi_repare', 'non_reparable', 'abandonne'].includes(status);
      if (isResolved && ticket.assignedTechId) {
        const tech = await db.technicians.get(ticket.assignedTechId);
        if (tech) {
          tech.status = 'libre';
          tech.currentTicketId = null;
          await networkManager.writeToDatabase('technicians', 'put', tech);
        }
        
        // Si c'est réparé ou semi-réparé, on déclenche une célébration !
        if (['repare', 'semi_repare'].includes(status)) {
          const celebrationPayload = {
            visitorName: ticket.visitorName,
            objectName: ticket.objectName,
            techName: ticket.assignedTechName || 'un bénévole',
            weightKg: ticket.weightKg
          };
          
          // Diffuser la célébration aux autres membres du réseau P2P
          networkManager.sendChronoAction({
            type: 'PEER_CELEBRATION',
            payload: celebrationPayload
          });

          // Diffuser la célébration aux autres onglets locaux
          const channel = new BroadcastChannel(`insertech_reparothon_sync_${event.id}`);
          channel.postMessage({ type: 'CELEBRATION', payload: celebrationPayload });
          channel.close();
          
          // Déclencher aussi en local
          playCelebrationSound();
          setActiveCelebration(celebrationPayload);
          setTimeout(() => setActiveCelebration(null), 8000);
        }

        ticket.assignedTechId = null;
        ticket.assignedTechName = null;
      }

      await networkManager.writeToDatabase('tickets', 'put', ticket);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTicket = async (id: string) => {
    if (!confirm('Voulez-vous supprimer ce ticket ?')) return;
    try {
      const ticketToDelete = await db.tickets.get(id);
      if (ticketToDelete && ticketToDelete.assignedTechId) {
        // Libérer le tech
        const tech = await db.technicians.get(ticketToDelete.assignedTechId);
        if (tech) {
          tech.status = 'libre';
          tech.currentTicketId = null;
          await networkManager.writeToDatabase('technicians', 'put', tech);
        }
      }
      await networkManager.writeToDatabase('tickets', 'delete', id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // ACTIONS TECHNICIENS
  const handleAddTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTechName.trim()) return;

    const newTech: Technician = {
      id: 'tech-' + Math.random().toString(36).substring(2, 11),
      eventId: event.id,
      name: newTechName.trim(),
      specialties: newTechSpecs,
      softwareSpecialties: newTechSoftwareSpecs,
      tableNumber: newTechTable.trim() ? parseInt(newTechTable) : null,
      status: 'libre',
      currentTicketId: null,
      createdAt: Date.now()
    };

    try {
      await networkManager.writeToDatabase('technicians', 'put', newTech);
      setNewTechName('');
      setNewTechSpecs([]);
      setNewTechTable('');
      setNewTechSoftwareSpecs([]);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTech = async (id: string) => {
    if (!confirm('Voulez-vous supprimer ce technicien ?')) return;
    try {
      const tech = await db.technicians.get(id);
      if (tech && tech.currentTicketId) {
        // Remettre le ticket en attente
        const ticket = await db.tickets.get(tech.currentTicketId);
        if (ticket) {
          ticket.status = 'en_attente';
          ticket.assignedTechId = null;
          ticket.assignedTechName = null;
          await networkManager.writeToDatabase('tickets', 'put', ticket);
        }
      }
      await networkManager.writeToDatabase('technicians', 'delete', id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleTechStatus = async (id: string, currentStatus: string) => {
    try {
      const tech = await db.technicians.get(id);
      if (tech) {
        tech.status = currentStatus === 'libre' ? 'en_pause' : 'libre';
        await networkManager.writeToDatabase('technicians', 'put', tech);
        await loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const parseCSVLine = (line: string, delimiter: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        alert("Fichier CSV invalide (doit contenir des en-têtes et au moins une ligne de données).");
        return;
      }

      // Détecter le séparateur (, ou ;)
      const firstLine = lines[0];
      const delimiter = firstLine.includes(';') ? ';' : ',';

      // Parser les en-têtes
      const headers = parseCSVLine(firstLine, delimiter).map(h => h.toLowerCase().trim());
      
      // Index des colonnes
      let idxVisitor = headers.findIndex(h => h.includes('visiteur') || h.includes('nom') || h.includes('client') || h.includes('visitor') || h.includes('name'));
      let idxVisitorEmail = headers.findIndex(h => h.includes('courriel') || h.includes('email') || h.includes('mail'));
      let idxObject = headers.findIndex(h => h.includes('appareil') || h.includes('objet') || h.includes('modèle') || h.includes('device') || h.includes('object') || h.includes('modele'));
      let idxCategory = headers.findIndex(h => h.includes('catégorie') || h.includes('type') || h.includes('category') || h.includes('categorie'));
      let idxOS = headers.findIndex(h => h.includes('os') || h.includes('système') || h.includes('system') || h.includes('operating'));
      let idxDiagnosis = headers.findIndex(h => h.includes('diagnostic') || h.includes('panne') || h.includes('symptome') || h.includes('symptôme') || h.includes('description') || h.includes('diagnosis'));
      let idxTech = headers.findIndex(h => h.includes('technicien') || h.includes('bénévole') || h.includes('tech') || h.includes('assigné') || h.includes('assigned') || h.includes('volunteer') || h.includes('benevole'));
      let idxTableNumber = headers.findIndex(h => h.includes('table'));
      let idxWeight = headers.findIndex(h => h.includes('poids') || h.includes('masse') || h.includes('kg') || h.includes('weight'));
      let idxStatus = headers.findIndex(h => h.includes('statut') || h.includes('status') || h.includes('résultat') || h.includes('result') || h.includes('resultat'));
      let idxRemarks = headers.findIndex(h => h.includes('remarque') || h.includes('note') || h.includes('remarks') || h.includes('resolution'));

      if (idxVisitor === -1 || idxObject === -1) {
        alert("Les en-têtes de colonnes obligatoires (Nom du visiteur, Nom de l'appareil) sont introuvables dans le fichier CSV.");
        return;
      }

      // Charger les techniciens existants pour vérification
      const existingTechs = await db.technicians.where('eventId').equals(event.id).toArray();
      const techNameMap = new Map(existingTechs.map(t => [t.name.toLowerCase().trim(), t]));

      const importedTickets: RepairTicket[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i], delimiter);
        if (cols.length < headers.length) continue; // Ligne tronquée

        const visitorName = cols[idxVisitor];
        const objectName = cols[idxObject];
        if (!visitorName || !objectName) continue;

        // Normalisation de la catégorie
        let category: DeviceCategory = 'laptop';
        if (idxCategory !== -1 && cols[idxCategory]) {
          const rawCat = cols[idxCategory].toLowerCase();
          if (rawCat.includes('tour') || rawCat.includes('fixe') || rawCat.includes('desktop')) category = 'pc_tour';
          else if (rawCat.includes('cellulaire') || rawCat.includes('téléphone') || rawCat.includes('phone') || rawCat.includes('mobile')) category = 'cellulaire';
          else if (rawCat.includes('tablette') || rawCat.includes('ipad') || rawCat.includes('tablet')) category = 'tablette';
          else if (rawCat.includes('portable') || rawCat.includes('laptop') || rawCat.includes('macbook')) category = 'laptop';
          else category = 'autre';
        }

        // Normalisation de l'OS
        let os: OperatingSystem = 'windows';
        if (idxOS !== -1 && cols[idxOS]) {
          const rawOS = cols[idxOS].toLowerCase();
          if (rawOS.includes('mac') || rawOS.includes('ios') || rawOS.includes('apple')) os = 'mac';
          else if (rawOS.includes('linux') || rawOS.includes('ubuntu') || rawOS.includes('debian')) os = 'linux';
          else if (rawOS.includes('windows')) os = 'windows';
          else if (rawOS.includes('aucun') || rawOS.includes('android') || rawOS.includes('chromebook') || rawOS.includes('chrome')) os = 'aucun';
          else os = 'autre';
        }

        // Normalisation du statut
        let status: TicketStatus = 'en_attente';
        if (idxStatus !== -1 && cols[idxStatus]) {
          const rawStat = cols[idxStatus].toLowerCase();
          if (rawStat.includes('repare') || rawStat.includes('réparé') || rawStat.includes('succes') || rawStat.includes('succès')) status = 'repare';
          else if (rawStat.includes('partiel') || rawStat.includes('semi')) status = 'semi_repare';
          else if (rawStat.includes('non') || rawStat.includes('echec') || rawStat.includes('échec') || rawStat.includes('impossible')) status = 'non_reparable';
          else if (rawStat.includes('abandon') || rawStat.includes('parti')) status = 'abandonne';
          else if (rawStat.includes('cours') || rawStat.includes('progress')) status = 'en_cours';
          else if (rawStat.includes('assign')) status = 'assigne';
        }

        // Gérer le technicien
        let assignedTechId: string | null = null;
        let assignedTechName: string | null = null;

        if (idxTech !== -1 && cols[idxTech]) {
          const techName = cols[idxTech].trim();
          if (techName) {
            const normalizedName = techName.toLowerCase();
            if (techNameMap.has(normalizedName)) {
              const tech = techNameMap.get(normalizedName)!;
              assignedTechId = tech.id;
              assignedTechName = tech.name;
            } else {
              // Créer le technicien à la volée !
              const newTechId = 'tech-' + Math.random().toString(36).substring(2, 11);
              const newTech: Technician = {
                id: newTechId,
                eventId: event.id,
                name: techName,
                specialties: [category],
                softwareSpecialties: os !== 'aucun' && os !== 'autre' ? [os] : [],
                status: status === 'assigne' || status === 'en_cours' ? 'occupe' : 'libre',
                currentTicketId: status === 'assigne' || status === 'en_cours' ? 'temp' : null,
                tableNumber: (() => {
                  if (idxTableNumber === -1) return null;
                  const rawTable = cols[idxTableNumber];
                  if (!rawTable) return null;
                  const match = rawTable.match(/\d+/);
                  return match ? parseInt(match[0]) : null;
                })(),
                createdAt: Date.now()
              };
              await networkManager.writeToDatabase('technicians', 'put', newTech);
              existingTechs.push(newTech);
              techNameMap.set(normalizedName, newTech);
              assignedTechId = newTechId;
              assignedTechName = techName;
            }
          }
        }

        const ticketId = 'tkt-' + Math.random().toString(36).substring(2, 11);
        if (assignedTechId && (status === 'assigne' || status === 'en_cours')) {
          // Lier l'ID temporaire du ticket au technicien
          const tech = techNameMap.get(assignedTechName!.toLowerCase())!;
          tech.currentTicketId = ticketId;
          await networkManager.writeToDatabase('technicians', 'put', tech);
        }

        const ticket: RepairTicket = {
          id: ticketId,
          eventId: event.id,
          visitorName,
          visitorEmail: idxVisitorEmail !== -1 ? cols[idxVisitorEmail] || undefined : idxVisitor !== -1 && cols[idxVisitor + 1]?.includes('@') ? cols[idxVisitor + 1] : undefined,
          objectName,
          objectCategory: category,
          operatingSystem: os,
          initialDiagnosis: idxDiagnosis !== -1 ? cols[idxDiagnosis] || '' : '',
          status,
          assignedTechId,
          assignedTechName,
          resultRemarks: idxRemarks !== -1 ? cols[idxRemarks] || '' : '',
          weightKg: idxWeight !== -1 ? clampNumber(cols[idxWeight], 0.05, 50, 1.5) : 1.5,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        importedTickets.push(ticket);
      }

      // Enregistrer les tickets dans IndexedDB et propager sur le réseau par lot (O(1))
      if (importedTickets.length > 0) {
        await networkManager.writeBatchToDatabase('tickets', importedTickets);
      }

      await loadData();
      showToast(`${importedTickets.length} tickets importés avec succès et synchronisés !`, 'success');
    };

    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };



  // CALCULS STATISTIQUES
  const totalRegistered = tickets.length;
  const repairedCount = tickets.filter(t => t.status === 'repare').length;
  const semiRepairedCount = tickets.filter(t => t.status === 'semi_repare').length;
  const successCount = repairedCount + semiRepairedCount;
  const unreparableCount = tickets.filter(t => t.status === 'non_reparable').length;
  const inProgressCount = tickets.filter(t => t.status === 'en_cours' || t.status === 'assigne').length;
  const waitingCount = tickets.filter(t => t.status === 'en_attente').length;
  
  const totalWeightSaved = tickets
    .filter(t => ['repare', 'semi_repare'].includes(t.status))
    .reduce((sum, t) => sum + (t.weightKg || 0), 0);

  // Rendu de l'écran public de projection
  if (activeTab === 'public') {
    // Préparer les données du Doughnut Chart
    const doughnutData = {
      labels: ['Réparés', 'Partiels', 'Non Réparables', 'En cours', 'En attente'],
      datasets: [
        {
          data: [repairedCount, semiRepairedCount, unreparableCount, inProgressCount, waitingCount],
          backgroundColor: ['#9ecd33', '#a3e635', '#ef4444', '#f59e0b', '#64748b'],
          borderColor: 'rgba(24, 10, 43, 0.8)',
          borderWidth: 2
        }
      ]
    };

    return (
      <div className="space-y-8 relative">
        {/* Pop-up de Célébration géant si active */}
        {activeCelebration && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#180A2b]/90 backdrop-blur-md animate-fade-in">
            <div className="glass-panel p-10 rounded-3xl max-w-2xl text-center space-y-6 border-4 border-primary animate-bounce">
              <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center text-primary mx-auto">
                <Award size={64} />
              </div>
              <span className="text-xs font-black uppercase text-primary tracking-widest font-sans block">
                Victoire Écologique !
              </span>
              <h2 className="text-4xl sm:text-5xl font-display font-bold text-white uppercase tracking-wider">
                Appareil Réparé !
              </h2>
              <p className="text-lg text-slate-300 font-sans leading-relaxed">
                Le <span className="text-primary font-bold">{activeCelebration.objectName}</span> de <span className="font-semibold text-white">{activeCelebration.visitorName}</span> a été sauvé par <span className="font-semibold text-white">{activeCelebration.techName}</span> !
              </p>
              <div className="inline-block bg-primary/10 border border-primary/30 px-6 py-2.5 rounded-2xl text-primary font-mono text-xl font-bold">
                +{activeCelebration.weightKg} kg détournés de la pollution numérique
              </div>
            </div>
          </div>
        )}

        {/* Grille de stats adaptative */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          <div className="bg-[#24123d]/60 border border-purple-900/40 p-3.5 sm:p-5 rounded-2xl text-center shadow-lg">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 font-sans block mb-1">
              Appareils apportés
            </span>
            <div className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-white">{totalRegistered}</div>
          </div>

          <div className="bg-[#24123d]/60 border border-purple-900/40 p-3.5 sm:p-5 rounded-2xl text-center shadow-lg">
            <span className="text-[10px] uppercase font-black tracking-widest text-primary font-sans block mb-1">
              Taux de succès
            </span>
            <div className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-primary">
              {totalRegistered > 0 ? Math.round((successCount / totalRegistered) * 100) : 0}%
            </div>
          </div>

          <div className="bg-[#24123d]/60 border border-purple-900/40 p-3.5 sm:p-5 rounded-2xl text-center shadow-lg">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 font-sans block mb-1">
              En cours de réparation
            </span>
            <div className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-yellow-500">{inProgressCount}</div>
          </div>

          <div className="bg-[#24123d]/60 border border-purple-900/40 p-3.5 sm:p-5 rounded-2xl text-center shadow-lg">
            <span className="text-[10px] uppercase font-black tracking-widest text-primary font-sans block mb-1">
              Poids Sauvé
            </span>
            <div className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-primary">{totalWeightSaved.toFixed(1)} kg</div>
          </div>
        </div>

        {/* Graphique et file d'attente */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
          {/* File d'attente / Tableau des réparations */}
          <div className="lg:col-span-8 bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
            <h3 className="text-lg font-bold font-display text-white uppercase tracking-wider mb-4 pb-2 border-b border-purple-950/60">
              Suivi des Réparations en cours
            </h3>
            
            {tickets.filter(t => ['assigne', 'en_cours', 'en_attente'].includes(t.status)).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12 font-sans">Aucun appareil en cours de réparation actuellement.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {tickets
                  .filter(t => ['assigne', 'en_cours', 'en_attente'].includes(t.status))
                  .slice(0, 8)
                  .map(t => (
                    <div key={t.id} className="p-4 rounded-xl bg-[#180A2b]/60 border border-purple-950 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm">{t.visitorName}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{t.objectName} ({t.objectCategory})</p>
                      </div>
                      
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${
                        t.status === 'en_attente' 
                          ? 'bg-slate-500/20 text-slate-400 border border-slate-500/30 animate-pulse' 
                          : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      }`}>
                        {t.status === 'en_attente' ? 'Attente' : `Banc : ${t.assignedTechName}`}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Graphique de répartition */}
          <div className="lg:col-span-4 bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
            <DoughnutChart data={doughnutData} title="Statut des diagnostics" />
          </div>
        </div>

        {/* Carrousel des Partenaires au bas */}
        {partnerLogos.length > 0 && (
          <div className="bg-[#24123d]/40 border border-purple-900/30 p-4 rounded-2xl flex items-center justify-between gap-4 mt-8 animate-fade-in">
            <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 font-sans shrink-0">Nos précieux partenaires</span>
            
            <div className="flex-1 overflow-hidden relative h-12 max-w-md mx-auto flex items-center justify-center">
              {partnerLogos.map((logo: PartnerLogo, idx: number) => (
                <div 
                  key={logo.id} 
                  className={`absolute inset-0 flex items-center justify-center p-1 transition-all duration-700 transform ${
                    idx === activeLogoIndex 
                      ? 'opacity-100 translate-x-0 scale-100' 
                      : 'opacity-0 translate-x-12 scale-95 pointer-events-none'
                  }`}
                >
                  <img src={logo.data} alt={logo.name} className="max-h-10 max-w-full object-contain filter drop-shadow" />
                </div>
              ))}
            </div>
            
            <span className="text-[9px] font-sans text-slate-500 shrink-0 font-bold">
              {activeLogoIndex + 1} / {partnerLogos.length}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Filtrage réactif des tickets (recherche textuelle + puce de statut)
  const filteredTickets = tickets.filter(t => {
    const matchesSearch = !searchQuery.trim() || 
      t.visitorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.objectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.initialDiagnosis && t.initialDiagnosis.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.assignedTechName && t.assignedTechName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Rendu de l'écran Organisateur (Admin / Accueil)
  if (activeTab === 'accueil') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Formulaire d'inscription ticket */}
        <div className="lg:col-span-4 bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
          <h3 className="text-base font-bold font-display text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Plus size={18} className="text-primary" />
            <span>Nouveau Diagnostic</span>
          </h3>

          <form onSubmit={handleAddTicket} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-300 block">Nom du Visiteur</label>
              <input
                type="text"
                required
                value={newVisitorName}
                onChange={(e) => setNewVisitorName(e.target.value)}
                placeholder="Ex. Martine Bouchard"
                className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-300 block">Courriel</label>
              <input
                type="email"
                value={newVisitorEmail}
                onChange={(e) => setNewVisitorEmail(e.target.value)}
                placeholder="martine@email.com"
                className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-300 block">Catégorie</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as DeviceCategory)}
                  className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
                >
                  <option value="laptop">Portable</option>
                  <option value="pc_tour">Ordinateur Tour</option>
                  <option value="cellulaire">Cellulaire</option>
                  <option value="tablette">Tablette</option>
                  <option value="autre">Autre</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-300 block">Système d'exploitation</label>
                <select
                  value={newOS}
                  onChange={(e) => setNewOS(e.target.value as OperatingSystem)}
                  className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
                >
                  <option value="windows">Windows</option>
                  <option value="mac">macOS</option>
                  <option value="linux">Linux</option>
                  <option value="aucun">Aucun / OS mobile</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-bold uppercase text-slate-300 block">Description de l'appareil</label>
                <input
                  type="text"
                  required
                  value={newObjectName}
                  onChange={(e) => setNewObjectName(e.target.value)}
                  placeholder="Ex. Asus ZenBook 14 ou Samsung S21"
                  className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-300 block">Poids estimé (kg)</label>
              <input
                type="number"
                step="0.1"
                required
                value={newWeight}
                onChange={(e) => setNewWeight(Number(e.target.value))}
                className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-300 block">Diagnostic initial / Problème</label>
              <textarea
                value={newDiagnosis}
                onChange={(e) => setNewDiagnosis(e.target.value)}
                placeholder="Ex. L'ordinateur surchauffe et s'éteint après 5 minutes de jeu."
                rows={3}
                className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 transition cursor-pointer"
            >
              <Plus size={14} />
              <span>Créer le ticket</span>
            </button>
          </form>

          <div className="border-t border-purple-950/60 pt-4 mt-4 space-y-3">
            <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 font-sans block text-center">Ou importation en lot</span>
            <label 
              htmlFor="csvImport"
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[#180A2b]/40 border border-purple-900/60 text-slate-300 font-bold font-display uppercase tracking-wider text-[11px] hover:scale-[1.02] active:scale-95 hover:bg-[#180A2b]/60 transition cursor-pointer"
            >
              <Plus size={12} className="text-primary" />
              <span>Importer un fichier CSV</span>
            </label>
            <input
              id="csvImport"
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
          </div>
        </div>

        {/* Liste des tickets (Admin) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-purple-950/60">
              <h3 className="text-base font-bold font-display text-white uppercase tracking-wider">
                Liste des Diagnostics ({filteredTickets.length}{filteredTickets.length !== tickets.length ? ` / ${tickets.length}` : ''})
              </h3>

              {/* Barre de recherche instantanée */}
              <div className="relative max-w-xs w-full">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher (nom, appareil, panne)..."
                  className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl pl-8 pr-3 py-1.5 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>

            {/* Puces de filtrage par statut */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {[
                { id: 'all', label: 'Tous' },
                { id: 'en_attente', label: 'En attente' },
                { id: 'assigne', label: 'Assigné' },
                { id: 'en_cours', label: 'En cours' },
                { id: 'repare', label: 'Réparé' },
                { id: 'semi_repare', label: 'Semi-réparé' },
                { id: 'non_reparable', label: 'Non réparable' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase transition cursor-pointer ${
                    statusFilter === f.id
                      ? 'bg-primary text-secondary font-black shadow-sm'
                      : 'bg-[#180A2b]/80 text-slate-400 border border-purple-900/40 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredTickets.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8 font-sans">
                {tickets.length === 0 ? "Aucun ticket créé pour cet événement." : "Aucun ticket ne correspond à vos critères de recherche."}
              </p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {filteredTickets.map((t) => {
                  const freeTechs = technicians.filter(tech => tech.status === 'libre');
                  
                  return (
                    <div key={t.id} className="p-4 rounded-xl bg-[#180A2b]/60 border border-purple-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm">{t.visitorName}</h4>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            t.status === 'en_attente' ? 'bg-slate-500/20 text-slate-400 border border-slate-500/30' :
                            t.status === 'assigne' || t.status === 'en_cours' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                            t.status === 'repare' ? 'bg-primary/20 text-primary border border-primary/30' :
                            'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}>
                            {t.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium font-sans">
                          {t.objectName}
                        </p>
                        <div className="text-[11px] text-slate-400 font-sans bg-[#180A2b]/80 p-3 rounded-xl mt-2 space-y-2 border border-purple-950/40">
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-[9px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded font-mono font-bold uppercase">
                              Catégorie: {t.objectCategory.replace('_', ' ')}
                            </span>
                            <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono font-bold uppercase">
                              OS: {t.operatingSystem}
                            </span>
                          </div>
                          {t.initialDiagnosis && (
                            <p className="italic text-slate-300 border-t border-purple-950/40 pt-1.5 mt-1.5">
                              « {t.initialDiagnosis} »
                            </p>
                          )}
                        </div>
                        {t.resultRemarks && (
                          <p className="text-[11px] text-primary font-sans bg-primary/5 border border-primary/10 p-2 rounded-lg mt-1">
                            <strong>Note de résolution:</strong> {t.resultRemarks}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {/* Assigner */}
                        {t.status === 'en_attente' && freeTechs.length > 0 && (
                          <select
                            onChange={(e) => handleAssignTicket(t.id, e.target.value)}
                            defaultValue=""
                            className="bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-2 py-1.5 text-white text-[11px] focus:outline-none focus:border-primary transition"
                          >
                            <option value="" disabled>Assigner à...</option>
                            {freeTechs.map(tech => (
                              <option key={tech.id} value={tech.id}>{tech.name}</option>
                            ))}
                          </select>
                        )}

                        {/* Évolution de statut */}
                        {(t.status === 'assigne' || t.status === 'en_cours') && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={() => {
                                const remarks = prompt('Entrez des remarques de réparation :') || '';
                                handleUpdateStatus(t.id, 'repare', remarks);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-primary text-secondary text-[10px] font-bold font-display uppercase hover:scale-105 transition cursor-pointer"
                            >
                              Réparé
                            </button>
                            <button
                              onClick={() => {
                                const remarks = prompt('Entrez des remarques de réparation partielle :') || '';
                                handleUpdateStatus(t.id, 'semi_repare', remarks);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-lime-500/20 text-lime-400 border border-lime-500/30 text-[10px] font-bold font-display uppercase hover:scale-105 transition cursor-pointer"
                            >
                              Partiel
                            </button>
                            <button
                              onClick={() => {
                                const remarks = prompt('Pourquoi cet appareil est-il non-réparable ?') || '';
                                handleUpdateStatus(t.id, 'non_reparable', remarks);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold font-display uppercase hover:scale-105 transition cursor-pointer"
                            >
                              Échec
                            </button>
                          </div>
                        )}

                        <button
                          onClick={() => handleDeleteTicket(t.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Rendu de l'onglet Gestion Techniciens
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Ajouter un technicien */}
      <div className="lg:col-span-4 bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
        <h3 className="text-base font-bold font-display text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <Users size={18} className="text-primary" />
          <span>Ajouter un Technicien</span>
        </h3>

        <form onSubmit={handleAddTech} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-300 block">Nom complet</label>
            <input
              type="text"
              required
              value={newTechName}
              onChange={(e) => setNewTechName(e.target.value)}
              placeholder="Ex. Gabriel Roy"
              className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-300 block">Numéro de table physique</label>
            <select
              value={newTechTable}
              onChange={(e) => setNewTechTable(e.target.value)}
              className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition cursor-pointer"
            >
              <option value="">Aucune table (Mobile)</option>
              <option value="1">Table 1</option>
              <option value="2">Table 2</option>
              <option value="3">Table 3</option>
              <option value="4">Table 4</option>
              <option value="5">Table 5</option>
              <option value="6">Table 6</option>
              <option value="7">Table 7</option>
              <option value="8">Table 8</option>
              <option value="9">Table 9</option>
              <option value="10">Table 10</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-300 block">Spécialités Matérielles (sélectionnez)</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {['laptop', 'pc_tour', 'cellulaire', 'tablette', 'autre'].map((spec) => {
                const isChecked = newTechSpecs.includes(spec);
                return (
                  <button
                    key={spec}
                    type="button"
                    onClick={() => {
                      if (isChecked) {
                        setNewTechSpecs(newTechSpecs.filter(s => s !== spec));
                      } else {
                        setNewTechSpecs([...newTechSpecs, spec]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border transition ${
                      isChecked 
                        ? 'bg-primary text-secondary border-primary' 
                        : 'bg-[#180A2b]/40 text-slate-400 border-purple-950 hover:border-purple-900'
                    }`}
                  >
                    {spec.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-300 block">Spécialités Logicielles / OS (sélectionnez)</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {['windows', 'mac', 'linux', 'android_ios'].map((spec) => {
                const isChecked = newTechSoftwareSpecs.includes(spec);
                return (
                  <button
                    key={spec}
                    type="button"
                    onClick={() => {
                      if (isChecked) {
                        setNewTechSoftwareSpecs(newTechSoftwareSpecs.filter(s => s !== spec));
                      } else {
                        setNewTechSoftwareSpecs([...newTechSoftwareSpecs, spec]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border transition ${
                      isChecked 
                        ? 'bg-primary text-secondary border-primary' 
                        : 'bg-[#180A2b]/40 text-slate-400 border-purple-950 hover:border-purple-900'
                    }`}
                  >
                    {spec.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 transition cursor-pointer"
          >
            <Plus size={14} />
            <span>Ajouter</span>
          </button>
        </form>
      </div>

      {/* Liste des techniciens */}
      <div className="lg:col-span-8 bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
        <h3 className="text-base font-bold font-display text-white uppercase tracking-wider mb-4 pb-2 border-b border-purple-950/60">
          Techniciens Bénévoles ({technicians.length})
        </h3>

        {technicians.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8 font-sans">Aucun technicien enregistré.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {technicians.map((t) => (
              <div key={t.id} className="p-4 rounded-xl bg-[#180A2b]/60 border border-purple-950 flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                      <span>{t.name}</span>
                      {t.tableNumber && (
                        <span className="text-[9px] text-primary bg-primary/10 border border-primary/25 px-1.5 py-0.5 rounded font-mono font-bold">
                          Table {t.tableNumber}
                        </span>
                      )}
                    </h4>
                    <button
                      onClick={() => toggleTechStatus(t.id, t.status)}
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase transition cursor-pointer ${
                        t.status === 'libre' ? 'bg-primary/20 text-primary border border-primary/30' :
                        t.status === 'occupe' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                        'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {t.status}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {t.specialties.map(spec => (
                      <span key={spec} className="text-[8px] bg-purple-950/80 text-purple-300 px-1.5 py-0.5 rounded uppercase">
                        {spec}
                      </span>
                    ))}
                    {t.softwareSpecialties?.map(spec => (
                      <span key={spec} className="text-[8px] bg-primary/5 text-primary border border-primary/20 px-1.5 py-0.5 rounded uppercase">
                        {spec.replace('_', '/')}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-purple-950/60">
                  <span className="text-[10px] text-slate-400 font-sans">
                    {t.status === 'occupe' ? 'Sur un appareil' : 'Disponible'}
                  </span>
                  
                  <button
                    onClick={() => handleDeleteTech(t.id)}
                    className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
