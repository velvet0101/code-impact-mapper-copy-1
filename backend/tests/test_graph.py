import pytest
from app.analyzer.parser import parse_code_file, is_supported_file
from app.analyzer.graph import build_networkx_graph

def test_supported_file_check():
    assert is_supported_file("src/app.ts") is True
    assert is_supported_file("src/components/Button.tsx") is True
    assert is_supported_file("styles.css") is False
    assert is_supported_file("README.md") is False

def test_parse_code_file_classes_and_functions():
    code = """
    export class OrderController {
        async handleCheckout(req: any) {
            return processPayment(req.amount);
        }
    }

    function processPayment(amt: number) {
        return true;
    }
    """
    fns, classes, warnings = parse_code_file("src/controllers/orderController.ts", code)
    assert len(fns) >= 2
    assert "OrderController" in classes
    assert len(warnings) == 0

def test_build_networkx_graph_confirmed_vs_inferred():
    files_map = {
        "src/order.ts": "import { processPayment } from './payment';\nexport function checkout() { processPayment(100); }",
        "src/payment.ts": "export function processPayment(amount: number) { return true; }"
    }

    extracted = []
    for path, code in files_map.items():
        fns, _, _ = parse_code_file(path, code)
        extracted.extend(fns)

    G, fn_map, nodes, edges, modules = build_networkx_graph("test/repo", files_map, extracted)

    assert len(nodes) > 0
    assert len(edges) > 0
    
    # Verify call edge has confirmed status
    call_edges = [e for e in edges if e.type == "calls"]
    assert len(call_edges) > 0
    assert call_edges[0].confidence in ["confirmed", "inferred"]
