'use client';

import React, { useState } from 'react';
import { GitFork, Sparkles, Key, Layers, ChevronDown } from 'lucide-react';

const GithubIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

interface NavbarProps {
  currentRepoName: string;
  onOpenGitHubModal: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRepoName,
  onOpenGitHubModal,
  apiKey,
  onSaveApiKey,
}) => {
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);

  const handleSaveKey = () => {
    onSaveApiKey(tempKey);
    setShowKeyInput(false);
  };

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-4 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 via-purple-600 to-cyan-500 p-0.5 shadow-lg shadow-purple-500/20">
          <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
            <GitFork className="w-5 h-5 text-cyan-400 rotate-90" />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-lg text-white tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              Code-Impact-Mapper
            </h1>
          </div>
          <p className="text-[11px] text-slate-400">Source-Code Blast Radius & AI Risk Analyzer</p>
        </div>
      </div>

      {/* Center Repository Selector & Quick Switcher */}
      <div className="flex items-center gap-2 relative">
        <div className="relative">
          <button
            onClick={() => setShowRepoDropdown(!showRepoDropdown)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-200 hover:border-slate-700 hover:bg-slate-800/80 transition-all text-xs font-mono font-medium"
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="max-w-[200px] truncate">{currentRepoName || 'Select Repository'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Repo Dropdown */}
          {showRepoDropdown && (
            <div className="absolute left-0 mt-2 w-72 rounded-xl bg-slate-900/95 border border-slate-800 shadow-2xl p-2 z-50 backdrop-blur-xl">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1.5">
                Active Repository
              </div>
              <div className="w-full text-left p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-200 truncate">
                  {currentRepoName || 'No repository loaded'}
                </span>
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0 ml-2" />
              </div>
              <div className="my-2 border-t border-slate-800" />
              <button
                onClick={() => {
                  onOpenGitHubModal();
                  setShowRepoDropdown(false);
                }}
                className="w-full p-2 text-xs font-medium text-cyan-400 hover:bg-cyan-950/40 rounded-lg flex items-center gap-2 transition-all"
              >
                <GithubIcon className="w-4 h-4" />
                Analyze Custom GitHub Repository...
              </button>
            </div>
          )}
        </div>

        {/* Load GitHub Repo Button */}
        <button
          onClick={onOpenGitHubModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-medium transition-all shadow-sm shadow-cyan-500/10"
        >
          <GithubIcon className="w-3.5 h-3.5" />
          <span>Import Repo</span>
        </button>
      </div>

      {/* Right Controls & Key Config */}
      <div className="flex items-center gap-3">
        {/* Visual Impact Legend */}
        <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-[11px]">
          <span className="flex items-center gap-1 text-slate-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
            Focal
          </span>
          <span className="flex items-center gap-1 text-slate-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
            Direct Caller
          </span>
          <span className="flex items-center gap-1 text-slate-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm shadow-purple-500/50" />
            Transitive
          </span>
          <span className="flex items-center gap-1 text-slate-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-sm shadow-sky-500/50" />
            Callee
          </span>
        </div>

        {/* Gemini API Key Button */}
        <div className="relative">
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              apiKey
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Gemini AI</span>
            <span
              className={`w-2 h-2 rounded-full ${apiKey ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}
            />
          </button>

          {/* API Key Modal Popup */}
          {showKeyInput && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl bg-slate-900/95 border border-slate-800 shadow-2xl p-4 z-50 backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-2 text-slate-100 font-semibold text-xs">
                <Key className="w-4 h-4 text-purple-400" />
                Google Gemini API Key
              </div>
              <p className="text-[11px] text-slate-400 mb-3">
                Provide a key for live Gemini 2.0 Flash explanations (or leave empty to use built-in heuristic analysis).
              </p>
              <input
                type="password"
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 mb-3 font-mono"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowKeyInput(false)}
                  className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveKey}
                  className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-all"
                >
                  Save Key
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
