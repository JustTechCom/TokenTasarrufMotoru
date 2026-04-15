import { SafetyResult } from "../types.js";
import { logger } from "../logger.js";

// ─── Fallback Handler ─────────────────────────────────────────────────────────

export interface FallbackDecision {
  useOriginal: boolean;
  reason: string;
}

/**
 * Determines whether to use the original prompt or the optimized version.
 * Returns original if safety check failed or dry-run is active.
 */
export function decideFallback(
  safetyResult: SafetyResult,
  dryRun: boolean
): FallbackDecision {
  if (dryRun) {
    return {
      useOriginal: true,
      reason: "dry-run mode — no modifications applied",
    };
  }

  if (!safetyResult.passed) {
    logger.warn(`Fallback triggered: ${safetyResult.reason}`);
    return {
      useOriginal: true,
      reason: safetyResult.reason ?? "safety threshold not met",
    };
  }

  return {
    useOriginal: false,
    reason: "safety threshold passed",
  };
}
