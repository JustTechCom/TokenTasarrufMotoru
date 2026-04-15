import { PromptOptimizerOptions, PromptVariant, TokenEstimator } from "../types.js";
import {
  normalizeWhitespace,
  normalizePunctuation,
  deduplicateSentences,
  collapseRepeatedParagraphs,
  shortenLongPaths,
  removeBoilerplate,
  applyDictionaryMap,
  processOutsideCodeBlocks,
  looksLikeStackTrace,
} from "../utils/text.js";
import { defaultEstimator } from "../utils/estimator.js";

// ─── Prompt Optimizer ─────────────────────────────────────────────────────────

export class PromptOptimizer {
  constructor(
    private opts: PromptOptimizerOptions,
    private estimator: TokenEstimator = defaultEstimator
  ) {}

  /**
   * Full optimization pass. Code blocks and stack traces are protected
   * from modification when their respective preserve flags are set.
   */
  optimize(input: string): string {
    let text = input;

    const process = (chunk: string): string => {
      // Skip stack traces if preserveStackTraces is enabled
      if (this.opts.preserveStackTraces && looksLikeStackTrace(chunk)) {
        return chunk;
      }

      if (this.opts.lowercase) {
        chunk = chunk.toLowerCase();
      }
      if (this.opts.normalizeWhitespace) {
        chunk = normalizeWhitespace(chunk);
      }
      if (this.opts.normalizePunctuation) {
        chunk = normalizePunctuation(chunk);
      }
      if (this.opts.removeBoilerplate) {
        chunk = removeBoilerplate(chunk);
      }
      if (this.opts.deduplicateSentences) {
        chunk = deduplicateSentences(chunk);
      }
      if (this.opts.shortenLongPaths) {
        chunk = shortenLongPaths(chunk);
      }
      if (Object.keys(this.opts.dictionaryMap).length > 0) {
        chunk = applyDictionaryMap(chunk, this.opts.dictionaryMap);
      }
      return chunk;
    };

    if (this.opts.preserveCodeBlocks) {
      text = processOutsideCodeBlocks(text, process);
    } else {
      text = process(text);
    }

    // Paragraph deduplication applies to the whole text after inner processing
    if (this.opts.collapseRepeatedParagraphs) {
      text = collapseRepeatedParagraphs(text);
    }

    return text.trim();
  }

  /**
   * Produces named variants at different compression levels.
   * Variants: original → normalized → alias-compressed → terse-technical
   */
  variants(input: string): PromptVariant[] {
    const originalTokens = this.estimator.estimate(input);

    // Variant 1: original
    const original: PromptVariant = {
      label: "original",
      text: input,
      estimatedTokens: originalTokens,
      compressionRatio: 1.0,
    };

    // Variant 2: normalized only (whitespace, punctuation)
    const normalizedText = processOutsideCodeBlocks(input, (t) => {
      let r = t;
      if (this.opts.normalizeWhitespace) r = normalizeWhitespace(r);
      if (this.opts.normalizePunctuation) r = normalizePunctuation(r);
      return r;
    });
    const normalizedTokens = this.estimator.estimate(normalizedText);
    const normalized: PromptVariant = {
      label: "normalized",
      text: normalizedText,
      estimatedTokens: normalizedTokens,
      compressionRatio: normalizedTokens / Math.max(originalTokens, 1),
    };

    // Variant 3: alias-compressed (adds dictionary and boilerplate removal)
    const aliasText = processOutsideCodeBlocks(normalizedText, (t) => {
      let r = removeBoilerplate(t);
      r = applyDictionaryMap(r, this.opts.dictionaryMap);
      if (this.opts.deduplicateSentences) r = deduplicateSentences(r);
      return r;
    });
    const aliasTokens = this.estimator.estimate(aliasText);
    const aliasCompressed: PromptVariant = {
      label: "alias-compressed",
      text: aliasText,
      estimatedTokens: aliasTokens,
      compressionRatio: aliasTokens / Math.max(originalTokens, 1),
    };

    // Variant 4: terse-technical (aggressive, path shortening)
    const terseText = shortenLongPaths(
      collapseRepeatedParagraphs(aliasText)
    );
    const terseTokens = this.estimator.estimate(terseText);
    const terseTechnical: PromptVariant = {
      label: "terse-technical",
      text: terseText,
      estimatedTokens: terseTokens,
      compressionRatio: terseTokens / Math.max(originalTokens, 1),
    };

    return [original, normalized, aliasCompressed, terseTechnical];
  }
}
