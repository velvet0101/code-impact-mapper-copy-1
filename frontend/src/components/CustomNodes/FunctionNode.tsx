import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GraphNodeData } from '@/types/impact';
import { Zap, ShieldAlert, Code2, ArrowUpRight, ArrowDownRight, Folder } from 'lucide-react';

export const FunctionNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as GraphNodeData;
  const { functionData, impactLevel, impactScore } = nodeData;
  const { name, filePath, params, isExported, callers, callees } = functionData;

  // Modern, refined color theme mapping
  let borderStyle = 'border-slate-800/90 bg-[#0c111e]/90 text-slate-300 hover:border-slate-700/80 shadow-lg shadow-black/40';
  let badgeColor = 'bg-slate-800/60 text-slate-400 border-slate-700/60';
  let glowClass = '';

  if (impactLevel === 'focal') {
    borderStyle = 'border-rose-500/80 bg-gradient-to-b from-rose-950/40 via-[#0d1322] to-[#0a0e19] text-rose-100 shadow-xl shadow-rose-950/30';
    badgeColor = 'bg-rose-500/15 text-rose-300 border-rose-500/35 shadow-sm shadow-rose-500/10';
    glowClass = 'glow-focal';
  } else if (impactLevel === 'direct') {
    borderStyle = 'border-amber-500/70 bg-gradient-to-b from-amber-950/35 via-[#0d1322] to-[#0a0e19] text-amber-100 shadow-xl shadow-amber-950/20';
    badgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/35 shadow-sm shadow-amber-500/10';
    glowClass = 'glow-direct';
  } else if (impactLevel === 'indirect') {
    borderStyle = 'border-purple-500/70 bg-gradient-to-b from-purple-950/35 via-[#0d1322] to-[#0a0e19] text-purple-100 shadow-xl shadow-purple-950/20';
    badgeColor = 'bg-purple-500/15 text-purple-300 border-purple-500/35 shadow-sm shadow-purple-500/10';
    glowClass = 'glow-indirect';
  } else if (impactLevel === 'callee') {
    borderStyle = 'border-sky-500/70 bg-gradient-to-b from-sky-950/35 via-[#0d1322] to-[#0a0e19] text-sky-100 shadow-xl shadow-sky-950/20';
    badgeColor = 'bg-sky-500/15 text-sky-300 border-sky-500/35 shadow-sm shadow-sky-500/10';
    glowClass = 'glow-callee';
  }

  const shortFile = filePath.split('/').slice(-2).join('/');
  const isEdited = nodeData.isEdited;
  const riskDelta = nodeData.riskDelta;

  return (
    <div
      className={`relative group rounded-2xl p-3.5 min-w-[250px] max-w-[320px] backdrop-blur-xl transition-all duration-300 cursor-pointer border ${borderStyle} ${glowClass} ${
        isEdited ? 'ring-1.5 ring-emerald-400/80 shadow-xl shadow-emerald-500/15' : ''
      } ${
        selected ? 'ring-2 ring-cyan-400/90 ring-offset-2 ring-offset-[#080b11] shadow-2xl shadow-cyan-500/20' : ''
      }`}
    >
      {/* Subtle top surface highlight reflection */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent rounded-t-2xl pointer-events-none" />

      {/* Top Handle for incoming call edges */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !rounded-full !bg-slate-300 hover:!bg-white !border-[2.5px] !border-[#080b11] transition-transform hover:!scale-125 shadow-sm"
      />

      {/* Header Row: Function Name, Icon & Status Badges */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <div className="p-1 rounded-lg bg-white/[0.04] border border-white/[0.06] shrink-0">
            {impactLevel === 'focal' ? (
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            ) : impactLevel === 'direct' ? (
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
            )}
          </div>
          <span className="font-mono text-[13px] font-bold truncate tracking-tight text-white group-hover:text-cyan-200 transition-colors">
            {name}()
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Live Edited Indicator */}
          {isEdited && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
              EDITED
            </span>
          )}

          {/* Risk Score Delta Pill */}
          {riskDelta !== undefined && riskDelta !== 0 && (
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${
                riskDelta > 0
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}
              title={`Risk Score changed by ${riskDelta > 0 ? '+' : ''}${riskDelta} points due to live edits`}
            >
              {riskDelta > 0 ? `+${riskDelta}` : riskDelta} Δ
            </span>
          )}

          {/* Export Badge */}
          {isExported && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
              EXPORT
            </span>
          )}
        </div>
      </div>

      {/* File Path Row */}
      <div className="text-[11px] font-mono text-slate-400/90 truncate mb-2.5 flex items-center gap-1.5">
        <Folder className="w-3 h-3 text-slate-500 shrink-0" />
        <span className="truncate">{shortFile}</span>
      </div>

      {/* Parameters Tag Cloud */}
      <div className="flex flex-wrap gap-1 mb-3">
        {params.length > 0 ? (
          params.slice(0, 3).map((p, idx) => (
            <span
              key={idx}
              className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-900/90 text-slate-300 border border-white/[0.08] shadow-sm truncate max-w-[120px]"
            >
              {p}
            </span>
          ))
        ) : (
          <span className="text-[10px] font-mono text-slate-500 italic">no args</span>
        )}
        {params.length > 3 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-900/90 text-slate-400 border border-white/[0.08]">
            +{params.length - 3}
          </span>
        )}
      </div>

      {/* Footer Metrics Row */}
      <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/80 text-slate-400">
        <div className="flex items-center gap-3">
          <span title="Callers (In-degree)" className="flex items-center gap-1 font-mono">
            <ArrowUpRight className="w-3 h-3 text-amber-400" />
            <strong className="text-slate-200 font-semibold">{callers?.length || 0}</strong> callers
          </span>
          <span title="Callees (Out-degree)" className="flex items-center gap-1 font-mono">
            <ArrowDownRight className="w-3 h-3 text-sky-400" />
            <strong className="text-slate-200 font-semibold">{callees?.length || 0}</strong> calls
          </span>
        </div>

        {impactLevel !== 'unaffected' && (
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${badgeColor}`}
          >
            {impactLevel}
          </span>
        )}
      </div>

      {/* Bottom Handle for outgoing call edges */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !rounded-full !bg-cyan-400 hover:!bg-cyan-300 !border-[2.5px] !border-[#080b11] transition-transform hover:!scale-125 shadow-sm"
      />
    </div>
  );
});

FunctionNode.displayName = 'FunctionNode';
