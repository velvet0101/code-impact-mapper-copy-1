import networkx as nx
from typing import Dict, List, Set, Tuple
from app.models.schemas import FunctionData, RiskFactors

def calculate_blast_radius_nx(
    target_id: str,
    function_map: Dict[str, FunctionData],
    nx_graph: nx.DiGraph = None
) -> Tuple[FunctionData, List[str], List[str], List[str], List[str], List[str], int, int, int, str, RiskFactors]:
    """
    Computes blast radius, caller trees, cascade depth, risk factor breakdowns, 
    and deterministic heuristic risk score.
    """
    focal_node = function_map.get(target_id)
    if not focal_node:
        raise ValueError(f"Target function '{target_id}' not found in codebase.")

    direct_caller_ids: List[str] = list(focal_node.callers or [])
    indirect_caller_ids_set: Set[str] = set()
    callee_ids: List[str] = list(focal_node.callees or [])
    affected_files_set: Set[str] = {focal_node.filePath}
    affected_modules_set: Set[str] = set()

    depth_map: Dict[str, int] = {target_id: 0}

    # BFS NetworkX predecessor call graph traversal
    if nx_graph is not None:
        call_subgraph = nx.DiGraph([(u, v) for u, v, d in nx_graph.edges(data=True) if d.get('type') == 'calls'])
        
        if target_id in call_subgraph:
            rev_graph = call_subgraph.reverse()
            lengths = nx.single_source_shortest_path_length(rev_graph, target_id)

            for node_id, depth in lengths.items():
                if node_id == target_id:
                    continue
                depth_map[node_id] = depth
                if node_id in function_map:
                    fn = function_map[node_id]
                    affected_files_set.add(fn.filePath)
                    if '/' in fn.filePath:
                        affected_modules_set.add(fn.filePath.split('/')[0])

                    if depth == 1 and node_id not in direct_caller_ids:
                        direct_caller_ids.append(node_id)
                    elif depth > 1:
                        indirect_caller_ids_set.add(node_id)
    else:
        # Queue traversal fallback
        queue: List[Tuple[str, int]] = [(cid, 1) for cid in direct_caller_ids]
        visited = set(direct_caller_ids)

        while queue:
            curr_id, depth = queue.pop(0)
            depth_map[curr_id] = depth
            if curr_id in function_map:
                fn = function_map[curr_id]
                affected_files_set.add(fn.filePath)
                if '/' in fn.filePath:
                    affected_modules_set.add(fn.filePath.split('/')[0])

                if depth > 1:
                    indirect_caller_ids_set.add(curr_id)

                for parent_id in fn.callers:
                    if parent_id != target_id and parent_id not in visited:
                        visited.add(parent_id)
                        queue.append((parent_id, depth + 1))

    for cid in callee_ids:
        if cid in function_map:
            fn = function_map[cid]
            affected_files_set.add(fn.filePath)
            if '/' in fn.filePath:
                affected_modules_set.add(fn.filePath.split('/')[0])

    indirect_caller_ids = list(indirect_caller_ids_set)
    total_impacted = len(direct_caller_ids) + len(indirect_caller_ids)
    max_depth = max(depth_map.values()) if depth_map else 0

    # Risk Factor Breakdown
    risk_factors = RiskFactors(
        direct_callers_count=len(direct_caller_ids),
        transitive_callers_count=len(indirect_caller_ids),
        affected_files_count=len(affected_files_set),
        affected_functions_count=total_impacted,
        affected_modules_count=len(affected_modules_set),
        max_dependency_depth=max_depth,
        is_exported=focal_node.isExported
    )

    # Deterministic Heuristic Risk Score (0 to 100)
    direct_weight = 15
    indirect_weight = 8
    depth_weight = 10
    export_bonus = 15 if focal_node.isExported else 0
    total_fns = len(function_map) or 1

    raw_score = (
        len(direct_caller_ids) * direct_weight +
        len(indirect_caller_ids) * indirect_weight +
        max_depth * depth_weight +
        export_bonus +
        (total_impacted / total_fns) * 30
    )

    impact_score = min(int(round(raw_score)), 100)

    # Heuristic Severity Rating
    if impact_score >= 75 or total_impacted >= 7:
        severity = "Critical"
    elif impact_score >= 50 or total_impacted >= 4:
        severity = "High"
    elif impact_score >= 20 or total_impacted >= 1:
        severity = "Medium"
    else:
        severity = "Low"

    return (
        focal_node,
        direct_caller_ids,
        indirect_caller_ids,
        callee_ids,
        list(affected_files_set),
        list(affected_modules_set),
        total_impacted,
        max_depth,
        impact_score,
        severity,
        risk_factors
    )
