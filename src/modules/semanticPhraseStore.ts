import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { SemanticPhraseIndex, SemanticPhraseRecord } from "../types.js";

const EMPTY_INDEX: SemanticPhraseIndex = {
  version: 1,
  phrases: [],
};

export class SemanticPhraseStore {
  constructor(private filePath: string) {}

  private ensureParentDir(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
  }

  private loadIndex(): SemanticPhraseIndex {
    if (!existsSync(this.filePath)) {
      return { ...EMPTY_INDEX, phrases: [] };
    }

    const raw = readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as SemanticPhraseIndex;
  }

  private saveIndex(index: SemanticPhraseIndex): void {
    this.ensureParentDir();
    writeFileSync(this.filePath, JSON.stringify(index, null, 2), "utf8");
  }

  listApproved(locale: "en" | "tr" | "any"): SemanticPhraseRecord[] {
    return this.loadIndex().phrases.filter(
      (phrase) =>
        phrase.approved &&
        (phrase.locale === "any" || phrase.locale === locale)
    );
  }

  upsert(record: Omit<SemanticPhraseRecord, "createdAt" | "usageCount">): SemanticPhraseRecord {
    const index = this.loadIndex();
    const normalizedFrom = record.from.trim().toLowerCase();
    const normalizedLocale = record.locale;
    const existing = index.phrases.find(
      (phrase) =>
        phrase.from.trim().toLowerCase() === normalizedFrom &&
        phrase.locale === normalizedLocale
    );

    if (existing) {
      existing.to = record.to;
      existing.approved = record.approved;
      existing.source = record.source;
      this.saveIndex(index);
      return existing;
    }

    const created: SemanticPhraseRecord = {
      ...record,
      createdAt: new Date().toISOString(),
      usageCount: 0,
    };
    index.phrases.push(created);
    this.saveIndex(index);
    return created;
  }

  recordUsage(from: string, locale: "en" | "tr" | "any"): void {
    const index = this.loadIndex();
    const normalizedFrom = from.trim().toLowerCase();
    const phrase = index.phrases.find(
      (entry) =>
        entry.from.trim().toLowerCase() === normalizedFrom &&
        entry.locale === locale
    );

    if (!phrase) return;

    phrase.usageCount += 1;
    this.saveIndex(index);
  }
}
