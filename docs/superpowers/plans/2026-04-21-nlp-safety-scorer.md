# NLP Hybrid Safety Scorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Jaccard as the primary similarity metric in `SafetyScorer` with TF-IDF cosine similarity for texts ≥ 6 tokens, keeping Jaccard as fallback for short texts.

**Architecture:** Add `tfidfCosineSimilarity()` as a pure function in `src/utils/text.ts`. Update `SafetyScorer.score()` with a token-count branch: short texts (< 6 tokens) use the existing `max(wordJaccard, ngramJaccard)` path; long texts use `max(tfidfCosine, wordJaccard)`. No other files change.

**Tech Stack:** TypeScript, Vitest — zero new dependencies.

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `src/utils/text.ts` | Add `tfidfCosineSimilarity(a, b): number` |
| Modify | `src/modules/safetyScorer.ts` | Update `score()` branch logic |
| Create | `tests/safetyScorer.nlp.test.ts` | TF-IDF and hybrid path tests |

---

## Task 1: Write failing tests for `tfidfCosineSimilarity`

**Files:**
- Create: `tests/safetyScorer.nlp.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
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
    expect(score).toBeGreaterThan(0.5);
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd /root/TokenTasarrufMotoru && npm test -- tests/safetyScorer.nlp.test.ts
```

Expected: 5 failures — `tfidfCosineSimilarity is not a function` or similar import error.

---

## Task 2: Implement `tfidfCosineSimilarity` in `src/utils/text.ts`

**Files:**
- Modify: `src/utils/text.ts` — append new export at the end of the file

- [ ] **Step 1: Append the function to `src/utils/text.ts`**

Add after the last function in the file (`charNgramSimilarity`):

```typescript
/**
 * TF-IDF cosine similarity between two texts.
 * Corpus = {a, b} (two-document local IDF).
 * Returns 0.0–1.0. Synchronous, no I/O, no external dependencies.
 */
export function tfidfCosineSimilarity(a: string, b: string): number {
  const tokenize = (text: string): string[] =>
    text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  // Term frequency: count / total
  const tf = (tokens: string[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    const total = tokens.length;
    const result = new Map<string, number>();
    for (const [term, count] of counts) result.set(term, count / total);
    return result;
  };

  const tfA = tf(tokensA);
  const tfB = tf(tokensB);

  // IDF over 2-doc corpus: log(2 / (1 + df))
  const vocab = new Set([...tfA.keys(), ...tfB.keys()]);
  const idf = new Map<string, number>();
  for (const term of vocab) {
    const df = (tfA.has(term) ? 1 : 0) + (tfB.has(term) ? 1 : 0);
    idf.set(term, Math.log(2 / (1 + df)));
  }

  // TF-IDF vectors
  const vecA = new Map<string, number>();
  const vecB = new Map<string, number>();
  for (const term of vocab) {
    vecA.set(term, (tfA.get(term) ?? 0) * (idf.get(term) ?? 0));
    vecB.set(term, (tfB.get(term) ?? 0) * (idf.get(term) ?? 0));
  }

  // Cosine similarity
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const term of vocab) {
    const va = vecA.get(term) ?? 0;
    const vb = vecB.get(term) ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0.0 : Math.min(1.0, dot / denom);
}
```

- [ ] **Step 2: Run the TF-IDF unit tests**

```bash
cd /root/TokenTasarrufMotoru && npm test -- tests/safetyScorer.nlp.test.ts
```

Expected: 5 tests pass (the `tfidfCosineSimilarity` describe block).

---

## Task 3: Write failing tests for the hybrid `SafetyScorer`

**Files:**
- Modify: `tests/safetyScorer.nlp.test.ts` — append a new `describe` block

- [ ] **Step 1: Append the SafetyScorer hybrid tests**

Add after the existing `describe("tfidfCosineSimilarity", ...)` block:

```typescript
import { SafetyScorer } from "../src/modules/safetyScorer.js";

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
    // 4 tokens — short path
    const original = "fix auth bug";
    const optimized = "fix auth issue";
    const result = scorer.score(original, optimized);
    // Jaccard gives high overlap for near-identical short texts
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
```

- [ ] **Step 2: Run tests to confirm hybrid tests fail (SafetyScorer not yet updated)**

