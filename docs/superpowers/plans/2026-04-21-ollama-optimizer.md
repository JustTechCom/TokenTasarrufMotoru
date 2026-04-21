# Ollama Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gemma 4 (via Ollama) as an additional variant producer in the existing PromptOptimizer variant competition — shorter prompts win.

**Architecture:** `OllamaOptimizer` is a new standalone class that POSTs to Ollama's `/api/generate` endpoint and returns a `PromptVariant | null`. `PromptOptimizer.variantsAsync()` runs it in parallel with existing rule-based variants using `Promise.all`. Token counting stays with `HeuristicTokenEstimator`. Feature is opt-in via `ollamaOptimizer.enabled: false` default.

**Tech Stack:** TypeScript, Node.js built-in `fetch`, `AbortController`, Vitest, existing `HeuristicTokenEstimator`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add `OllamaOptimizerOptions`; extend `OptimizationConfig` |
| `src/config.ts` | Modify | Add `ollamaOptimizer` defaults (`enabled: false`) |
| `src/modules/ollamaOptimizer.ts` | Create | `OllamaOptimizer` class with `generateVariant()` |
| `src/modules/promptOptimizer.ts` | Modify | Accept optional `OllamaOptimizer`; parallel call in `variantsAsync()` |
| `tests/ollamaOptimizer.test.ts` | Create | 5 unit tests with fetch mocks |
| `tests/promptOptimizer.test.ts` | Modify | 2 integration tests appended |

---

### Task 1: Types and Config

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Add `OllamaOptimizerOptions` to `src/types.ts`**

Open `src/types.ts`. After the `SafetyOptions` block (around line 160), add:

```typescript
// ─── Ollama Optimizer ─────────────────────────────────────────────────────────

export interface OllamaOptimizerOptions {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}
```

Then in the `OptimizationConfig` interface (lines 6-14), add `ollamaOptimizer` as the last field:

```typescript
export interface OptimizationConfig {
  promptOptimizer: PromptOptimizerOptions;
  jsonMinifier: JsonMinifierOptions;
  logFilter: LogFilterOptions;
  diffFilter: DiffFilterOptions;
  contextRegistry: ContextRegistryOptions;
  policy: PolicyOptions;
  safety: SafetyOptions;
  ollamaOptimizer: OllamaOptimizerOptions;
}
```

- [ ] **Step 2: Add `ollamaOptimizer` defaults to `src/config.ts`**

In `defaultConfig` (after the `safety` block, around line 115), add:

```typescript
  ollamaOptimizer: {
    enabled: false,
    baseUrl: "http://localhost:11434",
    model: "gemma4",
    timeoutMs: 10000,
  },
```

Also update `mergeConfig()` — the existing deep-merge loop handles all top-level sections automatically, so no change needed there. But `loadConfigFile` already calls `mergeConfig`, so it works for JSON config too.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /root/TokenTasarrufMotoru && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/config.ts
git commit -m "feat: add OllamaOptimizerOptions type and config defaults"
```

---

### Task 2: Write failing unit tests for OllamaOptimizer

**Files:**
- Create: `tests/ollamaOptimizer.test.ts`

- [ ] **Step 1: Write the 5 failing unit tests**

Create `tests/ollamaOptimizer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaOptimizer } from "../src/modules/ollamaOptimizer.js";

const BASE_OPTS = {
  enabled: true,
  baseUrl: "http://localhost:11434",
  model: "gemma4",
  timeoutMs: 5000,
};

