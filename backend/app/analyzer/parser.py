import os
import re
from typing import List, Dict, Tuple, Set, Optional
from app.models.schemas import FunctionData, AnalysisWarning

FUNC_DECL_REGEX = re.compile(
    r'(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)',
    re.MULTILINE
)

ARROW_FUNC_REGEX = re.compile(
    r'(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>',
    re.MULTILINE
)

CLASS_DECL_REGEX = re.compile(
    r'(?:export\s+)?class\s+([A-Za-z0-9_$]+)(?:\s+extends\s+[A-Za-z0-9_$.]+)?\s*\{',
    re.MULTILINE
)

CLASS_METHOD_REGEX = re.compile(
    r'(?:async\s+)?([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{',
    re.MULTILINE
)

CALL_EXPR_REGEX = re.compile(
    r'\b([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)?)\s*\(',
    re.MULTILINE
)

RESERVED_KEYWORDS = {
    'if', 'while', 'for', 'switch', 'catch', 'function', 'return', 'import',
    'export', 'require', 'super', 'this', 'typeof', 'instanceof', 'void',
    'delete', 'new', 'async', 'await', 'try', 'finally', 'console', 'log',
    'error', 'warn', 'info', 'set', 'get', 'then', 'catch', 'map', 'filter',
    'reduce', 'forEach', 'push', 'slice', 'splice', 'constructor'
}

SUPPORTED_EXTENSIONS = {'.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'}

def is_supported_file(file_path: str) -> bool:
    """Check if file extension is supported for AST static analysis."""
    _, ext = os.path.splitext(file_path.lower())
    return ext in SUPPORTED_EXTENSIONS

def parse_code_file(
    file_path: str, code: str
) -> Tuple[List[FunctionData], List[str], List[AnalysisWarning]]:
    """
    Parses a single JS/TS source file safely. 
    Returns (functions, classes, warnings).
    """
    functions: List[FunctionData] = []
    classes: List[str] = []
    warnings: List[AnalysisWarning] = []

    if not is_supported_file(file_path):
        return functions, classes, warnings

    lines = code.split('\n')

    def get_line_number(char_index: int) -> int:
        return code[:char_index].count('\n') + 1

    def get_snippet(start_line: int, max_lines: int = 30) -> str:
        end_line = min(start_line + max_lines, len(lines))
        return "\n".join(lines[start_line - 1:end_line])

    def parse_params(params_str: str) -> List[str]:
        if not params_str.strip():
            return []
        parts = [p.strip().split(':')[0].strip() for p in params_str.split(',')]
        return [p for p in parts if p and p != '']

    try:
        # Extract Classes
        for match in CLASS_DECL_REGEX.finditer(code):
            class_name = match.group(1)
            if class_name not in classes:
                classes.append(class_name)

        # 1. Parse Standard Function Declarations
        for match in FUNC_DECL_REGEX.finditer(code):
            fn_name = match.group(1)
            params_str = match.group(2)
            start_idx = match.start()
            start_line = get_line_number(start_idx)
            is_exported = 'export' in match.group(0)
            is_async = 'async' in match.group(0)

            snippet = get_snippet(start_line)
            callees = extract_callees(snippet, fn_name)

            functions.append(
                FunctionData(
                    id=f"{file_path}#{fn_name}",
                    name=fn_name,
                    filePath=file_path,
                    lineStart=start_line,
                    lineEnd=start_line + snippet.count('\n'),
                    params=parse_params(params_str),
                    isExported=is_exported,
                    isAsync=is_async,
                    kind="function",
                    codeSnippet=snippet,
                    callers=[],
                    callees=callees,
                )
            )

        # 2. Parse Arrow Functions
        for match in ARROW_FUNC_REGEX.finditer(code):
            fn_name = match.group(1)
            params_str = match.group(2)
            start_idx = match.start()
            start_line = get_line_number(start_idx)
            is_exported = 'export' in match.group(0)
            is_async = 'async' in match.group(0)

            snippet = get_snippet(start_line)
            callees = extract_callees(snippet, fn_name)

            if not any(f.name == fn_name for f in functions):
                functions.append(
                    FunctionData(
                        id=f"{file_path}#{fn_name}",
                        name=fn_name,
                        filePath=file_path,
                        lineStart=start_line,
                        lineEnd=start_line + snippet.count('\n'),
                        params=parse_params(params_str),
                        isExported=is_exported,
                        isAsync=is_async,
                        kind="arrow",
                        codeSnippet=snippet,
                        callers=[],
                        callees=callees,
                    )
                )

        # 3. Parse Class Methods
        for match in CLASS_METHOD_REGEX.finditer(code):
            method_name = match.group(1)
            params_str = match.group(2)
            start_idx = match.start()
            start_line = get_line_number(start_idx)
            is_async = 'async' in match.group(0)

            if method_name not in RESERVED_KEYWORDS and not any(f.name == method_name for f in functions):
                snippet = get_snippet(start_line)
                callees = extract_callees(snippet, method_name)

                functions.append(
                    FunctionData(
                        id=f"{file_path}#{method_name}",
                        name=method_name,
                        filePath=file_path,
                        lineStart=start_line,
                        lineEnd=start_line + snippet.count('\n'),
                        params=parse_params(params_str),
                        isExported=True,
                        isAsync=is_async,
                        kind="method",
                        codeSnippet=snippet,
                        callers=[],
                        callees=callees,
                    )
                )

    except Exception as err:
        warnings.append(
            AnalysisWarning(filePath=file_path, message=f"Partial parsing error: {str(err)}")
        )

    return functions, classes, warnings

def extract_callees(snippet: str, current_fn_name: str) -> List[str]:
    """Extract called function/method names inside snippet."""
    callees = []
    for match in CALL_EXPR_REGEX.finditer(snippet):
        callee = match.group(1)
        clean_callee = callee.split('.')[-1] if '.' in callee else callee

        if clean_callee not in RESERVED_KEYWORDS and clean_callee != current_fn_name and clean_callee not in callees:
            callees.append(clean_callee)
            
        if '.' in callee and callee not in callees:
            callees.append(callee)
            
    return callees
