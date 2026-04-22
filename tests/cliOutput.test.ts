import { describe, expect, it } from "vitest";
import { formatCandidateOutputs } from "../src/utils/cliOutput.js";
import { SelectionResult } from "../src/types.js";

describe("formatCandidateOutputs", () => {
  it("formats every candidate and marks the chosen one", () => {
    const selectionResult: SelectionResult = {
      original: {
        label: "original",
        text: "Please analyze the timeout issue in detail.",
        estimatedTokens: 10,
        compressionRatio: 1,
      },
      candidates: [
        {
          label: "normalized",
          text: "Analyze the timeout issue in detail.",
          estimatedTokens: 8,
          compressionRatio: 0.8,
        },
        {
          label: "normalized+alias-compressed+terse-technical",
          text: "Analyze timeout issue.",
          estimatedTokens: 5,
          compressionRatio: 0.5,
        },
      ],
      chosen: {
        label: "normalized",
        text: "Analyze the timeout issue in detail.",
        estimatedTokens: 8,
        compressionRatio: 0.8,
      },
      estimatedSavings: 2,
      potentialSavings: 5,
      safetyScore: 0.95,
    };

    expect(formatCandidateOutputs(selectionResult)).toEqual([
      "[normalized] 8 tokens (80.0%) <- chosen\nAnalyze the timeout issue in detail.",
      "[normalized+alias-compressed+terse-technical] 5 tokens (50.0%)\nAnalyze timeout issue.",
    ]);
  });
});
