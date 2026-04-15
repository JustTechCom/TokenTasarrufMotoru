import { HookContext, HookResult, HookEvent, OptimizationConfig } from "../types.js";
import { OptimizationPipeline } from "../core/pipeline.js";
import { JsonMinifier } from "../modules/jsonMinifier.js";
import { LogFilter } from "../modules/logFilter.js";
import { logger } from "../logger.js";

// ─── Hook Adapter ─────────────────────────────────────────────────────────────
//
// This adapter bridges the optimizer to Claude Code's hook system.
// Claude Code hooks fire at: prePrompt, preToolUse, postToolUse.
//
// Integration path:
//   1. Claude Code (or MCP) calls handleHook() with a HookContext
//   2. Adapter routes to the appropriate optimizer
//   3. Returns HookResult with (potentially) modified content
//
// Note: Claude Code hook API is not yet stable. This adapter uses an
// abstract interface so the binding can be wired up without rewriting logic.

export class HookAdapter {
  private pipeline: OptimizationPipeline;
  private jsonMinifier: JsonMinifier;
  private logFilter: LogFilter;

  constructor(config: OptimizationConfig) {
    this.pipeline = new OptimizationPipeline(config);
    this.jsonMinifier = new JsonMinifier(config.jsonMinifier);
    this.logFilter = new LogFilter(config.logFilter);
  }

  async handleHook(ctx: HookContext): Promise<HookResult> {
    switch (ctx.event) {
      case "prePrompt":
        return this.handlePrePrompt(ctx);
      case "preToolUse":
        return this.handlePreToolUse(ctx);
      case "postToolUse":
        return this.handlePostToolUse(ctx);
      default:
        logger.warn(`HookAdapter: unknown event ${ctx.event as string}`);
        return { content: ctx.content, modified: false };
    }
  }

  private async handlePrePrompt(ctx: HookContext): Promise<HookResult> {
    const result = await this.pipeline.run({ prompt: ctx.content });
    return {
      content: result.optimized,
      modified: result.optimized !== ctx.content,
      tokensaved: result.selectionResult?.estimatedSavings,
    };
  }

  private async handlePreToolUse(ctx: HookContext): Promise<HookResult> {
    // Tool inputs are often JSON — try to minify them
    const minified = this.jsonMinifier.maybeMinify(ctx.content);
    return {
      content: minified,
      modified: minified !== ctx.content,
    };
  }

  private async handlePostToolUse(ctx: HookContext): Promise<HookResult> {
    // Tool outputs may be large logs — filter them
    const filtered = this.logFilter.filterText(ctx.content);
    // Also try JSON minification
    const minified = this.jsonMinifier.maybeMinify(filtered);
    return {
      content: minified,
      modified: minified !== ctx.content,
    };
  }
}

// ─── Example hook registration shim ──────────────────────────────────────────
//
// When Claude Code exposes a hook registration API, you would call:
//
//   import { registerHook } from "@anthropic-ai/claude-code";
//   const adapter = new HookAdapter(config);
//   registerHook("prePrompt", (ctx) => adapter.handleHook({ event: "prePrompt", ...ctx }));
//
// For now, the adapter is callable directly from CLI or MCP adapter.
