import { describe, expect, it } from "vitest";
import { mergeConfig } from "../src/config.js";
import { OptimizationPipeline } from "../src/core/pipeline.js";
import { TokenEstimator } from "../src/types.js";

const wordEstimator: TokenEstimator = {
  estimate(text: string): number {
    return text.split(/\W+/).filter(Boolean).length;
  },
};

describe("OptimizationPipeline", () => {
  it("reports actual and potential savings separately during dry-run", async () => {
    const config = mergeConfig({
      promptOptimizer: {
        semanticCompression: {
          enabled: false,
          useEnglishSemanticProvider: false,
          useWordPosWordNet: false,
        },
      },
    });

    const pipeline = new OptimizationPipeline(config, wordEstimator);
    const input =
      "Please analyze the database configuration for the repository and provide documentation.";

    const result = await pipeline.run({ prompt: input, dryRun: true });

    expect(result.optimized).toBe(input);
    expect(result.fallbackUsed).toBe(true);
    expect(result.estimatedSavings).toBe(0);
    expect(result.potentialSavings).toBeGreaterThan(0);
    expect(result.selectionResult?.chosen.label).toBe("original");
    expect(result.selectionResult?.estimatedSavings).toBe(0);
    expect(result.selectionResult?.potentialSavings).toBe(result.potentialSavings);
  });
});
