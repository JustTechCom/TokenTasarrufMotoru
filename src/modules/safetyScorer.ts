import { SafetyOptions, SafetyResult } from "../types.js";
import { charNgramSimilarity, wordSimilarity, tfidfCosineSimilarity } from "../utils/text.js";
import { logger } from "../logger.js";

// ─── Safety Scorer ────────────────────────────────────────────────────────────
//
// Measures semantic proximity between original and optimized text.
// Long texts (≥ SHORT_TEXT_THRESHOLD tokens) use TF-IDF cosine similarity;
// short texts fall back to Jaccard to avoid sparse-vector noise.
//
// Score of 1.0 = identical content, 0.0 = nothing in common.
// If score < threshold, the caller should fall back to original.

const SHORT_TEXT_THRESHOLD = 6;

export class SafetyScorer {
  constructor(private opts: SafetyOptions) {}

  score(original: string, optimized: string): SafetyResult {
    const lexicalSimilarity = wordSimilarity(original, optimized);
    const ngramSimilarity = charNgramSimilarity(original, optimized);

    const tokenCount = original.split(/\W+/).filter(Boolean).length;
    const similarity = tokenCount < SHORT_TEXT_THRESHOLD
      ? Math.max(lexicalSimilarity, ngramSimilarity)
      : Math.max(tfidfCosineSimilarity(original, optimized), lexicalSimilarity);

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
        `lexical=${lexicalSimilarity.toFixed(3)}, ` +
        `ngram=${ngramSimilarity.toFixed(3)}, ` +
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
