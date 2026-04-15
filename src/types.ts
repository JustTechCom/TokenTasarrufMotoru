// ─── Core Types ────────────────────────────────────────────────────────────────

export type LogMode = "docker" | "journalctl" | "dotnet" | "npm" | "generic";
export type CompressionLevel = "none" | "light" | "normal" | "aggressive";

export interface OptimizationConfig {
  promptOptimizer: PromptOptimizerOptions;
  jsonMinifier: JsonMinifierOptions;
  logFilter: LogFilterOptions;
  diffFilter: DiffFilterOptions;
  contextRegistry: ContextRegistryOptions;
  variantSelector: VariantSelectorOptions;
  policy: PolicyOptions;
  safety: SafetyOptions;
}

// ─── Prompt Optimizer ─────────────────────────────────────────────────────────

export interface PromptOptimizerOptions {
  lowercase: boolean;
  normalizeWhitespace: boolean;
  normalizePunctuation: boolean;
  removeBoilerplate: boolean;
  deduplicateSentences: boolean;
  collapseRepeatedParagraphs: boolean;
  shortenLongPaths: boolean;
  preserveCodeBlocks: boolean;
  preserveStackTraces: boolean;
  preserveUrls: boolean;
  dictionaryMap: Record<string, string>;
  aggressiveMode: boolean; // enables stopword pruning
}

export interface PromptVariant {
  label: string;
  text: string;
  estimatedTokens: number;
  compressionRatio: number;
}

// ─── JSON Minifier ────────────────────────────────────────────────────────────

export interface JsonMinifierOptions {
  aliasMap: Record<string, string>;
  removeNulls: boolean;
  removeUndefined: boolean;
  removeEmptyArrays: boolean;
  removeEmptyObjects: boolean;
  aggressiveMode: boolean;
}

// ─── Log Filter ───────────────────────────────────────────────────────────────

export interface LogFilterOptions {
  mode: LogMode;
  includeErrors: boolean;
  includeWarnings: boolean;
  includeFailures: boolean;
  tailLines: number; // keep last N lines (0 = all)
  customPatterns: string[]; // additional regex patterns to include
}

export interface LogFilterResult {
  lines: string[];
  totalInput: number;
  totalOutput: number;
}

// ─── Diff Filter ──────────────────────────────────────────────────────────────

export interface DiffFilterOptions {
  hideWhitespaceOnly: boolean;
  summarizeBinaryFiles: boolean;
  fileSummaryThreshold: number; // lines; files above this get summary only
  relevantHunksOnly: boolean;
}

export interface DiffFilterResult {
  output: string;
  filesIncluded: string[];
  filesSkipped: string[];
}

// ─── Context Registry ─────────────────────────────────────────────────────────

export interface ContextRegistryOptions {
  cacheDir: string;
  hashLength: number; // 8 = CTX_ab12cd34
}

export interface RegistryEntry {
  hash: string;
  createdAt: string;
  length: number;
  summaryPreview: string; // first 120 chars
  tags: string[];
}

export interface RegistryIndex {
  version: number;
  entries: Record<string, RegistryEntry>; // key = hash
}

// ─── Variant Selector ─────────────────────────────────────────────────────────

export interface VariantSelectorOptions {
  safetyThreshold: number; // 0.0 – 1.0
}

export interface SelectionResult {
  original: PromptVariant;
  candidates: PromptVariant[];
  chosen: PromptVariant;
  estimatedSavings: number; // tokens saved vs original
  safetyScore: number;
}

// ─── Policy ───────────────────────────────────────────────────────────────────

export interface PolicyOptions {
  shortOutputPolicy: boolean;
  terseResponseMode: boolean;
  explanationOnlyIfAsked: boolean;
  maxOutputHint: number | null; // token hint injected into prompt
  injectLowVerbosityInstruction: boolean;
}

export interface PolicyInjection {
  prefix?: string;
  suffix?: string;
}

// ─── Safety / Fallback ────────────────────────────────────────────────────────

export interface SafetyOptions {
  threshold: number;   // similarity threshold below which we fallback
  dryRun: boolean;
  logViolations: boolean;
}

export interface SafetyResult {
  score: number;
  passed: boolean;
  reason?: string;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export interface PipelineInput {
  prompt: string;
  dryRun?: boolean;
}

export interface PipelineOutput {
  original: string;
  optimized: string;
  selectionResult?: SelectionResult;
  policyInjection?: PolicyInjection;
  safetyResult?: SafetyResult;
  fallbackUsed: boolean;
  dryRun: boolean;
}

// ─── Token Estimator Interface ────────────────────────────────────────────────

export interface TokenEstimator {
  estimate(text: string): number;
}

// ─── Hook / Adapter Types ─────────────────────────────────────────────────────

export type HookEvent = "prePrompt" | "preToolUse" | "postToolUse";

export interface HookContext {
  event: HookEvent;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface HookResult {
  content: string;
  modified: boolean;
  tokensaved?: number;
}
