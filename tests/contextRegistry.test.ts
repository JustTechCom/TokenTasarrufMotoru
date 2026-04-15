import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { ContextRegistry } from "../src/modules/contextRegistry.js";
import { formatRef } from "../src/utils/hash.js";

const TEST_CACHE_DIR = ".claude-token-optimizer/test-cache";

async function cleanTestCache() {
  if (existsSync(TEST_CACHE_DIR)) {
    await rm(TEST_CACHE_DIR, { recursive: true });
  }
}

describe("ContextRegistry", () => {
  let registry: ContextRegistry;

  beforeEach(async () => {
    await cleanTestCache();
    registry = new ContextRegistry({ cacheDir: TEST_CACHE_DIR, hashLength: 8 });
  });

  afterEach(async () => {
    await cleanTestCache();
  });

  it("stores content and returns a CTX_ reference", async () => {
    const ref = await registry.put("hello world content");
    expect(ref).toMatch(/^CTX_[0-9a-f]{8}$/);
  });

  it("retrieves stored content by reference", async () => {
    const content = "the quick brown fox jumps over the lazy dog";
    const ref = await registry.put(content);
    const retrieved = await registry.get(ref);
    expect(retrieved).toBe(content);
  });

  it("returns null for unknown reference", async () => {
    const result = await registry.get("CTX_00000000");
    expect(result).toBeNull();
  });

  it("same content returns same reference (deduplication)", async () => {
    const content = "identical content here";
    const ref1 = await registry.put(content);
    const ref2 = await registry.putOrRef(content);
    expect(ref1).toBe(ref2);
  });

  it("different content returns different references", async () => {
    const ref1 = await registry.put("first piece of content");
    const ref2 = await registry.put("second piece of content");
    expect(ref1).not.toBe(ref2);
  });

  it("lists stored entries sorted by createdAt desc", async () => {
    await registry.put("content A");
    await registry.put("content B");
    const entries = await registry.list();
    expect(entries.length).toBe(2);
  });

  it("getMeta returns metadata without loading full content", async () => {
    const content = "metadata test content";
    const ref = await registry.put(content, ["tag1", "tag2"]);
    const meta = await registry.getMeta(ref);
    expect(meta).not.toBeNull();
    expect(meta!.length).toBe(content.length);
    expect(meta!.tags).toContain("tag1");
    expect(meta!.summaryPreview).toBeTruthy();
  });

  it("summaryPreview is first 120 chars", async () => {
    const content = "A".repeat(200);
    const ref = await registry.put(content);
    const meta = await registry.getMeta(ref);
    expect(meta!.summaryPreview.length).toBeLessThanOrEqual(120);
  });

  it("findExisting returns null for unstored content", async () => {
    const result = await registry.findExisting("never stored this");
    expect(result).toBeNull();
  });

  it("findExisting returns ref for stored content", async () => {
    const content = "stored content for findExisting test";
    const ref = await registry.put(content);
    const found = await registry.findExisting(content);
    expect(found).toBe(ref);
  });
});
