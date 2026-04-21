# Registry TTL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic TTL-based purging to `ContextRegistry` so stale cache entries are removed on every `put()` call and via a manual `cache purge` CLI command.

**Architecture:** Add two optional config fields (`ttlHours`, `purgeBehavior`) to `ContextRegistryOptions`, implement a `purge(olderThanHours?)` method on `ContextRegistry` that removes expired entries from the index and optionally deletes their `.txt` files, then wire it as fire-and-forget inside `put()` and expose it as a `cache purge [--older-than <n>]` CLI command.

**Tech Stack:** TypeScript, Node.js built-ins (`fs/promises.unlink`), Vitest — zero new dependencies.

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `src/types.ts` | Add `ttlHours?` and `purgeBehavior?` to `ContextRegistryOptions` |
| Modify | `src/config.ts` | Add `ttlHours: 24` and `purgeBehavior: "full"` defaults |
| Modify | `src/modules/contextRegistry.ts` | Add `purge()`; call fire-and-forget in `put()` |
| Modify | `src/cli.ts` | Add `cache purge [--older-than <n>]` command |
| Modify | `tests/contextRegistry.test.ts` | Append `describe("ContextRegistry.purge")` with 6 tests |
| Modify | `README.md` | Mark Registry TTL as complete in roadmap |

---

## Task 1: Update types and config (prerequisite for type-safe tests)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Add new optional fields to `ContextRegistryOptions` in `src/types.ts`**

Find this block (around line 111):
```typescript
export interface ContextRegistryOptions {
  cacheDir: string;
  hashLength: number; // 8 = CTX_ab12cd34
}
```

Replace with:
```typescript
export interface ContextRegistryOptions {
  cacheDir: string;
  hashLength: number; // 8 = CTX_ab12cd34
  ttlHours?: number;  // 0 = disabled; default 24
  purgeBehavior?: "index-only" | "full"; // default "full"
}
```

- [ ] **Step 2: Add defaults to `contextRegistry` in `src/config.ts`**

Find this block (around line 98):
```typescript
  contextRegistry: {
    cacheDir: ".claude-token-optimizer/cache",
    hashLength: 8,
  },
```

