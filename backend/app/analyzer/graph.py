import networkx as nx
from typing import Dict, List, Tuple, Set
from app.models.schemas import FunctionData, GraphNode, GraphEdge
from app.analyzer.resolver import extract_file_imports, resolve_module_path

def build_networkx_graph(
    repo_name: str,
    parsed_files_map: Dict[str, str],
    extracted_functions: List[FunctionData],
    extracted_classes: List[str] = None
) -> Tuple[nx.DiGraph, Dict[str, FunctionData], List[GraphNode], List[GraphEdge], int]:
    """
    Builds a directed NetworkX graph with confirmed vs inferred confidence edge tagging.
    """
    G = nx.DiGraph()

    repo_node_id = f"repo:{repo_name}"
    G.add_node(repo_node_id, type="repository", label=repo_name, data={"repo_name": repo_name})

    nodes_list: List[GraphNode] = [
        GraphNode(id=repo_node_id, type="repository", label=repo_name, data={"repo_name": repo_name})
    ]
    edges_list: List[GraphEdge] = []

    function_map: Dict[str, FunctionData] = {}
    name_to_id_map: Dict[str, List[str]] = {}
    all_file_paths: Set[str] = set(parsed_files_map.keys())

    # Map file imports
    file_imports_map = {
        path: extract_file_imports(code) for path, code in parsed_files_map.items()
    }

    # Register functions
    for fn in extracted_functions:
        function_map[fn.id] = fn
        if fn.name not in name_to_id_map:
            name_to_id_map[fn.name] = []
        name_to_id_map[fn.name].append(fn.id)

    # 1. File & Class Nodes
    added_files = set()
    for file_path in all_file_paths:
        file_node_id = f"file:{file_path}"
        if file_node_id not in added_files:
            G.add_node(file_node_id, type="file", label=file_path, data={"filePath": file_path})
            nodes_list.append(GraphNode(id=file_node_id, type="file", label=file_path, data={"filePath": file_path}))

            G.add_edge(repo_node_id, file_node_id, type="contains", confidence="confirmed")
            edges_list.append(
                GraphEdge(id=f"e:{repo_node_id}->{file_node_id}", source=repo_node_id, target=file_node_id, type="contains", confidence="confirmed")
            )
            added_files.add(file_node_id)

    # 2. Function Nodes & File Containment/Exports Edges
    for fn_id, fn in function_map.items():
        G.add_node(fn_id, type="function", label=fn.name, data=fn.model_dump())
        nodes_list.append(GraphNode(id=fn_id, type="function", label=fn.name, data=fn.model_dump()))

        file_node_id = f"file:{fn.filePath}"
        G.add_edge(file_node_id, fn_id, type="contains", confidence="confirmed")
        edges_list.append(
            GraphEdge(id=f"e:{file_node_id}->{fn_id}", source=file_node_id, target=fn_id, type="contains", confidence="confirmed")
        )

        if fn.isExported:
            G.add_edge(file_node_id, fn_id, type="exports", confidence="confirmed")
            edges_list.append(
                GraphEdge(id=f"e_exp:{file_node_id}->{fn_id}", source=file_node_id, target=fn_id, type="exports", confidence="confirmed")
            )

    # 3. Cross-File Imports & Call Resolution
    module_nodes_added = set()

    for fn_id, fn in function_map.items():
        file_imports = file_imports_map.get(fn.filePath, [])
        resolved_callees = []

        for callee_raw in fn.callees:
            callee_name = callee_raw.split('.')[-1] if '.' in callee_raw else callee_raw
            callee_prefix = callee_raw.split('.')[0] if '.' in callee_raw else None

            target_id = None
            confidence = "inferred"

            # Check 1: Same File Local Call
            same_file_targets = [id for id in name_to_id_map.get(callee_name, []) if id.startswith(fn.filePath)]
            if same_file_targets:
                target_id = same_file_targets[0]
                confidence = "confirmed"

            # Check 2: Direct Named or Default Import match
            if not target_id:
                for imp in file_imports:
                    if imp.local_name == callee_name or (callee_prefix and imp.local_name == callee_prefix):
                        resolved_path = resolve_module_path(fn.filePath, imp.module_specifier, all_file_paths)
                        if resolved_path:
                            # Search in resolved file
                            imported_fn_name = callee_name if imp.import_type != 'default' else imp.imported_name
                            target_id = f"{resolved_path}#{imported_fn_name}"
                            if target_id in function_map:
                                confidence = "confirmed"
                                break

            # Check 3: General export match across repository (Inferred)
            if not target_id:
                global_targets = name_to_id_map.get(callee_name, [])
                if global_targets:
                    target_id = global_targets[0]
                    confidence = "inferred"

            if target_id and target_id in function_map and target_id != fn_id:
                if target_id not in resolved_callees:
                    resolved_callees.append(target_id)

                edge_id = f"e_call:{fn_id}->{target_id}"
                if not G.has_edge(fn_id, target_id):
                    G.add_edge(fn_id, target_id, type="calls", confidence=confidence)
                    edges_list.append(
                        GraphEdge(id=edge_id, source=fn_id, target=target_id, type="calls", confidence=confidence)
                    )

                if target_id in function_map and fn_id not in function_map[target_id].callers:
                    function_map[target_id].callers.append(fn_id)

        fn.callees = resolved_callees

    # Count unique modules
    module_count = len(module_nodes_added)

    return G, function_map, nodes_list, edges_list, module_count
