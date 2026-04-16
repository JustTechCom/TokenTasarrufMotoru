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
    this.scorer = new SafetyScorer(safetyOpts);
    this.estimator = estimator;
  }

  /**
   * Selects the most compressed variant that still passes the safety threshold.
   * Falls back to original if none pass.
   */
  select(original: string, candidates: PromptVariant[]): SelectionResult {
    const originalTokens = this.estimator.estimate(original);
    const originalVariant: PromptVariant = {
      label: "original",
      text: original,
      estimatedTokens: originalTokens,
      compressionRatio: 1.0,
    };

    // Sort candidates by compression ratio ascending (most compressed first)
    const sorted = [...candidates].sort(
      (a, b) => a.compressionRatio - b.compressionRatio
    );

    let chosen: PromptVariant = originalVariant;
    let safetyResult = { score: 1.0, passed: true };

    for (const candidate of sorted) {
      if (candidate.label === "original") continue;

      const result = this.scorer.score(original, candidate.text);
      if (result.passed) {
        chosen = candidate;
        safetyResult = result;
        logger.debug(
          `Variant selected: ${candidate.label} ` +
          `(score=${result.score.toFixed(3)}, tokens=${candidate.estimatedTokens})`
        );
        break;
      }
      logger.debug(
        `Variant rejected: ${candidate.label} (score=${result.score.toFixed(3)})`
      );
    }

    const estimatedSavings = originalTokens - chosen.estimatedTokens;

    return {
      original: originalVariant,
      candidates,
      chosen,
      estimatedSavings,
      safetyScore: safetyResult.score,
    };
  }
}
