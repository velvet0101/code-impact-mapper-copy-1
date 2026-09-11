'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { GraphView } from '@/components/GraphView';
import { ImpactSidebar } from '@/components/ImpactSidebar';
import { RepoModal } from '@/components/RepoModal';
import { calculateBlastRadius } from '@/lib/ast/blastRadius';
import { CodeImpactData, BlastRadiusResult } from '@/types/impact';
import { Server, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

export default function HomePage() {
  const [codeData, setCodeData] = useState<CodeImpactData>({
    repoName: 'No Repository Loaded',
    functions: {},
  });
  const [selectedFnId, setSelectedFnId] = useState<string | null>(null);

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

  // Calculate Blast Radius
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
          const firstFnId = Object.keys(result.functions)[0] || null;
          setSelectedFnId(firstFnId);
          setIsSidebarOpen(true);
          setLoading(false);
          return;
        }

        const errData = await res.json().catch(() => ({}));
        const detailMsg = errData.detail || `Backend returned HTTP ${res.status}`;

        // If client error (invalid URL, not found, rate limit, forbidden), surface immediately
        if (res.status >= 400 && res.status < 500) {
          setErrorMsg(detailMsg);
          setLoading(false);
          throw new Error(detailMsg);
        }

        // For server 5xx errors, fall through to fallback route
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
      setAnalysisId(null);
      const firstFnId = Object.keys(data.functions)[0] || null;
      setSelectedFnId(firstFnId);
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
  };

  const handleResetImpactView = () => {
    setSelectedFnId(null);
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-[#090d16] text-slate-100 overflow-hidden select-none">
      {/* Top Navbar Header */}
      <Navbar
        currentRepoName={codeData.repoName}
        onOpenGitHubModal={() => setIsRepoModalOpen(true)}
        apiKey={apiKey}
        onSaveApiKey={handleSaveApiKey}
      />

      {/* Post-Analysis Repository Experience Bar */}
      <div className="bg-slate-900/95 border-b border-slate-800/80 px-4 py-1.5 flex items-center justify-between text-xs text-slate-400 overflow-x-auto">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 font-mono text-slate-200">
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold">{codeData.repoName}</span>
          </div>

          {backendStatus === 'online' ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              FastAPI NetworkX Active
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              Standalone Mode
            </span>
          )}
        </div>

        {/* Real Post-Analysis Metrics */}
        <div className="flex items-center gap-4 text-[11px] font-mono shrink-0">
          <span title="Total Files Scanned">
            Files: <strong className="text-slate-200">{codeData.fileCount ?? 0}</strong>
            {codeData.supportedFileCount !== undefined && (
              <span className="text-slate-400 text-[10px]"> ({codeData.supportedFileCount} supported / {codeData.unsupportedFileCount} unparsed)</span>
            )}
          </span>
          <span>Functions: <strong className="text-slate-200">{Object.keys(codeData.functions).length}</strong></span>
          <span>Classes: <strong className="text-slate-200">{codeData.classCount ?? 0}</strong></span>
          <span>Relationships: <strong className="text-cyan-400">{codeData.relationshipCount ?? 0}</strong></span>
          {codeData.analysisDurationMs !== undefined && (
            <span className="flex items-center gap-1 text-slate-400">
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
          />
        )}
      </main>

      {/* Repository Selection & GitHub Import Modal */}
      <RepoModal
        isOpen={isRepoModalOpen}
        onClose={() => setIsRepoModalOpen(false)}
        onAnalyzeGitHub={handleAnalyzeGitHub}
      />
    </div>
  );
}
