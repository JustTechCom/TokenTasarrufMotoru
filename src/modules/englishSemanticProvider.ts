import { existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import { SemanticCompressionOptions, SemanticPhraseRecord } from "../types.js";
import { SemanticPhraseStore } from "./semanticPhraseStore.js";

const BUILTIN_ENGLISH_PHRASES: Array<{ from: string; to: string }> = [
  { from: "in order to", to: "to" },
  { from: "approximately", to: "about" },
  { from: "information", to: "info" },
  { from: "documentation", to: "docs" },
  { from: "application", to: "app" },
  { from: "applications", to: "apps" },
  { from: "repository", to: "repo" },
  { from: "repositories", to: "repos" },
  { from: "environment", to: "env" },
  { from: "environments", to: "envs" },
  { from: "configuration", to: "config" },
  { from: "configurations", to: "configs" },
];

type Replacement = {
  from: string;
  to: string;
  locale: "en" | "tr" | "any";
};

type WordPosLookupResult = {
  pos: string;
  synonyms?: string[];
};

type WordPosClient = {
  lookup(word: string): Promise<WordPosLookupResult[]>;
};

const require = createRequire(import.meta.url);
const WORD_TOKEN = /\b[A-Za-z]{7,}\b/g;
const COMMON_STOPWORDS = new Set([
  "about",
  "after",
  "before",
  "during",
  "through",
  "because",
  "against",
  "without",
]);
const PRESERVE_TECHNICAL_TERMS = new Set([
  "authentication",
  "authorization",
  "certificate",
  "certificates",
  "https",
  "http",
  "insecure",
  "security",
  "tls",
  "unsafe",
  "verification",
]);

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyPhraseReplacement(text: string, from: string, to: string): string {
  const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi");
  return text.replace(pattern, (match) => {
    if (match.toUpperCase() === match) return to.toUpperCase();
    if (match[0] === match[0].toUpperCase()) {
      return to[0].toUpperCase() + to.slice(1);
    }
    return to;
  });
}

function normalizeExternalRecords(
  data: unknown
): Replacement[] {
  if (!Array.isArray(data)) return [];

  return data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as {
      from?: unknown;
      to?: unknown;
      locale?: unknown;
    };
    if (typeof candidate.from !== "string" || typeof candidate.to !== "string") {
      return [];
    }
    return [{
      from: candidate.from,
      to: candidate.to,
      locale:
        candidate.locale === "tr" || candidate.locale === "any"
          ? candidate.locale
          : "en",
    }];
  });
}

