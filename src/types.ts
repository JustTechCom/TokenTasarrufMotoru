// ─── Core Types ────────────────────────────────────────────────────────────────

export type LogMode = "docker" | "journalctl" | "dotnet" | "npm" | "generic";
export type CompressionLevel = "none" | "light" | "normal" | "aggressive";

export interface OptimizationConfig {
  promptOptimizer: PromptOptimizerOptions;
  jsonMinifier: JsonMinifierOptions;
  logFilter: LogFilterOptions;
  diffFilter: DiffFilterOptions;
  contextRegistry: ContextRegistryOptions;
  policy: PolicyOptions;
  safety: SafetyOptions;
  ollamaOptimizer: OllamaOptimizerOptions;
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
  semanticCompression: SemanticCompressionOptions;
  aggressiveMode: boolean; // enables stopword pruning
}

export interface PromptVariant {
  label: string;
  text: string;
  estimatedTokens: number;
  compressionRatio: number;
}

export interface SemanticCompressionOptions {
  enabled: boolean;
  locale: "auto" | "en" | "tr";
  projectPhraseDbPath: string;
  useEnglishSemanticProvider: boolean;
  useWordPosWordNet: boolean;
  externalEnglishSynonymsPath: string | null;
  technicalAbbreviationMap: Record<string, string>;
}

export interface SemanticPhraseRecord {
  from: string;
  to: string;
  locale: "en" | "tr" | "any";
  approved: boolean;
  createdAt: string;
  source: "manual" | "builtin" | "imported";
  usageCount: number;
}

export interface SemanticPhraseIndex {
  version: number;
  phrases: SemanticPhraseRecord[];
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
  ttlHours?: number;  // 0 = disabled; default 24
  purgeBehavior?: "index-only" | "full"; // default "full"
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

export interface SelectionResult {
  original: PromptVariant;
  candidates: PromptVariant[];
  chosen: PromptVariant; // final emitted variant after fallback/policy handling
  estimatedSavings: number; // tokens saved vs original for the final emitted variant
  potentialSavings: number; // best-case tokens saved vs original across generated variants
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
  // Inverse of dictionaryMap/technicalAbbreviationMap — used to expand
  // abbreviations in the optimized text before similarity computation so that
  // "db" matches "database", "auth" matches "authentication", etc.
  abbreviationExpansions?: Record<string, string>;
}

export interface SafetyResult {
  score: number;
  passed: boolean;
  reason?: string;
}

// ─── Ollama Optimizer ─────────────────────────────────────────────────────────

export interface OllamaOptimizerOptions {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
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
  estimatedSavings: number; // tokens saved by the final emitted output
  potentialSavings: number; // best-case tokens saved across generated variants
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
