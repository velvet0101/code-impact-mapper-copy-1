'use client';

import React, { useState } from 'react';
import { BlastRadiusResult, AIExplanationResult, CodeImpactData } from '@/types/impact';
import {
  ShieldAlert,
  Zap,
  Sparkles,
  Code2,
  FileCode,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  X,
  Bot,
  Info,
  Sliders,
  RotateCcw,
} from 'lucide-react';

interface ImpactSidebarProps {
  blastRadius: BlastRadiusResult | null;
  codeData: CodeImpactData;
  apiKey: string;
  onSelectNode: (fnId: string) => void;
  onClose: () => void;
  onOpenCodeEditor?: () => void;
  isDirtyFile?: boolean;
  onResetFile?: () => void;
}

export const ImpactSidebar: React.FC<ImpactSidebarProps> = ({
  blastRadius,
  codeData,
  apiKey,
  onSelectNode,
  onClose,
  onOpenCodeEditor,
  isDirtyFile,
  onResetFile,
}) => {
  const [aiResult, setAiResult] = useState<AIExplanationResult | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'code' | 'callers'>('overview');

  // Invalidate previous AI explanation whenever target function, risk score, or codebase changes
  React.useEffect(() => {
    setAiResult(null);
  }, [blastRadius?.targetId, blastRadius?.impactScore, codeData.repoName]);

  if (!blastRadius) {
    return (
      <aside className="w-80 h-full bg-slate-950/80 backdrop-blur-xl border-l border-slate-800 p-6 flex flex-col items-center justify-center text-center z-20 shrink-0 select-none">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-cyan-400">
          <Zap className="w-7 h-7" />
        </div>
        <h3 className="font-bold text-slate-200 text-sm mb-1">No Function Selected</h3>
        <p className="text-xs text-slate-400 max-w-[220px]">
          Click any function node in the dependency graph to calculate its real blast radius, risk factors, and AI explanation.
        </p>
      </aside>
    );
  }

  const {
    focalNode,
    riskLevel,
    impactScore,
    totalImpactedCount,
    maxCascadeDepth,
    directCallerIds,
    indirectCallerIds,
    calleeIds,
    riskFactors,
    disclaimer,
  } = blastRadius;

  const handleGenerateAI = async () => {
    setLoadingAi(true);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blastRadius, apiKey }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiResult(data);
      }
    } catch (err) {
      console.error('AI generation error:', err);
    } finally {
      setLoadingAi(false);
    }
  };

  let riskBadgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
  if (riskLevel === 'CRITICAL') riskBadgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  if (riskLevel === 'HIGH') riskBadgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  if (riskLevel === 'MEDIUM') riskBadgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
  if (riskLevel === 'LOW') riskBadgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

  return (
    <aside className="w-96 lg:w-[430px] h-full bg-slate-950/90 backdrop-blur-2xl border-l border-slate-800/80 flex flex-col z-20 shrink-0 shadow-2xl overflow-hidden select-none">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 shrink-0">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-slate-100 text-sm font-mono truncate">
                {focalNode.name}()
              </h2>
              {isDirtyFile && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0 animate-pulse">
                  LIVE EDITED
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-mono truncate">
              {focalNode.filePath}:{focalNode.lineStart}-{focalNode.lineEnd}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onOpenCodeEditor && (
            <button
              onClick={onOpenCodeEditor}
              className="px-2 py-1 rounded-lg text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/20 transition-all flex items-center gap-1"
              title="Open Live Code Editor for this file"
            >
              <Code2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Edit</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/80 bg-slate-900/30 px-4 pt-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'overview'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Blast Radius
        </button>
        <button
          onClick={() => setActiveTab('code')}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'code'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Real Source Code
        </button>
        <button
          onClick={() => setActiveTab('callers')}
          className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'callers'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Callers ({totalImpactedCount})
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'overview' && (
          <>
            {/* Score & Risk Rating Box */}
            <div className="rounded-xl p-4 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                    Heuristic Risk Score
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white font-mono">{impactScore}</span>
                    <span className="text-xs text-slate-500 font-mono">/ 100</span>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold uppercase border tracking-wider ${riskBadgeColor}`}
                  >
                    {riskLevel} SEVERITY
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {totalImpactedCount} impacted functions
                  </p>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center gap-1.5 italic">
                <Info className="w-3 h-3 text-slate-400 shrink-0" />
                <span>{disclaimer || 'Heuristic risk score — not a production incident prediction.'}</span>
              </div>
            </div>

            {/* Risk Factor Breakdown Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Score Factor Breakdown
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Direct Callers:</span>
                  <strong className="text-amber-400">{riskFactors?.direct_callers_count ?? directCallerIds.length}</strong>
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Transitive:</span>
                  <strong className="text-purple-400">{riskFactors?.transitive_callers_count ?? indirectCallerIds.length}</strong>
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Affected Files:</span>
                  <strong className="text-cyan-400">{riskFactors?.affected_files_count ?? 1}</strong>
                </div>
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Max Depth:</span>
                  <strong className="text-rose-400">{riskFactors?.max_dependency_depth ?? maxCascadeDepth}</strong>
                </div>
              </div>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                  Direct Callers
                </div>
                <span className="text-xl font-bold text-slate-100 font-mono">
                  {directCallerIds.length}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  Transitive Callers
                </div>
                <span className="text-xl font-bold text-slate-100 font-mono">
                  {indirectCallerIds.length}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                  <ArrowDownRight className="w-3.5 h-3.5 text-sky-400" />
                  Internal Callees
                </div>
                <span className="text-xl font-bold text-slate-100 font-mono">
                  {calleeIds.length}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                  <Zap className="w-3.5 h-3.5 text-rose-400" />
                  Cascade Depth
                </div>
                <span className="text-xl font-bold text-slate-100 font-mono">
                  {maxCascadeDepth} hops
                </span>
              </div>
            </div>

            {/* AI Explanation Section */}
            <div className="rounded-xl border border-purple-500/30 bg-gradient-to-b from-purple-950/20 to-slate-950 p-4 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                    AI Blast Radius Explanation
                  </h3>
                </div>
                {!aiResult && (
                  <button
                    onClick={handleGenerateAI}
                    disabled={loadingAi}
                    className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-purple-600/30 transition-all flex items-center gap-1.5"
                  >
                    {loadingAi ? (
                      <>
                        <Bot className="w-3.5 h-3.5 animate-bounce" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Generate AI Analysis
                      </>
                    )}
                  </button>
                )}
              </div>

              {aiResult ? (
                <div className="space-y-3 text-xs text-slate-300 pt-2 border-t border-purple-500/20">
                  <div>
                    <h4 className="font-semibold text-purple-400 text-[11px] uppercase tracking-wider mb-1">
                      Function Purpose
                    </h4>
                    <p className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-slate-300 leading-relaxed">
                      {aiResult.functionPurpose}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-rose-400 text-[11px] uppercase tracking-wider mb-1">
                      Blast Radius Summary
                    </h4>
                    <p className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-slate-300 leading-relaxed">
                      {aiResult.blastRadiusSummary}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-amber-400 text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Cascading Risks
                    </h4>
                    <ul className="space-y-1 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      {aiResult.cascadeRisks.map((risk, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-slate-300">
                          <span className="text-amber-400 font-bold">•</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-emerald-400 text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Recommended Safety Tests
                    </h4>
                    <ul className="space-y-1 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      {aiResult.recommendedTests.map((test, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-slate-300">
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>{test}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 leading-relaxed">
                  Click the button above to generate Gemini AI explanations of function purpose, breaking change areas, and safety test strategy.
                </p>
              )}
            </div>
          </>
        )}

        {activeTab === 'code' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono bg-slate-900 p-2.5 rounded-t-lg border border-slate-800">
              <span className="flex items-center gap-1.5 truncate max-w-[240px]">
                <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                {focalNode.filePath}
              </span>
              <div className="flex items-center gap-2">
                <span>Lines {focalNode.lineStart}-{focalNode.lineEnd}</span>
                {onOpenCodeEditor && (
                  <button
                    onClick={onOpenCodeEditor}
                    className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 text-[11px] font-semibold transition-all flex items-center gap-1"
                  >
                    <Code2 className="w-3 h-3" />
                    <span>Open Editor</span>
                  </button>
                )}
                {isDirtyFile && onResetFile && (
                  <button
                    onClick={onResetFile}
                    className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 text-[11px] font-semibold transition-all flex items-center gap-1"
                    title="Reset this file back to GitHub source"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>
            <pre className="p-3 bg-slate-950 rounded-b-lg border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto leading-relaxed border-t-0 max-h-[500px]">
              <code>{focalNode.codeSnippet || '// Source code snippet extracted from repository'}</code>
            </pre>
          </div>
        )}

        {activeTab === 'callers' && (
          <div className="space-y-3">
            <div>
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                Direct Upstream Callers ({directCallerIds.length})
              </h4>
              {directCallerIds.length > 0 ? (
                <div className="space-y-1.5">
                  {directCallerIds.map((callerId) => {
                    const fn = codeData.functions[callerId];
                    return (
                      <button
                        key={callerId}
                        onClick={() => onSelectNode(callerId)}
                        className="w-full text-left p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 transition-all flex items-center justify-between group"
                      >
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-200 group-hover:text-amber-400">
                            {fn?.name || callerId.split('#')[1]}()
                          </span>
                          <p className="text-[10px] text-slate-400 font-mono truncate max-w-[240px]">
                            {fn?.filePath}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-2 bg-slate-900/40 rounded-lg">
                  No direct callers found in this repository.
                </p>
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                Transitive Indirect Callers ({indirectCallerIds.length})
              </h4>
              {indirectCallerIds.length > 0 ? (
                <div className="space-y-1.5">
                  {indirectCallerIds.map((callerId) => {
                    const fn = codeData.functions[callerId];
                    return (
                      <button
                        key={callerId}
                        onClick={() => onSelectNode(callerId)}
                        className="w-full text-left p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/50 transition-all flex items-center justify-between group"
                      >
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-200 group-hover:text-purple-400">
                            {fn?.name || callerId.split('#')[1]}()
                          </span>
                          <p className="text-[10px] text-slate-400 font-mono truncate max-w-[240px]">
                            {fn?.filePath}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic p-2 bg-slate-900/40 rounded-lg">
                  No transitive callers.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
