'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import {
  FileCode,
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Minimize2,
  Code2,
  Zap,
} from 'lucide-react';

interface CodeEditorDrawerProps {
  isOpen: boolean;
  filePath: string | null;
  functionName: string | null;
  functionLineStart?: number;
  initialCode: string;
  isDirty: boolean;
  onCodeChange: (filePath: string, newCode: string) => void;
  onResetFile: (filePath: string) => void;
  onClose: () => void;
  parsingError?: string | null;
}

export const CodeEditorDrawer: React.FC<CodeEditorDrawerProps> = ({
  isOpen,
  filePath,
  functionName,
  functionLineStart,
  initialCode,
  isDirty,
  onCodeChange,
  onResetFile,
  onClose,
  parsingError,
}) => {
  const [code, setCode] = useState(initialCode);
  const [isExpanded, setIsExpanded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'typing' | 'error'>('synced');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync internal state when filePath or initialCode changes from outside
  useEffect(() => {
    setCode(initialCode);
    setSyncStatus('synced');
  }, [filePath, initialCode]);

  useEffect(() => {
    if (parsingError) {
      setSyncStatus('error');
    }
  }, [parsingError]);

  const extensions = useMemo(() => {
    return [
      javascript({ jsx: true, typescript: true }),
    ];
  }, []);

  const handleChange = (val: string) => {
    setCode(val);
    setSyncStatus('typing');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!filePath) return;

    debounceTimerRef.current = setTimeout(() => {
      onCodeChange(filePath, val);
      setSyncStatus(parsingError ? 'error' : 'synced');
    }, 450);
  };

  const handleReset = () => {
    if (filePath) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      onResetFile(filePath);
      setSyncStatus('synced');
    }
  };

  if (!isOpen || !filePath) return null;

  const fileName = filePath.split('/').pop() || filePath;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-2xl border-t border-slate-800 shadow-2xl transition-all duration-300 flex flex-col ${
        isExpanded ? 'h-[75vh]' : 'h-[360px]'
      }`}
    >
      {/* Drawer Header Bar */}
      <div className="h-11 px-4 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* File Icon & Path */}
          <div className="flex items-center gap-1.5 font-mono text-xs text-slate-200 overflow-hidden">
            <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-bold text-white truncate">{fileName}</span>
            <span className="text-slate-500 hidden sm:inline truncate text-[11px]">({filePath})</span>
          </div>

          {/* Focal Function Badge */}
          {functionName && (
            <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400 text-[11px] font-mono shrink-0">
              <Code2 className="w-3 h-3" />
              <span>{functionName}()</span>
              {functionLineStart && <span className="text-sky-500/70">:{functionLineStart}</span>}
            </div>
          )}

          {/* Live Edited Dirty Indicator */}
          {isDirty ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded shrink-0 animate-pulse">
              <Zap className="w-2.5 h-2.5" />
              Live Edited (Unsaved)
            </span>
          ) : (
            <span className="hidden sm:inline-flex text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded shrink-0">
              Original GitHub Source
            </span>
          )}

          {/* AST Sync Status */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono shrink-0 ml-2">
            {syncStatus === 'typing' ? (
              <span className="text-amber-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                Parsing AST...
              </span>
            ) : syncStatus === 'error' || parsingError ? (
              <span className="text-rose-400 flex items-center gap-1" title={parsingError || 'Syntax warning'}>
                <AlertCircle className="w-3 h-3 text-rose-400" />
                Incomplete Syntax
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Graph Synced Live
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Reset to Original Button */}
          {isDirty && (
            <button
              onClick={handleReset}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-all flex items-center gap-1"
              title="Revert all live edits in this file back to GitHub source"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset File</span>
            </button>
          )}

          {/* Maximize / Minimize Height */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title={isExpanded ? 'Collapse Drawer' : 'Expand Drawer'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close Drawer Button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Close Editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 w-full h-full overflow-hidden bg-[#090d16] font-mono text-xs">
        <CodeMirror
          value={code}
          height="100%"
          theme={vscodeDark}
          extensions={extensions}
          onChange={handleChange}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            autocompletion: true,
            tabSize: 2,
            indentOnInput: true,
          }}
          className="h-full overflow-auto text-[12px]"
        />
      </div>

      {/* Footer Status Bar */}
      <div className="h-6 px-4 border-t border-slate-800/80 bg-slate-950 flex items-center justify-between text-[11px] font-mono text-slate-400 shrink-0">
        <div className="flex items-center gap-3">
          <span>JavaScript / TypeScript AST</span>
          <span className="text-slate-600">•</span>
          <span>Debounce: 450ms</span>
          {functionLineStart && (
            <>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-400 font-semibold">Target Line ~{functionLineStart}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span>UTF-8</span>
          <span>{code.split('\n').length} lines</span>
        </div>
      </div>
    </div>
  );
};
