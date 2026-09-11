import pytest
from app.models.schemas import FunctionData
from app.ai.explainer import generate_ai_explanation

def test_ai_explanation_isolation_and_metric_consistency():
    """
    Verifies that AI explanations are strictly isolated between functions 
    and that all blast-radius metrics (direct callers, transitive callers, total impacted, 
    affected files count, and max depth) match the computed engine values for multiple functions.
    """
    # Function 1: isString in lib/index.js
    fn_a = FunctionData(
        id="lib/index.js#isString",
        name="isString",
        filePath="lib/index.js",
        lineStart=15,
        lineEnd=18,
        params=["s"],
        isExported=False,
        codeSnippet="function isString(s) { return typeof s === 'string' || s instanceof String; }"
    )

    direct_a = ["lib/index.js#isOriginAllowed", "lib/index.js#configureOrigin"]
    indirect_a = [f"lib/index.js#fn_transitive_{i}" for i in range(16)]
    files_a = ["lib/index.js"]
    depth_a = 5

    exp_a = generate_ai_explanation(
        focal_node=fn_a,
        direct_callers=direct_a,
        indirect_callers=indirect_a,
        callees=[],
        affected_files=files_a,
        max_depth=depth_a,
        impact_score=100,
        severity="Critical"
    )

    # Metric Consistency Checks for Function A (isString)
    assert "isString" in exp_a.blastRadiusSummary
    assert "18 caller functions" in exp_a.blastRadiusSummary
    assert "2 direct callers" in exp_a.blastRadiusSummary
    assert "16 transitive callers" in exp_a.blastRadiusSummary
    assert "1 affected file" in exp_a.blastRadiusSummary
    assert "maximum depth of 5" in exp_a.blastRadiusSummary
    assert "configureOrigin" not in exp_a.functionPurpose

    # Function 2: configureOrigin in lib/index.js
    fn_b = FunctionData(
        id="lib/index.js#configureOrigin",
        name="configureOrigin",
        filePath="lib/index.js",
        lineStart=36,
        lineEnd=66,
        params=["options", "req"],
        isExported=True,
        codeSnippet="function configureOrigin(options, req) { return options.origin; }"
    )

    direct_b = ["lib/index.js#corsMiddleware", "lib/index.js#optionsHandler", "lib/index.js#expressApp", "lib/index.js#routeGuard"]
    indirect_b = ["lib/index.js#mainServer", "lib/index.js#appInit"]
    files_b = ["lib/index.js", "src/server.ts", "src/routes.ts"]
    depth_b = 2

    exp_b = generate_ai_explanation(
        focal_node=fn_b,
        direct_callers=direct_b,
        indirect_callers=indirect_b,
        callees=[],
        affected_files=files_b,
        max_depth=depth_b,
        impact_score=60,
        severity="High"
    )

    # Metric Consistency Checks for Function B (configureOrigin)
    assert "configureOrigin" in exp_b.blastRadiusSummary
    assert "6 caller functions" in exp_b.blastRadiusSummary
    assert "4 direct callers" in exp_b.blastRadiusSummary
    assert "2 transitive callers" in exp_b.blastRadiusSummary
    assert "3 affected file" in exp_b.blastRadiusSummary
    assert "maximum depth of 2" in exp_b.blastRadiusSummary
    assert "isString" not in exp_b.functionPurpose
