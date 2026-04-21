# Stream Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add line-by-line streaming to `LogFilter` so large log files are processed without loading them fully into memory, and matching lines are emitted to stdout immediately.

**Architecture:** Extract the pattern-matching logic from `filter()` into a private `matchesLine()` method, then add `filterStream(readable)` as an async generator that uses Node.js `readline`. Update the CLI `filter-log --file` path to use `createReadStream` instead of `readFile`.

**Tech Stack:** TypeScript, Node.js built-ins (`readline`, `fs.createReadStream`), Vitest — zero new dependencies.

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `src/modules/logFilter.ts` | Extract `matchesLine()`; add `filterStream()` |
| Modify | `src/cli.ts` | `filter-log --file` uses `createReadStream` + `filterStream()` |
| Modify | `tests/logFilter.test.ts` | Append `describe("LogFilter.filterStream")` with 5 tests |

---

## Task 1: Write failing tests for `filterStream`

**Files:**
- Modify: `tests/logFilter.test.ts`

- [ ] **Step 1: Add the import for `Readable` and append the new describe block to `tests/logFilter.test.ts`**

Add after the last `});` in the file:

```typescript
import { Readable } from "node:stream";

describe("LogFilter.filterStream", () => {
  const LINES = [
    "2024-01-15 INFO Server started",
    "2024-01-15 ERROR connection timeout",
    "2024-01-15 INFO GET /health 200",
    "2024-01-15 WARN Retrying connection",
    "2024-01-15 ERROR Failed to connect",
  ];

  async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
    const out: string[] = [];
    for await (const line of gen) out.push(line);
    return out;
  }

  it("yields matching lines in order (tailLines=0)", async () => {
    const filter = new LogFilter({ ...defaultConfig.logFilter, mode: "docker", tailLines: 0 });
    const stream = Readable.from(LINES);
    const result = await collect(filter.filterStream(stream));
    expect(result).toContain("2024-01-15 ERROR connection timeout");
    expect(result).toContain("2024-01-15 WARN Retrying connection");
    expect(result).toContain("2024-01-15 ERROR Failed to connect");
    expect(result.some((l) => l.includes("INFO Server started"))).toBe(false);
  });

  it("returns only last N matching lines (tailLines=2)", async () => {
    const filter = new LogFilter({ ...defaultConfig.logFilter, mode: "docker", tailLines: 2 });
    const stream = Readable.from(LINES);
    const result = await collect(filter.filterStream(stream));
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result[result.length - 1]).toContain("Failed to connect");
  });

  it("yields nothing in strict mode (all flags false)", async () => {
    const filter = new LogFilter({
      ...defaultConfig.logFilter,
      mode: "generic",
      includeErrors: false,
      includeWarnings: false,
      includeFailures: false,
      customPatterns: [],
    });
    const stream = Readable.from(LINES);
    const result = await collect(filter.filterStream(stream));
    expect(result).toHaveLength(0);
  });

  it("handles empty stream (yields nothing)", async () => {
    const filter = new LogFilter({ ...defaultConfig.logFilter, mode: "docker" });
    const stream = Readable.from([]);
    const result = await collect(filter.filterStream(stream));
    expect(result).toHaveLength(0);
  });

  it("applies custom patterns in stream mode", async () => {
    const filter = new LogFilter({
      ...defaultConfig.logFilter,
      mode: "generic",
      includeErrors: false,
      includeWarnings: false,
      includeFailures: false,
      customPatterns: ["Server started"],
    });
    const stream = Readable.from(LINES);
    const result = await collect(filter.filterStream(stream));
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("Server started");
  });
});
```

**Important:** The `import { Readable }` line must go at the TOP of the file, after the existing imports (line 3), not inside the describe block.

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd /root/TokenTasarrufMotoru && npm test -- tests/logFilter.test.ts
```

Expected: existing 9 tests pass, 5 new `filterStream` tests fail with `filter.filterStream is not a function`.

---

## Task 2: Extract `matchesLine` and implement `filterStream`

**Files:**
- Modify: `src/modules/logFilter.ts`

- [ ] **Step 1: Add `readline` import at the top of `src/modules/logFilter.ts`**

Add after the first line (`import { LogFilterOptions, ... }`):

```typescript
import { createInterface } from "readline";
```

- [ ] **Step 2: Replace the full `LogFilter` class body with this updated version**

```typescript
export class LogFilter {
  private patterns: RegExp[];

  constructor(private opts: LogFilterOptions) {
    this.patterns = this.buildPatterns();
  }

  private buildPatterns(): RegExp[] {
    const base = MODE_PATTERNS[this.opts.mode] ?? MODE_PATTERNS.generic;
    const selected: RegExp[] = [];

    if (this.opts.includeErrors) {
      selected.push(...base.errors);
    }
    if (this.opts.includeWarnings) {
      selected.push(...base.warnings);
    }
    if (this.opts.includeFailures) {
      selected.push(...base.failures);
    }

    const custom = this.opts.customPatterns.map((p) => new RegExp(p, "i"));
    return [...selected, ...custom];
  }

