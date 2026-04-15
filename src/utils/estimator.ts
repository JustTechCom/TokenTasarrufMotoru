import { TokenEstimator } from "../types.js";

// ─── Heuristic Token Estimator ─────────────────────────────────────────────────
//
// This is a swap-in-ready heuristic. Replace with a real tokenizer
// (e.g. @anthropic-ai/tokenizer or tiktoken) by implementing the
// TokenEstimator interface and passing it to VariantSelector.
//
// Heuristic method:
//   English text: ~4 characters per token (OpenAI-style approximation)
//   Code/JSON: ~3.5 characters per token (more tokens due to symbols)
//   Whitespace is counted but normalized

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;

export class HeuristicTokenEstimator implements TokenEstimator {
  estimate(text: string): number {
    if (!text || text.length === 0) return 0;

    let codeTokens = 0;
    let textTokens = 0;

    // Extract and measure code blocks separately (denser tokens)
    const codeBlocks: string[] = [];
    const withoutCode = text.replace(CODE_BLOCK_PATTERN, (block) => {
      codeBlocks.push(block);
      return "";
    });

    // Code blocks: ~3.5 chars/token → more token-dense
    for (const block of codeBlocks) {
      codeTokens += Math.ceil(block.length / 3.5);
    }

    // Regular text: ~4 chars/token
    textTokens = Math.ceil(withoutCode.length / 4);

    return codeTokens + textTokens;
  }
}

// Singleton default estimator
export const defaultEstimator: TokenEstimator = new HeuristicTokenEstimator();

/**
 * Calculates how many tokens would be saved between two texts.
 */
export function tokenSavings(
  original: string,
  optimized: string,
  estimator: TokenEstimator = defaultEstimator
): number {
  return estimator.estimate(original) - estimator.estimate(optimized);
}
