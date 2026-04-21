import { OptimizationConfig } from "./types.js";

// ─── Default Configuration ─────────────────────────────────────────────────────

export const defaultConfig: OptimizationConfig = {
  promptOptimizer: {
    lowercase: false,
    normalizeWhitespace: true,
    normalizePunctuation: false,
    removeBoilerplate: true,
    deduplicateSentences: true,
    collapseRepeatedParagraphs: true,
    shortenLongPaths: true,
    preserveCodeBlocks: true,
    preserveStackTraces: true,
    preserveUrls: true,
    dictionaryMap: {
      "database": "db",
      "connection": "conn",
      "configuration": "config",
      "authentication": "auth",
      "authorization": "authz",
      "repository": "repo",
      "environment": "env",
      "application": "app",
      "implementation": "impl",
      "function": "fn",
      "parameter": "param",
      "parameters": "params",
      "response": "resp",
      "request": "req",
      "variable": "var",
      "variables": "vars",
      "message": "msg",
      "information": "info",
      "documentation": "docs",
      "performance": "perf",
      "temporary": "temp",
      "development": "dev",
      "production": "prod",
    },
    semanticCompression: {
      enabled: true,
      locale: "auto",
      projectPhraseDbPath: ".claude-token-optimizer/semantic-phrases.json",
      useEnglishSemanticProvider: true,
      useWordPosWordNet: true,
      externalEnglishSynonymsPath: null,
      technicalAbbreviationMap: {
        "application": "app",
        "applications": "apps",
        "authentication": "auth",
        "authorization": "authz",
        "certificate": "cert",
        "certificates": "certs",
        "configuration": "config",
        "configurations": "configs",
        "connection": "conn",
        "connections": "conns",
        "documentation": "docs",
        "environment": "env",
        "environments": "envs",
        "parameter": "param",
        "parameters": "params",
        "request": "req",
        "requests": "reqs",
        "response": "resp",
        "responses": "resps",
        "variable": "var",
        "variables": "vars",
        "verification": "verify",
      },
    },
    aggressiveMode: false,
  },
  jsonMinifier: {
    aliasMap: {},
    removeNulls: false,
    removeUndefined: true,
    removeEmptyArrays: false,
    removeEmptyObjects: false,
    aggressiveMode: false,
  },
  logFilter: {
    mode: "generic",
    includeErrors: true,
    includeWarnings: true,
    includeFailures: true,
    tailLines: 0,
    customPatterns: [],
  },
  diffFilter: {
    hideWhitespaceOnly: true,
    summarizeBinaryFiles: true,
    fileSummaryThreshold: 150,
    relevantHunksOnly: false,
  },
  contextRegistry: {
    cacheDir: ".claude-token-optimizer/cache",
    hashLength: 8,
    ttlHours: 24,
    purgeBehavior: "full" as const,
  },
  policy: {
    shortOutputPolicy: false,
    terseResponseMode: false,
    explanationOnlyIfAsked: false,
    maxOutputHint: null,
    injectLowVerbosityInstruction: false,
  },
  safety: {
    threshold: 0.40,
    dryRun: false,
    logViolations: true,
  },
};

/**
 * Merges a partial user config over the defaults.
 * Deep-merges top-level sections, so you can override just `policy.terseResponseMode`.
 */
export function mergeConfig(
  partial: Partial<OptimizationConfig>
): OptimizationConfig {
  const merged = { ...defaultConfig };
  for (const section of Object.keys(partial) as Array<keyof OptimizationConfig>) {
    const nextSection = {
      ...(defaultConfig[section] as object),
      ...(partial[section] as object),
    };
    if (section === "promptOptimizer") {
      const promptSection = nextSection as OptimizationConfig["promptOptimizer"];
      promptSection.semanticCompression = {
        ...defaultConfig.promptOptimizer.semanticCompression,
        ...(partial.promptOptimizer?.semanticCompression ?? {}),
      };
    }
    (merged as Record<string, unknown>)[section] = nextSection;
  }
  return merged;
}

/**
 * Loads config from a JSON file path, merges with defaults.
 */
export async function loadConfigFile(
  path: string
): Promise<OptimizationConfig> {
  const { readFile } = await import("fs/promises");
  const raw = await readFile(path, "utf8");
  const partial = JSON.parse(raw) as Partial<OptimizationConfig>;
  return mergeConfig(partial);
}