  private matchesLine(line: string): boolean {
    return this.patterns.some((re) => re.test(line));
  }

  filter(input: string): LogFilterResult {
    const allLines = input.split("\n");
    const totalInput = allLines.length;

    let filtered: string[];

    filtered = this.patterns.length === 0
      ? []
      : allLines.filter((line) => this.matchesLine(line));

    if (this.opts.tailLines > 0 && filtered.length > this.opts.tailLines) {
      filtered = filtered.slice(-this.opts.tailLines);
    }

    return {
      lines: filtered,
      totalInput,
      totalOutput: filtered.length,
    };
  }

  filterText(input: string): string {
    return this.filter(input).lines.join("\n");
  }

  async *filterStream(readable: NodeJS.ReadableStream): AsyncGenerator<string> {
    const rl = createInterface({ input: readable, crlfDelay: Infinity });

    if (this.patterns.length === 0) {
      rl.close();
      return;
    }

    if (this.opts.tailLines === 0) {
      for await (const line of rl) {
        if (this.matchesLine(line)) yield line;
      }
    } else {
      const buf: string[] = [];
      for await (const line of rl) {
        if (this.matchesLine(line)) {
          if (buf.length >= this.opts.tailLines) buf.shift();
          buf.push(line);
        }
      }
      for (const line of buf) yield line;
    }
  }
}
```

- [ ] **Step 3: Run the logFilter tests**

```bash
cd /root/TokenTasarrufMotoru && npm test -- tests/logFilter.test.ts
```

Expected: all 14 tests pass (9 existing + 5 new `filterStream` tests).

- [ ] **Step 4: Run the full test suite**

```bash
cd /root/TokenTasarrufMotoru && npm test
```

Expected: all tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
cd /root/TokenTasarrufMotoru && git add src/modules/logFilter.ts tests/logFilter.test.ts && git commit -m "feat: add filterStream to LogFilter with readline-based streaming"
```

---

## Task 3: Update CLI `filter-log --file` to use streaming

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add `createReadStream` import to `src/cli.ts`**

Current line 3:
```typescript
import { readFile } from "fs/promises";
```

Replace with:
```typescript
import { readFile } from "fs/promises";
import { createReadStream } from "fs";
```

- [ ] **Step 2: Replace the `filter-log` action body in `src/cli.ts`**

Find the existing action (lines ~134–157):

```typescript
  .action(async (opts) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts(), opts);
    let input: string;
    if (opts.file) {
      input = await readFile(opts.file, "utf8");
    } else {
      logger.error("Provide --file <path>");
      process.exit(1);
    }

    const resolved = mergeConfig({
      logFilter: {
        ...config.logFilter,
        mode: opts.mode as LogMode,
        tailLines: parseInt(opts.tail, 10) || 0,
      },
    });
    const filter = new LogFilter(resolved.logFilter);
    const result = filter.filter(input);

    logger.out(`\nFiltered ${result.totalOutput} / ${result.totalInput} lines:\n`);
    logger.out(result.lines.join("\n"));
  });
```

Replace with:

```typescript
  .action(async (opts) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts(), opts);

    if (!opts.file) {
      logger.error("Provide --file <path>");
      process.exit(1);
    }

    const resolved = mergeConfig({
      logFilter: {
        ...config.logFilter,
        mode: opts.mode as LogMode,
        tailLines: parseInt(opts.tail, 10) || 0,
      },
    });
    const filter = new LogFilter(resolved.logFilter);
    const stream = createReadStream(opts.file);
    let count = 0;
    for await (const line of filter.filterStream(stream)) {
      process.stdout.write(line + "\n");
      count++;
    }
    logger.info(`Filtered ${count} matching lines.`);
  });
```

- [ ] **Step 3: Run the full test suite**

```bash
cd /root/TokenTasarrufMotoru && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Smoke test the CLI manually**

```bash
cd /root/TokenTasarrufMotoru && echo -e "INFO ok\nERROR boom\nWARN careful\nINFO fine" > /tmp/test.log && npx tsx src/cli.ts filter-log --file /tmp/test.log --mode generic
```

Expected output: lines containing ERROR, WARN (INFO lines excluded).

- [ ] **Step 5: Commit**

```bash
cd /root/TokenTasarrufMotoru && git add src/cli.ts && git commit -m "feat: filter-log --file uses createReadStream for memory-efficient streaming"
```

---

## Task 4: Update README roadmap and push

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Mark stream support as complete in `README.md`**

Find:
```markdown
- [ ] **Stream support** — line-by-line streaming for large log files
```

Replace with:
```markdown
- [x] ~~**Stream support** — line-by-line streaming for large log files via `filterStream()`~~
```

- [ ] **Step 2: Commit**

```bash
cd /root/TokenTasarrufMotoru && git add README.md && git commit -m "docs: mark stream support as complete"
```

- [ ] **Step 3: Push**

```bash
cd /root/TokenTasarrufMotoru && git push origin main
```

Expected: `main -> main` push success.
