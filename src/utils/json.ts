// ─── JSON Utilities ────────────────────────────────────────────────────────────

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/**
 * Safely parses JSON without throwing.
 */
export function safeParse(raw: string): JsonValue | null {
  try {
    return JSON.parse(raw) as JsonValue;
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

export function deepClean(
  value: JsonValue,
  opts: CleanOptions
): JsonValue | undefined {
  if (value === null && opts.removeNulls) return undefined;

  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => deepClean(item, opts))
      .filter((item) => item !== undefined);
    if (opts.removeEmptyArrays && cleaned.length === 0) return undefined;
    return cleaned;
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as JsonObject;
    const result: JsonObject = {};
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
  value: JsonValue,
  aliasMap: Record<string, string>
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => applyKeyAliases(item, aliasMap));
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as JsonObject;
    const result: JsonObject = {};
    for (const [k, v] of Object.entries(obj)) {
      const newKey = aliasMap[k] ?? k;
      result[newKey] = applyKeyAliases(v, aliasMap);
    }
    return result;
  }

  return value;
}