function protectUrls(text: string): { text: string; urls: string[] } {
  const URL_PATTERN = /https?:\/\/[^\s"')]+/g;
  const urls: string[] = [];
  const masked = text.replace(URL_PATTERN, (url) => {
    const idx = urls.length;
    urls.push(url);
    return `\x00SEM_URL_${idx}\x00`;
  });
  return { text: masked, urls };
}

function restoreUrls(text: string, urls: string[]): string {
  return text.replace(/\x00SEM_URL_(\d+)\x00/g, (_, i) => urls[parseInt(i, 10)]);
}

function normalizeAbbreviationMap(
  map: Record<string, string>
): Replacement[] {
  return Object.entries(map).map(([from, to]) => ({
    from,
    to,
    locale: "en" as const,
  }));
}

export class EnglishSemanticProvider {
  private phraseStore: SemanticPhraseStore;
  private externalReplacements: Replacement[];
  private wordPosClient: WordPosClient | null = null;
  private wordNetCache = new Map<string, string | null>();

  constructor(private opts: SemanticCompressionOptions) {
    this.phraseStore = new SemanticPhraseStore(opts.projectPhraseDbPath);
    this.externalReplacements = this.loadExternalReplacements();
    this.wordPosClient = this.loadWordPosClient();
  }

  private loadWordPosClient(): WordPosClient | null {
    if (!this.opts.useWordPosWordNet) {
      return null;
    }

    try {
      const WordPOS = require("wordpos") as new () => WordPosClient;
      return new WordPOS();
    } catch {
      return null;
    }
  }

  private loadExternalReplacements(): Replacement[] {
    if (!this.opts.externalEnglishSynonymsPath) {
      return [];
    }
    if (!existsSync(this.opts.externalEnglishSynonymsPath)) {
      return [];
    }

    const raw = readFileSync(this.opts.externalEnglishSynonymsPath, "utf8");
    return normalizeExternalRecords(JSON.parse(raw));
  }

  private detectLocale(text: string): "en" | "tr" {
    return /[çğıöşüİ]/iu.test(text) ? "tr" : "en";
  }

  private applyTechnicalAbbreviations(text: string): string {
    let result = text;
    const replacements = normalizeAbbreviationMap(this.opts.technicalAbbreviationMap)
      .sort((a, b) => b.from.length - a.from.length);

    for (const replacement of replacements) {
      if (replacement.to.length >= replacement.from.length) continue;
      result = applyPhraseReplacement(result, replacement.from, replacement.to);
    }

    return result;
  }

  private collectReplacements(text: string): Replacement[] {
    const locale = this.opts.locale === "auto" ? this.detectLocale(text) : this.opts.locale;
    const learned = this.phraseStore.listApproved(locale).map((entry) => ({
      from: entry.from,
      to: entry.to,
      locale: entry.locale,
    }));

    const builtin =
      locale === "en" && this.opts.useEnglishSemanticProvider
        ? BUILTIN_ENGLISH_PHRASES.map((entry) => ({
            ...entry,
            locale: "en" as const,
          }))
        : [];

    const external = this.externalReplacements.filter(
      (entry) => entry.locale === "any" || entry.locale === locale
    );

    return [...learned, ...external, ...builtin].sort(
      (a, b) => b.from.length - a.from.length
    );
  }

  compress(text: string): string {
    if (!this.opts.enabled) return text;

    const protectedText = protectUrls(text);
    let result = this.applyTechnicalAbbreviations(protectedText.text);
    const replacements = this.collectReplacements(text);

    for (const replacement of replacements) {
      if (replacement.to.length >= replacement.from.length) continue;
      const next = applyPhraseReplacement(result, replacement.from, replacement.to);
      if (next !== result && replacement.locale !== "any") {
        this.phraseStore.recordUsage(replacement.from, replacement.locale);
      }
      result = next;
    }

    return restoreUrls(result, protectedText.urls).replace(/\s{2,}/g, " ").trim();
  }

  private async findWordNetReplacement(word: string): Promise<string | null> {
    const normalizedWord = word.toLowerCase();
    if (this.wordNetCache.has(normalizedWord)) {
      return this.wordNetCache.get(normalizedWord) ?? null;
    }

    if (!this.wordPosClient) {
      this.wordNetCache.set(normalizedWord, null);
      return null;
    }

    const results = await this.wordPosClient.lookup(normalizedWord);
    const candidates = [...new Set(
      results
        .filter((result) => ["v", "a", "s", "r"].includes(result.pos))
        .flatMap((result) => result.synonyms ?? [])
        .map((synonym) => synonym.toLowerCase().replace(/_/g, " ").trim())
    )]
      .filter((candidate) => /^[a-z]+$/.test(candidate))
      .filter((candidate) => candidate.length >= 3)
      .filter((candidate) => candidate.length < normalizedWord.length)
      .filter((candidate) => candidate !== normalizedWord)
      .filter((candidate) => !COMMON_STOPWORDS.has(candidate))
      .sort((a, b) => a.length - b.length || a.localeCompare(b));

    const chosen = candidates[0] ?? null;
    this.wordNetCache.set(normalizedWord, chosen);
    return chosen;
  }

  private async applyWordNetSingleWordCompression(text: string): Promise<string> {
    if (!this.wordPosClient) {
      return text;
    }

    const matches = [...new Set(text.match(WORD_TOKEN) ?? [])];
    let bestMatch: { from: string; to: string; savings: number } | null = null;

    for (const match of matches) {
      if (PRESERVE_TECHNICAL_TERMS.has(match.toLowerCase())) {
        continue;
      }
      const replacement = await this.findWordNetReplacement(match);
      if (!replacement) continue;
      const savings = match.length - replacement.length;
      if (!bestMatch || savings > bestMatch.savings) {
        bestMatch = { from: match, to: replacement, savings };
      }
    }

    if (!bestMatch) {
      return text;
    }

    return applyPhraseReplacement(text, bestMatch.from, bestMatch.to);
  }

  async compressAsync(text: string): Promise<string> {
    const phraseCompressed = this.compress(text);
    if (!this.opts.enabled) return phraseCompressed;
    const locale = this.opts.locale === "auto" ? this.detectLocale(phraseCompressed) : this.opts.locale;
    if (locale !== "en") return phraseCompressed;
    return this.applyWordNetSingleWordCompression(phraseCompressed);
  }

  learn(record: Omit<SemanticPhraseRecord, "createdAt" | "usageCount">): SemanticPhraseRecord {
    return this.phraseStore.upsert(record);
  }

  list(locale: "en" | "tr" | "any"): SemanticPhraseRecord[] {
    return this.phraseStore.listApproved(locale);
  }
}
