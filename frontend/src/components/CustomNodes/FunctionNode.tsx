import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GraphNodeData } from '@/types/impact';
import { Zap, ShieldAlert, Code2, ArrowUpRight } from 'lucide-react';

export const FunctionNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as GraphNodeData;
  const { functionData, impactLevel, impactScore } = nodeData;
  const { name, filePath, params, isExported, callers, callees, kind } = functionData;

  // Impact level visual styling
  let borderStyle = 'border-slate-700/80 bg-slate-900/90 text-slate-200';
  let badgeColor = 'bg-slate-800 text-slate-400 border-slate-700';
  let glowClass = '';

  if (impactLevel === 'focal') {
    borderStyle = 'border-rose-500 bg-rose-950/90 text-rose-100';
    badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    glowClass = 'glow-focal';
  } else if (impactLevel === 'direct') {
    borderStyle = 'border-amber-500 bg-amber-950/80 text-amber-100';
    badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    glowClass = 'glow-direct';
  } else if (impactLevel === 'indirect') {
    borderStyle = 'border-purple-500 bg-purple-950/80 text-purple-100';
    badgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    glowClass = 'glow-indirect';
  } else if (impactLevel === 'callee') {
    borderStyle = 'border-sky-500 bg-sky-950/80 text-sky-100';
    badgeColor = 'bg-sky-500/20 text-sky-300 border-sky-500/40';
    glowClass = 'glow-callee';
  }

  const shortFile = filePath.split('/').slice(-2).join('/');
  const isEdited = nodeData.isEdited;
  const riskDelta = nodeData.riskDelta;

  return (
    <div
      className={`relative group rounded-xl p-3.5 min-w-[240px] max-w-[320px] backdrop-blur-md transition-all duration-300 cursor-pointer border ${borderStyle} ${glowClass} ${
        isEdited ? 'ring-1 ring-emerald-400/80 shadow-lg shadow-emerald-500/10' : ''
      } ${
        selected ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950' : ''
      }`}
    >
      {/* Top Handle for incoming call edges */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-slate-900"
      />

      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 overflow-hidden">
          {impactLevel === 'focal' ? (
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
          ) : impactLevel === 'direct' ? (
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <Code2 className="w-4 h-4 text-sky-400 shrink-0" />
          )}
          <span className="font-mono text-sm font-bold truncate tracking-tight text-white">
            {name}()
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Live Edited Indicator */}
          {isEdited && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
              EDITED
            </span>
          )}

          {/* Risk Score Delta Pill */}
          {riskDelta !== undefined && riskDelta !== 0 && (
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                riskDelta > 0
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}
              title={`Risk Score changed by ${riskDelta > 0 ? '+' : ''}${riskDelta} points due to live edits`}
            >
              {riskDelta > 0 ? `+${riskDelta}` : riskDelta} Δ
            </span>
          )}

          {/* Export / Kind Badge */}
          {isExported && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              EXPORT
            </span>
          )}
        </div>
      </div>

      {/* File Path */}
      <div className="text-[11px] font-mono text-slate-400 truncate mb-2 flex items-center gap-1">
        <span>{shortFile}</span>
      </div>

      {/* Parameters */}
      <div className="flex flex-wrap gap-1 mb-2.5">
        {params.length > 0 ? (
          params.slice(0, 3).map((p, idx) => (
            <span
              key={idx}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50"
            >
              {p}
            </span>
          ))
        ) : (
          <span className="text-[10px] font-mono text-slate-500 italic">no args</span>
        )}
        {params.length > 3 && (
          <span className="text-[10px] font-mono px-1 rounded bg-slate-800 text-slate-400">
            +{params.length - 3}
          </span>
        )}
      </div>

      {/* Footer Metrics */}
      <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/80 text-slate-400">
        <div className="flex items-center gap-3">
          <span title="Callers (In-degree)" className="flex items-center gap-0.5 font-mono">
            <ArrowUpRight className="w-3 h-3 text-slate-400" />
            <strong className="text-slate-200">{callers?.length || 0}</strong> callers
          </span>
          <span title="Callees (Out-degree)" className="flex items-center gap-0.5 font-mono">
            <strong className="text-slate-200">{callees?.length || 0}</strong> calls
          </span>
        </div>

        {impactLevel !== 'unaffected' && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${badgeColor}`}
          >
            {impactLevel}
          </span>
        )}
      </div>

      {/* Bottom Handle for outgoing call edges */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-cyan-400 !w-3 !h-3 !border-2 !border-slate-900"
      />
    </div>
  );
});

FunctionNode.displayName = 'FunctionNode';
