import { readFile, writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { ContextRegistryOptions, RegistryEntry, RegistryIndex } from "../types.js";
import { shortHash, formatRef, parseRef } from "../utils/hash.js";
import { logger } from "../logger.js";

// ─── Context Registry ─────────────────────────────────────────────────────────

const INDEX_FILE = "index.json";
const ENTRY_DIR = "entries";

export class ContextRegistry {
  private indexPath: string;
  private entryDir: string;

  constructor(private opts: ContextRegistryOptions) {
    this.indexPath = join(opts.cacheDir, INDEX_FILE);
    this.entryDir = join(opts.cacheDir, ENTRY_DIR);
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(this.entryDir, { recursive: true });
  }

  private async loadIndex(): Promise<RegistryIndex> {
    if (!existsSync(this.indexPath)) {
      return { version: 1, entries: {} };
    }
    const raw = await readFile(this.indexPath, "utf8");
    return JSON.parse(raw) as RegistryIndex;
  }

  private async saveIndex(index: RegistryIndex): Promise<void> {
    await writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf8");
  }

  /**
   * Stores content in the registry.
   * Returns the reference string (e.g. CTX_ab12cd34).
   */
  async put(content: string, tags: string[] = []): Promise<string> {
    await this.ensureDirs();

    const hash = shortHash(content, this.opts.hashLength);
    const ref = formatRef(hash);
    const entryFile = join(this.entryDir, `${hash}.txt`);

    // Write the content file
    await writeFile(entryFile, content, "utf8");

    // Update index
    const index = await this.loadIndex();
    const entry: RegistryEntry = {
      hash,
      createdAt: new Date().toISOString(),
      length: content.length,
      summaryPreview: content.slice(0, 120).replace(/\n/g, " "),
      tags,
    };
    index.entries[hash] = entry;
    await this.saveIndex(index);

    logger.info(`Registry: stored ${ref} (${content.length} chars)`);
    this.purge().catch((err: unknown) => {
      logger.warn(`Registry: background purge failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    return ref;
  }

  /**
   * Retrieves full content by reference (e.g. CTX_ab12cd34) or bare hash.
   */
  async get(refOrHash: string): Promise<string | null> {
    const hash = parseRef(refOrHash) ?? refOrHash;
    const entryFile = join(this.entryDir, `${hash}.txt`);

    if (!existsSync(entryFile)) {
      return null;
    }

    return readFile(entryFile, "utf8");
  }

  /**
   * Returns the metadata entry for a reference without loading full content.
   */
  async getMeta(refOrHash: string): Promise<RegistryEntry | null> {
    const hash = parseRef(refOrHash) ?? refOrHash;
    const index = await this.loadIndex();
    return index.entries[hash] ?? null;
  }

  /**
   * Lists all registered entries.
   */
  async list(): Promise<RegistryEntry[]> {
    const index = await this.loadIndex();
    return Object.values(index.entries).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * If this exact content is already registered, returns its reference.
   * Otherwise returns null.
   */
  async findExisting(content: string): Promise<string | null> {
    const hash = shortHash(content, this.opts.hashLength);
    const index = await this.loadIndex();
    if (index.entries[hash]) {
      return formatRef(hash);
    }
    return null;
  }

  /**
   * Returns a reference if content exists, otherwise stores and returns new ref.
   */
  async putOrRef(content: string, tags: string[] = []): Promise<string> {
    const existing = await this.findExisting(content);
    if (existing) {
      logger.debug(`Registry: cache hit ${existing}`);
      return existing;
    }
    return this.put(content, tags);
  }

  async purge(olderThanHours?: number): Promise<number> {
    if (olderThanHours === undefined && (this.opts.ttlHours ?? 24) === 0) return 0;

    const ttl = olderThanHours ?? this.opts.ttlHours ?? 24;

    const index = await this.loadIndex();
    const now = Date.now();
    const cutoffMs = ttl * 3600 * 1000;
    const behavior = this.opts.purgeBehavior ?? "full";
    let removed = 0;

    for (const [hash, entry] of Object.entries(index.entries)) {
      const age = now - new Date(entry.createdAt).getTime();
      if (age > cutoffMs) {
        if (behavior === "full") {
          await unlink(join(this.entryDir, `${hash}.txt`)).catch((err: NodeJS.ErrnoException) => {
            if (err.code !== "ENOENT") {
              logger.warn(`Registry: failed to unlink ${hash}.txt: ${err.message}`);
            }
          });
        }
        delete index.entries[hash];
        removed++;
      }
    }

    if (removed > 0) {
      await this.saveIndex(index);
    }

    return removed;
  }
}