describe("OllamaOptimizer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns variant with label 'ollama-gemma4' on successful shorter response", async () => {
    const input = "Please could you analyze this long error message for me and tell me what is wrong with it.";
    const shorterResponse = "Analyze this error.";
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: shorterResponse }),
    });

    const optimizer = new OllamaOptimizer(BASE_OPTS);
    const result = await optimizer.generateVariant(input);

    expect(result).not.toBeNull();
    expect(result!.label).toBe("ollama-gemma4");
    expect(result!.text).toBe(shorterResponse);
    expect(result!.estimatedTokens).toBeGreaterThan(0);
    expect(result!.compressionRatio).toBeLessThan(1);
  });

  it("returns null when response is longer than or equal to original", async () => {
    const input = "Short prompt.";
    const longerResponse = "This is a much longer response that expands the original prompt significantly and adds nothing.";
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: longerResponse }),
    });

    const optimizer = new OllamaOptimizer(BASE_OPTS);
    const result = await optimizer.generateVariant(input);

    expect(result).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const optimizer = new OllamaOptimizer(BASE_OPTS);
    const result = await optimizer.generateVariant("Any prompt here.");

    expect(result).toBeNull();
  });

  it("returns null on timeout (AbortController fires)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          (opts.signal as AbortSignal).addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError"))
          );
        })
    );

    const optimizer = new OllamaOptimizer({ ...BASE_OPTS, timeoutMs: 50 });
    const result = await optimizer.generateVariant("Any prompt here.");

    expect(result).toBeNull();
  });

  it("does not call fetch when enabled is false", async () => {
    const optimizer = new OllamaOptimizer({ ...BASE_OPTS, enabled: false });
    const result = await optimizer.generateVariant("Any prompt here.");

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail (class does not exist yet)**

```bash
cd /root/TokenTasarrufMotoru && npx vitest run tests/ollamaOptimizer.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../src/modules/ollamaOptimizer.js'`

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/ollamaOptimizer.test.ts
git commit -m "test: add 5 failing unit tests for OllamaOptimizer"
```

---

### Task 3: Implement OllamaOptimizer

**Files:**
- Create: `src/modules/ollamaOptimizer.ts`

- [ ] **Step 1: Create the implementation**

Create `src/modules/ollamaOptimizer.ts`:

```typescript
import { OllamaOptimizerOptions, PromptVariant } from "../types.js";
import { defaultEstimator } from "../utils/estimator.js";

const SYSTEM_PROMPT =
  "Rewrite the following prompt to be shorter and more concise while preserving all intent. Return only the rewritten text, nothing else.";

export class OllamaOptimizer {
  constructor(private opts: OllamaOptimizerOptions) {}

  async generateVariant(prompt: string): Promise<PromptVariant | null> {
    if (!this.opts.enabled) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);

    try {
      const res = await fetch(`${this.opts.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.opts.model,
          prompt: `${SYSTEM_PROMPT}\n\n${prompt}`,
          stream: false,
        }),
        signal: controller.signal,
      });

      const data = (await res.json()) as { response?: string };
      const text = data.response ?? "";

      if (!text || text.length >= prompt.length) return null;

      const originalTokens = defaultEstimator.estimate(prompt);
      const estimatedTokens = defaultEstimator.estimate(text);

      return {
        label: "ollama-gemma4",
        text,
        estimatedTokens,
        compressionRatio: estimatedTokens / Math.max(originalTokens, 1),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 2: Run the unit tests — all 5 should pass**

```bash
cd /root/TokenTasarrufMotoru && npx vitest run tests/ollamaOptimizer.test.ts
```

Expected: 5 passed.

- [ ] **Step 3: Compile check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/ollamaOptimizer.ts
git commit -m "feat: implement OllamaOptimizer with AbortController timeout"
```

---

### Task 4: Write failing integration tests for PromptOptimizer

**Files:**
- Modify: `tests/promptOptimizer.test.ts`

- [ ] **Step 1: Append 2 integration tests**

Open `tests/promptOptimizer.test.ts` and append this new `describe` block at the end of the file (after the closing `}` of the existing `describe`):

```typescript
import { OllamaOptimizer } from "../src/modules/ollamaOptimizer.js";

describe("PromptOptimizer + OllamaOptimizer integration", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ollama variant joins competition — selector can pick it when it is shortest", async () => {
    const shortText = "Do X.";
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: shortText }),
    });

    const ollamaOpts = {
      enabled: true,
      baseUrl: "http://localhost:11434",
      model: "gemma4",
      timeoutMs: 5000,
    };
    const ollamaOptimizer = new OllamaOptimizer(ollamaOpts);
    const optimizer = new PromptOptimizer(defaultConfig.promptOptimizer, undefined, ollamaOptimizer);

    const input = "Please could you analyze this long error message for me and explain what went wrong.";
    const variants = await optimizer.variantsAsync(input);

    const labels = variants.map((v) => v.label);
    expect(labels).toContain("ollama-gemma4");

    const ollamaVariant = variants.find((v) => v.label === "ollama-gemma4")!;
    expect(ollamaVariant.text).toBe(shortText);
  });

  it("ollama offline — variantsAsync produces rule-based variants normally", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const ollamaOpts = {
      enabled: true,
      baseUrl: "http://localhost:11434",
      model: "gemma4",
      timeoutMs: 5000,
    };
    const ollamaOptimizer = new OllamaOptimizer(ollamaOpts);
    const optimizer = new PromptOptimizer(defaultConfig.promptOptimizer, undefined, ollamaOptimizer);

    const input = "Please could you analyze this error for me.";
    const variants = await optimizer.variantsAsync(input);

    expect(variants.length).toBeGreaterThanOrEqual(4);
    const labels = variants.map((v) => v.label);
    expect(labels).not.toContain("ollama-gemma4");
    expect(labels).toContain("original");
  });
});
```

Also add `vi` and `beforeEach`/`afterEach` to the import at the top of `tests/promptOptimizer.test.ts` if not already present:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
```

- [ ] **Step 2: Run to confirm they fail (PromptOptimizer doesn't accept 3rd arg yet)**

```bash
cd /root/TokenTasarrufMotoru && npx vitest run tests/promptOptimizer.test.ts 2>&1 | tail -20
```

Expected: FAIL — integration tests fail; existing tests still pass.

- [ ] **Step 3: Commit failing integration tests**

```bash
git add tests/promptOptimizer.test.ts
git commit -m "test: add 2 failing integration tests for PromptOptimizer + OllamaOptimizer"
```

---

### Task 5: Wire OllamaOptimizer into PromptOptimizer

**Files:**
- Modify: `src/modules/promptOptimizer.ts`

- [ ] **Step 1: Add import and update constructor**

At the top of `src/modules/promptOptimizer.ts`, add the import:

```typescript
import { OllamaOptimizer } from "./ollamaOptimizer.js";
```

Update the constructor signature to accept optional `OllamaOptimizer`:

```typescript
constructor(
  private opts: PromptOptimizerOptions,
  private estimator: TokenEstimator = defaultEstimator,
  private ollamaOptimizer?: OllamaOptimizer
) {
  this.semanticProvider = new EnglishSemanticProvider(opts.semanticCompression);
}
```

- [ ] **Step 2: Update `variantsAsync()` to run Ollama in parallel**

The current `variantsAsync()` at line 182 runs rule-based logic sequentially. Replace the method body so it runs `ollamaOptimizer?.generateVariant()` in parallel with the async semantic provider calls:

```typescript
async variantsAsync(input: string): Promise<PromptVariant[]> {
  const originalTokens = this.estimator.estimate(input);
  const inputIntent = detectIntentKind(input);

  const [ruleVariants, ollamaVariant] = await Promise.all([
    this._computeRuleVariants(input, originalTokens, inputIntent),
    this.ollamaOptimizer?.generateVariant(input) ?? Promise.resolve(null),
  ]);

  return ollamaVariant ? [...ruleVariants, ollamaVariant] : ruleVariants;
}

private async _computeRuleVariants(
  input: string,
  originalTokens: number,
  inputIntent: string
): Promise<PromptVariant[]> {
  const variants = this.variants(input);

  const aliasText = !this.shouldApplySemanticCompression(inputIntent)
    ? variants[2].text
    : await this.semanticProvider.compressAsync(variants[2].text);
  const aliasTokens = this.estimator.estimate(aliasText);
  variants[2] = {
    ...variants[2],
    text: aliasText,
    estimatedTokens: aliasTokens,
    compressionRatio: aliasTokens / Math.max(originalTokens, 1),
  };

  const terseText = shortenLongPaths(collapseRepeatedParagraphs(aliasText));
  const terseWordNet = !this.shouldApplySemanticCompression(inputIntent)
    ? terseText
    : await this.semanticProvider.compressAsync(terseText);
  const terseTokens = this.estimator.estimate(terseWordNet);
  variants[3] = {
    ...variants[3],
    text: terseWordNet,
    estimatedTokens: terseTokens,
    compressionRatio: terseTokens / Math.max(originalTokens, 1),
  };

  return variants;
}
```

- [ ] **Step 3: Run all tests — all should pass**

```bash
cd /root/TokenTasarrufMotoru && npx vitest run
```

Expected: all tests pass, including the 2 new integration tests and the 5 unit tests.

- [ ] **Step 4: Compile check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/promptOptimizer.ts
git commit -m "feat: wire OllamaOptimizer into PromptOptimizer.variantsAsync() in parallel"
```

---

### Task 6: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Ollama Optimizer section to README**

Find the features section in `README.md`. Add a new subsection for Ollama:

```markdown
### Ollama LLM Optimizer (opt-in)

Uses a local LLM (Gemma 4 via [Ollama](https://ollama.com)) as an additional variant producer. The LLM rewrites the prompt to be shorter; if it wins the token-saving competition, that variant is used. Falls back silently if Ollama is offline.

**Setup:**

```bash
ollama pull gemma4
```

**Enable in config:**

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

**Run:**

```bash
claude-token-optimizer --config ./optimizer.config.json optimize --input "Your long prompt here"
```

If Ollama is not running or the rewritten prompt is longer than the original, the optimizer falls back to rule-based variants automatically.
```

- [ ] **Step 2: Run full test suite one final time**

```bash
cd /root/TokenTasarrufMotoru && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: document Ollama LLM optimizer opt-in feature"
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ `OllamaOptimizerOptions` interface → Task 1
- ✅ `OllamaOptimizer.generateVariant()` with AbortController → Task 3
- ✅ `enabled: false` default, no fetch call → Task 1 + Task 2 test 5
- ✅ Response longer than original → null → Task 2 test 2
- ✅ Network error → null → Task 2 test 3
- ✅ Timeout → null → Task 2 test 4
- ✅ `variantsAsync()` parallel with `Promise.all` → Task 5
- ✅ Ollama variant label `"ollama-gemma4"` → Task 2 test 1
- ✅ Token counting with `HeuristicTokenEstimator` (not Ollama) → Task 3 impl
- ✅ Integration: variant joins competition → Task 4 test 6
- ✅ Integration: offline fallback → Task 4 test 7
- ✅ README doc → Task 6

**Placeholder scan:** None found — all steps contain actual code.

**Type consistency:**
- `PromptVariant` shape (`label`, `text`, `estimatedTokens`, `compressionRatio`) used identically in Tasks 2, 3, 4
- `OllamaOptimizer` constructor arg in Task 5 matches class defined in Task 3
- `_computeRuleVariants` private helper extracted in Task 5 uses same `originalTokens` and `inputIntent` params

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-ollama-optimizer.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - Fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
