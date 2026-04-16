import { describe, it, expect } from "vitest";
import { VariantSelector } from "../src/modules/variantSelector.js";
import { PromptVariant } from "../src/types.js";

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

describe("VariantSelector", () => {
  it("selects more aggressive variant with lower threshold", () => {
    const selector = new VariantSelector({
      threshold: 0.5,
      dryRun: false,
      logViolations: false,
    });

    const result = selector.select(original, candidates);
    expect(result.chosen.label).toBe("aggressive");
  });

  it("selects less compressed variant with higher threshold", () => {
    const selector = new VariantSelector({
      threshold: 0.8,
      dryRun: false,
      logViolations: false,
    });

    const result = selector.select(original, candidates);
    expect(result.chosen.label).toBe("balanced");
  });
});
