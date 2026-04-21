// ─── Text Utilities ────────────────────────────────────────────────────────────

/**
 * Removes duplicate consecutive whitespace (spaces, tabs).
 * Preserves single newlines.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]*\^[ \t]*(?:\r?\n|$)/g, "\n")
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
 * Compresses common agile user story boilerplate while preserving intent.
 * Targets English and Turkish story phrasing with conservative rewrites.
 */
export function compressUserStory(text: string): string {
  let result = text.trim();

  result = result
    .replace(/^as an? [^,.;:\n]+,\s*/i, "")
    .replace(/^i want to\s+/i, "")
    .replace(/\s+so that i (?:don't|do not)\s+/gi, " to avoid ")
    .replace(/\s+so that i can\s+/gi, " to ")
    .replace(/\s+so that\b/gi, " to ");

  result = result
    .replace(/^bir [^,.;:\n]+ olarak,\s*/iu, "")
    .replace(/\bhatırlatma almak istiyorum\b/giu, "hatırlatma istiyorum")
    .replace(/\bböylece\b/giu, "")
    .replace(/\bhiçbir ([^ ]+)y[ıiuü] ([^ ]+mayay[ıiuü]m)\b/giu, "$1 $2");

  return result
    .replace(/\s*!=\s*/g, " != ")
    .replace(/\s*->\s*/g, " -> ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Compresses common approval/request boilerplate used around sandbox actions.
 */
export function compressApprovalPrompt(text: string): string {
  let result = text.trim();

  result = result
    .replace(/^do you want to\s+/i, "")
    .replace(/^would you like to\s+/i, "")
    .replace(/^are you sure you want to\s+/i, "")
    .replace(/\brun a one-off\b/gi, "run one-off")
    .replace(/\boutside the sandbox\b/gi, "outside sandbox")
    .replace(/\bto verify it can return\b/gi, "to verify")
    .replace(/\bfor the bridge\b/gi, "for bridge");

  return result
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Canonicalizes common technical warning phrasing without changing core meaning.
 * Targets Git/runtime diagnostics and keeps path/env/protocol tokens intact.
 */
export function canonicalizeTechnicalMessage(text: string): string {
  let result = text;

  result = result
    .replace(/\bThe engine "?node"? is incompatible with this module\b/gi, "node engine mismatch")
    .replace(/\bThe operation was rejected by your operating system\b/gi, "OS rejected op")
    .replace(/\bno such file or directory\b/gi, "ENOENT")
    .replace(/\boperation not permitted\b/gi, "EPERM")
    .replace(/\bpermission denied\b/gi, "EACCES")
    .replace(/\bcommand not found\b/gi, "cmd not found")
    .replace(/\bCannot find module\b/gi, "missing module")
    .replace(/Type '([^']+)' is not assignable to type '([^']+)'/gi, "type '$1' != '$2'")
    .replace(/\bis not assignable to type\b/gi, "!= type")
    .replace(/\bProperty '([^']+)' does not exist on type\b/gi, "prop '$1' missing on type")
    .replace(/\bArgument of type\b/gi, "arg type")
    .replace(/\bExpected (\d+) arguments?, but got (\d+)\b/gi, "args exp $1 got $2")
    .replace(/\bin the working copy of\b/gi, "in working copy")
    .replace(/\bwill be replaced by\b/gi, "->")
    .replace(/\bthe next time\b/gi, "next")
    .replace(/\bGit touches it\b/gi, "Git touch")
    .replace(/\bby disabling\b/gi, "disabling");

  return result
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/**
 * Compresses dotted alternatives that share the same prefix.
 * Example: browser.storage.session or browser.storage.local -> browser.storage.session/local
 */
export function compressQualifiedAlternatives(text: string): string {
  return text.replace(
    /\b((?:[A-Za-z_][\w$]*\.)+[A-Za-z_][\w$]*)\s+or\s+((?:[A-Za-z_][\w$]*\.)+[A-Za-z_][\w$]*)\b/g,
    (match, left: string, right: string) => {
      const leftParts = left.split(".");
      const rightParts = right.split(".");
      if (leftParts.length !== rightParts.length) return match;

      let sharedUntil = 0;
      while (
        sharedUntil < leftParts.length - 1 &&
        leftParts[sharedUntil] === rightParts[sharedUntil]
      ) {
        sharedUntil += 1;
      }

      if (sharedUntil !== leftParts.length - 1) {
        return match;
      }

      const sharedPrefix = leftParts.slice(0, -1).join(".");
      const leftTail = leftParts[leftParts.length - 1];
      const rightTail = rightParts[rightParts.length - 1];
      return `${sharedPrefix}.${leftTail}/${rightTail}`;
    }
  );
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

/**
 * Character n-gram Jaccard similarity.
 * Helpful for abbreviations and morphologically similar forms.
 */
export function charNgramSimilarity(a: string, b: string, size = 3): number {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const makeNgrams = (value: string): Set<string> => {
    const normalized = normalize(value);
    if (normalized.length <= size) {
      return new Set(normalized ? [normalized] : []);
    }
    const grams = new Set<string>();
    for (let i = 0; i <= normalized.length - size; i += 1) {
      grams.add(normalized.slice(i, i + size));
    }
    return grams;
  };

  const gramsA = makeNgrams(a);
  const gramsB = makeNgrams(b);
  const intersection = [...gramsA].filter((gram) => gramsB.has(gram)).length;
  const union = new Set([...gramsA, ...gramsB]).size;
  return union === 0 ? 1.0 : intersection / union;
}
