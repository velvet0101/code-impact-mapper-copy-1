import os
import re
from typing import Dict, List, Tuple, Set, Optional

# Regular Expressions for Import Declarations
# 1. Named imports: import { a, b as c } from './module'
NAMED_IMPORT_REGEX = re.compile(
    r'import\s*\{([^}]+)\}\s*from\s*[\'"]([^\'"]+)[\'"]',
    re.MULTILINE
)

# 2. Default imports: import Foo from './module'
DEFAULT_IMPORT_REGEX = re.compile(
    r'import\s+([A-Za-z0-9_$]+)\s+from\s*[\'"]([^\'"]+)[\'"]',
    re.MULTILINE
)

# 3. Namespace imports: import * as Utils from './module'
NAMESPACE_IMPORT_REGEX = re.compile(
    r'import\s*\*\s*as\s+([A-Za-z0-9_$]+)\s+from\s*[\'"]([^\'"]+)[\'"]',
    re.MULTILINE
)

# 4. Combined default + named: import Foo, { bar } from './module'
COMBINED_IMPORT_REGEX = re.compile(
    r'import\s+([A-Za-z0-9_$]+)\s*,\s*\{([^}]+)\}\s*from\s*[\'"]([^\'"]+)[\'"]',
    re.MULTILINE
)

class ImportedSymbol:
    def __init__(self, local_name: str, imported_name: str, module_specifier: str, import_type: str):
        self.local_name = local_name
        self.imported_name = imported_name  # Symbol name or 'default' or '*'
        self.module_specifier = module_specifier
        self.import_type = import_type  # 'named', 'default', 'namespace'
        self.resolved_file_path: Optional[str] = None

def extract_file_imports(code: str) -> List[ImportedSymbol]:
    """Extracts all import declarations from source code."""
    imports: List[ImportedSymbol] = []

    # Combined default + named
    for match in COMBINED_IMPORT_REGEX.finditer(code):
        default_name = match.group(1).strip()
        named_parts = match.group(2)
        specifier = match.group(3).strip()

        imports.append(ImportedSymbol(default_name, 'default', specifier, 'default'))

        for item in named_parts.split(','):
            item = item.strip()
            if not item:
                continue
            if ' as ' in item:
                orig, local = item.split(' as ')
                imports.append(ImportedSymbol(local.strip(), orig.strip(), specifier, 'named'))
            else:
                imports.append(ImportedSymbol(item, item, specifier, 'named'))

    # Namespace imports
    for match in NAMESPACE_IMPORT_REGEX.finditer(code):
        ns_name = match.group(1).strip()
        specifier = match.group(2).strip()
        imports.append(ImportedSymbol(ns_name, '*', specifier, 'namespace'))

    # Named imports
    for match in NAMED_IMPORT_REGEX.finditer(code):
        # Skip if already handled by combined
        named_parts = match.group(1)
        specifier = match.group(2).strip()

        for item in named_parts.split(','):
            item = item.strip()
            if not item:
                continue
            if ' as ' in item:
                orig, local = item.split(' as ')
                imports.append(ImportedSymbol(local.strip(), orig.strip(), specifier, 'named'))
            else:
                imports.append(ImportedSymbol(item, item, specifier, 'named'))

    # Default imports
    for match in DEFAULT_IMPORT_REGEX.finditer(code):
        def_name = match.group(1).strip()
        specifier = match.group(2).strip()
        if def_name != '*' and not any(i.local_name == def_name for i in imports):
            imports.append(ImportedSymbol(def_name, 'default', specifier, 'default'))

    return imports

def resolve_module_path(current_file_path: str, module_specifier: str, all_file_paths: Set[str]) -> Optional[str]:
    """
    Resolves relative import specifiers (e.g. './utils' or '../services/payment') 
    to exact source file paths in the codebase.
    """
    if not module_specifier.startswith('.'):
        # External package module (e.g. 'express', 'react', 'axios')
        return None

    current_dir = os.path.dirname(current_file_path)
    normalized_base = os.path.normpath(os.path.join(current_dir, module_specifier)).replace('\\', '/')

    # Candidate extensions
    candidates = [
        normalized_base,
        f"{normalized_base}.ts",
        f"{normalized_base}.tsx",
        f"{normalized_base}.js",
        f"{normalized_base}.jsx",
        f"{normalized_base}/index.ts",
        f"{normalized_base}/index.tsx",
        f"{normalized_base}/index.js",
        f"{normalized_base}/index.jsx",
    ]

    for cand in candidates:
        # Strip leading slashes or dots if any
        clean_cand = cand.lstrip('./')
        if clean_cand in all_file_paths:
            return clean_cand
        
        # Check matching suffix
        for path in all_file_paths:
            if path == clean_cand or path.endswith('/' + clean_cand):
                return path

    return None