```bash
cd /root/TokenTasarrufMotoru && npm test -- tests/safetyScorer.nlp.test.ts
```

Expected: 5 TF-IDF tests still pass; the "passes technical abbreviation" hybrid test may fail (Jaccard gives low score for abbreviated text).

---

## Task 4: Update `SafetyScorer.score()` with hybrid branch

**Files:**
- Modify: `src/modules/safetyScorer.ts`

- [ ] **Step 1: Add the import for `tfidfCosineSimilarity`**

At the top of `src/modules/safetyScorer.ts`, update the import line:

```typescript
import { charNgramSimilarity, wordSimilarity, tfidfCosineSimilarity } from "../utils/text.js";
```

- [ ] **Step 2: Update the `score()` method body**

Replace the `similarity` calculation (lines ~17–19) with:

```typescript
  score(original: string, optimized: string): SafetyResult {
    const lexicalSimilarity = wordSimilarity(original, optimized);
    const ngramSimilarity = charNgramSimilarity(original, optimized);

    const tokenCount = original.split(/\W+/).filter(Boolean).length;
    const similarity = tokenCount < 6
      ? Math.max(lexicalSimilarity, ngramSimilarity)
      : Math.max(tfidfCosineSimilarity(original, optimized), lexicalSimilarity);

    // Length ratio guard: if optimized is less than 40% the original length
    // in chars, it's likely too aggressive regardless of word overlap.
    const lengthRatio = optimized.length / Math.max(original.length, 1);
    const lengthPenalty = lengthRatio < 0.4 ? 0.4 - lengthRatio : 0;

    const finalScore = Math.max(0, similarity - lengthPenalty);
    const passed = finalScore >= this.opts.threshold;

    if (!passed && this.opts.logViolations) {
      logger.warn(
        `Safety check failed: score=${finalScore.toFixed(3)}, ` +
        `threshold=${this.opts.threshold}, ` +
        `similarity=${similarity.toFixed(3)}, ` +
        `lexical=${lexicalSimilarity.toFixed(3)}, ` +
        `ngram=${ngramSimilarity.toFixed(3)}, ` +
        `lengthRatio=${lengthRatio.toFixed(3)}`
      );
    }

    return {
      score: finalScore,
      passed,
      reason: passed
        ? undefined
        : `Similarity ${finalScore.toFixed(3)} below threshold ${this.opts.threshold}`,
    };
  }
```

- [ ] **Step 3: Run the full test suite**

```bash
cd /root/TokenTasarrufMotoru && npm test
```

Expected: all tests pass including the new hybrid tests. Existing `variantSelector.test.ts` tests must also pass.

- [ ] **Step 4: Commit**

```bash
cd /root/TokenTasarrufMotoru && git add src/utils/text.ts src/modules/safetyScorer.ts tests/safetyScorer.nlp.test.ts && git commit -m "feat: hybrid TF-IDF/Jaccard safety scorer"
```

---

## Task 5: Update README roadmap

**Files:**
- Modify: `README.md` — mark roadmap item as complete (both EN and TR sections)

- [ ] **Step 1: Mark the item done in the English roadmap section**

Find and replace in `README.md` (English section):

```markdown
- [ ] **NLP-based safety scorer** — embedding similarity instead of Jaccard
```

Replace with:

```markdown
- [x] ~~**NLP-based safety scorer** — hybrid TF-IDF cosine + Jaccard fallback for short texts~~
```

- [ ] **Step 2: Mark the item done in the Turkish roadmap section**

Find and replace in `README.md` (Turkish section):

```markdown
- [ ] **NLP tabanlı güvenlik puanlayıcı** — Jaccard yerine embedding benzerliği
```

Replace with:

```markdown
- [x] ~~**NLP tabanlı güvenlik puanlayıcı** — kısa metinler için Jaccard fallback'li hybrid TF-IDF cosine~~
```

- [ ] **Step 3: Commit**

```bash
cd /root/TokenTasarrufMotoru && git add README.md && git commit -m "docs: mark NLP safety scorer as complete"
```

---

## Task 6: Push

- [ ] **Step 1: Push all commits**

```bash
cd /root/TokenTasarrufMotoru && git push origin main
```

Expected: `main -> main` push success.
