import time
import uuid
from typing import Dict, List
from fastapi import APIRouter, HTTPException
import networkx as nx
from app.models.schemas import RepoAnalyzeRequest, AnalysisResult, FunctionData, AnalysisWarning
from app.analyzer.downloader import (
    download_github_repo,
    cleanup_temp_dir,
    InvalidGitHubURLError,
    GitHubRateLimitError,
    GitHubAccessDeniedError,
    GitHubRepoNotFoundError,
    GitHubConnectionError,
    GitHubAPIUnavailableError,
)
from app.analyzer.parser import parse_code_file
from app.analyzer.graph import build_networkx_graph

router = APIRouter()

ANALYSIS_SESSIONS: Dict[str, Dict] = {}

@router.post("/repository/analyze", response_model=AnalysisResult)
def analyze_repository(req: RepoAnalyzeRequest):
    if not req.repo_url or not req.repo_url.strip():
        raise HTTPException(status_code=400, detail="Repository URL is required")

    start_time = time.time()
    temp_dir = None
    try:
        (
            temp_dir,
            repo_name,
            source_files,
            total_files,
            supported_count,
            unsupported_count
        ) = download_github_repo(req.repo_url, req.github_token)

        extracted_functions: List[FunctionData] = []
        extracted_classes: List[str] = []
        all_warnings: List[AnalysisWarning] = []

        for file_path, code in source_files.items():
            fns, cls_list, warnings = parse_code_file(file_path, code)
            extracted_functions.extend(fns)
            extracted_classes.extend(cls_list)
            all_warnings.extend(warnings)

        if not extracted_functions:
            raise HTTPException(
                status_code=400,
                detail=f"No functions could be extracted from JS/TS source files in repository '{repo_name}'."
            )

        G, function_map, nodes_list, edges_list, module_count = build_networkx_graph(
            repo_name, source_files, extracted_functions, extracted_classes
        )

        analysis_duration_ms = round((time.time() - start_time) * 1000, 2)
        analysis_id = str(uuid.uuid4())

        # Store session in memory
        ANALYSIS_SESSIONS[analysis_id] = {
            "analysis_id": analysis_id,
            "repo_name": repo_name,
            "graph": G,
            "function_map": function_map,
            "nodes": nodes_list,
            "edges": edges_list,
            "file_count": total_files,
            "supported_file_count": supported_count,
            "unsupported_file_count": unsupported_count,
            "function_count": len(function_map),
            "class_count": len(extracted_classes),
            "module_count": module_count,
            "relationship_count": len(edges_list),
            "analysis_duration_ms": analysis_duration_ms,
            "warnings": all_warnings,
        }

        return AnalysisResult(
            analysis_id=analysis_id,
            repo_name=repo_name,
            nodes=nodes_list,
            edges=edges_list,
            functions=function_map,
            file_count=total_files,
            supported_file_count=supported_count,
            unsupported_file_count=unsupported_count,
            function_count=len(function_map),
            class_count=len(extracted_classes),
            module_count=module_count,
            relationship_count=len(edges_list),
            analysis_duration_ms=analysis_duration_ms,
            warnings=all_warnings,
        )

    except InvalidGitHubURLError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except GitHubRepoNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except GitHubAccessDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except GitHubRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except GitHubConnectionError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except GitHubAPIUnavailableError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze repository: {str(e)}")
    finally:
        if temp_dir:
            cleanup_temp_dir(temp_dir)

@router.get("/analysis/{analysis_id}", response_model=AnalysisResult)
def get_analysis_by_id(analysis_id: str):
    session = ANALYSIS_SESSIONS.get(analysis_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Analysis session '{analysis_id}' not found.")

    return AnalysisResult(
        analysis_id=session["analysis_id"],
        repo_name=session["repo_name"],
        nodes=session["nodes"],
        edges=session["edges"],
        functions=session["function_map"],
        file_count=session["file_count"],
        supported_file_count=session["supported_file_count"],
        unsupported_file_count=session["unsupported_file_count"],
        function_count=session["function_count"],
        class_count=session["class_count"],
        module_count=session["module_count"],
        relationship_count=session["relationship_count"],
        analysis_duration_ms=session["analysis_duration_ms"],
        warnings=session["warnings"],
    )
