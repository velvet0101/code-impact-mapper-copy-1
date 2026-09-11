export interface ParsedFunction {
  id: string;
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  params: string[];
  isExported: boolean;
  isAsync: boolean;
  kind: 'function' | 'method' | 'arrow';
  className?: string;
  codeSnippet: string;
  callers: string[];
  callees: string[];
}

export interface ParsedFile {
  filePath: string;
  imports?: Array<{ source: string; specifiers: string[] }>;
  exports?: string[];
  functions: ParsedFunction[];
}

export type ImpactLevel = 'focal' | 'direct' | 'indirect' | 'callee' | 'unaffected';
export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface GraphNodeData {
  label: string;
  functionData: ParsedFunction;
  impactLevel: ImpactLevel;
  impactScore: number;
  depth: number;
  [key: string]: unknown;
}

export interface RiskFactors {
  direct_callers_count: number;
  transitive_callers_count: number;
  affected_files_count: number;
  affected_functions_count: number;
  affected_modules_count: number;
  max_dependency_depth: number;
  is_exported: boolean;
}

export interface BlastRadiusResult {
  targetId: string;
  focalNode: ParsedFunction;
  directCallerIds: string[];
  indirectCallerIds: string[];
  calleeIds: string[];
  affectedFilePaths: string[];
  affectedModuleNames?: string[];
  totalImpactedCount: number;
  maxCascadeDepth: number;
  impactScore: number;
  riskLevel: RiskLevel;
  disclaimer?: string;
  riskFactors?: RiskFactors;
}

export interface AIExplanationResult {
  functionPurpose: string;
  blastRadiusSummary: string;
  cascadeRisks: string[];
  potentialBreakingChanges: string[];
  recommendedTests: string[];
  riskRating: RiskLevel;
}

export interface AnalysisWarning {
  filePath: string;
  message: string;
}

export interface CodeImpactData {
  repoName: string;
  files?: Array<{ filePath: string }>;
  functions: Record<string, ParsedFunction>;
  fileCount?: number;
  supportedFileCount?: number;
  unsupportedFileCount?: number;
  classCount?: number;
  moduleCount?: number;
  relationshipCount?: number;
  analysisDurationMs?: number;
  warnings?: AnalysisWarning[];
}

