import { DiffFilterOptions, DiffFilterResult } from "../types.js";

// ─── Diff Filter ──────────────────────────────────────────────────────────────

// Detects unified diff file headers: "diff --git a/... b/..." or "--- a/..."
const FILE_HEADER_RE = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_HEADER_RE = /^@@\s/;
const BINARY_FILE_RE = /^Binary files (.+) and (.+) differ/;

interface Hunk {
  header: string;
  lines: string[];
}

interface FileDiff {
  header: string;
  isBinary: boolean;
  hunks: Hunk[];
  filePath: string;
}

export class DiffFilter {
  constructor(private opts: DiffFilterOptions) {}

  filter(input: string): DiffFilterResult {
    const files = this.parseDiff(input);
    const outputParts: string[] = [];
    const filesIncluded: string[] = [];
    const filesSkipped: string[] = [];

    for (const file of files) {
      if (file.isBinary) {
        if (this.opts.summarizeBinaryFiles) {
          outputParts.push(`[Binary: ${file.filePath}]`);
          filesIncluded.push(file.filePath);
        } else {
          outputParts.push(file.header);
          filesIncluded.push(file.filePath);
        }
        continue;
      }

      const lineCount = file.hunks.reduce(
        (acc, h) => acc + h.lines.length,
        0
      );

      if (lineCount > this.opts.fileSummaryThreshold) {
        // Produce a per-file summary instead of full diff
        outputParts.push(
          `[Large diff: ${file.filePath} — ${lineCount} lines, ${file.hunks.length} hunks]`
        );
        filesSkipped.push(file.filePath);
        continue;
      }

      filesIncluded.push(file.filePath);
      outputParts.push(file.header);

      for (const hunk of file.hunks) {
        const filteredLines = this.filterHunkLines(hunk.lines);
        if (filteredLines.length > 0) {
          outputParts.push(hunk.header);
          outputParts.push(...filteredLines);
        }
      }
    }

    return {
      output: outputParts.join("\n"),
      filesIncluded,
      filesSkipped,
    };
  }

  private parseDiff(input: string): FileDiff[] {
    const lines = input.split("\n");
    const files: FileDiff[] = [];
    let current: FileDiff | null = null;
    let currentHunk: Hunk | null = null;

    for (const line of lines) {
      const fileMatch = line.match(FILE_HEADER_RE);
      if (fileMatch) {
        if (current) files.push(current);
        current = {
          header: line,
          isBinary: false,
          hunks: [],
          filePath: fileMatch[2],
        };
        currentHunk = null;
        continue;
      }

      if (BINARY_FILE_RE.test(line)) {
        if (current) {
          current.isBinary = true;
          current.header += `\n${line}`;
        }
        continue;
      }

      if (HUNK_HEADER_RE.test(line)) {
        currentHunk = { header: line, lines: [] };
        current?.hunks.push(currentHunk);
        continue;
      }

      // Lines that are part of --- / +++ header after diff --git
      if ((line.startsWith("--- ") || line.startsWith("+++ ")) && current && !currentHunk) {
        current.header += `\n${line}`;
        continue;
      }

      if (currentHunk) {
        currentHunk.lines.push(line);
      }
    }

    if (current) files.push(current);
    return files;
  }

  private filterHunkLines(lines: string[]): string[] {
    if (!this.opts.hideWhitespaceOnly) return lines;

    return lines.filter((line) => {
      const prefix = line[0]; // '+', '-', ' '
      const content = line.slice(1);
      // If the line is an addition or removal but only whitespace changed → skip
      if (prefix === "+" || prefix === "-") {
        return content.trim().length > 0;
      }
      return true; // context lines always kept
    });
  }
}
