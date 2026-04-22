import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
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

describe("ContextRegistry.purge", () => {
  const PURGE_CACHE_DIR = ".claude-token-optimizer/test-cache-purge";

  async function cleanPurgeCache() {
    if (existsSync(PURGE_CACHE_DIR)) {
      await rm(PURGE_CACHE_DIR, { recursive: true });
    }
  }

  async function setCreatedAt(dir: string, hash: string, hoursAgo: number): Promise<void> {
    const indexPath = join(dir, "index.json");
    const raw = await readFile(indexPath, "utf8");
    const index = JSON.parse(raw) as { entries: Record<string, { createdAt: string }> };
    index.entries[hash].createdAt = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
    await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
  }

  beforeEach(async () => {
    await cleanPurgeCache();
  });

  afterEach(async () => {
    await cleanPurgeCache();
  });

  it("purges expired entry in full mode (removes index entry and .txt file)", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 24,
      purgeBehavior: "full",
    });
    const ref = await reg.put("expired content");
    const hash = ref.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 48);
    const count = await reg.purge();
    expect(count).toBe(1);
    expect(await reg.getMeta(ref)).toBeNull();
    expect(existsSync(join(PURGE_CACHE_DIR, "entries", `${hash}.txt`))).toBe(false);
  });

  it("leaves unexpired entry untouched", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 24,
      purgeBehavior: "full",
    });
    const ref = await reg.put("fresh content");
    const hash = ref.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 1);
    const count = await reg.purge();
    expect(count).toBe(0);
    expect(await reg.getMeta(ref)).not.toBeNull();
  });

  it("index-only mode removes index entry but keeps .txt file on disk", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 24,
      purgeBehavior: "index-only",
    });
    const ref = await reg.put("index-only content");
    const hash = ref.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 48);
    await reg.purge();
    expect(await reg.getMeta(ref)).toBeNull();
    expect(existsSync(join(PURGE_CACHE_DIR, "entries", `${hash}.txt`))).toBe(true);
  });

  it("olderThanHours argument overrides config ttlHours", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 24,
      purgeBehavior: "full",
    });
    const ref = await reg.put("content to override-purge");
    const hash = ref.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 1);
    // config says 24h but we call purge(0.5) — 1h-old entry is older than 0.5h → purged
    const count = await reg.purge(0.5);
    expect(count).toBe(1);
    expect(await reg.getMeta(ref)).toBeNull();
  });

  it("ttlHours 0 disables auto-purge — purge() returns 0", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 0,
      purgeBehavior: "full",
    });
    const ref = await reg.put("should survive purge");
    const hash = ref.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 9999);
    const count = await reg.purge();
    expect(count).toBe(0);
    expect(await reg.getMeta(ref)).not.toBeNull();
  });

  it("put() triggers background purge — expired entry gone after event-loop tick", async () => {
    const reg = new ContextRegistry({
      cacheDir: PURGE_CACHE_DIR,
      hashLength: 8,
      ttlHours: 1,
      purgeBehavior: "full",
    });
    const oldRef = await reg.put("old content");
    const hash = oldRef.replace("CTX_", "");
    await setCreatedAt(PURGE_CACHE_DIR, hash, 2); // 2h old, beyond 1h TTL
    await reg.put("new content triggers purge");
    await new Promise((r) => setTimeout(r, 50));
    expect(await reg.getMeta(oldRef)).toBeNull();
  });
});
