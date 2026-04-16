import { describe, it, expect } from "vitest";
import { safeParse, deepClean, applyKeyAliases } from "../src/utils/json.js";

describe("json utils", () => {
  describe("safeParse", () => {
    it("parses valid json values", () => {
      expect(safeParse('{"a":1}')).toEqual({ a: 1 });
      expect(safeParse('[1,2,3]')).toEqual([1, 2, 3]);
      expect(safeParse('"text"')).toBe("text");
      expect(safeParse("null")).toBeNull();
    });

    it("returns null for invalid json", () => {
      expect(safeParse("{invalid json}")).toBeNull();
    });
  });

  describe("deepClean", () => {
    it("removes nulls recursively from objects and arrays", () => {
      const value = {
        keep: 1,
        remove: null,
        nested: { keep: "ok", remove: null },
        list: [1, null, { keep: true, remove: null }],
      } as const;

      const cleaned = deepClean(value, { removeNulls: true });

      expect(cleaned).toEqual({
        keep: 1,
        nested: { keep: "ok" },
        list: [1, { keep: true }],
      });
    });

    it("removes empty containers when configured", () => {
      const value = { a: [], b: {}, c: { d: [] }, e: 1 };
      const cleaned = deepClean(value, {
        removeEmptyArrays: true,
        removeEmptyObjects: true,
      });

      expect(cleaned).toEqual({ e: 1 });
    });
  });

  describe("applyKeyAliases", () => {
    it("renames keys recursively without changing values", () => {
      const value = {
        timestamp: "2026-01-01",
        meta: { description: "hello" },
        items: [{ timestamp: "x" }],
      };

      const aliased = applyKeyAliases(value, {
        timestamp: "ts",
        description: "desc",
      });

      expect(aliased).toEqual({
        ts: "2026-01-01",
        meta: { desc: "hello" },
        items: [{ ts: "x" }],
      });
    });
  });
});
