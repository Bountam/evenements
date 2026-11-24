import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  FileCode2,
  Download,
  Copy,
  Check,
  Leaf,
  Clock,
  Users,
  GraduationCap,
  Layers
} from 'lucide-react';
import Modal from './Modal';
import { showToast } from './Toast';
import type { EventSettings } from '../../types';
import {
  computeEventImpactSummary,
  exportConsolidatedMultiEventXlsx,
  exportEventImpactFile,
  formatExecutiveSummaryText,
  type EventImpactSummary,
  type ImpactExportFormat
} from '../../utils/impactReport';

interface ImpactReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventSettings;
}

export default function ImpactReportModal({ isOpen, onClose, event }: ImpactReportModalProps) {
  const [summary, setSummary] = useState<EventImpactSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    computeEventImpactSummary(event)
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, event]);

  const handleDownload = async (format: ImpactExportFormat) => {
    setExportingFormat(format);
    try {
      const fileName = await exportEventImpactFile(event, format);
      showToast(`Rapport exporté : ${fileName}`, 'success');
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la génération du rapport d'impact.", 'error');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleConsolidated = async () => {
    setExportingFormat('consolidated');
    try {
      const fileName = await exportConsolidatedMultiEventXlsx();
      showToast(`Bilan consolidé exporté : ${fileName}`, 'success');
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de l'export consolidé.", 'error');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleCopySummary = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(formatExecutiveSummaryText(summary));
      setCopied(true);
      showToast('Résumé exécutif copié dans le presse-papiers !', 'success');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      showToast('Impossible de copier automatiquement.', 'warning');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Centre de Rapport d'Impact"
      icon={FileSpreadsheet}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-app-card-border">
          <div>
            <p className="text-xs font-bold uppercase text-primary tracking-wider">{event.name}</p>
            <p className="text-xs text-app-text-muted">
              {event.date} • {event.location}
              {event.partner ? ` • ${event.partner}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopySummary}
            disabled={!summary}
            className="min-h-11 px-4 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text text-xs font-bold font-display uppercase tracking-wider hover:border-primary/60 transition cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
          >
            {copied ? <Check size={15} className="text-primary" /> : <Copy size={15} className="text-primary" />}
            <span>{copied ? 'Résumé copié !' : 'Copier le résumé exécutif'}</span>
          </button>
        </div>

        {loading || !summary ? (
          <div className="py-8 text-center text-xs text-app-text-muted">Calcul des indicateurs d'impact...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Volet 1 : Écologie */}
            <div className="p-4 rounded-2xl bg-app-input border border-app-card-border space-y-2">
              <div className="flex items-center gap-2 text-primary font-display font-bold uppercase text-xs tracking-wider">
                <Leaf size={15} />
                <span>1. Impact Écologique</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-app-text-muted block">Appareils sauvés</span>
                  <strong className="text-base font-display text-app-text">
                    {summary.savedDevices} / {summary.totalDevices} ({summary.successRatePct}%)
                  </strong>
                </div>
                <div>
                  <span className="text-app-text-muted block">Poids & CO2e évité</span>
                  <strong className="text-base font-display text-primary">
                    {summary.weightSavedKg} kg • {summary.co2eAvoidedKg} kg CO2e
                  </strong>
                </div>
              </div>
            </div>

            {/* Volet 2 : Opérations & Boutique */}
            <div className="p-4 rounded-2xl bg-app-input border border-app-card-border space-y-2">
              <div className="flex items-center gap-2 text-warning font-display font-bold uppercase text-xs tracking-wider">
                <Clock size={15} />
                <span>2. Opérations & Boutique</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-app-text-muted block">Attente / Réparation</span>
                  <strong className="text-base font-display text-app-text">
                    {summary.avgWaitMinutes}m / {summary.avgRepairMinutes}m
                  </strong>
                </div>
                <div>
                  <span className="text-app-text-muted block">Pièces / Boutique</span>
                  <strong className="text-base font-display text-app-text">
                    {summary.partsOrientationsCount} / {summary.shopOrientationsCount}
                  </strong>
                </div>
              </div>
            </div>

            {/* Volet 3 : Mobilisation & Loi 25 */}
            <div className="p-4 rounded-2xl bg-app-input border border-app-card-border space-y-2">
              <div className="flex items-center gap-2 text-info font-display font-bold uppercase text-xs tracking-wider">
                <Users size={15} />
                <span>3. Mobilisation & Loi 25</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-app-text-muted block">Nouveaux bénévoles</span>
                  <strong className="text-base font-display text-app-text">{summary.newVolunteersCount}</strong>
                </div>
                <div>
                  <span className="text-app-text-muted block">Infolettre Loi 25</span>
                  <strong className="text-base font-display text-app-text">{summary.newsletterOptInsCount}</strong>
                </div>
              </div>
            </div>

            {/* Volet 4 : Pédagogie Formation */}
            <div className="p-4 rounded-2xl bg-app-input border border-app-card-border space-y-2">
              <div className="flex items-center gap-2 text-success font-display font-bold uppercase text-xs tracking-wider">
                <GraduationCap size={15} />
                <span>4. Pédagogie Formation</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-app-text-muted block">Présence</span>
                  <strong className="text-base font-display text-app-text">
                    {summary.attendeesPresent}/{summary.attendeesRegistered} ({summary.presenceRatePct}%)
                  </strong>
                </div>
                <div>
                  <span className="text-app-text-muted block">Prêts Réparothon</span>
                  <strong className="text-base font-display text-app-text">{summary.readyForReparothonCount}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gros boutons d'export */}
        <div className="space-y-2.5 pt-2 border-t border-app-card-border">
          <button
            type="button"
            onClick={() => handleDownload('xlsx')}
            disabled={exportingFormat !== null}
            className="w-full min-h-14 px-5 py-3 rounded-2xl bg-primary text-secondary font-display font-black uppercase tracking-wider text-sm hover:opacity-90 active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-3 shadow-lg disabled:opacity-50"
          >
            <FileSpreadsheet size={20} />
            <span>Rapport Excel Complet (.xlsx — 3 onglets)</span>
          </button>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => handleDownload('md')}
              disabled={exportingFormat !== null}
              className="min-h-12 px-3 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text text-xs font-bold font-display uppercase hover:border-primary/60 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FileText size={14} className="text-primary" />
              <span>Markdown (.md)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload('tex')}
              disabled={exportingFormat !== null}
              className="min-h-12 px-3 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text text-xs font-bold font-display uppercase hover:border-primary/60 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FileCode2 size={14} className="text-primary" />
              <span>LaTeX (.tex)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload('csv')}
              disabled={exportingFormat !== null}
              className="min-h-12 px-3 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text text-xs font-bold font-display uppercase hover:border-primary/60 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Download size={14} className="text-primary" />
              <span>CSV (.csv)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload('json')}
              disabled={exportingFormat !== null}
              className="min-h-12 px-3 py-2 rounded-xl bg-app-input border border-app-card-border text-app-text text-xs font-bold font-display uppercase hover:border-primary/60 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Download size={14} className="text-primary" />
              <span>JSON (.json)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleConsolidated}
            disabled={exportingFormat !== null}
            className="w-full min-h-12 px-4 py-2.5 rounded-xl bg-app-input border border-primary/40 text-primary text-xs font-bold font-display uppercase tracking-wider hover:bg-primary/10 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Layers size={15} />
            <span>Exporter le Bilan Consolidé Multi-Événements (.xlsx)</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
