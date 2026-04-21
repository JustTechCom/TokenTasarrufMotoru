# Registry TTL — Design Spec

**Date:** 2026-04-21  
**Status:** Approved  
**Scope:** `src/types.ts`, `src/config.ts`, `src/modules/contextRegistry.ts`, `src/cli.ts`, `tests/contextRegistry.test.ts`

---

## Problem

`ContextRegistry.put()` stores entries indefinitely. Over long sessions, the cache directory accumulates stale `.txt` files and index entries that are never accessed again, wasting disk space and making `cache list` output noisy.

---

## Goals

- Automatically purge entries older than a configurable TTL on every `put()` call.
- Provide a manual `cache purge` CLI command for on-demand cleanup.
- Allow `--older-than <hours>` to override the configured TTL for one-off purges.
- Allow purge behavior to be either index-only (soft) or full (index + file deletion).
- Zero new dependencies. Keep the existing `ContextRegistry` API intact.

---

## Architecture

### Config changes

Two new fields added to `ContextRegistryOptions` and `defaultConfig`:

```typescript
interface ContextRegistryOptions {
  cacheDir: string;
  hashLength: number;
  ttlHours: number;          // 0 = TTL disabled
  purgeBehavior: "index-only" | "full";
}
```

Default values:
```typescript
contextRegistry: {
  cacheDir: ".claude-token-optimizer/cache",
  hashLength: 8,
  ttlHours: 24,
  purgeBehavior: "full",
}
```

`ttlHours: 0` disables automatic purging entirely. Manual purge via `--older-than` still works.

### `ContextRegistry.purge(olderThanHours?: number): Promise<number>`

New public method. Returns the count of entries removed.

**Rules:**
- If `olderThanHours` is not provided, uses `this.opts.ttlHours`.
- If the resolved value is `0` (TTL disabled and no override given), returns `0` immediately without touching the index.
- For each entry where `(now - createdAt) > olderThanHours * 3600 * 1000`:
  - If `purgeBehavior === "full"`: delete `entries/<hash>.txt` (ignore ENOENT).
  - Remove `index.entries[hash]`.
- If any entries were removed, save the updated index.
- Returns the number of entries removed.

### `put()` integration

After writing the new entry, `put()` calls purge as fire-and-forget:

```typescript
this.purge().catch(() => {});
```

Purge failures are silently swallowed so they never block or surface errors to the caller.

### CLI — `cache purge` command

```bash
claude-token-optimizer cache purge
claude-token-optimizer cache purge --older-than 48
```

- No `--older-than`: uses `opts.ttlHours` from config.
- If resolved TTL is `0` and no `--older-than` given: logs `"TTL is disabled. Use --older-than <hours> to purge manually."` and exits cleanly.
- Output: `Purged N entries (M files deleted).` where M is omitted for `index-only` mode.

---

## Purge Behaviour Matrix

| `ttlHours` | `--older-than` | Behaviour |
|------------|----------------|-----------|
| `0` | not given | no-op, warning message |
| `0` | `48` | purge entries older than 48 h |
| `24` | not given | purge entries older than 24 h |
| `24` | `48` | purge entries older than 48 h (override) |

---

## `purgeBehavior` Matrix

| `purgeBehavior` | index entry | `.txt` file |
|----------------|-------------|-------------|
| `"full"` | removed | deleted |
| `"index-only"` | removed | kept on disk |

---

## Error Handling

| Condition | Behaviour |
|-----------|-----------|
| `.txt` file already gone (`ENOENT`) | silently ignored, index still cleaned |
| index write fails | error propagates to caller (same as existing `saveIndex` behaviour) |
| `put()` purge failure | swallowed via `.catch(() => {})` |

---

## Tests

New `describe("ContextRegistry.purge")` block appended to `tests/contextRegistry.test.ts`. Uses a real temp directory per test (via `mkdtemp`).

| # | Description |
|---|-------------|
| 1 | Purges expired entry — `createdAt` 48 h ago, `ttlHours: 24` → entry gone, `.txt` deleted |
| 2 | Leaves unexpired entry — `createdAt` 1 h ago, `ttlHours: 24` → entry untouched |
| 3 | `index-only` keeps `.txt` — entry removed from index but file exists on disk |
| 4 | `olderThanHours` override — `ttlHours: 24`, call `purge(1)` → 1-hour-old entry purged |
| 5 | `ttlHours: 0` no-ops — `purge()` returns `0`, nothing deleted |
| 6 | `put()` triggers background purge — expired entry present, `put()` called, after event loop tick stale entry is gone |

---

## Files Changed

```
src/types.ts                  add ttlHours, purgeBehavior to ContextRegistryOptions
src/config.ts                 add ttlHours: 24, purgeBehavior: "full" defaults
src/modules/contextRegistry.ts  add purge(); call purge() fire-and-forget in put()
src/cli.ts                    add cache purge [--older-than <n>] command
tests/contextRegistry.test.ts   append describe("ContextRegistry.purge") with 6 tests
```

---

## Out of Scope

- Purging by tag
- Size-based eviction (largest entries first)
- Last-accessed tracking (accessedAt field)
- Scheduled/daemon purge process
