from fastapi import APIRouter, HTTPException
from app.models.schemas import ImpactAnalyzeRequest, ImpactAnalysisResponse
from app.blast_radius.engine import calculate_blast_radius_nx
from app.ai.explainer import generate_ai_explanation
from app.api.repo import ANALYSIS_SESSIONS

router = APIRouter()

@router.post("/impact/analyze", response_model=ImpactAnalysisResponse)
def analyze_impact(req: ImpactAnalyzeRequest):
    function_map = None
    nx_graph = None

    if req.analysis_id and req.analysis_id in ANALYSIS_SESSIONS:
        session = ANALYSIS_SESSIONS[req.analysis_id]
        function_map = session["function_map"]
        nx_graph = session["graph"]
    elif req.functions:
        function_map = req.functions
    else:
        raise HTTPException(
            status_code=400,
            detail="Either valid 'analysis_id' or 'functions' map must be provided."
        )

    if req.target_function_id not in function_map:
        raise HTTPException(
            status_code=404,
            detail=f"Target function '{req.target_function_id}' not found in codebase analysis."
        )

    try:
        (
            focal_node,
            direct_callers,
            indirect_callers,
            callees,
            affected_files,
            affected_modules,
            total_impacted,
            max_depth,
            impact_score,
            severity,
            risk_factors
        ) = calculate_blast_radius_nx(req.target_function_id, function_map, nx_graph)

        ai_exp = generate_ai_explanation(
            focal_node=focal_node,
            direct_callers=direct_callers,
            indirect_callers=indirect_callers,
            callees=callees,
            affected_files=affected_files,
            max_depth=max_depth,
            impact_score=impact_score,
            severity=severity,
            user_api_key=req.user_api_key
        )

        return ImpactAnalysisResponse(
            target_id=req.target_function_id,
            focal_node=focal_node,
            direct_caller_ids=direct_callers,
            indirect_caller_ids=indirect_callers,
            callee_ids=callees,
            affected_file_paths=affected_files,
            affected_module_names=affected_modules,
            total_impacted_count=total_impacted,
            max_cascade_depth=max_depth,
            impact_score=impact_score,
            severity=severity,
            disclaimer="Heuristic risk score — not a production incident prediction.",
            risk_factors=risk_factors,
            ai_explanation=ai_exp
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Impact calculation error: {str(e)}")
