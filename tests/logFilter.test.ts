import { describe, it, expect } from "vitest";
import { LogFilter } from "../src/modules/logFilter.js";
import { defaultConfig } from "../src/config.js";

const SAMPLE_DOCKER_LOG = `
2024-01-15T10:00:01 container/web INFO Server started on port 3000
2024-01-15T10:00:02 container/db INFO Database connected
2024-01-15T10:00:05 container/web INFO GET /api/health 200 OK
2024-01-15T10:00:10 container/db ERROR connection timeout after 5000ms
2024-01-15T10:00:10 container/web ERROR Failed to connect to database
2024-01-15T10:00:11 container/web WARN Retrying database connection...
2024-01-15T10:00:15 container/web INFO GET /api/health 503 Service Unavailable
2024-01-15T10:00:20 container/db FATAL Max retries exceeded, exiting
`.trim();

describe("LogFilter", () => {
  it("filters to error lines in docker mode", () => {
    const filter = new LogFilter({ ...defaultConfig.logFilter, mode: "docker" });
    const result = filter.filter(SAMPLE_DOCKER_LOG);
    expect(result.lines.some((l) => l.includes("ERROR"))).toBe(true);
    expect(result.lines.some((l) => l.includes("WARN"))).toBe(true);
    expect(result.lines.some((l) => l.includes("FATAL"))).toBe(true);
  });

  it("excludes normal INFO lines", () => {
    const filter = new LogFilter({ ...defaultConfig.logFilter, mode: "docker" });
    const result = filter.filter(SAMPLE_DOCKER_LOG);
    const infoOnlyLines = result.lines.filter(
      (l) => l.includes("INFO") && !l.includes("ERROR") && !l.includes("WARN")
    );
    expect(infoOnlyLines).toHaveLength(0);
  });

  it("reduces output lines", () => {
    const filter = new LogFilter({ ...defaultConfig.logFilter, mode: "docker" });
    const result = filter.filter(SAMPLE_DOCKER_LOG);
    expect(result.totalOutput).toBeLessThan(result.totalInput);
  });

  it("applies tail limit", () => {
    const filter = new LogFilter({
      ...defaultConfig.logFilter,
      mode: "generic",
      tailLines: 2,
    });
    const result = filter.filter(SAMPLE_DOCKER_LOG);
    expect(result.lines.length).toBeLessThanOrEqual(2);
  });

  it("applies custom regex patterns", () => {
    const filter = new LogFilter({
      ...defaultConfig.logFilter,
      mode: "generic",
      customPatterns: ["port 3000"],
    });
    const result = filter.filter(SAMPLE_DOCKER_LOG);
    expect(result.lines.some((l) => l.includes("port 3000"))).toBe(true);
  });

  it("works in npm mode", () => {
    const npmLog = `
npm warn deprecated lodash@1.0.0
npm error code ENOENT
npm info creating lockfile
npm error missing package
`.trim();
    const filter = new LogFilter({ ...defaultConfig.logFilter, mode: "npm" });
    const result = filter.filter(npmLog);
    expect(result.lines.some((l) => l.toLowerCase().includes("error"))).toBe(true);
  });

  it("returns empty result in strict mode when all include flags are disabled", () => {
    const filter = new LogFilter({
      ...defaultConfig.logFilter,
      mode: "generic",
      includeErrors: false,
      includeWarnings: false,
      includeFailures: false,
      customPatterns: [],
    });
    const cleanLog = "INFO: all good\nINFO: still good\nINFO: perfect";
    const result = filter.filter(cleanLog);
    expect(result.totalInput).toBe(3);
    expect(result.totalOutput).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("includes only warning patterns when only includeWarnings is enabled", () => {
    const filter = new LogFilter({
      ...defaultConfig.logFilter,
      mode: "docker",
      includeErrors: false,
      includeWarnings: true,
      includeFailures: false,
    });
    const result = filter.filter(SAMPLE_DOCKER_LOG);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain("WARN");
  });

  it("includes only failure patterns when only includeFailures is enabled", () => {
    const filter = new LogFilter({
      ...defaultConfig.logFilter,
      mode: "docker",
      includeErrors: false,
      includeWarnings: false,
      includeFailures: true,
    });
    const result = filter.filter(SAMPLE_DOCKER_LOG);
    expect(result.lines.some((line) => line.includes("Failed"))).toBe(true);
    expect(result.lines.some((line) => line.includes("WARN"))).toBe(false);
  });

  it("includes only error patterns when only includeErrors is enabled", () => {
    const filter = new LogFilter({
      ...defaultConfig.logFilter,
      mode: "docker",
      includeErrors: true,
      includeWarnings: false,
      includeFailures: false,
    });
    const result = filter.filter(SAMPLE_DOCKER_LOG);
    expect(result.lines.some((line) => line.includes("ERROR"))).toBe(true);
    expect(result.lines.some((line) => line.includes("WARN"))).toBe(false);
    expect(
      result.lines.every(
        (line) => line.includes("ERROR") || line.includes("FATAL")
      )
    ).toBe(true);
  });
});
