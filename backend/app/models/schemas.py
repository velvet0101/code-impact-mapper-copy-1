from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field

class FunctionData(BaseModel):
    id: str
    name: str
    filePath: str
    lineStart: int = 1
    lineEnd: int = 1
    params: List[str] = Field(default_factory=list)
    isExported: bool = False
    isAsync: bool = False
    kind: str = "function"  # 'function', 'method', 'arrow'
    className: Optional[str] = None
    codeSnippet: str = ""
    callers: List[str] = Field(default_factory=list)
    callees: List[str] = Field(default_factory=list)

class GraphNode(BaseModel):
    id: str
    type: str  # 'repository', 'file', 'function', 'module', 'class'
    label: str
    data: Dict[str, Any] = Field(default_factory=dict)

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str  # 'calls', 'imports', 'exports', 'contains'
    confidence: str = "confirmed"  # 'confirmed' vs 'inferred'

class RepoAnalyzeRequest(BaseModel):
    repo_url: str
    github_token: Optional[str] = None

class AnalysisWarning(BaseModel):
    filePath: str
    message: str

class AnalysisResult(BaseModel):
    analysis_id: str
    repo_name: str
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    functions: Dict[str, FunctionData]
    file_count: int
    supported_file_count: int
    unsupported_file_count: int
    function_count: int
    class_count: int
    module_count: int
    relationship_count: int
    analysis_duration_ms: float
    warnings: List[AnalysisWarning] = Field(default_factory=list)
    file_contents: Optional[Dict[str, str]] = None

class ImpactAnalyzeRequest(BaseModel):
    analysis_id: Optional[str] = None
    target_function_id: str
    functions: Optional[Dict[str, FunctionData]] = None
    user_api_key: Optional[str] = None

class AIExplanation(BaseModel):
    functionPurpose: str
    blastRadiusSummary: str
    cascadeRisks: List[str]
    potentialBreakingChanges: List[str]
    recommendedTests: List[str]
    riskRating: str

class RiskFactors(BaseModel):
    direct_callers_count: int
    transitive_callers_count: int
    affected_files_count: int
    affected_functions_count: int
    affected_modules_count: int
    max_dependency_depth: int
    is_exported: bool

class ImpactAnalysisResponse(BaseModel):
    target_id: str
    focal_node: FunctionData
    direct_caller_ids: List[str]
    indirect_caller_ids: List[str]
    callee_ids: List[str]
    affected_file_paths: List[str]
    affected_module_names: List[str]
    total_impacted_count: int
    max_cascade_depth: int
    impact_score: int
    severity: str  # 'Low', 'Medium', 'High', 'Critical'
    disclaimer: str = "Heuristic risk score — not a production incident prediction."
    risk_factors: RiskFactors
    ai_explanation: AIExplanation
