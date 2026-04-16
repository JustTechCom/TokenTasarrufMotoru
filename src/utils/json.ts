// ─── JSON Utilities ────────────────────────────────────────────────────────────

/**
 * Safely parses JSON without throwing.
 */
export function safeParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Recursively removes entries from an object/array based on filter options.
 */
interface CleanOptions {
  removeNulls?: boolean;
  removeUndefined?: boolean;
  removeEmptyArrays?: boolean;
  removeEmptyObjects?: boolean;
}

export function deepClean(value: unknown, opts: CleanOptions): unknown {
  if (value === null && opts.removeNulls) return undefined;
  if (value === undefined && opts.removeUndefined) return undefined;

  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => deepClean(item, opts))
      .filter((item) => item !== undefined);
    if (opts.removeEmptyArrays && cleaned.length === 0) return undefined;
    return cleaned;
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const cleaned = deepClean(v, opts);
      if (cleaned !== undefined) {
        result[k] = cleaned;
      }
    }
    if (opts.removeEmptyObjects && Object.keys(result).length === 0) {
      return undefined;
    }
    return result;
  }

  return value;
}

/**
 * Applies key alias mapping recursively.
 * E.g. { "description": "desc", "timestamp": "ts" }
 */
export function applyKeyAliases(
  value: unknown,
  aliasMap: Record<string, string>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => applyKeyAliases(item, aliasMap));
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const newKey = aliasMap[k] ?? k;
      result[newKey] = applyKeyAliases(v, aliasMap);
    }
    return result;
  }

  return value;
}
