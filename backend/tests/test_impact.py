import pytest
from app.models.schemas import FunctionData
from app.blast_radius.engine import calculate_blast_radius_nx

def test_calculate_blast_radius_factors():
    functions = {
        "src/a.ts#fn_a": FunctionData(id="src/a.ts#fn_a", name="fn_a", filePath="src/a.ts", isExported=True, callers=["src/b.ts#fn_b"], callees=[]),
        "src/b.ts#fn_b": FunctionData(id="src/b.ts#fn_b", name="fn_b", filePath="src/b.ts", callers=["src/c.ts#fn_c"], callees=["src/a.ts#fn_a"]),
        "src/c.ts#fn_c": FunctionData(id="src/c.ts#fn_c", name="fn_c", filePath="src/c.ts", callers=[], callees=["src/b.ts#fn_b"]),
    }

    (
        focal,
        direct,
        indirect,
        callees,
        affected_files,
        affected_modules,
        total_impacted,
        max_depth,
        impact_score,
        severity,
        risk_factors
    ) = calculate_blast_radius_nx("src/a.ts#fn_a", functions)

    assert focal.id == "src/a.ts#fn_a"
    assert "src/b.ts#fn_b" in direct
    assert "src/c.ts#fn_c" in indirect
    assert total_impacted == 2
    assert max_depth == 2
    assert risk_factors.direct_callers_count == 1
    assert risk_factors.transitive_callers_count == 1
    assert risk_factors.is_exported is True
    assert severity in ["Low", "Medium", "High", "Critical"]
