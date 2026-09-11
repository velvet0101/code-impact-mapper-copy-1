import pytest
from app.analyzer.parser import parse_code_file
from app.analyzer.graph import build_networkx_graph
from app.blast_radius.engine import calculate_blast_radius_nx

def test_full_repository_analysis_pipeline():
    """
    Integration test verifying complete AST parsing, cross-file import resolution, 
    NetworkX graph construction, and blast radius calculation for a multi-file repository.
    """
    sample_repo_files = {
        "src/api/auth.ts": """
        import { verifyToken } from '../services/tokenService';
        export async function handleAuth(req: any) {
            const token = req.headers.authorization;
            return await verifyToken(token);
        }
        """,
        "src/services/tokenService.ts": """
        import { logAudit } from '../utils/logger';
        export async function verifyToken(token: string) {
            await logAudit('TOKEN_VERIFIED');
            return { valid: true, userId: 'usr_100' };
        }
        """,
        "src/utils/logger.ts": """
        export async function logAudit(event: string) {
            console.log("Audit log:", event);
        }
        """
    }

    # 1. Parse files
    extracted_functions = []
    extracted_classes = []
    for file_path, code in sample_repo_files.items():
        fns, cls_list, warnings = parse_code_file(file_path, code)
        extracted_functions.extend(fns)
        extracted_classes.extend(cls_list)

    assert len(extracted_functions) >= 3

    # 2. Build NetworkX Graph
    G, fn_map, nodes, edges, modules = build_networkx_graph(
        "test/auth-repo", sample_repo_files, extracted_functions, extracted_classes
    )

    assert len(nodes) > 0
    assert len(edges) > 0
    assert "src/utils/logger.ts#logAudit" in fn_map

    # 3. Calculate Blast Radius when logAudit is modified
    (
        focal,
        direct,
        indirect,
        callees,
        affected_files,
        affected_modules,
        total_impacted,
        max_depth,
        score,
        severity,
        risk_factors
    ) = calculate_blast_radius_nx("src/utils/logger.ts#logAudit", fn_map, G)

    assert focal.name == "logAudit"
    assert "src/services/tokenService.ts#verifyToken" in direct
    assert "src/api/auth.ts#handleAuth" in indirect
    assert total_impacted == 2
    assert max_depth == 2
    assert len(affected_files) == 3
    assert risk_factors.affected_files_count == 3
