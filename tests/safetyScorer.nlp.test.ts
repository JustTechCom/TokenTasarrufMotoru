// tests/safetyScorer.nlp.test.ts
import { describe, it, expect } from "vitest";
import { tfidfCosineSimilarity } from "../src/utils/text.js";
import { SafetyScorer } from "../src/modules/safetyScorer.js";

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

describe("SafetyScorer abbreviation expansion", () => {
  const expansions = {
    db: "database",
    conn: "connection",
    auth: "authentication",
    config: "configuration",
    env: "environment",
    repo: "repository",
  };
  const opts = { threshold: 0.4, dryRun: false, logViolations: false, abbreviationExpansions: expansions };
  const scorer = new SafetyScorer(opts);

  it("passes boilerplate-removed + abbreviated variant that would otherwise fall below threshold", () => {
    // Exact scenario from the CLI regression report
    const original =
      "Please could you kindly analyze the database connection timeout error in the authentication service logs";
    // After boilerplate removal ("Please could you kindly") + alias compression (db, conn, auth)
    const compressed = "study the db conn timeout error in the auth service logs";
    const result = scorer.score(original, compressed);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0.4);
  });

  it("does not inflate score for truly unrelated text even with expansions", () => {
    const original =
      "Please could you kindly analyze the database connection timeout error in the authentication service logs";
    const unrelated = "write a poem about autumn leaves";
    const result = scorer.score(original, unrelated);
    expect(result.passed).toBe(false);
  });
});

describe("SafetyScorer hybrid path", () => {
  const opts = { threshold: 0.4, dryRun: false, logViolations: false };
  const scorer = new SafetyScorer(opts);

  it("passes technical abbreviation that Jaccard-only would reject", () => {
    // 10 tokens — long path, TF-IDF used
    const original = "analyze the database connection timeout error in the authentication service logs";
    const compressed = "analyze db conn timeout error in auth service logs";
    const result = scorer.score(original, compressed);
    expect(result.passed).toBe(true);
  });

  it("fails completely unrelated text", () => {
    const original = "deploy kubernetes cluster with rolling updates and health probes";
    const unrelated = "write a poem about autumn leaves falling in the forest";
    const result = scorer.score(original, unrelated);
    expect(result.passed).toBe(false);
  });

  it("uses Jaccard path for short texts (< 6 tokens)", () => {
    // 3 tokens — short path
    const original = "fix auth bug";
    const optimized = "fix auth issue";
    const result = scorer.score(original, optimized);
    expect(result.passed).toBe(true);
  });

  it("fails when optimized is empty regardless of path", () => {
    const original = "analyze the database connection timeout error in the service";
    const result = scorer.score(original, "");
    expect(result.passed).toBe(false);
  });

  it("passes identical text", () => {
    const text = "deploy service to production with rollback and health checks enabled";
    const result = scorer.score(text, text);
    expect(result.passed).toBe(true);
    expect(result.score).toBeCloseTo(1.0, 1);
  });
});
