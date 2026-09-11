import { GoogleGenAI } from '@google/genai';
import { BlastRadiusResult, AIExplanationResult, RiskLevel } from '@/types/impact';

export async function generateAIImpactExplanation(
  blastRadius: BlastRadiusResult,
  userApiKey?: string
): Promise<AIExplanationResult> {
  const apiKey = userApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  const fn = blastRadius.focalNode;
  const directCount = blastRadius.directCallerIds.length;
  const indirectCount = blastRadius.indirectCallerIds.length;
  const totalImpacted = blastRadius.totalImpactedCount;
  const filesCount = blastRadius.affectedFilePaths.length;
  const depth = blastRadius.maxCascadeDepth;

  const directCallersText = blastRadius.directCallerIds.join(', ') || 'None';
  const indirectCallersText = blastRadius.indirectCallerIds.join(', ') || 'None';
  const calleesText = blastRadius.calleeIds.join(', ') || 'None';
  const affectedFilesText = blastRadius.affectedFilePaths.join(', ');

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are a senior software architect analyzing code blast radius.
Target Function: "${fn.name}"
File Path: ${fn.filePath} (Lines ${fn.lineStart}-${fn.lineEnd})
Is Exported: ${fn.isExported}
Parameters: ${fn.params.join(', ') || 'None'}

--- SOURCE CODE ---
${fn.codeSnippet}

--- COMPUTED BLAST RADIUS METRICS ---
- Direct Callers Count: ${directCount} (${directCallersText})
- Transitive Indirect Callers Count: ${indirectCount} (${indirectCallersText})
- Total Impacted Caller Functions: ${totalImpacted}
- Internal Callees Count: ${blastRadius.calleeIds.length} (${calleesText})
- Affected Files Count: ${filesCount} (${affectedFilesText})
- Maximum Cascade Depth: ${depth}
- Heuristic Risk Score: ${blastRadius.impactScore}/100
- Severity Rating: ${blastRadius.riskLevel}

CRITICAL METRIC INSTRUCTIONS:
1. "functionPurpose": Accurately describe what "${fn.name}" in ${fn.filePath} (lines ${fn.lineStart}-${fn.lineEnd}) does based on its source code.
2. "blastRadiusSummary": Must use the EXACT metric numbers provided above. Use this format:
   "Modifying ${fn.name} impacts ${totalImpacted} caller functions, with ${directCount} direct callers and ${indirectCount} transitive callers. The current blast-radius analysis spans ${filesCount} affected file(s) and reaches a maximum depth of ${depth}."
3. "cascadeRisks": List 2-3 specific risks referencing callers [${directCallersText}].
4. "potentialBreakingChanges": List 2-3 risks regarding parameters [${fn.params.join(', ') || 'none'}].
5. "recommendedTests": List 2-3 targeted tests for ${fn.name} in ${fn.filePath}.
6. "riskRating": "${blastRadius.riskLevel}"

Return JSON matching this exact structure, with no markdown code blocks.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      const rawText = response.text || '';
      const cleanJsonText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJsonText);

      const defaultSummary = `Modifying ${fn.name} impacts ${totalImpacted} caller functions, with ${directCount} direct callers and ${indirectCount} transitive callers. The current blast-radius analysis spans ${filesCount} affected file(s) and reaches a maximum depth of ${depth}.`;

      return {
        functionPurpose: parsed.functionPurpose || `Function '${fn.name}' in ${fn.filePath} (lines ${fn.lineStart}-${fn.lineEnd}) executes core operations.`,
        blastRadiusSummary: parsed.blastRadiusSummary || defaultSummary,
        cascadeRisks: Array.isArray(parsed.cascadeRisks) ? parsed.cascadeRisks : [`Upstream regression in callers of ${fn.name}`],
        potentialBreakingChanges: Array.isArray(parsed.potentialBreakingChanges) ? parsed.potentialBreakingChanges : [`Changing parameter signature (${fn.params.join(', ') || 'none'})`],
        recommendedTests: Array.isArray(parsed.recommendedTests) ? parsed.recommendedTests : [`Run unit tests for '${fn.name}' in ${fn.filePath}`],
        riskRating: (parsed.riskRating as RiskLevel) || blastRadius.riskLevel,
      };
    } catch (err) {
      console.warn('Gemini API call failed, using intelligent fallback analysis:', err);
    }
  }

  return generateFallbackExplanation(blastRadius);
}

function generateFallbackExplanation(blastRadius: BlastRadiusResult): AIExplanationResult {
  const fn = blastRadius.focalNode;
  const directCount = blastRadius.directCallerIds.length;
  const indirectCount = blastRadius.indirectCallerIds.length;
  const totalImpacted = blastRadius.totalImpactedCount;
  const filesCount = blastRadius.affectedFilePaths.length;
  const depth = blastRadius.maxCascadeDepth;

  const callerNames = blastRadius.directCallerIds.slice(0, 3).map((c) => c.split('#').pop());
  const callerStr = callerNames.length > 0 ? callerNames.join(', ') : 'None';

  return {
    functionPurpose: `Function '${fn.name}' in ${fn.filePath} (lines ${fn.lineStart}-${fn.lineEnd}) receives (${fn.params.join(', ') || 'no parameters'}) and is ${fn.isExported ? 'an exported public module interface' : 'an internal helper'}.`,
    blastRadiusSummary: `Modifying ${fn.name} impacts ${totalImpacted} caller functions, with ${directCount} direct callers and ${indirectCount} transitive callers. The current blast-radius analysis spans ${filesCount} affected file(s) and reaches a maximum depth of ${depth}.`,
    cascadeRisks: [
      `Direct callers [${callerStr}] in ${fn.filePath} depend directly on return values of '${fn.name}'.`,
      `Type signature or parameter changes will cascade across ${filesCount} affected file(s).`,
      `Execution cascade reaches a maximum depth of ${depth} level(s).`,
    ],
    potentialBreakingChanges: [
      `Altering parameters [${fn.params.join(', ') || 'none'}] without default fallbacks.`,
      `Changing async Promise execution contracts.`,
      `Throwing unhandled exceptions that propagate up caller frames.`,
    ],
    recommendedTests: [
      `Run unit tests for '${fn.name}' in ${fn.filePath} (lines ${fn.lineStart}-${fn.lineEnd}).`,
      `Verify callers: [${callerStr}].`,
      `Run integration test suite for ${fn.filePath}.`,
    ],
    riskRating: blastRadius.riskLevel,
  };
}
