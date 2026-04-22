#!/usr/bin/env node
import { Command } from "commander";
import { readFile } from "fs/promises";
import { createReadStream } from "fs";
import { defaultConfig, loadConfigFile, mergeConfig } from "./config.js";
import { OptimizationPipeline } from "./core/pipeline.js";
import { JsonMinifier } from "./modules/jsonMinifier.js";
import { LogFilter } from "./modules/logFilter.js";
import { DiffFilter } from "./modules/diffFilter.js";
import { ContextRegistry } from "./modules/contextRegistry.js";
import { EnglishSemanticProvider } from "./modules/englishSemanticProvider.js";
import { logger } from "./logger.js";
import { LogMode } from "./types.js";
import { createEstimator, EstimatorType } from "./utils/estimator.js";
import { formatCandidateOutputs } from "./utils/cliOutput.js";

// ─── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("claude-token-optimizer")
  .description("Optimize token consumption for Claude Code prompts and outputs")
  .version("1.0.0")
  .option("--config <path>", "Path to config JSON file")
  .option("--dry-run", "Show what would happen without applying changes")
  .option("--estimator <type>", "Token estimator: heuristic | claude (default: claude)", "claude")
  .option("--debug", "Enable debug logging")
  .option("--quiet", "Suppress info/debug logs");

// ─── Helper: load config from CLI options ─────────────────────────────────────

async function resolveConfig(...sources: Array<{ config?: string; dryRun?: boolean }>) {
  let configPath: string | undefined;
  let dryRun = false;

  for (const source of sources) {
    if (source.config) {
      configPath = source.config;
    }
    if (source.dryRun) {
      dryRun = true;
    }
  }

  let config = defaultConfig;
  if (configPath) {
    config = await loadConfigFile(configPath);
  }
  if (dryRun) {
    config = {
      ...config,
      safety: {
        ...config.safety,
        dryRun: true,
      },
    };
  }
  return config;
}

// ─── optimize ─────────────────────────────────────────────────────────────────

program
  .command("optimize")
  .description("Optimize a prompt string")
  .requiredOption("--input <text>", "Input prompt text")
  .option("--config <path>", "Config file")
  .option("--dry-run", "Dry run mode")
  .action(async (opts, cmd) => {
    setupLogging(cmd.parent?.opts() ?? {});
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = await resolveConfig(globalOpts, opts);
    const estimator = await createEstimator((globalOpts.estimator ?? "claude") as EstimatorType);
    const pipeline = new OptimizationPipeline(config, estimator);
    const result = await pipeline.run({ prompt: opts.input, dryRun: opts.dryRun });

    const estimatorLabel = (globalOpts.estimator ?? "claude") as string;
    logger.out("\n=== TOKEN OPTIMIZER RESULT ===");
    logger.out(`Estimator: ${estimatorLabel}`);
    logger.out(`\nOriginal (${result.selectionResult?.original.estimatedTokens ?? "?"} tokens):`);
    logger.out(result.original);

    if (result.selectionResult) {
      logger.out("\nCandidates:");
      for (const c of result.selectionResult.candidates) {
        logger.out(
          `  [${c.label}] ${c.estimatedTokens} tokens (${(c.compressionRatio * 100).toFixed(1)}%)`
        );
      }

      logger.out("\nCandidate outputs:");
      for (const output of formatCandidateOutputs(result.selectionResult)) {
        logger.out(`\n${output}`);
      }
    }

    logger.out(`\nChosen: [${result.selectionResult?.chosen.label ?? "original"}]`);
    logger.out(result.optimized);

    logger.out(`\nEstimated savings: ${result.estimatedSavings} tokens`);
    if (result.potentialSavings > result.estimatedSavings) {
      logger.out(`Potential savings across variants: ${result.potentialSavings} tokens`);
    }
    logger.out(`Safety score: ${(result.selectionResult?.safetyScore ?? 1).toFixed(3)}`);
    if (result.fallbackUsed) {
      logger.out(`⚠ Fallback used: original prompt preserved`);
    }
  });

// ─── optimize-file ────────────────────────────────────────────────────────────

program
  .command("optimize-file")
  .description("Optimize a prompt from a file")
  .argument("<file>", "Input file path")
  .option("--config <path>", "Config file")
  .option("--dry-run", "Dry run mode")
  .action(async (file: string, opts) => {
    setupLogging(program.opts());
    const globalOpts = program.opts();
    const config = await resolveConfig(globalOpts, opts);
    const input = await readFile(file, "utf8");
    const estimator = await createEstimator((globalOpts.estimator ?? "claude") as EstimatorType);
    const pipeline = new OptimizationPipeline(config, estimator);
    const result = await pipeline.run({ prompt: input, dryRun: opts.dryRun });

    logger.out("\n=== OPTIMIZE FILE RESULT ===");
    logger.out(`Original: ${result.selectionResult?.original.estimatedTokens ?? "?"} tokens`);
    logger.out(`Optimized: ${result.selectionResult?.chosen.estimatedTokens ?? "?"} tokens`);
    logger.out(`Savings: ${result.estimatedSavings} tokens`);
    if (result.potentialSavings > result.estimatedSavings) {
      logger.out(`Potential savings: ${result.potentialSavings} tokens`);
    }
    logger.out(`Safety: ${(result.selectionResult?.safetyScore ?? 1).toFixed(3)}`);
    logger.out(`Fallback: ${result.fallbackUsed}`);
    logger.out("\n--- Optimized Output ---");
    logger.out(result.optimized);
  });

