import { SafetyOptions, SafetyResult } from "../types.js";
import { wordSimilarity } from "../utils/text.js";
import { logger } from "../logger.js";

// ─── Safety Scorer ────────────────────────────────────────────────────────────
//
// Measures semantic proximity between original and optimized text using a
// heuristic word-level Jaccard similarity. No NLP required.
//
// Score of 1.0 = identical content, 0.0 = nothing in common.
// If score < threshold, the caller should fall back to original.

export class SafetyScorer {
  constructor(private opts: SafetyOptions) {}

  score(original: string, optimized: string): SafetyResult {
    const similarity = wordSimilarity(original, optimized);

    // Length ratio guard: if optimized is less than 40% the original length
    // in chars, it's likely too aggressive regardless of word overlap.
    const lengthRatio = optimized.length / Math.max(original.length, 1);
    const lengthPenalty = lengthRatio < 0.4 ? 0.4 - lengthRatio : 0;

    const finalScore = Math.max(0, similarity - lengthPenalty);
    const passed = finalScore >= this.opts.threshold;

    if (!passed && this.opts.logViolations) {
      logger.warn(
        `Safety check failed: score=${finalScore.toFixed(3)}, ` +
        `threshold=${this.opts.threshold}, ` +
        `similarity=${similarity.toFixed(3)}, ` +
        `lengthRatio=${lengthRatio.toFixed(3)}`
      );
    }

    return {
      score: finalScore,
      passed,
      reason: passed
        ? undefined
        : `Similarity ${finalScore.toFixed(3)} below threshold ${this.opts.threshold}`,
    };
  }
}