Replace with:
```typescript
  contextRegistry: {
    cacheDir: ".claude-token-optimizer/cache",
    hashLength: 8,
    ttlHours: 24,
    purgeBehavior: "full" as const,
  },
```

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
cd /root/TokenTasarrufMotoru && npm test
```

Expected: all 75 tests pass (type-only change, no runtime behaviour altered).

- [ ] **Step 4: Commit**

```bash
cd /root/TokenTasarrufMotoru && git add src/types.ts src/config.ts && git commit -m "feat: add ttlHours and purgeBehavior to ContextRegistryOptions"
```

---

## Task 2: Write failing tests for `purge()`

**Files:**
- Modify: `tests/contextRegistry.test.ts`

- [ ] **Step 1: Update imports at the top of `tests/contextRegistry.test.ts`**

Current line 2:
```typescript
import { rm, mkdir } from "fs/promises";
```

Replace with:
```typescript
import { rm, mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
```

- [ ] **Step 2: Append the new describe block after the last `});` in `tests/contextRegistry.test.ts`**

```typescript
describe("ContextRegistry.purge", () => {
  const PURGE_CACHE_DIR = ".claude-token-optimizer/test-cache-purge";

  async function cleanPurgeCache() {
    if (existsSync(PURGE_CACHE_DIR)) {
      await rm(PURGE_CACHE_DIR, { recursive: true });
    }
  }

  async function setCreatedAt(dir: string, hash: string, hoursAgo: number): Promise<void> {
    const indexPath = join(dir, "index.json");
    const raw = await readFile(indexPath, "utf8");
    const index = JSON.parse(raw) as { entries: Record<string, { createdAt: string }> };
    index.entries[hash].createdAt = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
    await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
  }

  beforeEach(async () => {
    await cleanPurgeCache();
  });

  afterEach(async () => {
    await cleanPurgeCache();
  });

  it("purges expired entry in full mode (removes index entry and .txt file)", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 24,
      purgeBehavior: "full",
    });
    const ref = await reg.put("expired content");
    const hash = ref.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 48);
    const count = await reg.purge();
    expect(count).toBe(1);
    expect(await reg.getMeta(ref)).toBeNull();
    expect(existsSync(join(PURGE_CACHE_DIR, "entries", `${hash}.txt`))).toBe(false);
  });

  it("leaves unexpired entry untouched", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 24,
      purgeBehavior: "full",
    });
    const ref = await reg.put("fresh content");
    const hash = ref.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 1);
    const count = await reg.purge();
    expect(count).toBe(0);
    expect(await reg.getMeta(ref)).not.toBeNull();
  });

  it("index-only mode removes index entry but keeps .txt file on disk", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 24,
      purgeBehavior: "index-only",
    });
    const ref = await reg.put("index-only content");
    const hash = ref.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 48);
    await reg.purge();
    expect(await reg.getMeta(ref)).toBeNull();
    expect(existsSync(join(PURGE_CACHE_DIR, "entries", `${hash}.txt`))).toBe(true);
  });

  it("olderThanHours argument overrides config ttlHours", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 24,
      purgeBehavior: "full",
    });
    const ref = await reg.put("content to override-purge");
    const hash = ref.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 1);
    // config says 24h but we call purge(0.5) — 1h-old entry is older than 0.5h → purged
    const count = await reg.purge(0.5);
    expect(count).toBe(1);
    expect(await reg.getMeta(ref)).toBeNull();
  });

  it("ttlHours 0 disables auto-purge — purge() returns 0", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 0,
      purgeBehavior: "full",
    });
    const ref = await reg.put("should survive purge");
    const hash = ref.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 9999);
    const count = await reg.purge();
    expect(count).toBe(0);
    expect(await reg.getMeta(ref)).not.toBeNull();
  });

  it("put() triggers background purge — expired entry gone after event-loop tick", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 1,
      purgeBehavior: "full",
    });
    const oldRef = await reg.put("old content");
    const hash = oldRef.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 2); // 2h old, beyond 1h TTL
    await reg.put("new content triggers purge");
    await new Promise((r) => setTimeout(r, 50));
    expect(await reg.getMeta(oldRef)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
cd /root/TokenTasarrufMotoru && npm test -- tests/contextRegistry.test.ts
```

Expected: 10 existing tests pass, 6 new `purge` tests fail with `reg.purge is not a function`.

---

## Task 3: Implement `purge()` and integrate with `put()`

**Files:**
- Modify: `src/modules/contextRegistry.ts`

- [ ] **Step 1: Add `unlink` to the `fs/promises` import**

Current line 1:
```typescript
import { readFile, writeFile, mkdir } from "fs/promises";
```

Replace with:
```typescript
import { readFile, writeFile, mkdir, unlink } from "fs/promises";
```

- [ ] **Step 2: Add `purge()` method before the closing `}` of the class**

Add this method after `putOrRef()`:

```typescript
  /**
   * Removes entries older than `olderThanHours` (defaults to `opts.ttlHours`).
   * Returns the number of entries removed.
   * When `purgeBehavior` is "full", also deletes the corresponding .txt files.
   * When `ttlHours` is 0 and no override is given, returns 0 immediately.
   */
  async purge(olderThanHours?: number): Promise<number> {
    const ttl = olderThanHours ?? this.opts.ttlHours ?? 24;
    if (ttl === 0 && olderThanHours === undefined) return 0;

    const index = await this.loadIndex();
    const now = Date.now();
    const cutoffMs = ttl * 3600 * 1000;
    const behavior = this.opts.purgeBehavior ?? "full";
    let removed = 0;

    for (const [hash, entry] of Object.entries(index.entries)) {
      const age = now - new Date(entry.createdAt).getTime();
      if (age > cutoffMs) {
        if (behavior === "full") {
          await unlink(join(this.entryDir, `${hash}.txt`)).catch(() => {});
        }
        delete index.entries[hash];
        removed++;
      }
    }

    if (removed > 0) {
      await this.saveIndex(index);
    }

    return removed;
  }
