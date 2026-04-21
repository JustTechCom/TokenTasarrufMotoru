import { describe, it, expect } from "vitest";
import { rm } from "fs/promises";
import { PromptOptimizer } from "../src/modules/promptOptimizer.js";
import { defaultConfig } from "../src/config.js";
import { EnglishSemanticProvider } from "../src/modules/englishSemanticProvider.js";

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
      "terse-technical",
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
