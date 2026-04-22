import { OllamaOptimizerOptions, PromptVariant } from "../types.js";
import { defaultEstimator } from "../utils/estimator.js";

const SYSTEM_PROMPT =
  "Rewrite the following prompt to be shorter and more concise while preserving all intent. Return only the rewritten text, nothing else.";

export class OllamaOptimizer {
  constructor(private opts: OllamaOptimizerOptions) {}

  async generateVariant(prompt: string): Promise<PromptVariant | null> {
    if (!this.opts.enabled) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);

    try {
      const res = await fetch(`${this.opts.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.opts.model,
          prompt: `${SYSTEM_PROMPT}\n\n${prompt}`,
          stream: false,
        }),
        signal: controller.signal,
      });

      const data = (await res.json()) as { response?: string };
      const text = data.response ?? "";

      if (!text || text.length >= prompt.length) return null;

      const originalTokens = defaultEstimator.estimate(prompt);
      const estimatedTokens = defaultEstimator.estimate(text);

      return {
        label: "ollama-gemma4",
        text,
        estimatedTokens,
        compressionRatio: estimatedTokens / Math.max(originalTokens, 1),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
