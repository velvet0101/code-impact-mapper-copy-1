import { parseSourceFile } from './jsParser';
import { calculateBlastRadius } from './blastRadius';
import {
  ParsedFunction,
  ParsedFile,
  BlastRadiusResult,
  GraphDiffMetadata,
} from '@/types/impact';

export interface PatchResult {
  success: boolean;
  error?: string;
  updatedFunctions: Record<string, ParsedFunction>;
  diffMetadata: GraphDiffMetadata;
  updatedBlastRadius: BlastRadiusResult | null;
  affectedFunctionIds: string[];
}

/**
 * Parses only the modified file, diffs against existing state,
 * and incrementally patches the graph and caller/callee connections.
 */
export function patchIncrementalFile(
  filePath: string,
  newCode: string,
  currentFunctions: Record<string, ParsedFunction>,
  baselineFunctions: Record<string, ParsedFunction>,
  selectedFunctionId: string | null,
  dirtyFilePaths: Set<string>
): PatchResult {
  let parsedFile: ParsedFile;
  try {
    parsedFile = parseSourceFile(filePath, newCode);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'AST Parsing Error';
    return {
      success: false,
      error: msg,
      updatedFunctions: currentFunctions,
      diffMetadata: {
        dirtyFiles: Array.from(dirtyFilePaths),
        addedFunctionIds: [],
        removedFunctionIds: [],
        addedEdgeIds: [],
        removedEdgeIds: [],
        riskDeltaMap: {},
      },
      updatedBlastRadius: selectedFunctionId && currentFunctions[selectedFunctionId]
        ? calculateBlastRadius(selectedFunctionId, currentFunctions)
        : null,
      affectedFunctionIds: [],
    };
  }

  // Clone current functions map for immutable state update
  const patchedFunctions: Record<string, ParsedFunction> = {};
  for (const [id, fn] of Object.entries(currentFunctions)) {
    patchedFunctions[id] = {
      ...fn,
      params: [...(fn.params || [])],
      callers: [...(fn.callers || [])],
      callees: [...(fn.callees || [])],
    };
  }

  // Identify old functions belonging to this file
  const oldFileFns: Record<string, ParsedFunction> = {};
  for (const [id, fn] of Object.entries(patchedFunctions)) {
    if (fn.filePath === filePath) {
      oldFileFns[id] = fn;
    }
  }

  // Map new parsed functions by id
  const newFileFns: Record<string, ParsedFunction> = {};
  for (const fn of parsedFile.functions) {
    newFileFns[fn.id] = fn;
  }

  const addedFnIds = Object.keys(newFileFns).filter((id) => !oldFileFns[id]);
  const removedFnIds = Object.keys(oldFileFns).filter((id) => !newFileFns[id]);
  const retainedFnIds = Object.keys(newFileFns).filter((id) => oldFileFns[id]);

  const affectedFnIds = new Set<string>([...addedFnIds, ...removedFnIds, ...retainedFnIds]);

  // 1. Remove deleted functions and unlink their connections
  for (const removedId of removedFnIds) {
    const oldFn = oldFileFns[removedId];
    if (oldFn) {
      // Unlink callers from its callees
      for (const calleeId of oldFn.callees || []) {
        const target = patchedFunctions[calleeId];
        if (target && target.callers) {
          target.callers = target.callers.filter((c) => c !== removedId);
          affectedFnIds.add(calleeId);
        }
      }

      // Unlink callees from its callers
      for (const callerId of oldFn.callers || []) {
        const caller = patchedFunctions[callerId];
        if (caller && caller.callees) {
          caller.callees = caller.callees.filter((c) => c !== removedId);
          affectedFnIds.add(callerId);
        }
      }
    }
    delete patchedFunctions[removedId];
  }

  // Build a symbol-name to candidate ID map across current graph
  const nameToIdMap: Record<string, string[]> = {};
  for (const fn of Object.values(patchedFunctions)) {
    if (!nameToIdMap[fn.name]) {
      nameToIdMap[fn.name] = [];
    }
    nameToIdMap[fn.name].push(fn.id);
  }
  for (const fn of Object.values(newFileFns)) {
    if (!nameToIdMap[fn.name]) {
      nameToIdMap[fn.name] = [];
    }
    if (!nameToIdMap[fn.name].includes(fn.id)) {
      nameToIdMap[fn.name].push(fn.id);
    }
  }

  const resolveCalleeId = (rawCallee: string, currentFilePath: string): string | null => {
    const candidates = nameToIdMap[rawCallee];
    if (!candidates || candidates.length === 0) return null;
    const sameFile = candidates.find((c) => c.startsWith(currentFilePath));
    return sameFile || candidates[0];
  };

  // 2. Add new functions
  for (const addedId of addedFnIds) {
    const newFn = newFileFns[addedId];
    const resolvedCallees: string[] = [];

    for (const rawCallee of newFn.callees || []) {
      const targetId = resolveCalleeId(rawCallee, filePath);
      if (targetId && targetId !== addedId && !resolvedCallees.includes(targetId)) {
        resolvedCallees.push(targetId);
      }
    }

    patchedFunctions[addedId] = {
      ...newFn,
      callers: [],
      callees: resolvedCallees,
    };

    // Link this new function to its callees' callers list
    for (const calleeId of resolvedCallees) {
      const callee = patchedFunctions[calleeId];
      if (callee) {
        if (!callee.callers.includes(addedId)) {
          callee.callers.push(addedId);
        }
        affectedFnIds.add(calleeId);
      }
    }
  }

  // 3. Update retained functions and adjust call edges incrementally
  for (const retainedId of retainedFnIds) {
    const oldFn = oldFileFns[retainedId];
    const newFn = newFileFns[retainedId];

    const oldCallees = oldFn.callees || [];
    const newResolvedCallees: string[] = [];

    for (const rawCallee of newFn.callees || []) {
      const targetId = resolveCalleeId(rawCallee, filePath);
      if (targetId && targetId !== retainedId && !newResolvedCallees.includes(targetId)) {
        newResolvedCallees.push(targetId);
      }
    }

    // Call edges removed
    const removedCallees = oldCallees.filter((c) => !newResolvedCallees.includes(c));
    for (const calleeId of removedCallees) {
      const callee = patchedFunctions[calleeId];
      if (callee) {
        callee.callers = callee.callers.filter((c) => c !== retainedId);
        affectedFnIds.add(calleeId);
      }
    }

    // Call edges added
    const addedCallees = newResolvedCallees.filter((c) => !oldCallees.includes(c));
    for (const calleeId of addedCallees) {
      const callee = patchedFunctions[calleeId];
      if (callee) {
        if (!callee.callers.includes(retainedId)) {
          callee.callers.push(retainedId);
        }
        affectedFnIds.add(calleeId);
      }
    }

    // Update function definition attributes
    patchedFunctions[retainedId] = {
      ...oldFn,
      name: newFn.name,
      lineStart: newFn.lineStart,
      lineEnd: newFn.lineEnd,
      params: newFn.params,
      isExported: newFn.isExported,
      isAsync: newFn.isAsync,
      kind: newFn.kind,
      codeSnippet: newFn.codeSnippet,
      callees: newResolvedCallees,
    };
  }

  // 4. Compute Diff Metadata against pristine Baseline Functions
  const currentEdgeSet = new Set<string>();
  for (const fn of Object.values(patchedFunctions)) {
    for (const calleeId of fn.callees || []) {
      if (patchedFunctions[calleeId]) {
        currentEdgeSet.add(`e-${fn.id}->${calleeId}`);
      }
    }
  }

  const baselineEdgeSet = new Set<string>();
  for (const fn of Object.values(baselineFunctions)) {
    for (const calleeId of fn.callees || []) {
      if (baselineFunctions[calleeId]) {
        baselineEdgeSet.add(`e-${fn.id}->${calleeId}`);
      }
    }
  }

  const addedEdgeIds: string[] = [];
  currentEdgeSet.forEach((edgeId) => {
    if (!baselineEdgeSet.has(edgeId)) {
      addedEdgeIds.push(edgeId);
    }
  });

  const removedEdgeIds: string[] = [];
  baselineEdgeSet.forEach((edgeId) => {
    if (!currentEdgeSet.has(edgeId)) {
      removedEdgeIds.push(edgeId);
    }
  });

  // Calculate Risk Deltas for affected functions
  const riskDeltaMap: Record<string, number> = {};
  for (const fnId of affectedFnIds) {
    if (patchedFunctions[fnId] && baselineFunctions[fnId]) {
      try {
        const liveBlast = calculateBlastRadius(fnId, patchedFunctions);
        const baseBlast = calculateBlastRadius(fnId, baselineFunctions);
        const delta = liveBlast.impactScore - baseBlast.impactScore;
        if (delta !== 0) {
          riskDeltaMap[fnId] = delta;
        }
      } catch {
        // Continue
      }
    }
  }

  // Recompute blast radius for current selected function
  let updatedBlastRadius: BlastRadiusResult | null = null;
  const effectiveSelectedId =
    selectedFunctionId && patchedFunctions[selectedFunctionId]
      ? selectedFunctionId
      : addedFnIds[0] || Object.keys(patchedFunctions)[0] || null;

  if (effectiveSelectedId && patchedFunctions[effectiveSelectedId]) {
    try {
      updatedBlastRadius = calculateBlastRadius(effectiveSelectedId, patchedFunctions);
    } catch {
      updatedBlastRadius = null;
    }
  }

  const updatedDirtyFiles = new Set(dirtyFilePaths);
  updatedDirtyFiles.add(filePath);

  return {
    success: true,
    updatedFunctions: patchedFunctions,
    diffMetadata: {
      dirtyFiles: Array.from(updatedDirtyFiles),
      addedFunctionIds: addedFnIds,
      removedFunctionIds: removedFnIds,
      addedEdgeIds,
      removedEdgeIds,
      riskDeltaMap,
    },
    updatedBlastRadius,
    affectedFunctionIds: Array.from(affectedFnIds),
  };
}
