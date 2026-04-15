// ─── Logger ────────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";
let isQuiet = false;

export const logger = {
  setLevel(level: LogLevel): void {
    currentLevel = level;
  },

  setQuiet(quiet: boolean): void {
    isQuiet = quiet;
  },

  debug(msg: string, ...args: unknown[]): void {
    if (!isQuiet && LEVELS[currentLevel] <= LEVELS.debug) {
      console.debug(`[DEBUG] ${msg}`, ...args);
    }
  },

  info(msg: string, ...args: unknown[]): void {
    if (!isQuiet && LEVELS[currentLevel] <= LEVELS.info) {
      console.info(`[INFO]  ${msg}`, ...args);
    }
  },

  warn(msg: string, ...args: unknown[]): void {
    if (LEVELS[currentLevel] <= LEVELS.warn) {
      console.warn(`[WARN]  ${msg}`, ...args);
    }
  },

  error(msg: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${msg}`, ...args);
  },

  /** Plain output — always printed regardless of level/quiet (for CLI results) */
  out(msg: string): void {
    console.log(msg);
  },
};
