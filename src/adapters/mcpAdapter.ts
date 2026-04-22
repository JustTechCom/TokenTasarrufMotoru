import { OptimizationConfig } from "../types.js";
import { OptimizationPipeline } from "../core/pipeline.js";
import { JsonMinifier } from "../modules/jsonMinifier.js";
import { LogFilter } from "../modules/logFilter.js";
import { DiffFilter } from "../modules/diffFilter.js";
import { ContextRegistry } from "../modules/contextRegistry.js";
import { logger } from "../logger.js";

// ─── MCP Adapter ──────────────────────────────────────────────────────────────
//
// Exposes optimizer capabilities as MCP (Model Context Protocol) tool calls.
// Each method corresponds to an MCP tool that Claude can invoke.
//
// To register these as real MCP tools, implement an MCP server that calls
// into this adapter. The adapter itself is transport-agnostic.

export class McpAdapter {
  private pipeline: OptimizationPipeline;
  private jsonMinifier: JsonMinifier;
  private logFilter: LogFilter;
  private diffFilter: DiffFilter;
  private registry: ContextRegistry;

  constructor(private config: OptimizationConfig) {
    this.pipeline = new OptimizationPipeline(config);
    this.jsonMinifier = new JsonMinifier(config.jsonMinifier);
    this.logFilter = new LogFilter(config.logFilter);
    this.diffFilter = new DiffFilter(config.diffFilter);
    this.registry = new ContextRegistry(config.contextRegistry);
  }

  /**
   * MCP tool: optimize_prompt
   * Compresses a prompt and returns the optimized version with metadata.
   */
  async optimizePrompt(prompt: string, dryRun = false): Promise<{
    optimized: string;
    estimatedSavings: number;
    potentialSavings: number;
    safetyScore: number;
    fallbackUsed: boolean;
  }> {
    const result = await this.pipeline.run({ prompt, dryRun });
    logger.info(
      `MCP optimizePrompt: savings=${result.estimatedSavings}, ` +
      `potential=${result.potentialSavings}`
    );
    return {
      optimized: result.optimized,
      estimatedSavings: result.estimatedSavings,
      potentialSavings: result.potentialSavings,
      safetyScore: result.selectionResult?.safetyScore ?? 1,
      fallbackUsed: result.fallbackUsed,
    };
  }

  /**
   * MCP tool: minify_json
   * Minifies a JSON string.
   */
  minifyJson(json: string): { output: string; originalTokens: number; minifiedTokens: number } {
    return this.jsonMinifier.minify(json);
  }

  /**
   * MCP tool: filter_log
   * Filters log output to relevant lines.
   */
  filterLog(log: string): { lines: string[]; totalInput: number; totalOutput: number } {
    return this.logFilter.filter(log);
  }

  /**
   * MCP tool: filter_diff
   * Filters a git diff to relevant changes.
   */
  filterDiff(diff: string): { output: string; filesIncluded: string[]; filesSkipped: string[] } {
    return this.diffFilter.filter(diff);
  }

  /**
   * MCP tool: cache_put
   * Stores content in the context registry.
   */
  async cachePut(content: string, tags?: string[]): Promise<{ ref: string }> {
    const ref = await this.registry.putOrRef(content, tags);
    return { ref };
  }

  /**
   * MCP tool: cache_get
   * Retrieves content from the context registry.
   */
  async cacheGet(ref: string): Promise<{ content: string | null }> {
    const content = await this.registry.get(ref);
    return { content };
  }
}
