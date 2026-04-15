import { OptimizationConfig } from "../types.js";
import { HookAdapter } from "./hookAdapter.js";
import { logger } from "../logger.js";

// ─── Plugin Adapter ────────────────────────────────────────────────────────────
//
// A thin wrapper that exposes the optimizer as a Claude Code plugin entry point.
// Claude Code plugins export a manifest and lifecycle hooks.
//
// This is a forward-compatible skeleton — wire up the actual plugin API
// when it stabilizes.

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  hooks: string[];
}

export class PluginAdapter {
  readonly manifest: PluginManifest = {
    name: "claude-token-optimizer",
    version: "1.0.0",
    description: "Reduces token consumption by optimizing prompts and tool outputs",
    hooks: ["prePrompt", "preToolUse", "postToolUse"],
  };

  private hook: HookAdapter;

  constructor(config: OptimizationConfig) {
    this.hook = new HookAdapter(config);
    logger.info(`PluginAdapter: initialized — hooks: ${this.manifest.hooks.join(", ")}`);
  }

  /** Called by Claude Code at startup to register the plugin */
  async activate(): Promise<void> {
    logger.info(`Plugin "${this.manifest.name}" v${this.manifest.version} activated`);
  }

  /** Called by Claude Code when a hook event fires */
  async onHook(
    event: "prePrompt" | "preToolUse" | "postToolUse",
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const result = await this.hook.handleHook({ event, content, metadata });
    return result.content;
  }

  /** Graceful shutdown */
  async deactivate(): Promise<void> {
    logger.info(`Plugin "${this.manifest.name}" deactivated`);
  }
}
