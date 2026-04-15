import { createHash } from "crypto";

/**
 * Returns a short SHA-256 hex prefix of given length (default 8).
 * Used as CTX_<hash> identifiers in the context registry.
 */
export function shortHash(content: string, length = 8): string {
  return createHash("sha256").update(content).digest("hex").slice(0, length);
}

/**
 * Returns the full SHA-256 hex digest.
 */
export function fullHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Formats a short hash into the standard registry reference format.
 */
export function formatRef(hash: string): string {
  return `CTX_${hash}`;
}

/**
 * Parses a CTX_ reference, returning the hash portion.
 */
export function parseRef(ref: string): string | null {
  const match = ref.match(/^CTX_([0-9a-f]+)$/i);
  return match ? match[1] : null;
}
