# Ollama Optimizer — Design Spec

**Date:** 2026-04-21  
**Status:** Approved  
**Scope:** `src/types.ts`, `src/config.ts`, `src/modules/ollamaOptimizer.ts`, `src/modules/promptOptimizer.ts`, `tests/ollamaOptimizer.test.ts`, `tests/promptOptimizer.test.ts`

---

## Problem

The current `PromptOptimizer` generates variants using rule-based compression (boilerplate removal, deduplication, semantic phrase replacement). These rules are fast and reliable but produce modest compression. A local LLM can understand prompt intent and produce semantically superior rewrites — shorter without losing meaning.

---

## Goals

- Add Gemma 4 (via Ollama) as an additional variant producer in the existing variant competition.
- Keep token counting with the existing heuristic/Claude tokenizer — Gemma is optimizer only.
- Fail gracefully: if Ollama is offline or slow, rule-based variants still compete normally.
- Zero new npm dependencies — use Node.js built-in `fetch`.
- Opt-in via config (`enabled: false` by default).

---

## Architecture

### New config block: `ollamaOptimizer`

Added to `OptimizationConfig` in `src/types.ts` and `defaultConfig` in `src/config.ts`:

```typescript
interface OllamaOptimizerOptions {
  enabled: boolean;    // default: false
  baseUrl: string;     // default: "http://localhost:11434"
  model: string;       // default: "gemma4"
  timeoutMs: number;   // default: 10000
}
```

`enabled: false` means `OllamaOptimizer` is never instantiated — complete no-op, no network calls.

### New class: `OllamaOptimizer` (`src/modules/ollamaOptimizer.ts`)

Single public method:

```typescript
async generateVariant(prompt: string): Promise<PromptVariant | null>
```

**Flow:**
1. POST to `{baseUrl}/api/generate` with `{ model, prompt: "<system>\n\n<user prompt>", stream: false }`
2. System prompt: `"Rewrite the following prompt to be shorter and more concise while preserving all intent. Return only the rewritten text, nothing else."`
3. Parse `response` field from JSON body
4. If response is longer than or equal to original → return `null`
5. If success → return `{ label: "ollama-gemma4", text: response, estimatedTokens: heuristic(response) }`
6. Any error (network, timeout, parse) → return `null`

Token estimation for the returned variant uses `HeuristicTokenEstimator` directly — no extra Ollama calls.

### Integration with `PromptOptimizer.variantsAsync()`

`PromptOptimizer` is constructed with an optional `OllamaOptimizer`. In `variantsAsync()`, rule-based variants and the Ollama variant are generated **in parallel**:

```typescript
const [ruleVariants, ollamaVariant] = await Promise.all([
  this.generateRuleBasedVariants(prompt),
  this.ollamaOptimizer?.generateVariant(prompt) ?? Promise.resolve(null),
]);
const all = ollamaVariant ? [...ruleVariants, ollamaVariant] : ruleVariants;
```

`VariantSelector` already picks the best token-saving variant — no selection logic changes.

---

## Ollama API Contract

```
POST {baseUrl}/api/generate
Content-Type: application/json

{
  "model": "gemma4",
  "prompt": "...",
  "stream": false
}

Response:
{
  "response": "<rewritten text>",
  ...
}
```

Request is cancelled via `AbortController` after `timeoutMs`.

---

## Error Handling

| Condition | Behaviour |
|-----------|-----------|
| Ollama offline / ECONNREFUSED | Return `null` — rule-based variants compete normally |
| Request exceeds `timeoutMs` | Abort via `AbortController`, return `null` |
| Response body longer than original | Return `null` — not a useful compression |
| Empty response | Return `null` |
| JSON parse error | Return `null` |
| `enabled: false` | `OllamaOptimizer` not instantiated, `variantsAsync()` unchanged |

All errors are caught internally — `generateVariant()` never throws.

---

## Configuration Example

```json
{
  "ollamaOptimizer": {
    "enabled": true,
    "baseUrl": "http://localhost:11434",
    "model": "gemma4",
    "timeoutMs": 10000
  }
}
```

Enable via CLI:

```bash
claude-token-optimizer --config ./optimizer.config.json optimize --input "..."
```

---

## Tests

### `tests/ollamaOptimizer.test.ts` (new, 5 unit tests)

All tests mock `fetch` — no real Ollama required.

| # | Test |
|---|------|
| 1 | Successful response returns variant with `label: "ollama-gemma4"` |
| 2 | Response longer than original returns `null` |
| 3 | Network error (fetch throws) returns `null` without throwing |
| 4 | Timeout (AbortController fires) returns `null` without throwing |
| 5 | `enabled: false` — fetch is never called |

### `tests/promptOptimizer.test.ts` (append 2 integration tests)

| # | Test |
|---|------|
| 6 | Ollama variant joins competition — mock returns short text, selector can pick it |
| 7 | Ollama offline — pipeline produces rule-based variants normally |

---

## Files Changed

```
src/types.ts                     add OllamaOptimizerOptions; extend OptimizationConfig
src/config.ts                    add ollamaOptimizer defaults (enabled: false)
src/modules/ollamaOptimizer.ts   new — OllamaOptimizer class
src/modules/promptOptimizer.ts   accept optional OllamaOptimizer; parallel call in variantsAsync()
tests/ollamaOptimizer.test.ts    new — 5 unit tests with fetch mocks
tests/promptOptimizer.test.ts    append 2 integration tests
```

---

## Out of Scope

- Using Ollama for token counting (stays with heuristic/Claude tokenizer)
- Streaming responses from Ollama
- Multiple concurrent Ollama models
- LM Studio or other backends
- Fine-tuning prompts sent to Gemma per use case