```

- [ ] **Step 3: Call `purge()` fire-and-forget at the end of `put()`**

Find these two lines near the end of `put()`:
```typescript
    logger.info(`Registry: stored ${ref} (${content.length} chars)`);
    return ref;
```

Replace with:
```typescript
    logger.info(`Registry: stored ${ref} (${content.length} chars)`);
    this.purge().catch(() => {});
    return ref;
```

- [ ] **Step 4: Run the logFilter tests to verify all 16 pass**

```bash
cd /root/TokenTasarrufMotoru && npm test -- tests/contextRegistry.test.ts
```

Expected: all 16 tests pass (10 existing + 6 new `purge` tests).

- [ ] **Step 5: Run the full test suite**

```bash
cd /root/TokenTasarrufMotoru && npm test
```

Expected: all 75 tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
cd /root/TokenTasarrufMotoru && git add src/modules/contextRegistry.ts tests/contextRegistry.test.ts && git commit -m "feat: add purge() to ContextRegistry with TTL-based expiry"
```

---

## Task 4: Add `cache purge` CLI command

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add `cache purge` command after the existing `cache list` command in `src/cli.ts`**

Find the end of the `cache list` action (look for the closing `.action(...)` after `cache list`). After that closing `});`, add:

```typescript
cache
  .command("purge")
  .description("Remove expired entries from the context registry")
  .option("--older-than <hours>", "Purge entries older than N hours (overrides config TTL)")
  .action(async (opts) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts());
    const registry = new ContextRegistry(config.contextRegistry);

    const olderThan = opts.olderThan !== undefined ? parseFloat(opts.olderThan) : undefined;
    const effectiveTtl = olderThan ?? (config.contextRegistry.ttlHours ?? 24);

    if (effectiveTtl === 0) {
      logger.out("TTL is disabled. Use --older-than <hours> to purge manually.");
      return;
    }

    const count = await registry.purge(olderThan);
    const behavior = config.contextRegistry.purgeBehavior ?? "full";
    if (behavior === "full") {
      logger.out(`Purged ${count} entries (${count} files deleted).`);
    } else {
      logger.out(`Purged ${count} entries.`);
    }
  });
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /root/TokenTasarrufMotoru && npm test
```

Expected: all 75 tests pass.

- [ ] **Step 3: Smoke-test the CLI manually**

```bash
cd /root/TokenTasarrufMotoru && npx tsx src/cli.ts cache put --input "test entry for purge smoke test" && npx tsx src/cli.ts cache purge --older-than 0.0001
```

Expected: first command prints `Stored as: CTX_XXXXXXXX`, second prints `Purged 1 entries (1 files deleted).`

- [ ] **Step 4: Smoke-test TTL-disabled path**

```bash
cd /root/TokenTasarrufMotoru && npx tsx src/cli.ts --config /dev/null cache purge 2>&1 || npx tsx src/cli.ts cache purge
```

To test the zero-TTL message without a custom config, temporarily confirm the path works by checking the `--older-than` flag is optional and the config default `ttlHours: 24` means auto-purge is active. Run:

```bash
cd /root/TokenTasarrufMotoru && npx tsx src/cli.ts cache purge
```

Expected: `Purged 0 entries (0 files deleted).` (no old entries present) or actual purge count.

- [ ] **Step 5: Commit**

```bash
cd /root/TokenTasarrufMotoru && git add src/cli.ts && git commit -m "feat: add cache purge CLI command with --older-than flag"
```

---

## Task 5: Update README roadmap and push

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Mark Registry TTL as complete in `README.md`**

Find:
```markdown
- [ ] **Registry TTL** — automatic purge of stale cache entries
```

Replace with:
```markdown
- [x] ~~**Registry TTL** — automatic purge of stale cache entries via `purge()` and `cache purge`~~
```

- [ ] **Step 2: Commit and push**

```bash
cd /root/TokenTasarrufMotoru && git add README.md && git commit -m "docs: mark registry TTL as complete" && git push origin main
```

Expected: `main -> main` push success.
