import React, { useState, useEffect } from 'react';
import { EventSettings, GenericAttendee, EventType } from '../../types';
import { db, notifySync, registerSyncListener } from '../../db';
import { networkManager } from '../../network';
import { DoughnutChart, BarChart } from '../shared/LazyCharts';
import { 
  UserPlus, Check, Trash2, Star, MessageSquare, Users, Award, Play, Pause, RotateCcw, HelpCircle, FileText, CheckSquare, Square
} from 'lucide-react';
import { formatTime } from '../shared/Stopwatch';
import { confirmDialog } from '../shared/ConfirmDialog';

interface GenericMatrixProps {
  event: EventSettings;
  activeTab: 'enregistrements' | 'bilan' | 'public';
}

export default function GenericMatrix({ event, activeTab }: GenericMatrixProps) {
  const [attendees, setAttendees] = useState<GenericAttendee[]>([]);
  
  // États Formulaires
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newPresence, setNewPresence] = useState(true);
  
  // États de feedback (évaluation)
  const [selectedAttendeeId, setSelectedAttendeeId] = useState<string | null>(null);
  const [feedbackScore, setFeedbackScore] = useState<number>(5);
  const [feedbackText, setFeedbackText] = useState('');

  // Chronomètre de session locale (Fresque / Conférence)
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerIntervalRef = React.useRef<number | null>(null);

  // Charger les participants
  const loadAttendees = async () => {
    try {
      const data = await db.attendees.where('eventId').equals(event.id).toArray();
      setAttendees(data.sort((a, b) => b.registeredAt - a.registeredAt));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadAttendees();
    
    // Écouter les mises à jour
    const unsubscribe = registerSyncListener(() => {
      loadAttendees();
    });

    return () => unsubscribe();
  }, [event.id]);

  // Gérer le chrono de session locale
  useEffect(() => {
    if (timerRunning) {
      const start = Date.now() - elapsedTime;
      timerIntervalRef.current = window.setInterval(() => {
        setElapsedTime(Date.now() - start);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerRunning]);

  // Ajouter un inscrit/présent
  const handleAddAttendee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    // Déterminer des tags automatiques selon le type d'événement
    const tags: string[] = [];
    if (event.type === 'install_fest_linux') {
      tags.push('En attente install');
    }

    const newAttendee: GenericAttendee = {
      id: 'att-' + Math.random().toString(36).substring(2, 11),
      eventId: event.id,
      name: newName.trim(),
      email: newEmail.trim() || undefined,
      presenceConfirmed: newPresence,
      notes: newNote.trim() || undefined,
      registeredAt: Date.now(),
      tags: tags.length > 0 ? tags : undefined
    };

    try {
      await networkManager.writeToDatabase('attendees', 'put', newAttendee);
      setNewName('');
      setNewEmail('');
      setNewNote('');
      setNewPresence(true);
      await loadAttendees();
    } catch (err) {
      console.error(err);
    }
  };

  // Cocher/décocher la présence
  const togglePresence = async (id: string) => {
    try {
      const att = await db.attendees.get(id);
      if (att) {
        att.presenceConfirmed = !att.presenceConfirmed;
        await networkManager.writeToDatabase('attendees', 'put', att);
        await loadAttendees();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Enregistrer le feedback
  const handleSaveFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAttendeeId) return;

    try {
      const att = await db.attendees.get(selectedAttendeeId);
      if (att) {
        att.feedbackScore = feedbackScore;
        att.feedbackText = feedbackText.trim() || undefined;
        await networkManager.writeToDatabase('attendees', 'put', att);
        
        setSelectedAttendeeId(null);
        setFeedbackText('');
        setFeedbackScore(5);
        await loadAttendees();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAttendee = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Supprimer ce participant ?',
      message: 'Cette suppression est définitive.',
      confirmLabel: 'Supprimer',
      tone: 'destructive'
    });
    if (!confirmed) return;
    try {
      await networkManager.writeToDatabase('attendees', 'delete', id);
      await loadAttendees();
    } catch (e) {
      console.error(e);
    }
  };

  // ACTIONS POUR INSTALL FEST (Tags OS)
  const setLinuxInstallTag = async (id: string, step: 'Réussi' | 'Échec' | 'En cours') => {
    try {
      const att = await db.attendees.get(id);
      if (att) {
        att.tags = [step];
        await networkManager.writeToDatabase('attendees', 'put', att);
        await loadAttendees();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // CALCULS STATISTIQUES
  const totalRegistered = attendees.length;
  const presentCount = attendees.filter(a => a.presenceConfirmed).length;
  const presenceRate = totalRegistered > 0 ? Math.round((presentCount / totalRegistered) * 100) : 0;
  
  // Feedback
  const feedbackList = attendees.filter(a => a.feedbackScore !== undefined);
  const averageFeedback = feedbackList.length > 0 
    ? (feedbackList.reduce((sum, a) => sum + a.feedbackScore!, 0) / feedbackList.length).toFixed(1)
    : 'N/A';

  // Préparer les données pour les graphiques
  const presenceData = {
    labels: ['Présents', 'Absents / Non validés'],
    datasets: [
      {
        data: [presentCount, totalRegistered - presentCount],
        backgroundColor: ['#9ecd33', '#480A94'],
        borderColor: 'rgba(24, 10, 43, 0.8)',
        borderWidth: 2
      }
    ]
  };

  // Compter la distribution des scores de 1 à 5
  const scoreCounts = [0, 0, 0, 0, 0]; // Pour scores 1, 2, 3, 4, 5
  feedbackList.forEach(a => {
    const score = Math.round(a.feedbackScore!);
    if (score >= 1 && score <= 5) {
      scoreCounts[score - 1]++;
    }
  });

  const feedbackData = {
    labels: ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'],
    datasets: [
      {
        label: 'Nombre d\'avis',
        data: scoreCounts,
        backgroundColor: '#9ecd33',
        borderWidth: 0,
        borderRadius: 8
      }
    ]
  };

  // Rendu de l'écran public de projection
  if (activeTab === 'public') {
    return (
      <div className="space-y-8">
        <div className="bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl text-center space-y-4 max-w-3xl mx-auto shadow-lg">
          <h2 className="text-3xl font-display font-bold text-white uppercase tracking-wider">
            {event.name}
          </h2>
          <div className="flex justify-center gap-6 text-sm text-slate-300 font-sans">
            <div>Présents : <span className="text-primary font-bold">{presentCount}</span></div>
            <div className="w-px bg-purple-950"></div>
            <div>Taux de présence : <span className="text-primary font-bold">{presenceRate}%</span></div>
            {feedbackList.length > 0 && (
              <>
                <div className="w-px bg-purple-950"></div>
                <div>Appréciation : <span className="text-primary font-bold">{averageFeedback}/5 ★</span></div>
              </>
            )}
          </div>
        </div>

        {/* Chrono et animateurs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center max-w-4xl mx-auto">
          {/* Chronomètre de session */}
          <div className="bg-[#24123d]/40 border border-purple-950/60 p-6 rounded-3xl text-center shadow-lg">
            <h3 className="text-xs uppercase font-black text-slate-400 tracking-widest mb-3 font-sans">
              Durée de l'activité
            </h3>
            <div className="font-mono text-5xl sm:text-6xl font-bold text-white tracking-widest tabular-nums mb-4">
              {formatTime(elapsedTime).split('.')[0]} {/* Pas de millisecondes pour la conférence */}
            </div>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setTimerRunning(!timerRunning)}
                className="px-4 py-2 rounded-xl bg-purple-950 border border-purple-900 text-xs font-bold font-display uppercase tracking-wider text-purple-300 hover:text-white cursor-pointer"
              >
                {timerRunning ? 'Pause' : 'Démarrer'}
              </button>
              <button
                onClick={() => {
                  setTimerRunning(false);
                  setElapsedTime(0);
                }}
                className="px-4 py-2 rounded-xl bg-purple-950 border border-purple-900 text-xs font-bold font-display uppercase tracking-wider text-purple-300 hover:text-white cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Messages de remerciement et d'impact */}
          <div className="bg-[#24123d]/40 border border-purple-950/60 p-6 rounded-3xl shadow-lg flex flex-col justify-center min-h-[190px]">
            <h3 className="text-xs uppercase font-black text-primary tracking-widest mb-2 font-sans flex items-center gap-1.5">
              <Award size={14} />
              <span>Sensibilisation active</span>
            </h3>
            {event.type === 'fresque_numerique' && (
              <p className="text-sm text-slate-300 font-sans leading-relaxed">
                Fresque collaborative : comprendre l'impact environnemental du matériel, de l'utilisation et de la fabrication afin d'imaginer ensemble des actions concrètes de sobriété !
              </p>
            )}
            {event.type === 'install_fest_linux' && (
              <p className="text-sm text-slate-300 font-sans leading-relaxed">
                InstallFest Linux : donnez une seconde jeunesse à votre PC obsolète et reprenez le contrôle de vos données avec les logiciels libres !
              </p>
            )}
            {event.type === 'conference_pollution' && (
              <p className="text-sm text-slate-300 font-sans leading-relaxed">
                Conférence pollution numérique : la sobriété est le premier pas vers un usage éclairé. Moins de terminaux neufs, plus de réemploi et de réparation locale !
              </p>
            )}
            {!['fresque_numerique', 'install_fest_linux', 'conference_pollution'].includes(event.type) && (
              <p className="text-sm text-slate-300 font-sans leading-relaxed">
                Merci à tous les participants d'agir avec Insertech pour la prolongation de la durée de vie des appareils informatiques et la sobriété numérique !
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Rendu de l'onglet Inscriptions & Présences (Organisateur)
  if (activeTab === 'enregistrements') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Ajouter un inscrit */}
        <div className="lg:col-span-4 bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
          <h3 className="text-base font-bold font-display text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <UserPlus size={18} className="text-primary" />
            <span>Nouvelle inscription</span>
          </h3>

          <form onSubmit={handleAddAttendee} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-300 block">Nom du participant</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex. Sylvain Tremblay"
                className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-300 block">Adresse courriel</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="sylvain@email.com"
                className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-300 block">Notes rapides</label>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Ex. Intérêt pour Linux Mint"
                className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition"
              />
            </div>

            <div className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                id="presenceCheck"
                checked={newPresence}
                onChange={(e) => setNewPresence(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary bg-[#180A2b]"
              />
              <label htmlFor="presenceCheck" className="text-xs font-semibold text-slate-300">
                Confirmer la présence immédiatement
              </label>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-secondary font-bold font-display uppercase tracking-wider text-xs hover:scale-[1.02] active:scale-95 transition cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Inscrire</span>
            </button>
          </form>
        </div>

        {/* Liste des participants */}
        <div className="lg:col-span-8 bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-purple-950/60">
            <h3 className="text-base font-bold font-display text-white uppercase tracking-wider">
              Présences de la Session ({attendees.length})
            </h3>
            <div className="text-xs text-slate-400 font-sans">
              Présents : {presentCount} / Inscrits : {totalRegistered} ({presenceRate}%)
            </div>
          </div>

          {attendees.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-12 font-sans">Aucun participant enregistré.</p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {attendees.map((a) => (
                <div key={a.id} className="p-3.5 rounded-xl bg-[#180A2b]/60 border border-purple-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-sm">{a.name}</h4>
                      {a.presenceConfirmed ? (
                        <span className="text-[8px] bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-bold uppercase">Présent</span>
                      ) : (
                        <span className="text-[8px] bg-purple-950/80 text-slate-500 border border-purple-900/30 px-2 py-0.5 rounded-full font-bold uppercase">Absent</span>
                      )}
                    </div>
                    {a.email && <p className="text-xs text-slate-400 font-sans">{a.email}</p>}
                    {a.notes && <p className="text-[11px] text-slate-400 font-sans italic bg-[#180A2b]/80 p-2 rounded-lg mt-1">{a.notes}</p>}
                    
                    {/* Tags dynamiques pour Linux InstallFest */}
                    {event.type === 'install_fest_linux' && (
                      <div className="flex gap-1.5 mt-2">
                        {['En attente install', 'Réussi', 'Échec'].map((step) => {
                          const isCurrent = a.tags?.includes(step);
                          return (
                            <button
                              key={step}
                              onClick={() => setLinuxInstallTag(a.id, step as any)}
                              className={`text-[8px] px-2 py-0.5 rounded font-bold uppercase border transition cursor-pointer ${
                                isCurrent 
                                  ? step === 'Réussi' ? 'bg-primary text-secondary border-primary' :
                                    step === 'Échec' ? 'bg-red-500 text-white border-red-500' :
                                    'bg-yellow-500 text-secondary border-yellow-500'
                                  : 'bg-purple-950 text-slate-400 border-purple-900/30'
                              }`}
                            >
                              {step}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Actions de présence et feedback */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => togglePresence(a.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-bold font-display uppercase transition cursor-pointer ${
                        a.presenceConfirmed
                          ? 'bg-primary/20 text-primary border-primary/30'
                          : 'bg-purple-950 text-slate-400 border-purple-900/40 hover:text-white'
                      }`}
                    >
                      <Check size={12} />
                      <span>{a.presenceConfirmed ? 'Valide' : 'Marquer présent'}</span>
                    </button>

                    {a.presenceConfirmed && (
                      <button
                        onClick={() => setSelectedAttendeeId(selectedAttendeeId === a.id ? null : a.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-bold font-display uppercase transition cursor-pointer ${
                          a.feedbackScore !== undefined
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            : 'bg-purple-950 text-slate-400 border-purple-900/40 hover:text-white'
                        }`}
                      >
                        <Star size={12} />
                        <span>{a.feedbackScore !== undefined ? `${a.feedbackScore}/5 ★` : 'Évaluer'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteAttendee(a.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal d'évaluation du participant selectionné */}
        {selectedAttendeeId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#180A2b]/80 backdrop-blur-xs">
            <div className="bg-[#24123d] border border-purple-900/60 p-6 rounded-3xl max-w-md w-full mx-4 space-y-4">
              <h3 className="text-lg font-bold font-display text-white uppercase tracking-wider">
                Avis de {attendees.find(a => a.id === selectedAttendeeId)?.name}
              </h3>

              <form onSubmit={handleSaveFeedback} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-300 block">Note globale de satisfaction</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFeedbackScore(star)}
                        className="p-1 text-yellow-500 hover:scale-110 transition cursor-pointer"
                      >
                        <Star size={24} fill={star <= feedbackScore ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-300 block">Commentaire de satisfaction / Avis</label>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Ex. Superbe présentation, très clair !"
                    rows={3}
                    className="w-full bg-[#180A2b]/80 border border-purple-900/60 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-primary transition resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAttendeeId(null)}
                    className="px-4 py-2 rounded-xl bg-purple-950 text-slate-400 text-xs font-bold font-display uppercase border border-purple-900/40 hover:text-white cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-primary text-secondary text-xs font-bold font-display uppercase hover:scale-105 transition cursor-pointer"
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Rendu de l'onglet Bilan & Évaluation
  return (
    <div className="space-y-8">
      {/* Cards de Bilan rapide adaptatives */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
        <div className="bg-[#24123d]/60 border border-purple-900/40 p-3.5 sm:p-5 rounded-2xl text-center shadow-lg">
          <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 font-sans block mb-1">
            Total Inscrits
          </span>
          <div className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-white">{totalRegistered}</div>
        </div>

        <div className="bg-[#24123d]/60 border border-purple-900/40 p-3.5 sm:p-5 rounded-2xl text-center shadow-lg">
          <span className="text-[10px] uppercase font-black tracking-widest text-primary font-sans block mb-1">
            Présence Effective
          </span>
          <div className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-primary">{presentCount} ({presenceRate}%)</div>
        </div>

        <div className="bg-[#24123d]/60 border border-purple-900/40 p-3.5 sm:p-5 rounded-2xl text-center shadow-lg">
          <span className="text-[10px] uppercase font-black tracking-widest text-yellow-500 font-sans block mb-1">
            Satisfaction Moyenne
          </span>
          <div className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-yellow-500">
            {feedbackList.length > 0 ? `${averageFeedback} / 5` : 'Aucun avis'}
          </div>
        </div>
      </div>

      {/* Graphiques et Liste de Feedbacks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
        {/* Liste des avis formulés */}
        <div className="lg:col-span-6 bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
          <h3 className="text-base font-bold font-display text-white uppercase tracking-wider mb-4 pb-2 border-b border-purple-950/60">
            Avis & Remarques du Public
          </h3>

          {feedbackList.filter(a => a.feedbackText).length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-12 font-sans">Aucun commentaire textuel formulé.</p>
          ) : (
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {feedbackList
                .filter(a => a.feedbackText)
                .map((a) => (
                  <div key={a.id} className="p-3 rounded-xl bg-[#180A2b]/60 border border-purple-950 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white">{a.name}</h4>
                      <div className="flex items-center text-yellow-500">
                        {Array.from({ length: a.feedbackScore! }).map((_, i) => (
                          <Star key={i} size={10} fill="currentColor" />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 font-sans italic">"{a.feedbackText}"</p>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Graphiques de satisfaction */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
            <h4 className="text-xs font-bold font-display text-white uppercase tracking-wider mb-4 text-center">Taux d'émargement</h4>
            <DoughnutChart data={presenceData} />
          </div>
          <div className="bg-[#24123d]/60 border border-purple-900/40 p-6 rounded-3xl shadow-lg">
            <h4 className="text-xs font-bold font-display text-white uppercase tracking-wider mb-4 text-center">Scores d'appréciation</h4>
            <BarChart data={feedbackData} />
          </div>
        </div>
      </div>
    </div>
  );
}
