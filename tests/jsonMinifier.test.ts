import { describe, it, expect } from "vitest";
import { JsonMinifier } from "../src/modules/jsonMinifier.js";
import { defaultConfig } from "../src/config.js";

const minifier = new JsonMinifier(defaultConfig.jsonMinifier);

describe("JsonMinifier", () => {
  it("minifies a valid JSON object", () => {
    const input = JSON.stringify({ name: "test", value: 42 }, null, 2);
    const result = minifier.minify(input);
    expect(result.valid).toBe(true);
    expect(result.output).toBe('{"name":"test","value":42}');
  });

  it("minifies a valid JSON array", () => {
    const input = JSON.stringify([1, 2, 3], null, 2);
    const result = minifier.minify(input);
    expect(result.valid).toBe(true);
    expect(result.output).toBe("[1,2,3]");
  });

  it("returns valid=false for non-JSON input", () => {
    const input = "this is not json at all";
    const result = minifier.minify(input);
    expect(result.valid).toBe(false);
    expect(result.output).toBe(input);
  });

  it("removes null values when configured", () => {
    const m = new JsonMinifier({ ...defaultConfig.jsonMinifier, removeNulls: true });
    const input = JSON.stringify({ a: 1, b: null, c: "hello" });
    const result = m.minify(input);
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("b");
    expect(parsed.a).toBe(1);
    expect(parsed.c).toBe("hello");
  });

  it("removes empty arrays when configured", () => {
    const m = new JsonMinifier({ ...defaultConfig.jsonMinifier, removeEmptyArrays: true });
    const input = JSON.stringify({ items: [], count: 5 });
    const result = m.minify(input);
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("items");
    expect(parsed.count).toBe(5);
  });

  it("applies key alias map", () => {
    const m = new JsonMinifier({
      ...defaultConfig.jsonMinifier,
      aliasMap: { description: "desc", timestamp: "ts" },
    });
    const input = JSON.stringify({ description: "foo", timestamp: "2024-01-01", other: 1 });
    const result = m.minify(input);
    const parsed = JSON.parse(result.output) as Record<string, unknown>;
    expect(parsed).toHaveProperty("desc", "foo");
    expect(parsed).toHaveProperty("ts", "2024-01-01");
    expect(parsed).toHaveProperty("other", 1);
    expect(parsed).not.toHaveProperty("description");
  });

  it("maybeMinify returns original for non-JSON text", () => {
    const text = "just a plain string";
    expect(minifier.maybeMinify(text)).toBe(text);
  });

  it("maybeMinify minifies JSON-looking input", () => {
    const text = '{"a":  1,  "b":  2}';
    const result = minifier.maybeMinify(text);
    expect(result).toBe('{"a":1,"b":2}');
  });

  it("originalTokens >= minifiedTokens for valid JSON", () => {
    const input = JSON.stringify({ longKey: "longValue", anotherKey: [1, 2, 3] }, null, 4);
    const result = minifier.minify(input);
    expect(result.originalTokens).toBeGreaterThanOrEqual(result.minifiedTokens);
  });
});
