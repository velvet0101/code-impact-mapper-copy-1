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
import { Search, SlidersHorizontal, Layers, RotateCcw, Eye, ShieldCheck, HelpCircle, Code2, Zap } from 'lucide-react';

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

  const nodeWidth = 270;
  const nodeHeight = 140;

  dagreGraph.setGraph({ rankdir: direction, ranksep: 90, nodesep: 60 });

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
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'confirmed'>('all');

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

          let strokeColor = '#475569';
          let strokeWidth = 1.5;
          let animated = false;

          if (isNewlyAdded) {
            strokeColor = '#10b981'; // distinct emerald for live added call edge
            strokeWidth = 3;
            animated = true;
          } else if (isDirectCaller) {
            strokeColor = '#f59e0b';
            strokeWidth = 3.5;
            animated = true;
          } else if (isFocalCallee) {
            strokeColor = '#0ea5e9';
            strokeWidth = 3;
            animated = true;
          } else if (isTransitive) {
            strokeColor = '#a855f7';
            strokeWidth = 2.5;
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
            labelStyle: isNewlyAdded ? { fill: '#34d399', fontWeight: 800, fontSize: 10 } : undefined,
            labelBgStyle: isNewlyAdded ? { fill: '#064e3b', fillOpacity: 0.9 } : undefined,
            labelBgPadding: isNewlyAdded ? [4, 2] : undefined,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: strokeColor,
              width: 16,
              height: 16,
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
    <div className="relative w-full h-full bg-[#090d16] flex flex-col overflow-hidden">
      {/* Top Floating Controls Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Search Bar */}
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-1.5 rounded-xl shadow-2xl pointer-events-auto min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 ml-2" />
          <input
            type="text"
            placeholder="Search function, file, or class..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full pr-2 font-mono"
          />
        </div>

        {/* Filter & Action Toggles */}
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-1 rounded-xl shadow-2xl pointer-events-auto">
          {/* Edit Code Button for Selected Node */}
          {selectedFunctionId && onOpenCodeEditor && (
            <button
              onClick={() => onOpenCodeEditor(selectedFunctionId)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all flex items-center gap-1.5 shadow-sm shadow-cyan-500/10"
              title="Open Live Code Editor for this file"
            >
              <Code2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Edit Code</span>
            </button>
          )}

          {/* Live Edited Indicator Badge */}
          {dirtyFiles && dirtyFiles.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>{dirtyFiles.length} file(s) live edited</span>
            </div>
          )}

          {/* Reset Impact View Button */}
          {selectedFunctionId && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition-all flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Impact View</span>
            </button>
          )}

          {/* Filter Mode Toggle */}
          <button
            onClick={() => setFilterMode(filterMode === 'all' ? 'blast' : 'all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
              filterMode === 'blast'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{filterMode === 'blast' ? 'Impact Radius Only' : 'All Nodes'}</span>
          </button>

          <div className="h-4 w-px bg-slate-800" />

          {/* Layout Orientation */}
          <button
            onClick={toggleLayout}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1.5 transition-all"
            title="Toggle Layout Orientation"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Layout: {layoutDir === 'TB' ? 'Top-Down' : 'Left-Right'}</span>
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
          <Background color="#1e293b" gap={24} size={1.5} />
          <Controls className="!bottom-4 !left-4" />
          <MiniMap
            nodeColor={(node) => {
              const data = node.data as unknown as GraphNodeData;
              if (data.impactLevel === 'focal') return '#f43f5e';
              if (data.impactLevel === 'direct') return '#f59e0b';
              if (data.impactLevel === 'indirect') return '#a855f7';
              if (data.impactLevel === 'callee') return '#0ea5e9';
              return '#334155';
            }}
            maskColor="rgba(9, 13, 22, 0.7)"
            className="!bottom-4 !right-4"
          />
        </ReactFlow>
        {Object.keys(codeData.functions).length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm p-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 shadow-xl">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-100 mb-1">No Repository Loaded</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
              Import a public GitHub repository to extract AST functions, map call graphs, and calculate blast radius.
            </p>
            {onOpenGitHubModal && (
              <button
                onClick={onOpenGitHubModal}
                className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20"
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
