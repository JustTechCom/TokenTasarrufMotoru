import { SelectionResult } from "../types.js";

export function formatCandidateOutputs(selectionResult: SelectionResult): string[] {
  return selectionResult.candidates.map((candidate) => {
    const chosenMarker = candidate.label === selectionResult.chosen.label ? " <- chosen" : "";
    const header =
      `[${candidate.label}] ${candidate.estimatedTokens} tokens ` +
      `(${(candidate.compressionRatio * 100).toFixed(1)}%)${chosenMarker}`;

    return `${header}\n${candidate.text}`;
  });
}
