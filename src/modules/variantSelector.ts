import { PromptVariant, SelectionResult, SafetyOptions, TokenEstimator } from "../types.js";
import { SafetyScorer } from "./safetyScorer.js";
import { defaultEstimator } from "../utils/estimator.js";
import { logger } from "../logger.js";

// ─── Variant Selector ─────────────────────────────────────────────────────────

export class VariantSelector {
  private scorer: SafetyScorer;
  private estimator: TokenEstimator;

  constructor(
    safetyOpts: SafetyOptions,
    estimator: TokenEstimator = defaultEstimator
  ) {
    // Suppress violation logging here — the pipeline re-scores after policy
    // injection and owns the single authoritative warning.
    this.scorer = new SafetyScorer({ ...safetyOpts, logViolations: false });
    this.estimator = estimator;
  }

  /**
   * Selects the final cumulative variant produced by the optimizer.
   * Safety is still measured here, but fallback to the original is handled later
   * in the pipeline after policy injection.
   */
  select(original: string, candidates: PromptVariant[]): SelectionResult {
    const originalTokens = this.estimator.estimate(original);
    const originalVariant: PromptVariant = {
      label: "original",
      text: original,
      estimatedTokens: originalTokens,
      compressionRatio: 1.0,
    };

    const chosen = candidates.reduce<PromptVariant>(
      (best, candidate) =>
        candidate.compressionRatio < best.compressionRatio ? candidate : best,
      originalVariant
    );
    const safetyResult = this.scorer.score(original, chosen.text);

    logger.debug(
      `Variant selected: ${chosen.label} ` +
      `(score=${safetyResult.score.toFixed(3)}, tokens=${chosen.estimatedTokens})`
    );

    const estimatedSavings = Math.max(0, originalTokens - chosen.estimatedTokens);
    const bestCandidateTokens = candidates.reduce(
      (lowest, candidate) => Math.min(lowest, candidate.estimatedTokens),
      originalTokens
    );
    const potentialSavings = Math.max(0, originalTokens - bestCandidateTokens);

    return {
      original: originalVariant,
      candidates,
      chosen,
      estimatedSavings,
      potentialSavings,
      safetyScore: safetyResult.score,
    };
  }
}
