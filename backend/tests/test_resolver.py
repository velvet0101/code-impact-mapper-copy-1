import pytest
from app.analyzer.resolver import extract_file_imports, resolve_module_path

def test_extract_imports():
    code = """
    import { processPayment, issueRefund as refund } from './paymentService';
    import DefaultLogger from '../utils/logger';
    import * as StripeSDK from 'stripe';
    """
    imports = extract_file_imports(code)
    
    assert len(imports) >= 3
    local_names = [i.local_name for i in imports]
    assert "processPayment" in local_names
    assert "refund" in local_names
    assert "DefaultLogger" in local_names
    assert "StripeSDK" in local_names

def test_resolve_relative_module_path():
    all_files = {
        "src/services/paymentService.ts",
        "src/utils/logger.ts",
        "src/index.ts"
    }

    resolved = resolve_module_path("src/services/order.ts", "./paymentService", all_files)
    assert resolved == "src/services/paymentService.ts"

    resolved_up = resolve_module_path("src/services/order.ts", "../utils/logger", all_files)
    assert resolved_up == "src/utils/logger.ts"
