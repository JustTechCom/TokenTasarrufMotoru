import { TokenEstimator } from "../types.js";

// ─── Heuristic Token Estimator ─────────────────────────────────────────────────
//
// Fast offline approximation. No external dependency.
// English text: ~4 chars/token, code/JSON: ~3.5 chars/token.

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;

export class HeuristicTokenEstimator implements TokenEstimator {
  estimate(text: string): number {
    if (!text || text.length === 0) return 0;

    const codeBlocks: string[] = [];
    const withoutCode = text.replace(CODE_BLOCK_PATTERN, (block) => {
      codeBlocks.push(block);
      return "";
    });

    const codeTokens = codeBlocks.reduce(
      (acc, b) => acc + Math.ceil(b.length / 3.5),
      0
    );
    const textTokens = Math.ceil(withoutCode.length / 4);

    return codeTokens + textTokens;
  }
}

// ─── Claude Tokenizer (real, @anthropic-ai/tokenizer) ─────────────────────────
//
// Uses the official Anthropic tokenizer — exact token counts for Claude models.
// Loaded lazily so the package is optional: if import fails, we fall back to
// HeuristicTokenEstimator without crashing.

export class ClaudeTokenEstimator implements TokenEstimator {
  private countFn: ((text: string) => number) | null = null;
  private initAttempted = false;

  private async init(): Promise<void> {
    if (this.initAttempted) return;
    this.initAttempted = true;
    try {
      const mod = await import("@anthropic-ai/tokenizer");
      this.countFn = mod.countTokens as (text: string) => number;
    } catch {
      // Package not installed — silently degrade to null
    }
  }

  estimate(text: string): number {
    // Synchronous path: if countFn is already loaded use it, else heuristic
    if (this.countFn) {
      return this.countFn(text);
    }
    // Trigger async init for next call (fire-and-forget)
    void this.init();
    return new HeuristicTokenEstimator().estimate(text);
  }

  /**
   * Warm up: loads the tokenizer module so the first real call is synchronous.
   */
  async warmup(): Promise<boolean> {
    await this.init();
    return this.countFn !== null;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export type EstimatorType = "heuristic" | "claude";

/**
 * Creates and warms up a token estimator.
 *
 * @param type "claude" uses @anthropic-ai/tokenizer (falls back to heuristic
 *             if the package is unavailable). "heuristic" always uses the
 *             fast offline approximation.
 */
export async function createEstimator(
  type: EstimatorType = "claude"
): Promise<TokenEstimator> {
  if (type === "heuristic") return new HeuristicTokenEstimator();

  const est = new ClaudeTokenEstimator();
  const available = await est.warmup();
  if (!available) {
    // graceful fallback
    console.warn(
      "[token-optimizer] @anthropic-ai/tokenizer not available, using heuristic estimator"
    );
    return new HeuristicTokenEstimator();
  }
  return est;
}

// Default singleton — heuristic (sync-safe, no async required at import time)
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
