import { ParsedFunction, BlastRadiusResult, ImpactLevel, RiskLevel } from '@/types/impact';

export function calculateBlastRadius(
  targetId: string,
  functions: Record<string, ParsedFunction>
): BlastRadiusResult {
  const focalNode = functions[targetId];

  if (!focalNode) {
    throw new Error(`Function ID not found in codebase: ${targetId}`);
  }

  const directCallerIds: string[] = [...(focalNode.callers || [])];
  const indirectCallerIdsSet = new Set<string>();
  const calleeIdsSet = new Set<string>(focalNode.callees || []);
  const affectedFilesSet = new Set<string>([focalNode.filePath]);

  // Track depth map for cascade depth calculation
  const depthMap = new Map<string, number>();
  depthMap.set(targetId, 0);

  // 1. Traverse Upstream Callers (Direct + Transitive Indirect Callers)
  const queue: Array<{ id: string; depth: number }> = directCallerIds.map((id) => ({ id, depth: 1 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (!depthMap.has(id)) {
      depthMap.set(id, depth);
    }

    const node = functions[id];
    if (node) {
      affectedFilesSet.add(node.filePath);

      if (depth > 1) {
        indirectCallerIdsSet.add(id);
      }

      // Add upstream callers of node to queue
      if (node.callers) {
        node.callers.forEach((callerId) => {
          if (callerId !== targetId && !depthMap.has(callerId)) {
            queue.push({ id: callerId, depth: depth + 1 });
          }
        });
      }
    }
  }

  // 2. Add files of callees to affected files
  calleeIdsSet.forEach((calleeId) => {
    const node = functions[calleeId];
    if (node) {
      affectedFilesSet.add(node.filePath);
    }
  });

  const indirectCallerIds = Array.from(indirectCallerIdsSet);
  const calleeIds = Array.from(calleeIdsSet);

  const totalImpactedCount = directCallerIds.length + indirectCallerIds.length;
  const totalRepoFunctions = Object.keys(functions).length || 1;

  // Max cascade depth
  let maxCascadeDepth = 0;
  depthMap.forEach((depth) => {
    if (depth > maxCascadeDepth) {
      maxCascadeDepth = depth;
    }
  });

  // Calculate Impact Score (0 to 100)
  const directWeight = 15;
  const indirectWeight = 8;
  const depthWeight = 10;
  const exportBonus = focalNode.isExported ? 15 : 0;

  const rawScore =
    directCallerIds.length * directWeight +
    indirectCallerIds.length * indirectWeight +
    maxCascadeDepth * depthWeight +
    exportBonus +
    (totalImpactedCount / totalRepoFunctions) * 30;

  const impactScore = Math.min(Math.round(rawScore), 100);

  // Determine Risk Level
  let riskLevel: RiskLevel = 'LOW';
  if (impactScore >= 75 || totalImpactedCount >= 7) {
    riskLevel = 'CRITICAL';
  } else if (impactScore >= 50 || totalImpactedCount >= 4) {
    riskLevel = 'HIGH';
  } else if (impactScore >= 20 || totalImpactedCount >= 1) {
    riskLevel = 'MEDIUM';
  }

  return {
    targetId,
    focalNode,
    directCallerIds,
    indirectCallerIds,
    calleeIds,
    affectedFilePaths: Array.from(affectedFilesSet),
    totalImpactedCount,
    maxCascadeDepth,
    impactScore,
    riskLevel,
  };
}

export function getNodeImpactLevel(
  nodeId: string,
  blastRadius: BlastRadiusResult | null
): { impactLevel: ImpactLevel; depth: number } {
  if (!blastRadius) {
    return { impactLevel: 'unaffected', depth: -1 };
  }

  if (nodeId === blastRadius.targetId) {
    return { impactLevel: 'focal', depth: 0 };
  }

  if (blastRadius.directCallerIds.includes(nodeId)) {
    return { impactLevel: 'direct', depth: 1 };
  }

  if (blastRadius.indirectCallerIds.includes(nodeId)) {
    return { impactLevel: 'indirect', depth: 2 };
  }

  if (blastRadius.calleeIds.includes(nodeId)) {
    return { impactLevel: 'callee', depth: 1 };
  }

  return { impactLevel: 'unaffected', depth: -1 };
}
