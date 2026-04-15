import { LogFilterOptions, LogFilterResult, LogMode } from "../types.js";

// ─── Log Filter ───────────────────────────────────────────────────────────────

// Built-in patterns per log mode
const MODE_PATTERNS: Record<LogMode, RegExp[]> = {
  docker: [
    /\b(error|err|fatal|critical|exception)\b/i,
    /\b(warning|warn)\b/i,
    /\b(failed|failure|down|unhealthy|crash)\b/i,
    /exit code [^0]/i,
  ],
  journalctl: [
    /\b(error|critical|emerg|alert|crit)\b/i,
    /\b(warning|warn|notice)\b/i,
    /\bfailed\b/i,
    /\bkernel:\s+\[/i,
  ],
  dotnet: [
    /\b(error|exception|fatal|unhandled)\b/i,
    /\b(warning|warn)\b/i,
    /\bfailed\b/i,
    /^\s+at\s+/,        // stack trace lines
    /Microsoft\..*Exception/,
    /System\..*Exception/,
  ],
  npm: [
    /\b(error|err!)\b/i,
    /\b(warn|warning)\b/i,
    /\bfailed\b/i,
    /npm ERR!/i,
    /ENOENT|EACCES|EADDRINUSE/i,
  ],
  generic: [
    /\b(error|err|fatal|critical|exception)\b/i,
    /\b(warning|warn)\b/i,
    /\b(failed|failure)\b/i,
  ],
};

export class LogFilter {
  private patterns: RegExp[];

  constructor(private opts: LogFilterOptions) {
    this.patterns = this.buildPatterns();
  }

  private buildPatterns(): RegExp[] {
    const base = MODE_PATTERNS[this.opts.mode] ?? MODE_PATTERNS.generic;
    const custom = this.opts.customPatterns.map((p) => new RegExp(p, "i"));
    return [...base, ...custom];
  }

  filter(input: string): LogFilterResult {
    const allLines = input.split("\n");
    const totalInput = allLines.length;

    let filtered: string[];

    if (this.patterns.length === 0) {
      filtered = allLines;
    } else {
      filtered = allLines.filter((line) =>
        this.patterns.some((re) => re.test(line))
      );
    }

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