// ─── filter-log ───────────────────────────────────────────────────────────────

program
  .command("filter-log")
  .description("Filter log output to relevant lines")
  .option("--file <path>", "Log file to filter")
  .option("--mode <mode>", "Log mode: docker, journalctl, dotnet, npm, generic", "generic")
  .option("--tail <n>", "Keep last N matching lines (0 = all)", "0")
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

// ─── minify-json ──────────────────────────────────────────────────────────────

program
  .command("minify-json")
  .description("Minify a JSON file or string")
  .option("--file <path>", "JSON file to minify")
  .option("--input <text>", "JSON string to minify")
  .option("--remove-nulls", "Remove null values", false)
  .action(async (opts) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts(), opts);
    let input: string;
    if (opts.file) {
      input = await readFile(opts.file, "utf8");
    } else if (opts.input) {
      input = opts.input;
    } else {
      logger.error("Provide --file or --input");
      process.exit(1);
    }

    const resolved = mergeConfig({
      jsonMinifier: {
        ...config.jsonMinifier,
        removeNulls: !!opts.removeNulls,
      },
    });
    const minifier = new JsonMinifier(resolved.jsonMinifier);
    const result = minifier.minify(input);

    if (!result.valid) {
      logger.warn("Input is not valid JSON — returned as-is");
    }
    logger.out(`\nTokens: ${result.originalTokens} → ${result.minifiedTokens} (saved ${result.originalTokens - result.minifiedTokens})\n`);
    logger.out(result.output);
  });

// ─── filter-diff ──────────────────────────────────────────────────────────────

program
  .command("filter-diff")
  .description("Filter a git diff to relevant changes")
  .option("--file <path>", "Diff file to filter")
  .option("--no-hide-whitespace", "Keep whitespace-only changes in the filtered diff")
  .action(async (opts) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts(), opts);
    const input = opts.file
      ? await readFile(opts.file, "utf8")
      : (logger.error("Provide --file"), process.exit(1) as never);

    const filter = new DiffFilter({
      ...config.diffFilter,
      hideWhitespaceOnly: opts.hideWhitespace,
    });
    const result = filter.filter(input);

    logger.out(`\nIncluded files: ${result.filesIncluded.join(", ") || "none"}`);
    logger.out(`Skipped files: ${result.filesSkipped.join(", ") || "none"}`);
    logger.out("\n--- Filtered Diff ---");
    logger.out(result.output);
  });

// ─── cache ────────────────────────────────────────────────────────────────────

const cache = program.command("cache").description("Context registry operations");

cache
  .command("put")
  .description("Store content in the context registry")
  .option("--file <path>", "File to store")
  .option("--input <text>", "Text to store")
  .option("--tags <tags>", "Comma-separated tags")
  .action(async (opts) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts(), opts);
    let content: string;
    if (opts.file) {
      content = await readFile(opts.file, "utf8");
    } else if (opts.input) {
      content = opts.input;
    } else {
      logger.error("Provide --file or --input");
      process.exit(1);
    }

    const tags = opts.tags ? (opts.tags as string).split(",").map((t: string) => t.trim()) : [];
    const registry = new ContextRegistry(config.contextRegistry);
    const ref = await registry.putOrRef(content, tags);
    logger.out(`\nStored as: ${ref}`);
  });

cache
  .command("get")
  .description("Retrieve content from the context registry")
  .argument("<ref>", "Registry reference (e.g. CTX_ab12cd34)")
  .action(async (ref: string) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts());
    const registry = new ContextRegistry(config.contextRegistry);
    const content = await registry.get(ref);
    if (content === null) {
      logger.error(`Reference not found: ${ref}`);
      process.exit(1);
    }
    logger.out(content);
  });

cache
  .command("list")
  .description("List all registry entries")
  .action(async () => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts());
    const registry = new ContextRegistry(config.contextRegistry);
    const entries = await registry.list();
    if (entries.length === 0) {
      logger.out("Registry is empty.");
      return;
    }
    logger.out(`\n${"REF".padEnd(16)} ${"CHARS".padEnd(8)} ${"CREATED".padEnd(24)} PREVIEW`);
    logger.out("─".repeat(90));
    for (const e of entries) {
      const ref = `CTX_${e.hash}`.padEnd(16);
      const len = String(e.length).padEnd(8);
      const created = e.createdAt.slice(0, 19).padEnd(24);
      logger.out(`${ref} ${len} ${created} ${e.summaryPreview.slice(0, 40)}`);
    }
  });

