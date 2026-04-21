# NLP-Based Hybrid Safety Scorer — Design Spec

**Date:** 2026-04-21  
**Status:** Approved  
**Scope:** `src/utils/text.ts`, `src/modules/safetyScorer.ts`, `tests/safetyScorer.nlp.test.ts`

---

## Problem

The current `SafetyScorer` measures semantic proximity between original and optimized text using word-level Jaccard similarity and character n-gram Jaccard similarity. Jaccard treats all terms as equal weight, which causes two failure modes:

1. **False negatives:** Aggressive but semantically valid compressions (e.g. `"database connection error"` → `"db conn error"`) score low because shared word overlap is small, triggering unnecessary fallback to the original.
2. **False positives (rare):** Texts with high word overlap but different meaning can slip through.

TF-IDF cosine similarity weights rare, informative terms higher and handles different document lengths naturally — making it more accurate for semantic comparison of technical prompts.

---

## Goals

- Replace Jaccard as the primary similarity metric with TF-IDF cosine similarity for texts of sufficient length.
- Keep Jaccard as the fallback for very short texts where TF-IDF is unreliable.
- Zero new external dependencies.
- `SafetyScorer.score()` remains synchronous; `VariantSelector` and all callers are unchanged.

---

## Architecture

### Decision boundary

```
score(original, optimized)
  ├─ tokenCount(original) < 6 ?
  │    └─ max(wordJaccard, ngramJaccard)       ← existing path, unchanged
  └─ else
       └─ max(tfidfCosine, wordJaccard)        ← new path
```

The `ngramJaccard` is dropped from the long-text path because TF-IDF subsumes its intent (morphological similarity is captured by term weighting). `wordJaccard` is retained as a floor to prevent edge cases where TF-IDF underestimates overlap on highly abbreviated text.

### Length penalty

Unchanged: if `optimized.length / original.length < 0.4`, a penalty of `(0.4 − ratio)` is subtracted from the final score. This guards against catastrophic compression regardless of similarity metric.

---

## TF-IDF Cosine Similarity

### Formula

```
TF(term, doc)  = occurrences(term, doc) / totalTerms(doc)
IDF(term)      = log(2 / (1 + docsContaining(term)))   // corpus = {original, optimized}
weight(t, d)   = TF(t, d) × IDF(t)
cosine(a, b)   = dotProduct(vecA, vecB) / (|vecA| × |vecB|)
```

Using `log(2 / (1 + df))` with a two-document corpus:
- Term appears in both docs → IDF = log(2/2) = 0 (shared background, low weight)
- Term appears in one doc only → IDF = log(2/1) ≈ 0.693 (discriminative, high weight)

This ensures that terms unique to the original (i.e. meaning lost in compression) are penalised most heavily.

### Normalisation

Before tokenisation: lowercase, strip punctuation. Stop-word removal is intentionally skipped — in short technical prompts, words like "not", "without", "only" carry semantic meaning.

### Edge cases

| Condition | Behaviour |
|-----------|-----------|
| Both texts identical | cosine = 1.0 |
| Zero vector (empty text after normalisation) | returns 0.0, length penalty applies |
| Single unique term in each | IDF-weighted, Jaccard floor covers it |
| `tokenCount(original) < 6` | Jaccard path used, TF-IDF not called |

---

## API Contract

`src/utils/text.ts` — new export:

```typescript
export function tfidfCosineSimilarity(a: string, b: string): number
// Returns 0.0–1.0. Pure function, synchronous, no I/O.
```

`src/modules/safetyScorer.ts` — `score()` change (diff):

```typescript
// Before
const similarity = Math.max(lexicalSimilarity, ngramSimilarity);

// After
const tokenCount = original.split(/\W+/).filter(Boolean).length;
const similarity = tokenCount < 6
  ? Math.max(lexicalSimilarity, ngramSimilarity)
  : Math.max(tfidfCosineSimilarity(original, optimized), lexicalSimilarity);
```

No other files change. `SafetyResult` type, `SafetyOptions`, `VariantSelector`, `pipeline.ts`, CLI, and MCP server are all unaffected.

---

## Tests

New file: `tests/safetyScorer.nlp.test.ts`

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Technical abbreviation: `"database connection error"` → `"db conn error"` | score ≥ threshold (no false fallback) |
| 2 | Completely different text | score < threshold |
| 3 | Short text (< 6 tokens) | Jaccard path used (same result as before) |
| 4 | Empty optimized string | score = 0, `passed = false` |
| 5 | Identical texts | score = 1.0, `passed = true` |

Regression requirement: all existing tests in `tests/safetyScorer.test.ts` (if present) must continue to pass without modification.

---

## Files Changed

```
src/utils/text.ts                           add tfidfCosineSimilarity()
src/modules/safetyScorer.ts                 update score() decision branch
tests/safetyScorer.nlp.test.ts              new test file
```

---

## Out of Scope

- External embedding models (`@xenova/transformers`, etc.)
- Async `score()` signature
- Changes to `SafetyOptions` config shape
- Stop-word lists or language detection
