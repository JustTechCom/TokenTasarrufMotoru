import { LogFilterOptions, LogFilterResult, LogMode } from "../types.js";

// ─── Log Filter ───────────────────────────────────────────────────────────────

type PatternCategories = {
  errors: RegExp[];
  warnings: RegExp[];
  failures: RegExp[];
};

// Built-in patterns per log mode, grouped by category.
const MODE_PATTERNS: Record<LogMode, PatternCategories> = {
  docker: {
    errors: [/\b(error|err|fatal|critical|exception)\b/i],
    warnings: [/\b(warning|warn)\b/i],
    failures: [/\b(failed|failure|down|unhealthy|crash)\b/i, /exit code [^0]/i],
  },
  journalctl: {
    errors: [/\b(error|critical|emerg|alert|crit)\b/i],
    warnings: [/\b(warning|warn|notice)\b/i],
    failures: [/\bfailed\b/i, /\bkernel:\s+\[/i],
  },
  dotnet: {
    errors: [
      /\b(error|exception|fatal|unhandled)\b/i,
      /Microsoft\..*Exception/,
      /System\..*Exception/,
    ],
    warnings: [/\b(warning|warn)\b/i],
    failures: [/\bfailed\b/i, /^\s+at\s+/], // stack trace lines
  },
  npm: {
    errors: [/\b(error|err!)\b/i, /npm ERR!/i, /ENOENT|EACCES|EADDRINUSE/i],
    warnings: [/\b(warn|warning)\b/i],
    failures: [/\bfailed\b/i],
  },
  generic: {
    errors: [/\b(error|err|fatal|critical|exception)\b/i],
    warnings: [/\b(warning|warn)\b/i],
    failures: [/\b(failed|failure)\b/i],
  },
};

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

  filter(input: string): LogFilterResult {
    const allLines = input.split("\n");
    const totalInput = allLines.length;

    let filtered: string[];

    // Strict mode: if no category/custom pattern is selected, return empty result.
    filtered = this.patterns.length === 0
      ? []
      : allLines.filter((line) => this.patterns.some((re) => re.test(line)));

    // Apply tail limit
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
}
