import React, { useEffect, useMemo, useState } from 'react';
import {
  Stethoscope,
  CheckCircle,
  XCircle,
  RotateCcw,
  ArrowLeft,
  BookOpenCheck,
  ChevronDown,
  AlertTriangle,
  Check
} from 'lucide-react';
import type { RepairTicket } from '../../../types';
import {
  getDiagnosticSuggestions,
  getRecommendedTreesForTicket,
  type DiagnosticDecisionTreeDef
} from '../../../utils/repairLexicon';

interface DiagnosticDecisionTreeProps {
  ticket: RepairTicket;
  checkedIds: string[];
  onToggleCheck: (id: string) => void | Promise<void>;
  onSelectGuideKeyword?: (keyword: string) => void;
}

// Diagnostic interactif Oui / Non : 1 question claire à la fois, orientation cause probable et action directe
export default function DiagnosticDecisionTree({
  ticket,
  checkedIds,
  onToggleCheck,
  onSelectGuideKeyword
}: DiagnosticDecisionTreeProps) {
  const { trees, recommendedTreeId } = useMemo(() => getRecommendedTreesForTicket(ticket), [ticket]);
  const suggestions = useMemo(() => getDiagnosticSuggestions(ticket), [ticket]);

  const [selectedTreeId, setSelectedTreeId] = useState<string>(recommendedTreeId);
  const [history, setHistory] = useState<string[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string>('');
  const [showExtraChecks, setShowExtraChecks] = useState(false);

  const activeTree: DiagnosticDecisionTreeDef = useMemo(
    () => trees.find((t) => t.id === selectedTreeId) || trees[0],
    [trees, selectedTreeId]
  );

  // Réinitialise l'arbre uniquement quand l'identifiant du ticket actif change
  useEffect(() => {
    setSelectedTreeId(recommendedTreeId);
    const first = trees.find((t) => t.id === recommendedTreeId) || trees[0];
    setCurrentNodeId(first.startNodeId);
    setHistory([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  const switchTree = (treeId: string) => {
    const found = trees.find((t) => t.id === treeId);
    if (!found) return;
    setSelectedTreeId(treeId);
    setCurrentNodeId(found.startNodeId);
    setHistory([]);
  };

  const node = activeTree.nodes[currentNodeId] || activeTree.nodes[activeTree.startNodeId];

  const handleAnswer = (answer: 'yes' | 'no') => {
    if (!node || node.type !== 'question') return;
    const nextId = answer === 'yes' ? node.yesNextId : node.noNextId;
    setHistory((prev) => [...prev, node.id]);
    setCurrentNodeId(nextId);
  };

  const handleStepBack = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const previousId = copy.pop()!;
      setCurrentNodeId(previousId);
      return copy;
    });
  };

  const handleRestart = () => {
    setHistory([]);
    setCurrentNodeId(activeTree.startNodeId);
  };

  const extraItems = useMemo(
    () => [
      ...suggestions.questions.map((q) => ({ id: q.id, label: q.label, tip: q.tip })),
      ...suggestions.quickChecks.map((c) => ({ id: c.id, label: c.label, tip: c.category === 'securite' ? 'Sécurité' : c.category === 'materiel' ? 'Matériel' : 'Logiciel' }))
    ],
    [suggestions]
  );
  const extraDoneCount = extraItems.filter((item) => checkedIds.includes(item.id)).length;

  return (
    <section
      aria-label="Diagnostic guidé interactif"
      className="bg-app-card border border-app-card-border p-4 sm:p-5 rounded-3xl shadow-lg space-y-4"
    >
      {/* Choix de la piste de panne (piste recommandée en premier) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm sm:text-base font-display font-bold uppercase text-app-text flex items-center gap-2">
            <Stethoscope size={17} className="text-primary shrink-0" aria-hidden="true" />
            <span>Diagnostic pas à pas</span>
          </h4>
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleRestart}
              className="min-h-9 px-3 py-1 rounded-xl bg-app-input border border-app-card-border text-micro font-display font-bold uppercase text-app-text-muted hover:text-app-text cursor-pointer inline-flex items-center gap-1"
            >
              <RotateCcw size={12} aria-hidden="true" />
              <span>Recommencer</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pistes de panne">
          {trees.map((tree) => {
            const active = tree.id === activeTree.id;
            const recommended = tree.id === recommendedTreeId;
            return (
              <button
                key={tree.id}
                type="button"
                aria-pressed={active}
                onClick={() => switchTree(tree.id)}
                className={`min-h-10 px-3 py-1.5 rounded-xl border text-xs font-display font-bold uppercase cursor-pointer inline-flex items-center gap-1.5 transition ${
                  active
                    ? 'bg-primary text-secondary border-primary font-black shadow-sm'
                    : 'bg-app-input text-app-text border-app-card-border hover:border-primary/50'
                }`}
              >
                <span>{tree.title}</span>
                {recommended && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-micro font-black ${
                      active ? 'bg-secondary/20 text-secondary' : 'bg-primary/15 text-primary'
                    }`}
                  >
                    Conseillé
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Question courante OU Résultat */}
      {node.type === 'question' ? (
        <div className="p-4 sm:p-5 rounded-2xl bg-app-input border-2 border-primary/40 space-y-4">
          <div className="space-y-1.5">
            <span className="text-micro font-bold uppercase tracking-wider text-primary block" aria-live="polite">
              Question {history.length + 1} · {activeTree.title}
            </span>
            <p className="text-base sm:text-lg font-display font-bold text-app-text leading-snug">
              {node.prompt}
            </p>
            <p className="text-xs sm:text-sm text-app-text-muted">{node.falcTip}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleAnswer('yes')}
              className="min-h-14 px-4 py-3 rounded-2xl bg-success/15 border-2 border-success/60 hover:bg-success/25 text-success font-display font-black uppercase text-base cursor-pointer inline-flex items-center justify-center gap-2 transition active:scale-95"
            >
              <CheckCircle size={20} aria-hidden="true" />
              <span>Oui</span>
            </button>
            <button
              type="button"
              onClick={() => handleAnswer('no')}
              className="min-h-14 px-4 py-3 rounded-2xl bg-danger/15 border-2 border-danger/60 hover:bg-danger/25 text-danger font-display font-black uppercase text-base cursor-pointer inline-flex items-center justify-center gap-2 transition active:scale-95"
            >
              <XCircle size={20} aria-hidden="true" />
              <span>Non</span>
            </button>
          </div>

          {history.length > 0 && (
            <button
              type="button"
              onClick={handleStepBack}
              className="min-h-10 px-3 py-1.5 rounded-xl bg-app-card border border-app-card-border text-xs font-display font-bold uppercase text-app-text-muted hover:text-app-text cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              <span>Question précédente</span>
            </button>
          )}
        </div>
      ) : (
        <div
          className="p-4 sm:p-5 rounded-2xl bg-primary/10 border-2 border-primary space-y-3.5"
          aria-live="polite"
        >
          <div className="space-y-1">
            <span className="text-micro font-black uppercase tracking-wider text-primary block">
              Piste identifiée
            </span>
            <h5 className="text-base sm:text-lg font-display font-bold text-app-text">
              {node.cause}
            </h5>
            <p className="text-xs sm:text-sm text-app-text">{node.action}</p>
          </div>

          <div className="p-3 rounded-xl bg-warning/15 border border-warning/40 flex items-start gap-2 text-xs font-semibold text-warning">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>Sécurité : {node.safetyWarning}</span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {(() => {
              const checkKey = node.quickCheckId || node.id;
              const isChecked = checkedIds.includes(checkKey);
              return (
                <button
                  type="button"
                  aria-pressed={isChecked}
                  onClick={() => void onToggleCheck(checkKey)}
                  className={`min-h-12 px-4 py-2 rounded-xl border-2 font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-2 transition ${
                    isChecked
                      ? 'bg-primary text-secondary border-primary font-black'
                      : 'bg-app-card text-app-text border-app-card-border hover:border-primary'
                  }`}
                >
                  <Check size={15} aria-hidden="true" />
                  <span>{isChecked ? 'Vérification faite' : 'Marquer cette action faite'}</span>
                </button>
              );
            })()}

            {node.guideKeyword && onSelectGuideKeyword && (
              <button
                type="button"
                onClick={() => onSelectGuideKeyword(node.guideKeyword!)}
                className="min-h-12 px-4 py-2 rounded-xl bg-app-card border border-primary/50 text-primary font-display font-bold uppercase text-xs cursor-pointer inline-flex items-center gap-2 hover:bg-primary/10"
              >
                <BookOpenCheck size={15} aria-hidden="true" />
                <span>Cibler les guides ({node.guideKeyword})</span>
              </button>
            )}

            {history.length > 0 && (
              <button
                type="button"
                onClick={handleStepBack}
                className="min-h-12 px-3.5 py-2 rounded-xl bg-app-input border border-app-card-border text-xs font-display font-bold uppercase text-app-text-muted hover:text-app-text cursor-pointer inline-flex items-center gap-1.5"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                <span>Retour</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Liste repliable des vérifications complémentaires hors-ligne */}
      {extraItems.length > 0 && (
        <div className="border-t border-app-card-border pt-3">
          <button
            type="button"
            aria-expanded={showExtraChecks}
            onClick={() => setShowExtraChecks((prev) => !prev)}
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-app-input border border-app-card-border text-xs font-display font-bold uppercase text-app-text flex items-center justify-between gap-2 cursor-pointer hover:border-primary/50"
          >
            <span>
              Points de contrôle complémentaires ({extraDoneCount}/{extraItems.length})
            </span>
            <ChevronDown
              size={15}
              className={`transition-transform ${showExtraChecks ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>

          {showExtraChecks && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
              {extraItems.map((item) => {
                const checked = checkedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => void onToggleCheck(item.id)}
                    className={`min-h-12 p-3 rounded-xl border-2 text-left cursor-pointer flex items-start justify-between gap-2 transition ${
                      checked
                        ? 'bg-primary text-secondary border-primary'
                        : 'bg-app-input text-app-text border-app-card-border hover:border-primary/50'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-xs font-bold block">{item.label}</span>
                      <span className={`text-micro block ${checked ? 'text-secondary/90' : 'text-app-text-muted'}`}>
                        {item.tip}
                      </span>
                    </div>
                    {checked && <Check size={15} className="shrink-0 mt-0.5" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
