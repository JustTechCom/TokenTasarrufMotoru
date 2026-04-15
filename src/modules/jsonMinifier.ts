import { JsonMinifierOptions } from "../types.js";
import { safeParse, deepClean, applyKeyAliases } from "../utils/json.js";
import { defaultEstimator } from "../utils/estimator.js";

// ─── JSON Minifier ────────────────────────────────────────────────────────────

export interface MinifyResult {
  output: string;
  originalTokens: number;
  minifiedTokens: number;
  valid: boolean;
}

export class JsonMinifier {
  constructor(private opts: JsonMinifierOptions) {}

  minify(input: string): MinifyResult {
    const originalTokens = defaultEstimator.estimate(input);
    const parsed = safeParse(input);

    if (parsed === null) {
      // Not valid JSON — return original unchanged
      return {
        output: input,
        originalTokens,
        minifiedTokens: originalTokens,
        valid: false,
      };
    }

    let value = parsed;

    // Apply key aliases if provided
    if (Object.keys(this.opts.aliasMap).length > 0) {
      value = applyKeyAliases(value, this.opts.aliasMap);
    }

    // Remove unwanted entries
    value = deepClean(value, {
      removeNulls: this.opts.removeNulls,
      removeUndefined: this.opts.removeUndefined,
      removeEmptyArrays: this.opts.removeEmptyArrays,
      removeEmptyObjects: this.opts.removeEmptyObjects,
    }) ?? {};

    const output = JSON.stringify(value); // compact (no spaces)
    const minifiedTokens = defaultEstimator.estimate(output);

    return { output, originalTokens, minifiedTokens, valid: true };
  }

  /**
   * Minifies only if input looks like JSON (starts with { or [).
   * Otherwise returns the original string.
   */
  maybeMinify(input: string): string {
    const trimmed = input.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return this.minify(trimmed).output;
    }
    return input;
  }
}
