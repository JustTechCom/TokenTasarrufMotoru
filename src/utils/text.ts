// ─── Text Utilities ────────────────────────────────────────────────────────────

/**
 * Removes duplicate consecutive whitespace (spaces, tabs).
 * Preserves single newlines.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n"); // collapse 3+ blank lines to 2
}

/**
 * Normalizes common punctuation inconsistencies.
 */
export function normalizePunctuation(text: string): string {
  return text
    .replace(/\.{3,}/g, "...") // 4+ dots → ellipsis
    .replace(/!{2,}/g, "!")   // multiple ! → single
    .replace(/\?{2,}/g, "?"); // multiple ? → single
}

/**
 * Removes sentences that appear more than once (exact match).
 * Preserves first occurrence.
 */
export function deduplicateSentences(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const sentence of sentences) {
    const normalized = sentence.trim().toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(sentence.trim());
    }
  }
  return result.join(" ");
}

/**
 * Detects paragraphs (double-newline separated) that appear more than once
 * and replaces duplicates with "[repeated — omitted]".
 */
export function collapseRepeatedParagraphs(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  const seen = new Set<string>();
  return paragraphs
    .map((p) => {
      const key = p.trim().toLowerCase();
      if (key.length < 20) return p; // skip very short paragraphs
      if (seen.has(key)) return "[repeated — omitted]";
      seen.add(key);
      return p;
    })
    .join("\n\n");
}

/**
 * Shortens long absolute file paths to a shorter alias.
 * E.g. /home/user/projects/myapp/src/components/Button.tsx → …/src/components/Button.tsx
 */
export function shortenLongPaths(text: string): string {
  return text.replace(
    /(?:\/[a-zA-Z0-9_.-]+){5,}/g,
    (match) => {
      const parts = match.split("/").filter(Boolean);
      if (parts.length <= 4) return match;
      return `…/${parts.slice(-3).join("/")}`;
    }
  );
}

/**
 * Common boilerplate phrases in informal prompts.
 * These are phrases that add no semantic content.
 */
const BOILERPLATE_PHRASES = [
  /\bplease\b,?\s*/gi,
  /\bkindly\b,?\s*/gi,
  /\bcould you\b\s*/gi,
  /\bwould you\b\s*/gi,
  /\bi\s+would\s+like\s+(you\s+to\s+)?/gi,
  /\bcan you\s*/gi,
  /\bi\s+need\s+you\s+to\s*/gi,
  /\bi\s+want\s+you\s+to\s*/gi,
  /\bthank\s*(?:you|s)\b[.,]?\s*/gi,
  /\bif\s+you\s+(?:could|can|would)\b,?\s*/gi,
];

export function removeBoilerplate(text: string): string {
  let result = text;
  for (const pattern of BOILERPLATE_PHRASES) {
    result = result.replace(pattern, "");
  }
  // Clean up double spaces introduced by removals
  return result.replace(/  +/g, " ").trim();
}

/**
 * Applies a dictionary map to replace long terms with shorter aliases.
 * Only replaces whole words (case-insensitive matching).
 * Preserves content inside URLs (https?://...) to avoid breaking links.
 */
export function applyDictionaryMap(
  text: string,
  map: Record<string, string>
): string {
  const URL_PATTERN = /https?:\/\/[^\s"')]+/g;
  const urlPlaceholders: string[] = [];

  // Temporarily replace URLs with placeholders
  const withPlaceholders = text.replace(URL_PATTERN, (url) => {
    const idx = urlPlaceholders.length;
    urlPlaceholders.push(url);
    return `\x00URL_${idx}\x00`;
  });

  // Sort by length descending to match longer terms first
  const entries = Object.entries(map).sort(
    ([a], [b]) => b.length - a.length
  );

  let result = withPlaceholders;
  for (const [from, to] of entries) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(pattern, to);
  }

  // Restore URLs
  return result.replace(/\x00URL_(\d+)\x00/g, (_, i) => urlPlaceholders[parseInt(i)]);
}

/**
 * Extracts code blocks from text, processes the rest, then reinserts blocks.
 * Used to prevent modifications inside ``` ... ``` sections.
 */
export function processOutsideCodeBlocks(
  text: string,
  processor: (chunk: string) => string
): string {
  const CODE_BLOCK = /```[\s\S]*?```/g;
  const blocks: string[] = [];
  const placeholder = (i: number) => `\x00CODE_BLOCK_${i}\x00`;

  // Extract code blocks
  const withPlaceholders = text.replace(CODE_BLOCK, (match) => {
    const idx = blocks.length;
    blocks.push(match);
    return placeholder(idx);
  });

  // Process non-code portions
  const processed = processor(withPlaceholders);

  // Reinsert code blocks
  return processed.replace(/\x00CODE_BLOCK_(\d+)\x00/g, (_, i) => blocks[parseInt(i)]);
}

/**
 * Detects if a text segment looks like a stack trace.
 * Simple heuristic: multiple lines with "at " prefixes.
 */
export function looksLikeStackTrace(text: string): boolean {
  const atLines = (text.match(/^\s+at\s+/gm) || []).length;
  return atLines >= 3;
}

/**
 * Detects URLs in text.
 */
export function extractUrls(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s"')]+/g;
  return text.match(urlPattern) || [];
}

/**
 * Simple Jaccard-based similarity between two strings (word level).
 * Returns 0.0 – 1.0.
 */
export function wordSimilarity(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tokB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  const intersection = [...tokA].filter((w) => tokB.has(w)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 1.0 : intersection / union;
}