cache
  .command("purge")
  .description("Remove expired entries from the context registry")
  .option("--older-than <hours>", "Purge entries older than N hours (overrides config TTL)")
  .action(async (opts) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts());
    const registry = new ContextRegistry(config.contextRegistry);

    const olderThan = opts.olderThan !== undefined ? parseFloat(opts.olderThan) : undefined;

    if (olderThan !== undefined && (isNaN(olderThan) || olderThan < 0)) {
      logger.error(`Invalid --older-than value: "${opts.olderThan as string}". Must be a non-negative number.`);
      process.exit(1);
    }

    const effectiveTtl = olderThan ?? (config.contextRegistry.ttlHours ?? 24);

    if (olderThan === undefined && effectiveTtl === 0) {
      logger.out("TTL is disabled (config). Use --older-than <hours> to purge manually.");
      return;
    }

    const count = await registry.purge(effectiveTtl);
    const behavior = config.contextRegistry.purgeBehavior ?? "full";
    if (behavior === "full") {
      logger.out(`Purged ${count} entries (${count} files deleted).`);
    } else {
      logger.out(`Purged ${count} entries.`);
    }
  });

// ─── setup logging ────────────────────────────────────────────────────────────

const semantic = program.command("semantic").description("Semantic phrase learning and inspection");

semantic
  .command("learn")
  .description("Approve a semantic phrase replacement for future optimizations")
  .requiredOption("--from <text>", "Verbose source phrase")
  .requiredOption("--to <text>", "Shorter replacement phrase")
  .option("--locale <locale>", "Phrase locale: en | tr | any", "en")
  .action(async (opts) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts(), opts);
    const provider = new EnglishSemanticProvider(config.promptOptimizer.semanticCompression);
    const locale = opts.locale as "en" | "tr" | "any";
    const learned = provider.learn({
      from: opts.from,
      to: opts.to,
      locale,
      approved: true,
      source: "manual",
    });

    logger.out("\nLearned semantic phrase:");
    logger.out(`${learned.locale}: ${learned.from} -> ${learned.to}`);
  });

semantic
  .command("list")
  .description("List approved semantic phrase replacements")
  .option("--locale <locale>", "Phrase locale: en | tr | any", "en")
  .action(async (opts) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts(), opts);
    const provider = new EnglishSemanticProvider(config.promptOptimizer.semanticCompression);
    const phrases = provider.list(opts.locale as "en" | "tr" | "any");

    if (phrases.length === 0) {
      logger.out("No approved semantic phrases.");
      return;
    }

    for (const phrase of phrases) {
      logger.out(
        `${phrase.locale} | ${phrase.from} -> ${phrase.to} | uses=${phrase.usageCount} | source=${phrase.source}`
      );
    }
  });

semantic
  .command("import")
  .description("Import semantic phrase replacements from a JSON file into the project phrase DB")
  .requiredOption("--file <path>", "JSON file containing [{ from, to, locale? }]")
  .option("--locale <locale>", "Default locale when records omit it: en | tr | any", "en")
  .action(async (opts) => {
    setupLogging(program.opts());
    const config = await resolveConfig(program.opts(), opts);
    const provider = new EnglishSemanticProvider(config.promptOptimizer.semanticCompression);
    const input = await readFile(opts.file, "utf8");
    const parsed = JSON.parse(input) as Array<{ from?: string; to?: string; locale?: string }>;

    if (!Array.isArray(parsed)) {
      logger.error("Import file must be a JSON array.");
      process.exit(1);
    }

    let imported = 0;
    for (const item of parsed) {
      if (!item || typeof item.from !== "string" || typeof item.to !== "string") {
        continue;
      }
      const locale = (item.locale ?? opts.locale) as "en" | "tr" | "any";
      provider.learn({
        from: item.from,
        to: item.to,
        locale,
        approved: true,
        source: "imported",
      });
      imported += 1;
    }

    logger.out(`Imported ${imported} semantic phrases.`);
  });

function setupLogging(opts: { debug?: boolean; quiet?: boolean }) {
  if (opts.debug) logger.setLevel("debug");
  if (opts.quiet) logger.setQuiet(true);
}

program.hook("preAction", (_thisCommand, actionCommand) => {
  const globalOpts = program.opts();
  setupLogging(globalOpts);
  // Propagate dry-run to subcommand options if not already set
  const subOpts = actionCommand.opts() as Record<string, unknown>;
  if (globalOpts.dryRun && !subOpts["dryRun"]) {
    subOpts["dryRun"] = true;
  }
});

program.parse(process.argv);
