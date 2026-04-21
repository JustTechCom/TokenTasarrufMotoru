# Stream Support — Design Spec

**Date:** 2026-04-21  
**Status:** Approved  
**Scope:** `src/modules/logFilter.ts`, `src/cli.ts`, `tests/logFilter.test.ts`

---

## Problem

`LogFilter.filter(input: string)` requires the entire log file to be loaded into memory before processing begins. For large files (100 MB+) this causes:

1. **Memory pressure** — the full file sits in RAM as a string before any line is matched.
2. **Latency** — output is unavailable until the file is fully read, even when `tailLines === 0`.

---

## Goals

- Process large log files line-by-line without loading the full content into memory.
- Emit matching lines to stdout immediately as they are found (`tailLines === 0`).
- Keep the existing `filter(string)` and `filterText(string)` API unchanged for library users and inline (`--input`) mode.
- Zero new external dependencies.

---

## Architecture

### New method on `LogFilter`

```typescript
async *filterStream(readable: NodeJS.ReadableStream): AsyncGenerator<string>
```

- Uses `readline.createInterface` (Node.js built-in) to iterate line-by-line.
- Returns an `AsyncGenerator<string>` — each yielded value is one matching line.
- Callers decide what to do with each line (write to stdout, collect into array, etc.).

### Refactor: extract `matchesLine`

The inline pattern-matching expression inside `filter()` is extracted into a private method:

```typescript
private matchesLine(line: string): boolean
```

Both `filter()` and `filterStream()` delegate to it, keeping pattern logic in one place.

### Updated `LogFilter` surface

```
LogFilter
  filter(input: string): LogFilterResult           unchanged
  filterText(input: string): string                unchanged
  filterStream(readable: Readable): AsyncGenerator  new
  private matchesLine(line: string): boolean        new (extracted)
  private buildPatterns(): RegExp[]                 unchanged
```

### CLI change (`src/cli.ts` — `filter-log` command)

| Input mode | Before | After |
|-----------|--------|-------|
| `--file` | `readFile` → `filter(string)` | `createReadStream` → `filterStream()` |
| `--input` | `filter(string)` | unchanged |

CLI output: `for await (const line of filter.filterStream(stream)) process.stdout.write(line + "\n")`

`LogFilterResult` (totalInput / totalOutput counts) is **not** returned in stream mode — the CLI prints lines directly. Library users who need counts should continue using `filter()`.

---

## `filterStream` Behaviour

### `tailLines === 0` — latency mode

```typescript
for await (const line of rl) {
  if (this.matchesLine(line)) yield line;
}
```

Each matching line is yielded immediately as it is read. Output begins before the file ends.

### `tailLines > 0` — tail mode

```typescript
const buf: string[] = [];
for await (const line of rl) {
  if (this.matchesLine(line)) {
    if (buf.length >= this.opts.tailLines) buf.shift();
    buf.push(line);
  }
}
for (const line of buf) yield line;
```

A fixed-size circular buffer keeps only the last N matching lines. Yields all buffered lines after the stream ends. Memory usage is bounded by `tailLines`, not file size.

### Strict mode

When `patterns.length === 0` (all three include flags are false and no custom patterns), the generator yields nothing — consistent with `filter()` returning `[]`.

---

## Error Handling

| Condition | Behaviour |
|-----------|-----------|
| File not found | `createReadStream` throws; CLI existing `try/catch` surfaces the error |
| Empty file | `readline` emits no lines; generator returns without yielding |
| Binary / very long line | Passed as string to `matchesLine`; no match → skipped |
| Stream error mid-read | Generator propagates the error to the caller |

---

## Tests

New `describe` block appended to `tests/logFilter.test.ts`:

```typescript
describe("LogFilter.filterStream", () => {
  // Uses Readable.from([...lines]) as a mock stream — no file I/O needed

  it("yields matching lines in order (tailLines=0)")
  it("returns only last N matching lines (tailLines>0)")
  it("yields nothing in strict mode (all flags false)")
  it("handles empty stream (yields nothing)")
  it("applies custom patterns in stream mode")
})
```

`Readable.from(iterable)` is Node.js built-in — no additional dependencies.

Regression requirement: all existing `logFilter.test.ts` tests must continue to pass.

---

## Files Changed

```
src/modules/logFilter.ts    extract matchesLine(); add filterStream()
src/cli.ts                  filter-log --file path uses createReadStream + filterStream
tests/logFilter.test.ts     add describe("LogFilter.filterStream") with 5 tests
```

---

## Out of Scope

- Streaming for `minify-json`, `filter-diff`, or `optimize` commands
- `LogFilterResult` counts in stream mode
- Progress reporting / byte counters
- Piping from stdin (only `--file` path uses streaming)
