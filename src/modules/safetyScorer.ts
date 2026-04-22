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

  private expandAbbreviations(text: string): string {
    const expansions = this.opts.abbreviationExpansions;
    if (!expansions || Object.keys(expansions).length === 0) return text;
    let result = text;
    for (const [abbrev, full] of Object.entries(expansions)) {
      const pattern = new RegExp(`\\b${abbrev}\\b`, "gi");
      result = result.replace(pattern, full);
    }
    return result;
  }

  score(original: string, optimized: string): SafetyResult {
    const expandedOptimized = this.expandAbbreviations(optimized);
    const lexicalSimilarity = Math.max(
      wordSimilarity(original, optimized),
      wordSimilarity(original, expandedOptimized),
    );
    const ngramSimilarity = Math.max(
      charNgramSimilarity(original, optimized),
      charNgramSimilarity(original, expandedOptimized),
    );

    const tokenCount = original.split(/\W+/).filter(Boolean).length;
    const tfidf = tokenCount < SHORT_TEXT_THRESHOLD
      ? 0
      : Math.max(
          tfidfCosineSimilarity(original, optimized),
          tfidfCosineSimilarity(original, expandedOptimized),
        );
    const similarity = tokenCount < SHORT_TEXT_THRESHOLD
      ? Math.max(lexicalSimilarity, ngramSimilarity)
      : Math.max(tfidf, lexicalSimilarity);

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
