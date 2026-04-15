import { describe, it, expect } from "vitest";
import { PromptOptimizer } from "../src/modules/promptOptimizer.js";
import { defaultConfig } from "../src/config.js";

const optimizer = new PromptOptimizer(defaultConfig.promptOptimizer);

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
});
