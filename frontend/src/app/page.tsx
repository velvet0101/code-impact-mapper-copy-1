'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { GraphView } from '@/components/GraphView';
import { ImpactSidebar } from '@/components/ImpactSidebar';
import { RepoModal } from '@/components/RepoModal';
import { CodeEditorDrawer } from '@/components/Editor/CodeEditorDrawer';
import { calculateBlastRadius } from '@/lib/ast/blastRadius';
import { patchIncrementalFile } from '@/lib/ast/incrementalPatcher';
import { CodeImpactData, BlastRadiusResult, GraphDiffMetadata } from '@/types/impact';
import { Server, CheckCircle2, AlertTriangle, Clock, Zap, RotateCcw } from 'lucide-react';

const initialDiffMetadata: GraphDiffMetadata = {
  dirtyFiles: [],
  addedFunctionIds: [],
  removedFunctionIds: [],
  addedEdgeIds: [],
  removedEdgeIds: [],
  riskDeltaMap: {},
};

export default function HomePage() {
  // Pristine baseline fetched from GitHub / backend
  const [originalCodeData, setOriginalCodeData] = useState<CodeImpactData>({
    repoName: 'No Repository Loaded',
    functions: {},
  });

  // Current live code & graph data (patched incrementally)
  const [codeData, setCodeData] = useState<CodeImpactData>({
    repoName: 'No Repository Loaded',
    functions: {},
  });

  // In-memory overlay for edited files: filePath -> newCode
  const [fileContentsOverlay, setFileContentsOverlay] = useState<Record<string, string>>({});
  const [diffMetadata, setDiffMetadata] = useState<GraphDiffMetadata>(initialDiffMetadata);
  const [parsingError, setParsingError] = useState<string | null>(null);

  const [selectedFnId, setSelectedFnId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeEditorFilePath, setActiveEditorFilePath] = useState<string | null>(null);

  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

  // Check Backend Health (FastAPI)
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/health`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          setBackendStatus('online');
        } else {
          setBackendStatus('offline');
        }
      } catch {
        setBackendStatus('offline');
      }
    }
    checkHealth();
  }, [API_BASE_URL]);

  // Load API Key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('GEMINI_API_KEY');
    if (saved) setApiKey(saved);
  }, []);

  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('GEMINI_API_KEY', key);
  };

  // Calculate Blast Radius dynamically from current live functions
  const blastRadius: BlastRadiusResult | null = useMemo(() => {
    if (!selectedFnId || !codeData.functions[selectedFnId]) {
      return null;
    }
    return calculateBlastRadius(selectedFnId, codeData.functions);
  }, [selectedFnId, codeData]);

  const handleAnalyzeGitHub = async (repoUrl: string, token?: string) => {
    setLoading(true);
    setErrorMsg(null);

    // 1. Try FastAPI backend first if online
    if (backendStatus === 'online') {
      try {
        const res = await fetch(`${API_BASE_URL}/api/repository/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo_url: repoUrl, github_token: token }),
        });

        if (res.ok) {
          const result = await res.json();
          setAnalysisId(result.analysis_id);

          const backendCodeData: CodeImpactData = {
            repoName: result.repo_name,
            files: [],
            functions: result.functions,
            fileContents: result.file_contents || {},
            fileCount: result.file_count,
            supportedFileCount: result.supported_file_count,
            unsupportedFileCount: result.unsupported_file_count,
            classCount: result.class_count,
            moduleCount: result.module_count,
            relationshipCount: result.relationship_count,
            analysisDurationMs: result.analysis_duration_ms,
            warnings: result.warnings,
          };

          setCodeData(backendCodeData);
          setOriginalCodeData(backendCodeData);
          setFileContentsOverlay({});
          setDiffMetadata(initialDiffMetadata);
          setParsingError(null);

          const firstFnId = Object.keys(result.functions)[0] || null;
          setSelectedFnId(firstFnId);
          if (firstFnId && result.functions[firstFnId]) {
            setActiveEditorFilePath(result.functions[firstFnId].filePath);
          }
          setIsSidebarOpen(true);
          setLoading(false);
          return;
        }

        const errData = await res.json().catch(() => ({}));
        const detailMsg = errData.detail || `Backend returned HTTP ${res.status}`;

        if (res.status >= 400 && res.status < 500) {
          setErrorMsg(detailMsg);
          setLoading(false);
          throw new Error(detailMsg);
        }

        console.warn('FastAPI backend returned 5xx, falling back to Next.js analyzer route:', detailMsg);
      } catch (err: unknown) {
        if (err instanceof Error && err.message && !err.message.includes('fetch')) {
          setErrorMsg(err.message);
          setLoading(false);
          throw err;
        }
        console.warn('FastAPI backend connection unreachable, falling back to Next.js analyzer:', err);
      }
    }

    // 2. Fallback to Next.js analyzer route
    try {
      const res = await fetch('/api/analyze-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, githubToken: token }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to analyze GitHub repository.');
      }

      const data: CodeImpactData = await res.json();
      setCodeData(data);
      setOriginalCodeData(data);
      setFileContentsOverlay({});
      setDiffMetadata(initialDiffMetadata);
      setParsingError(null);
      setAnalysisId(null);

      const firstFnId = Object.keys(data.functions)[0] || null;
      setSelectedFnId(firstFnId);
      if (firstFnId && data.functions[firstFnId]) {
        setActiveEditorFilePath(data.functions[firstFnId].filePath);
      }
      setIsSidebarOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed.';
      setErrorMsg(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (fnId: string) => {
    setSelectedFnId(fnId);
    setIsSidebarOpen(true);
    const targetFile = codeData.functions[fnId]?.filePath;
    if (targetFile) {
      setActiveEditorFilePath(targetFile);
    }
  };

  const handleOpenCodeEditor = useCallback(
    (fnId?: string) => {
      const targetId = fnId || selectedFnId;
      if (targetId && codeData.functions[targetId]) {
        setSelectedFnId(targetId);
        setActiveEditorFilePath(codeData.functions[targetId].filePath);
      }
      setIsEditorOpen(true);
    },
    [selectedFnId, codeData.functions]
  );

  const handleResetImpactView = () => {
    setSelectedFnId(null);
  };

  // Debounced in-memory code update handler
  const handleFileContentChange = (filePath: string, newCode: string) => {
    setFileContentsOverlay((prev) => ({ ...prev, [filePath]: newCode }));

    const res = patchIncrementalFile(
      filePath,
      newCode,
      codeData.functions,
      originalCodeData.functions,
      selectedFnId,
      new Set(diffMetadata.dirtyFiles)
    );

    if (res.success) {
      setCodeData((prev) => ({
        ...prev,
        functions: res.updatedFunctions,
      }));
      setDiffMetadata(res.diffMetadata);
      setParsingError(null);
    } else {
      setParsingError(res.error || 'Syntax warning during edit');
    }
  };

  // Reset a single file back to original fetched state
  const handleResetFile = (filePath: string) => {
    const updatedOverlay = { ...fileContentsOverlay };
    delete updatedOverlay[filePath];
    setFileContentsOverlay(updatedOverlay);

    const remainingDirty = diffMetadata.dirtyFiles.filter((f) => f !== filePath);

    if (remainingDirty.length === 0) {
      setCodeData(originalCodeData);
      setDiffMetadata(initialDiffMetadata);
      setParsingError(null);
    } else {
      let currentFns = { ...originalCodeData.functions };
      let lastMeta = initialDiffMetadata;
      for (const df of remainingDirty) {
        const patchRes = patchIncrementalFile(
          df,
          updatedOverlay[df] || originalCodeData.fileContents?.[df] || '',
          currentFns,
          originalCodeData.functions,
          selectedFnId,
          new Set(lastMeta.dirtyFiles)
        );
        if (patchRes.success) {
          currentFns = patchRes.updatedFunctions;
          lastMeta = patchRes.diffMetadata;
        }
      }
      setCodeData((prev) => ({ ...prev, functions: currentFns }));
      setDiffMetadata(lastMeta);
      setParsingError(null);
    }
  };

  // Reset all files back to pristine GitHub state
  const handleResetAllEdits = () => {
    setFileContentsOverlay({});
    setCodeData(originalCodeData);
    setDiffMetadata(initialDiffMetadata);
    setParsingError(null);
  };

  // Compute the current code content to pass to editor for active file
  const currentEditorCode = useMemo(() => {
    if (!activeEditorFilePath) return '';
    return (
      fileContentsOverlay[activeEditorFilePath] ??
      codeData.fileContents?.[activeEditorFilePath] ??
      originalCodeData.fileContents?.[activeEditorFilePath] ??
      (selectedFnId && codeData.functions[selectedFnId]?.filePath === activeEditorFilePath
        ? codeData.functions[selectedFnId]?.codeSnippet
        : '') ??
      ''
    );
  }, [activeEditorFilePath, fileContentsOverlay, codeData, originalCodeData, selectedFnId]);

  const isLiveEdited = diffMetadata.dirtyFiles.length > 0;
  const isCurrentFileDirty = Boolean(activeEditorFilePath && diffMetadata.dirtyFiles.includes(activeEditorFilePath));

  return (
    <div className="flex flex-col w-screen h-screen bg-[#080b11] text-slate-100 overflow-hidden select-none">
      {/* Top Navbar Header */}
      <Navbar
        currentRepoName={codeData.repoName}
        onOpenGitHubModal={() => setIsRepoModalOpen(true)}
        apiKey={apiKey}
        onSaveApiKey={handleSaveApiKey}
      />

      {/* Post-Analysis Repository Experience Bar */}
      <div className="bg-[#0c111e]/90 border-b border-white/[0.06] px-5 py-2 flex items-center justify-between text-xs text-slate-400 overflow-x-auto select-none backdrop-blur-xl">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 font-mono text-slate-200 bg-white/[0.03] px-2.5 py-1 rounded-xl border border-white/[0.06]">
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold">{codeData.repoName}</span>
          </div>

          {backendStatus === 'online' ? (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              FastAPI NetworkX Active
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 bg-white/[0.04] px-2.5 py-1 rounded-xl border border-white/[0.06]">
              Standalone Mode
            </span>
          )}

          {/* Live Edited Indicator & Revert All Button */}
          {isLiveEdited && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-xl animate-pulse font-mono">
                <Zap className="w-3 h-3 text-amber-400" />
                Live Edited ({diffMetadata.dirtyFiles.length} file{diffMetadata.dirtyFiles.length > 1 ? 's' : ''})
              </span>
              <button
                onClick={handleResetAllEdits}
                className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-all flex items-center gap-1.5 active:scale-95"
                title="Revert all live edits back to original GitHub state"
              >
                <RotateCcw className="w-3 h-3" />
                Revert All
              </button>
            </div>
          )}
        </div>

        {/* Real Post-Analysis Metrics Capsules */}
        <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
          <span className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/[0.05]" title="Total Files Scanned">
            Files: <strong className="text-slate-200 font-bold">{codeData.fileCount ?? 0}</strong>
            {codeData.supportedFileCount !== undefined && (
              <span className="text-slate-400 text-[10px]"> ({codeData.supportedFileCount} parsed)</span>
            )}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            Functions: <strong className="text-slate-200 font-bold">{Object.keys(codeData.functions).length}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            Classes: <strong className="text-slate-200 font-bold">{codeData.classCount ?? 0}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
            Edges: <strong className="text-cyan-400 font-bold">{codeData.relationshipCount ?? 0}</strong>
          </span>
          {codeData.analysisDurationMs !== undefined && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/[0.05] text-slate-400">
              <Clock className="w-3 h-3 text-slate-400" />
              {codeData.analysisDurationMs}ms
            </span>
          )}
        </div>
      </div>

      {/* Parsing Warnings Notification */}
      {codeData.warnings && codeData.warnings.length > 0 && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{codeData.warnings.length} non-fatal parsing warning(s) occurred (unsupported syntax skipped safely).</span>
          </div>
        </div>
      )}

      {/* Error Message Toast */}
      {errorMsg && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 px-4 py-2 text-xs text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-slate-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="flex-1 flex w-full h-[calc(100vh-5.5rem)] relative overflow-hidden">
        {/* Graph View Canvas */}
        <div className="flex-1 h-full relative">
          <GraphView
            codeData={codeData}
            selectedFunctionId={selectedFnId}
            blastRadius={blastRadius}
            onSelectNode={handleNodeClick}
            onResetImpactView={handleResetImpactView}
            onOpenGitHubModal={() => setIsRepoModalOpen(true)}
            onOpenCodeEditor={handleOpenCodeEditor}
            diffMetadata={diffMetadata}
            dirtyFiles={diffMetadata.dirtyFiles}
          />
        </div>

        {/* Impact Sidebar Inspector */}
        {isSidebarOpen && (
          <ImpactSidebar
            blastRadius={blastRadius}
            codeData={codeData}
            apiKey={apiKey}
            onSelectNode={handleNodeClick}
            onClose={() => setIsSidebarOpen(false)}
            onOpenCodeEditor={() => selectedFnId && handleOpenCodeEditor(selectedFnId)}
            isDirtyFile={selectedFnId ? diffMetadata.dirtyFiles.includes(codeData.functions[selectedFnId]?.filePath) : false}
            onResetFile={() => {
              const fp = selectedFnId && codeData.functions[selectedFnId]?.filePath;
              if (fp) handleResetFile(fp);
            }}
          />
        )}
      </main>

      {/* Real-time In-App Code Editor Drawer */}
      <CodeEditorDrawer
        isOpen={isEditorOpen}
        filePath={activeEditorFilePath}
        functionName={selectedFnId ? codeData.functions[selectedFnId]?.name || null : null}
        functionLineStart={selectedFnId ? codeData.functions[selectedFnId]?.lineStart : undefined}
        initialCode={currentEditorCode}
        isDirty={isCurrentFileDirty}
        onCodeChange={handleFileContentChange}
        onResetFile={handleResetFile}
        onClose={() => setIsEditorOpen(false)}
        parsingError={parsingError}
      />

      {/* Repository Selection & GitHub Import Modal */}
      <RepoModal
        isOpen={isRepoModalOpen}
        onClose={() => setIsRepoModalOpen(false)}
        onAnalyzeGitHub={handleAnalyzeGitHub}
      />
    </div>
  );
}

