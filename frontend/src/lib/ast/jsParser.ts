import * as babelParser from '@babel/parser';
import _traverse from '@babel/traverse';
import { ParsedFile, ParsedFunction, CodeImpactData } from '@/types/impact';

// Handle CommonJS / ESM default export variation for babel traverse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse = (_traverse as any).default || _traverse;

export function parseSourceFile(filePath: string, code: string): ParsedFile {
  const fileImports: Array<{ source: string; specifiers: string[] }> = [];
  const fileExports: string[] = [];
  const functions: ParsedFunction[] = [];

  try {
    const ast = babelParser.parse(code, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
      ] as babelParser.ParserPlugin[],
      errorRecovery: true,
    });

    const lines = code.split('\n');

    const extractSnippet = (start?: number, end?: number): string => {
      if (!start || !end) return '';
      return lines.slice(start - 1, end).join('\n');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractParams = (paramsList: any[]): string[] => {
      return paramsList.map((p) => {
        if (p.type === 'Identifier') return p.name;
        if (p.type === 'RestElement' && p.argument.type === 'Identifier') return `...${p.argument.name}`;
        if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') return `${p.left.name}=...`;
        if (p.type === 'ObjectPattern') return '{...}';
        if (p.type === 'ArrayPattern') return '[...]';
        return 'param';
      });
    };

    traverse(ast, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ImportDeclaration(path: any) {
        const source = path.node.source.value;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const specifiers = path.node.specifiers.map((s: any) => {
          if (s.type === 'ImportDefaultSpecifier') return 'default';
          if (s.type === 'ImportNamespaceSpecifier') return '*';
          if (s.type === 'ImportSpecifier' && s.imported.type === 'Identifier') return s.imported.name;
          return s.local.name;
        });
        fileImports.push({ source, specifiers });
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ExportNamedDeclaration(path: any) {
        if (path.node.declaration) {
          if (path.node.declaration.type === 'FunctionDeclaration' && path.node.declaration.id) {
            fileExports.push(path.node.declaration.id.name);
          } else if (path.node.declaration.type === 'VariableDeclaration') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            path.node.declaration.declarations.forEach((d: any) => {
              if (d.id.type === 'Identifier') fileExports.push(d.id.name);
            });
          }
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ExportDefaultDeclaration(path: any) {
        if (path.node.declaration.type === 'FunctionDeclaration' && path.node.declaration.id) {
          fileExports.push(path.node.declaration.id.name);
        } else {
          fileExports.push('default');
        }
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      FunctionDeclaration(path: any) {
        const funcName = path.node.id?.name || 'anonymousFunction';
        const loc = path.node.loc;
        const start = loc?.start.line || 1;
        const end = loc?.end.line || 1;
        const isExported = path.parent.type === 'ExportNamedDeclaration' || path.parent.type === 'ExportDefaultDeclaration';

        const callees: string[] = [];
        path.traverse({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          CallExpression(callPath: any) {
            let calleeName = '';
            if (callPath.node.callee.type === 'Identifier') {
              calleeName = callPath.node.callee.name;
            } else if (callPath.node.callee.type === 'MemberExpression') {
              if (callPath.node.callee.property.type === 'Identifier') {
                calleeName = callPath.node.callee.property.name;
              }
            }
            if (calleeName && calleeName !== funcName && !callees.includes(calleeName)) {
              callees.push(calleeName);
            }
          }
        });

        functions.push({
          id: `${filePath}#${funcName}`,
          name: funcName,
          filePath,
          lineStart: start,
          lineEnd: end,
          params: extractParams(path.node.params),
          isExported,
          isAsync: path.node.async || false,
          kind: 'function',
          codeSnippet: extractSnippet(start, end),
          callers: [],
          callees,
        });
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      VariableDeclarator(path: any) {
        if (
          path.node.id.type === 'Identifier' &&
          path.node.init &&
          (path.node.init.type === 'ArrowFunctionExpression' || path.node.init.type === 'FunctionExpression')
        ) {
          const funcName = path.node.id.name;
          const fnNode = path.node.init;
          const loc = path.node.loc;
          const start = loc?.start.line || 1;
          const end = loc?.end.line || 1;
          const isExported = path.parentPath?.parent?.type === 'ExportNamedDeclaration';

          const callees: string[] = [];
          path.traverse({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            CallExpression(callPath: any) {
              let calleeName = '';
              if (callPath.node.callee.type === 'Identifier') {
                calleeName = callPath.node.callee.name;
              } else if (callPath.node.callee.type === 'MemberExpression') {
                if (callPath.node.callee.property.type === 'Identifier') {
                  calleeName = callPath.node.callee.property.name;
                }
              }
              if (calleeName && calleeName !== funcName && !callees.includes(calleeName)) {
                callees.push(calleeName);
              }
            }
          });

          functions.push({
            id: `${filePath}#${funcName}`,
            name: funcName,
            filePath,
            lineStart: start,
            lineEnd: end,
            params: extractParams(fnNode.params),
            isExported,
            isAsync: fnNode.async || false,
            kind: fnNode.type === 'ArrowFunctionExpression' ? 'arrow' : 'function',
            codeSnippet: extractSnippet(start, end),
            callers: [],
            callees,
          });
        }
      },

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ClassMethod(path: any) {
        if (path.node.key.type === 'Identifier') {
          const funcName = path.node.key.name;
          const loc = path.node.loc;
          const start = loc?.start.line || 1;
          const end = loc?.end.line || 1;

          const callees: string[] = [];
          path.traverse({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            CallExpression(callPath: any) {
              let calleeName = '';
              if (callPath.node.callee.type === 'Identifier') {
                calleeName = callPath.node.callee.name;
              } else if (callPath.node.callee.type === 'MemberExpression') {
                if (callPath.node.callee.property.type === 'Identifier') {
                  calleeName = callPath.node.callee.property.name;
                }
              }
              if (calleeName && calleeName !== funcName && !callees.includes(calleeName)) {
                callees.push(calleeName);
              }
            }
          });

          functions.push({
            id: `${filePath}#${funcName}`,
            name: funcName,
            filePath,
            lineStart: start,
            lineEnd: end,
            params: extractParams(path.node.params),
            isExported: true,
            isAsync: path.node.async || false,
            kind: 'method',
            codeSnippet: extractSnippet(start, end),
            callers: [],
            callees,
          });
        }
      }
    });

  } catch (err) {
    console.warn(`Error parsing AST for ${filePath}:`, err);
  }

  return {
    filePath,
    imports: fileImports,
    exports: fileExports,
    functions,
  };
}

export function buildCodeImpactData(
  repoName: string,
  parsedFiles: ParsedFile[],
  fileContents?: Record<string, string>
): CodeImpactData {
  const functionMap: Record<string, ParsedFunction> = {};
  const nameToIdMap: Record<string, string[]> = {};

  parsedFiles.forEach((file: ParsedFile) => {
    file.functions.forEach((fn: ParsedFunction) => {
      functionMap[fn.id] = { ...fn, callers: [], callees: [] };
      if (!nameToIdMap[fn.name]) {
        nameToIdMap[fn.name] = [];
      }
      nameToIdMap[fn.name].push(fn.id);
    });
  });

  parsedFiles.forEach((file: ParsedFile) => {
    file.functions.forEach((fn: ParsedFunction) => {
      const currentFn = functionMap[fn.id];
      if (!currentFn) return;

      fn.callees.forEach((calleeName: string) => {
        const potentialTargetIds = nameToIdMap[calleeName];
        if (potentialTargetIds && potentialTargetIds.length > 0) {
          let targetId = potentialTargetIds.find((id) => id.startsWith(file.filePath));
          if (!targetId) {
            targetId = potentialTargetIds[0];
          }

          if (targetId && targetId !== fn.id) {
            if (!currentFn.callees.includes(targetId)) {
              currentFn.callees.push(targetId);
            }
            if (functionMap[targetId] && !functionMap[targetId].callers.includes(fn.id)) {
              functionMap[targetId].callers.push(fn.id);
            }
          }
        }
      });
    });
  });

  return {
    repoName,
    files: parsedFiles.map((f) => ({ filePath: f.filePath })),
    functions: functionMap,
    fileContents: fileContents || {},
  };
}
