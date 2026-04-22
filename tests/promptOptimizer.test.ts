import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rm } from "fs/promises";
import { PromptOptimizer } from "../src/modules/promptOptimizer.js";
import { defaultConfig } from "../src/config.js";
import { EnglishSemanticProvider } from "../src/modules/englishSemanticProvider.js";
import { OllamaOptimizer } from "../src/modules/ollamaOptimizer.js";

const optimizer = new PromptOptimizer(defaultConfig.promptOptimizer);
const TEST_SEMANTIC_DB = ".claude-token-optimizer/test-semantic-phrases.json";

describe("PromptOptimizer", () => {
  it("normalizes excess whitespace", () => {
    const input = "hello   world\n\n\n\nfoo";
    const result = optimizer.optimize(input);
    expect(result).not.toContain("   "); // no triple spaces
    expect(result).not.toMatch(/\n{3,}/);  // no 3+ newlines
  });

  it("removes boilerplate phrases", () => {
    const input = "Please could you analyze this error message for me.";
    const result = optimizer.optimize(input);
    expect(result.toLowerCase()).not.toContain("please");
    expect(result.toLowerCase()).not.toContain("could you");
  });

  it("applies dictionary map replacements", () => {
    const input = "Analyze the database connection configuration";
    const result = optimizer.optimize(input);
    expect(result).toContain("db");
    expect(result).toContain("conn");
    expect(result).toContain("config");
  });

  it("preserves code blocks untouched", () => {
    const code = "```\nconst database = require('db');\nplease install\n```";
    const input = `Please look at this code:\n${code}`;
    const result = optimizer.optimize(input);
    // Code block should be preserved as-is
    expect(result).toContain("const database = require");
    // "please" inside code block must not be removed
    expect(result).toContain("please install");
  });

  it("preserves URLs", () => {
    const url = "https://example.com/api/v2/configuration";
    const input = `Please check ${url} for configuration details`;
    const result = optimizer.optimize(input);
    expect(result).toContain(url);
  });

  it("deduplicates repeated sentences", () => {
    const input = "Check the logs. Fix the error. Check the logs.";
    const result = optimizer.optimize(input);
    const count = (result.match(/Check the logs/gi) || []).length;
    expect(count).toBe(1);
  });

  it("produces 4 variants", () => {
    const input = "Please analyze the database connection timeout error in the logs.";
    const variants = optimizer.variants(input);
    expect(variants).toHaveLength(4);
    expect(variants.map((v) => v.label)).toEqual([
      "original",
      "normalized",
      "alias-compressed",
      "normalized+alias-compressed+terse-technical",
    ]);
  });

  it("variants have decreasing or equal token counts", () => {
    const input =
      "Please could you kindly analyze the database connection configuration file and the authentication error in the log output.";
    const variants = optimizer.variants(input);
    const [orig, norm, alias, terse] = variants.map((v) => v.estimatedTokens);
    // Each subsequent variant should be <= prior
    expect(norm).toBeLessThanOrEqual(orig);
    expect(alias).toBeLessThanOrEqual(norm);
    expect(terse).toBeLessThanOrEqual(alias);
  });

  it("shortens long paths", () => {
    const input =
      "Error in /home/user/projects/myapp/src/components/auth/LoginForm.tsx line 42";
    const result = optimizer.optimize(input);
    expect(result).not.toContain("/home/user/projects/myapp");
    expect(result).toContain("LoginForm.tsx");
  });

  it("compresses English user story boilerplate", () => {
    const input =
      "As a user, I want to receive reminders for my appointments in advance so I don't miss any meetings.";
    const variants = optimizer.variants(input);
    const alias = variants.find((v) => v.label === "alias-compressed");

    expect(alias).toBeDefined();
    expect(alias!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
    expect(alias!.text).not.toMatch(/^As a user/i);
    expect(alias!.text).not.toMatch(/\bI want to\b/i);
    expect(alias!.text).not.toMatch(/\bso that\b/i);
  });

  it("compresses Turkish user story boilerplate", () => {
    const input =
      "Bir kullanıcı olarak, randevularım için önceden hatırlatma almak istiyorum; böylece hiçbir toplantıyı kaçırmayayım.";
    const variants = optimizer.variants(input);
    const alias = variants.find((v) => v.label === "alias-compressed");

    expect(alias).toBeDefined();
    expect(alias!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
    expect(alias!.text).not.toMatch(/^Bir kullanıcı olarak/i);
    expect(alias!.text).not.toContain("böylece");
  });
  it("compresses sandbox approval prompts without semantic drift", async () => {
    const variants = await optimizer.variantsAsync(
      "Do you want to run a one-off Codex CLI check outside the sandbox to verify it can return JSON for the bridge?"
    );
    const alias = variants.find((v) => v.label === "alias-compressed");

    expect(alias).toBeDefined();
    expect(alias!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
    expect(alias!.text).not.toMatch(/^Do you want to/i);
    expect(alias!.text).toContain("run one-off Codex CLI check");
    expect(alias!.text).toContain("outside sandbox");
    expect(alias!.text).toContain("verify JSON for bridge");
    expect(alias!.text).not.toContain("away");
  });

  it("canonicalizes approval responses into persistent prefix policy", () => {
    const variants = optimizer.variants(
      "Yes, and don't ask again for commands that start with npm run build"
    );
    const normalized = variants.find((v) => v.label === "normalized");

    expect(normalized).toBeDefined();
    expect(normalized!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
    expect(normalized!.text).toContain("Yes");
    expect(normalized!.text).toContain("don't ask again");
    expect(normalized!.text).toContain("cmds starting with npm run build");
  });

  it("canonicalizes technical progress updates into terse debug notes", () => {
    const variants = optimizer.variants(
      "An empty-bodied 500 was verified. Now I'm running the same request in the process with app.inject and adding a temporary errorHandler to draw up the actual exception."
    );
    const normalized = variants.find((v) => v.label === "normalized");

    expect(normalized).toBeDefined();
    expect(normalized!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
    expect(normalized!.text).toContain("500 verified");
    expect(normalized!.text).toContain("Running same req in-proc via app.inject");
    expect(normalized!.text).toContain("adding temp errorHandler");
    expect(normalized!.text).toContain("draw up actual exception");
  });

  it("canonicalizes status summaries about remaining work and verification", () => {
    const variants = optimizer.variants(
      "The heuristic has been completely reverted. The only remaining change now is prompt tightening; I'm confirming this with testing and building."
    );
    const normalized = variants.find((v) => v.label === "normalized");

    expect(normalized).toBeDefined();
    expect(normalized!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
    expect(normalized!.text).toContain("heuristic completely reverted");
    expect(normalized!.text).toContain("remaining change: prompt tightening");
    expect(normalized!.text).toContain("confirming via tests/build");
    expect(normalized!.text).not.toContain("odd change");
    expect(normalized!.text).not.toContain("all reverted");
  });

  it("canonicalizes implementation guidance with bullets and shell line continuations", () => {
    const variants = optimizer.variants(`This behavior is a result of the normal popup lifecycle: when the browser extension popup closes, the DOM and JS context are completely destroyed. If the state is only stored in the useState/variable, it starts from scratch when the popup is reopened. ^

This repository currently does not contain the actual extension source code; only the bridge/ and plan documentation. Therefore, I cannot directly patch the popup code here. The solution is clear: ^

- Store the temporary screen state in browser.storage.session or browser.storage.local, not in popup memory. ^
- Load the saved draft state as soon as the popup opens. ^
- Write to storage with debounce as the form field changes. ^
- Delete the draft from storage when the operation is successfully completed or if the user clicks "clear".`);
    const normalized = variants.find((v) => v.label === "normalized");

    expect(normalized).toBeDefined();
    expect(normalized!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
    expect(normalized!.text).toContain("Normal popup lifecycle:");
    expect(normalized!.text).toContain("closing browser extension popup destroys DOM and JS context");
    expect(normalized!.text).toContain("If state is only in the useState/var, it resets on popup reopen");
    expect(normalized!.text).toContain("This repo lacks the extension source code; only the bridge/ and plan docs.");
    expect(normalized!.text).toContain("So I can't patch the popup code here. Fix:");
    expect(normalized!.text).toContain("browser.storage.session/local");
    expect(normalized!.text).toContain("Load saved draft when popup opens.");
    expect(normalized!.text).toContain("Fix:\n- Store temp screen state");
    expect(normalized!.text).toContain("Debounce writes to storage on form field change.");
    expect(normalized!.text).toContain("Delete draft on success or clear.");
    expect(normalized!.text).not.toContain("^");
  });

  it("applies built-in English semantic shortening", () => {
    const input = "Additional documentation regarding the application configuration is required.";
    const result = optimizer.optimize(input);

    expect(result).toContain("Additional docs");
    expect(result).toContain("app config");
    expect(result).toContain("required");
  });

  it("applies learned semantic phrases from the project phrase DB", async () => {
    await rm(TEST_SEMANTIC_DB, { force: true });

    const config = {
      ...defaultConfig.promptOptimizer,
      semanticCompression: {
        ...defaultConfig.promptOptimizer.semanticCompression,
        projectPhraseDbPath: TEST_SEMANTIC_DB,
      },
    };
    const provider = new EnglishSemanticProvider(config.semanticCompression);
    provider.learn({
      from: "worktree ready",
      to: "wt ready",
      locale: "en",
      approved: true,
      source: "manual",
    });

    const semanticOptimizer = new PromptOptimizer(config);
    const result = semanticOptimizer.optimize("Worktree ready. Additional documentation is required.");

    expect(result).toContain("Wt ready");
    expect(result).toContain("Additional docs");

    await rm(TEST_SEMANTIC_DB, { force: true });
  });

  it("uses WordNet-backed English synonym compression for verbs and adjectives", async () => {
    const variants = await optimizer.variantsAsync("Please receive additional assistance.");
    const alias = variants.find((v) => v.label === "alias-compressed");

    expect(alias).toBeDefined();
    expect(alias!.text.toLowerCase()).not.toBe("receive additional assistance.");
    expect(alias!.text.toLowerCase()).toMatch(/get|extra|needed|about/);
    expect(alias!.text.toLowerCase()).toContain("assistance");
  });

  it("applies technical abbreviations in warning text without paraphrasing sensitive terms", async () => {
    const variants = await optimizer.variantsAsync(
      "Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' makes TLS connections and HTTPS requests insecure by disabling certificate verification."
    );
    const alias = variants.find((v) => v.label === "alias-compressed");

    expect(alias).toBeDefined();
    expect(alias!.text).toContain("env var");
    expect(alias!.text).toContain("TLS conns");
    expect(alias!.text).toContain("HTTPS reqs");
    expect(alias!.text).toContain("insecure");
    expect(alias!.text).not.toContain("unsafe");
  });

  it("applies technical abbreviations in normalized output", () => {
    const variants = optimizer.variants(
      "Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' makes TLS connections and HTTPS requests insecure by disabling certificate verification."
    );
    const normalized = variants.find((v) => v.label === "normalized");

    expect(normalized).toBeDefined();
    expect(normalized!.text).toContain("env var");
    expect(normalized!.text).toContain("TLS conns");
    expect(normalized!.text).toContain("HTTPS reqs");
    expect(normalized!.text).toContain("insecure");
    expect(normalized!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
  });

  it("canonicalizes git warning phrasing in normalized output", () => {
    const variants = optimizer.variants(
      "warning: in the working copy of 'extension/src/popup/popup.ts', LF will be replaced by CRLF the next time Git touches it"
    );
    const normalized = variants.find((v) => v.label === "normalized");

    expect(normalized).toBeDefined();
    expect(normalized!.text).toContain("in working copy");
    expect(normalized!.text).toContain("LF -> CRLF");
    expect(normalized!.text).toContain("next Git touch");
    expect(normalized!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
  });

  it("canonicalizes common TypeScript diagnostics in normalized output", () => {
    const variants = optimizer.variants(
      "Type 'string' is not assignable to type 'number'. Property 'foo' does not exist on type 'Bar'."
    );
    const normalized = variants.find((v) => v.label === "normalized");

    expect(normalized).toBeDefined();
    expect(normalized!.text).toContain("type 'string'!= 'number'");
    expect(normalized!.text).toContain("prop 'foo' missing on type 'Bar'");
    expect(normalized!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
  });

  it("canonicalizes common runtime permission phrasing in normalized output", () => {
    const variants = optimizer.variants(
      "The operation was rejected by your operating system: operation not permitted, no such file or directory"
    );
    const normalized = variants.find((v) => v.label === "normalized");

    expect(normalized).toBeDefined();
    expect(normalized!.text).toContain("OS rejected op");
    expect(normalized!.text).toContain("EPERM");
    expect(normalized!.text).toContain("ENOENT");
    expect(normalized!.estimatedTokens).toBeLessThan(variants[0].estimatedTokens);
  });
});

describe("PromptOptimizer + OllamaOptimizer integration", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ollama variant joins competition — selector can pick it when it is shortest", async () => {
    const shortText = "Do X.";
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: shortText }),
    });

    const ollamaOpts = {
      enabled: true,
      baseUrl: "http://localhost:11434",
      model: "gemma4",
      timeoutMs: 5000,
    };
    const ollamaOptimizer = new OllamaOptimizer(ollamaOpts);
    const optimizer = new PromptOptimizer(defaultConfig.promptOptimizer, undefined, ollamaOptimizer);

    const input = "Please could you analyze this long error message for me and explain what went wrong.";
    const variants = await optimizer.variantsAsync(input);

    const labels = variants.map((v) => v.label);
    expect(labels).toContain("ollama-gemma4");

    const ollamaVariant = variants.find((v) => v.label === "ollama-gemma4")!;
    expect(ollamaVariant.text).toBe(shortText);
  });

  it("ollama offline — variantsAsync produces rule-based variants normally", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const ollamaOpts = {
      enabled: true,
      baseUrl: "http://localhost:11434",
      model: "gemma4",
      timeoutMs: 5000,
    };
    const ollamaOptimizer = new OllamaOptimizer(ollamaOpts);
    const optimizer = new PromptOptimizer(defaultConfig.promptOptimizer, undefined, ollamaOptimizer);

    const input = "Please could you analyze this error for me.";
    const variants = await optimizer.variantsAsync(input);

    expect(variants.length).toBeGreaterThanOrEqual(4);
    const labels = variants.map((v) => v.label);
    expect(labels).not.toContain("ollama-gemma4");
    expect(labels).toContain("original");
  });
});
