// ─── Public API ────────────────────────────────────────────────────────────────
// Re-exports all public interfaces so this package can be used as a library.

export * from "./types.js";
export { defaultConfig, mergeConfig, loadConfigFile } from "./config.js";
export { logger } from "./logger.js";

// Utils
export { shortHash, fullHash, formatRef, parseRef } from "./utils/hash.js";
export { HeuristicTokenEstimator, defaultEstimator, tokenSavings } from "./utils/estimator.js";

// Modules
export { PromptOptimizer } from "./modules/promptOptimizer.js";
export { JsonMinifier } from "./modules/jsonMinifier.js";
export { LogFilter } from "./modules/logFilter.js";
export { DiffFilter } from "./modules/diffFilter.js";
export { ContextRegistry } from "./modules/contextRegistry.js";
export { SemanticPhraseStore } from "./modules/semanticPhraseStore.js";
export { EnglishSemanticProvider } from "./modules/englishSemanticProvider.js";
export { VariantSelector } from "./modules/variantSelector.js";
export { SafetyScorer } from "./modules/safetyScorer.js";

// Core
export { OptimizationPipeline } from "./core/pipeline.js";
export { PolicyEngine } from "./core/policies.js";
export { decideFallback } from "./core/fallback.js";

// Adapters
export { HookAdapter } from "./adapters/hookAdapter.js";
export { PluginAdapter } from "./adapters/pluginAdapter.js";
export { McpAdapter } from "./adapters/mcpAdapter.js";
