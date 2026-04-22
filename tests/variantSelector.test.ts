import { describe, it, expect } from "vitest";
import { VariantSelector } from "../src/modules/variantSelector.js";
import { PromptVariant, TokenEstimator } from "../src/types.js";

const original = "deploy service to production with rollback and health checks enabled";

const candidates: PromptVariant[] = [
  {
    label: "aggressive",
    text: "deploy production rollback health checks",
    estimatedTokens: 5,
    compressionRatio: 0.45,
  },
  {
    label: "balanced",
    text: "deploy service to production with rollback and health checks",
    estimatedTokens: 8,
    compressionRatio: 0.75,
  },
];

const wordEstimator: TokenEstimator = {
  estimate(text: string): number {
    return text.split(/\W+/).filter(Boolean).length;
  },
};

describe("VariantSelector", () => {
  it("selects the most compressed candidate even with a lower threshold", () => {
    const selector = new VariantSelector({
      threshold: 0.5,
      dryRun: false,
      logViolations: false,
    }, wordEstimator);

    const result = selector.select(original, candidates);
    expect(result.chosen.label).toBe("aggressive");
    expect(result.estimatedSavings).toBe(5);
    expect(result.potentialSavings).toBe(5);
  });

  it("still selects the most compressed candidate with a higher threshold", () => {
    const selector = new VariantSelector({
      threshold: 0.8,
      dryRun: false,
      logViolations: false,
    }, wordEstimator);

    const result = selector.select(original, candidates);
    expect(result.chosen.label).toBe("aggressive");
    expect(result.estimatedSavings).toBe(5);
    expect(result.potentialSavings).toBe(5);
    expect(result.safetyScore).toBeLessThan(0.8);
  });
});
