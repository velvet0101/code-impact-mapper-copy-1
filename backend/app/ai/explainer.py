import os
import json
from typing import Dict, Any, List
from app.models.schemas import FunctionData, AIExplanation

def generate_ai_explanation(
    focal_node: FunctionData,
    direct_callers: List[str],
    indirect_callers: List[str],
    callees: List[str],
    affected_files: List[str],
    max_depth: int,
    impact_score: int,
    severity: str,
    user_api_key: str = None
) -> AIExplanation:
    """
    Generates plain-language AI explanation of function purpose, blast radius, 
    cascading risks, potential breaking changes, and recommended safety tests.
    Uses Google GenAI SDK if key is available, or deterministic local fallback.
    All metric numbers in explanation are dynamically matched to actual computed values.
    """
    api_key = user_api_key or os.getenv("GEMINI_API_KEY")

    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)

            total_callers = len(direct_callers) + len(indirect_callers)
            direct_count = len(direct_callers)
            indirect_count = len(indirect_callers)
            files_count = len(affected_files)

            prompt = f"""You are a senior software architect analyzing code blast radius.
Target Function: "{focal_node.name}"
File Path: {focal_node.filePath} (Lines {focal_node.lineStart}-{focal_node.lineEnd})
Is Exported: {focal_node.isExported}
Parameters: {', '.join(focal_node.params) if focal_node.params else 'None'}

--- SOURCE CODE ---
{focal_node.codeSnippet}

--- COMPUTED BLAST RADIUS METRICS ---
- Direct Callers Count: {direct_count}
- Transitive Indirect Callers Count: {indirect_count}
- Total Impacted Caller Functions: {total_callers}
- Affected Files Count: {files_count}
- Maximum Cascade Depth: {max_depth}
- Heuristic Risk Score: {impact_score}/100
- Severity Rating: {severity}

CRITICAL METRIC INSTRUCTIONS:
1. "functionPurpose": Accurately describe what "{focal_node.name}" in {focal_node.filePath} (lines {focal_node.lineStart}-{focal_node.lineEnd}) does based on its source code.
2. "blastRadiusSummary": Must use the EXACT metric numbers provided above. Use this format:
   "Modifying {focal_node.name} impacts {total_callers} caller functions, with {direct_count} direct callers and {indirect_count} transitive callers. The current blast-radius analysis spans {files_count} affected file(s) and reaches a maximum depth of {max_depth}."
3. "cascadeRisks": List 2-3 specific risks referencing callers [{', '.join(direct_callers[:3]) if direct_callers else 'None'}].
4. "potentialBreakingChanges": List 2-3 risks regarding parameters [{', '.join(focal_node.params) if focal_node.params else 'none'}].
5. "recommendedTests": List 2-3 targeted tests for {focal_node.name} in {focal_node.filePath}.
6. "riskRating": "{severity}"

Return JSON matching this exact structure, with no markdown code blocks.
"""

            response = client.models.generate_content(
                model='gemini-2.0-flash',
                contents=prompt
            )

            raw_text = response.text or ""
            clean_json = raw_text.replace("```json", "").replace("```", "").strip()
            data = json.loads(clean_json)

            default_summary = (
                f"Modifying {focal_node.name} impacts {total_callers} caller functions, with {direct_count} direct callers and {indirect_count} transitive callers. "
                f"The current blast-radius analysis spans {files_count} affected file(s) and reaches a maximum depth of {max_depth}."
            )

            return AIExplanation(
                functionPurpose=data.get("functionPurpose", f"Function '{focal_node.name}' in {focal_node.filePath} (lines {focal_node.lineStart}-{focal_node.lineEnd}) executes core operations."),
                blastRadiusSummary=data.get("blastRadiusSummary", default_summary),
                cascadeRisks=data.get("cascadeRisks", [f"Upstream regression in callers of {focal_node.name}"]),
                potentialBreakingChanges=data.get("potentialBreakingChanges", [f"Changing parameter signature ({', '.join(focal_node.params) if focal_node.params else 'none'})"]),
                recommendedTests=data.get("recommendedTests", [f"Run unit tests for '{focal_node.name}' in {focal_node.filePath}"]),
                riskRating=data.get("riskRating", severity)
            )

        except Exception as e:
            print(f"Gemini API call failed, falling back to local deterministic explanation: {e}")

    return generate_deterministic_fallback(
        focal_node, direct_callers, indirect_callers, callees, affected_files, max_depth, severity
    )

def generate_deterministic_fallback(
    focal_node: FunctionData,
    direct_callers: List[str],
    indirect_callers: List[str],
    callees: List[str],
    affected_files: List[str],
    max_depth: int,
    severity: str
) -> AIExplanation:
    direct_count = len(direct_callers)
    indirect_count = len(indirect_callers)
    total_callers = direct_count + indirect_count
    files_count = len(affected_files)

    purpose = f"Function '{focal_node.name}' in {focal_node.filePath} (lines {focal_node.lineStart}-{focal_node.lineEnd}) receives ({', '.join(focal_node.params) if focal_node.params else 'no parameters'}) and is {'an exported public module interface' if focal_node.isExported else 'an internal helper'}."

    summary = (
        f"Modifying {focal_node.name} impacts {total_callers} caller functions, with {direct_count} direct callers and {indirect_count} transitive callers. "
        f"The current blast-radius analysis spans {files_count} affected file(s) and reaches a maximum depth of {max_depth}."
    )

    caller_names = [c.split('#')[-1] for c in direct_callers[:3]]
    caller_str = ', '.join(caller_names) if caller_names else 'None'

    cascade_risks = [
        f"Direct callers [{caller_str}] in {focal_node.filePath} depend directly on return values of '{focal_node.name}'.",
        f"Type signature or parameter changes will cascade across {files_count} affected file(s).",
        f"Execution cascade reaches a maximum depth of {max_depth} level(s)."
    ]

    breaking_changes = [
        f"Altering parameters [{', '.join(focal_node.params) if focal_node.params else 'none'}] without default fallbacks.",
        "Changing async Promise execution contracts.",
        "Throwing unhandled exceptions that propagate up caller frames."
    ]

    tests = [
        f"Run unit tests for '{focal_node.name}' in {focal_node.filePath} (lines {focal_node.lineStart}-{focal_node.lineEnd}).",
        f"Verify callers: [{caller_str}].",
        f"Run integration test suite for {focal_node.filePath}."
    ]

    return AIExplanation(
        functionPurpose=purpose,
        blastRadiusSummary=summary,
        cascadeRisks=cascade_risks,
        potentialBreakingChanges=breaking_changes,
        recommendedTests=tests,
        riskRating=severity
    )
