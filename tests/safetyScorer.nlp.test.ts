// tests/safetyScorer.nlp.test.ts
import { describe, it, expect } from "vitest";
import { tfidfCosineSimilarity } from "../src/utils/text.js";

describe("tfidfCosineSimilarity", () => {
  it("returns 1.0 for identical texts", () => {
    const text = "analyze the database connection timeout error";
    expect(tfidfCosineSimilarity(text, text)).toBeCloseTo(1.0, 5);
  });

  it("returns high score for technical abbreviation (false-negative guard)", () => {
    const original = "analyze the database connection timeout error in the authentication service logs";
    const compressed = "analyze db conn timeout error in auth service logs";
    const score = tfidfCosineSimilarity(original, compressed);
    expect(score).toBeGreaterThan(0.30);
  });

  it("returns low score for completely different texts", () => {
    const a = "deploy kubernetes cluster with rolling updates and health probes";
    const b = "write a poem about autumn leaves falling in the forest";
    const score = tfidfCosineSimilarity(a, b);
    expect(score).toBeLessThan(0.2);
  });

  it("returns 0.0 when optimized is empty", () => {
    expect(tfidfCosineSimilarity("some meaningful content here", "")).toBe(0.0);
  });

  it("returns 0.0 when both texts are empty", () => {
    expect(tfidfCosineSimilarity("", "")).toBe(0.0);
  });
});
