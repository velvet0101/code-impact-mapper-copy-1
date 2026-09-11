'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
  Position,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { CodeImpactData, BlastRadiusResult, GraphNodeData, GraphDiffMetadata } from '@/types/impact';
import { FunctionNode } from './CustomNodes/FunctionNode';
import { getNodeImpactLevel } from '@/lib/ast/blastRadius';
import { Search, SlidersHorizontal, Layers, RotateCcw, Code2, Zap, Sparkles } from 'lucide-react';

const nodeTypes = {
  functionNode: FunctionNode,
};

interface GraphViewProps {
  codeData: CodeImpactData;
  selectedFunctionId: string | null;
  blastRadius: BlastRadiusResult | null;
  onSelectNode: (functionId: string) => void;
  onResetImpactView: () => void;
  onOpenGitHubModal?: () => void;
  onOpenCodeEditor?: (functionId: string) => void;
  diffMetadata?: GraphDiffMetadata;
  dirtyFiles?: string[];
}

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 280;
  const nodeHeight = 150;

  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 70 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: direction === 'TB' ? Position.Top : Position.Left,
      sourcePosition: direction === 'TB' ? Position.Bottom : Position.Right,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const GraphCanvasContent: React.FC<GraphViewProps> = ({
  codeData,
  selectedFunctionId,
  blastRadius,
  onSelectNode,
  onResetImpactView,
  onOpenGitHubModal,
  onOpenCodeEditor,
  diffMetadata,
  dirtyFiles,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'blast'>('all');
  const [layoutDir, setLayoutDir] = useState<'TB' | 'LR'>('TB');

  const { fitView } = useReactFlow();

  // Build React Flow nodes & edges
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const rawNodes: Node[] = [];
    const rawEdges: Edge[] = [];

    const fnKeys = Object.keys(codeData.functions);

    fnKeys.forEach((fnId) => {
      const fn = codeData.functions[fnId];
      const { impactLevel, depth } = getNodeImpactLevel(fnId, blastRadius);

      const isEdited = dirtyFiles?.includes(fn.filePath);
      const riskDelta = diffMetadata?.riskDeltaMap?.[fnId];

      const nodeData: GraphNodeData = {
        label: fn.name,
        functionData: fn,
        impactLevel,
        impactScore: blastRadius?.impactScore || 0,
        depth,
        isEdited,
        riskDelta,
      };

      rawNodes.push({
        id: fnId,
        type: 'functionNode',
        data: nodeData as unknown as Record<string, unknown>,
        position: { x: 0, y: 0 },
      });

      fn.callees.forEach((calleeId) => {
        if (codeData.functions[calleeId]) {
          const edgeId = `e-${fnId}->${calleeId}`;
          const isNewlyAdded = diffMetadata?.addedEdgeIds?.includes(edgeId);
          const isDirectCaller = blastRadius?.directCallerIds.includes(fnId) && calleeId === selectedFunctionId;
          const isFocalCallee = fnId === selectedFunctionId && blastRadius?.calleeIds.includes(calleeId);
          const isTransitive = blastRadius?.indirectCallerIds.includes(fnId);

          let strokeColor = 'rgba(148, 163, 184, 0.22)';
          let strokeWidth = 1.5;
          let animated = false;

          if (isNewlyAdded) {
            strokeColor = '#10b981'; // distinct emerald for live added call edge
            strokeWidth = 2.5;
            animated = true;
          } else if (isDirectCaller) {
            strokeColor = '#f59e0b';
            strokeWidth = 2.5;
            animated = true;
          } else if (isFocalCallee) {
            strokeColor = '#0ea5e9';
            strokeWidth = 2.2;
            animated = true;
          } else if (isTransitive) {
            strokeColor = '#a855f7';
            strokeWidth = 2;
            animated = true;
          }

          rawEdges.push({
            id: edgeId,
            source: fnId,
            target: calleeId,
            animated,
            style: {
              stroke: strokeColor,
              strokeWidth,
              strokeDasharray: isNewlyAdded ? '6 4' : undefined,
            },
            label: isNewlyAdded ? 'NEW CALL' : undefined,
            labelStyle: isNewlyAdded
              ? { fill: '#34d399', fontWeight: 800, fontSize: 9, fontFamily: 'var(--font-geist-mono)' }
              : undefined,
            labelBgStyle: isNewlyAdded
              ? { fill: '#042f2e', fillOpacity: 0.95, rx: 6, ry: 6 }
              : undefined,
            labelBgPadding: isNewlyAdded ? [6, 3] : undefined,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: strokeColor,
              width: 14,
              height: 14,
            },
          });
        }
      });
    });

    return getLayoutedElements(rawNodes, rawEdges, layoutDir);
  }, [codeData, blastRadius, selectedFunctionId, layoutDir, diffMetadata, dirtyFiles]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    const layouted = getLayoutedElements(initialNodes, initialEdges, layoutDir);
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [initialNodes, initialEdges, layoutDir, setNodes, setEdges]);

  // Filter nodes based on search & filter mode
  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      const data = node.data as unknown as GraphNodeData;
      const fn = data.functionData;

      const matchesSearch =
        fn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fn.filePath.toLowerCase().includes(searchQuery.toLowerCase());

      if (filterMode === 'blast') {
        return matchesSearch && data.impactLevel !== 'unaffected';
      }

      return matchesSearch;
    });
  }, [nodes, searchQuery, filterMode]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  const toggleLayout = () => {
    setLayoutDir((prev) => (prev === 'TB' ? 'LR' : 'TB'));
  };

  const handleReset = () => {
    onResetImpactView();
    setSearchQuery('');
    setFilterMode('all');
    setTimeout(() => fitView({ duration: 500 }), 50);
  };

  return (
    <div className="relative w-full h-full bg-[#080b11] flex flex-col overflow-hidden">
      {/* Top Floating Controls Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Search Bar */}
        <div className="flex items-center gap-2.5 bg-[#0d1322]/85 backdrop-blur-2xl border border-white/[0.08] p-1.5 px-3 rounded-2xl shadow-2xl pointer-events-auto min-w-[280px] max-w-sm transition-all focus-within:border-cyan-500/50 focus-within:ring-2 focus-within:ring-cyan-500/15">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search functions, classes, files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full font-mono tracking-tight"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-[10px] font-mono text-slate-500 hover:text-white px-1"
            >
              ESC
            </button>
          )}
        </div>

        {/* Action Toggles & Context Bar */}
        <div className="flex items-center gap-2 bg-[#0d1322]/85 backdrop-blur-2xl border border-white/[0.08] p-1.5 rounded-2xl shadow-2xl pointer-events-auto">
          {/* Primary Action: Edit Code Button when function is selected */}
          {selectedFunctionId && onOpenCodeEditor && (
            <button
              onClick={() => onOpenCodeEditor(selectedFunctionId)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-all flex items-center gap-1.5 shadow-lg shadow-cyan-400/20 active:scale-95"
              title="Open In-App Code Editor for this file"
            >
              <Code2 className="w-3.5 h-3.5 text-slate-950 stroke-[2.5]" />
              <span>Edit Code</span>
            </button>
          )}

          {/* Live Edited Indicator Badge */}
          {dirtyFiles && dirtyFiles.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
              <Zap className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>{dirtyFiles.length} edited</span>
            </div>
          )}

          {/* Reset Impact View Button */}
          {selectedFunctionId && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Selection</span>
            </button>
          )}

          {/* Filter Mode Toggle */}
          <button
            onClick={() => setFilterMode(filterMode === 'all' ? 'blast' : 'all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
              filterMode === 'blast'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{filterMode === 'blast' ? 'Blast Radius Only' : 'All Nodes'}</span>
          </button>

          <div className="h-4 w-px bg-white/[0.08]" />

          {/* Layout Orientation Toggle */}
          <button
            onClick={toggleLayout}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] flex items-center gap-1.5 transition-all"
            title="Toggle Graph Layout Orientation"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>{layoutDir === 'TB' ? 'Top-Down' : 'Left-Right'}</span>
          </button>
        </div>
      </div>

      {/* Main React Flow Canvas */}
      <div className="flex-1 w-full h-full">
        <ReactFlow
          nodes={filteredNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.8}
          defaultEdgeOptions={{ type: 'smoothstep' }}
        >
          <Background color="#161f33" gap={28} size={1} />
          <Controls className="!bottom-4 !left-4" />
          <MiniMap
            nodeColor={(node) => {
              const data = node.data as unknown as GraphNodeData;
              if (data.impactLevel === 'focal') return '#f43f5e';
              if (data.impactLevel === 'direct') return '#f59e0b';
              if (data.impactLevel === 'indirect') return '#a855f7';
              if (data.impactLevel === 'callee') return '#0ea5e9';
              return '#1e293b';
            }}
            maskColor="rgba(8, 11, 17, 0.75)"
            className="!bottom-4 !right-4"
          />
        </ReactFlow>

        {Object.keys(codeData.functions).length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#080b11]/90 backdrop-blur-md p-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-cyan-500/20 via-purple-500/10 to-transparent border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-5 shadow-2xl shadow-cyan-500/10">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-100 mb-1.5 tracking-tight">No Repository Loaded</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed font-sans">
              Import a public GitHub repository to extract AST functions, map call graphs, and calculate blast radius.
            </p>
            {onOpenGitHubModal && (
              <button
                onClick={onOpenGitHubModal}
                className="px-5 py-2.5 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs transition-all flex items-center gap-2 shadow-xl shadow-cyan-400/20 active:scale-95"
              >
                <span>Import GitHub Repository</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const GraphView: React.FC<GraphViewProps> = (props) => (
  <ReactFlowProvider>
    <GraphCanvasContent {...props} />
  </ReactFlowProvider>
);
