import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaOptimizer } from "../src/modules/ollamaOptimizer.js";

const BASE_OPTS = {
  enabled: true,
  baseUrl: "http://localhost:11434",
  model: "gemma4",
  timeoutMs: 5000,
};

describe("OllamaOptimizer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns variant with label 'ollama-gemma4' on successful shorter response", async () => {
    const input = "Please could you analyze this long error message for me and tell me what is wrong with it.";
    const shorterResponse = "Analyze this error.";
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: shorterResponse }),
    });

    const optimizer = new OllamaOptimizer(BASE_OPTS);
    const result = await optimizer.generateVariant(input);

    expect(result).not.toBeNull();
    expect(result!.label).toBe("ollama-gemma4");
    expect(result!.text).toBe(shorterResponse);
    expect(result!.estimatedTokens).toBeGreaterThan(0);
    expect(result!.compressionRatio).toBeLessThan(1);
  });

  it("returns null when response is longer than or equal to original", async () => {
    const input = "Short prompt.";
    const longerResponse = "This is a much longer response that expands the original prompt significantly and adds nothing.";
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: longerResponse }),
    });

    const optimizer = new OllamaOptimizer(BASE_OPTS);
    const result = await optimizer.generateVariant(input);

    expect(result).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const optimizer = new OllamaOptimizer(BASE_OPTS);
    const result = await optimizer.generateVariant("Any prompt here.");

    expect(result).toBeNull();
  });

  it("returns null on timeout (AbortController fires)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          (opts.signal as AbortSignal).addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError"))
          );
        })
    );

    const optimizer = new OllamaOptimizer({ ...BASE_OPTS, timeoutMs: 50 });
    const result = await optimizer.generateVariant("Any prompt here.");

    expect(result).toBeNull();
  });

  it("does not call fetch when enabled is false", async () => {
    const optimizer = new OllamaOptimizer({ ...BASE_OPTS, enabled: false });
    const result = await optimizer.generateVariant("Any prompt here.");

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
