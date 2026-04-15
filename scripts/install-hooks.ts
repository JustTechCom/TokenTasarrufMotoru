#!/usr/bin/env tsx
/**
 * install-hooks.ts
 *
 * Installs claude-token-optimizer as Claude Code hooks in
 * ~/.claude/settings.json (global) or .claude/settings.json (project).
 *
 * Hook wiring:
 *   PreToolUse  → minify JSON tool inputs
 *   PostToolUse → filter log/JSON tool outputs
 *
 * Claude Code hook format (settings.json):
 * {
 *   "hooks": {
 *     "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "..." }] }],
 *     "PostToolUse": [...]
 *   }
 * }
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

type HookScope = "global" | "project";

interface HookEntry {
  type: "command";
  command: string;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookMatcher[];
    PostToolUse?: HookMatcher[];
    Stop?: HookMatcher[];
  };
  [key: string]: unknown;
}

const args = process.argv.slice(2);
const scope: HookScope = args.includes("--project") ? "project" : "global";
const dryRun = args.includes("--dry-run");

function settingsPath(scope: HookScope): string {
  if (scope === "global") {
    return join(homedir(), ".claude", "settings.json");
  }
  return join(process.cwd(), ".claude", "settings.json");
}

async function loadSettings(path: string): Promise<ClaudeSettings> {
  if (!existsSync(path)) return {};
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as ClaudeSettings;
}

async function saveSettings(path: string, settings: ClaudeSettings): Promise<void> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2), "utf8");
}

/**
 * Builds the shell command that pipes stdin through the optimizer.
 * Claude Code passes tool input/output via stdin and reads stdout.
 */
function buildCommand(mode: "preToolUse" | "postToolUse"): string {
  const bin = resolve(process.cwd(), "node_modules/.bin/tsx");
  const cli = resolve(process.cwd(), "src/cli.ts");

  if (mode === "preToolUse") {
    // Read stdin JSON, minify it, print to stdout
    return `${bin} ${cli} minify-json --input "$(cat -)" 2>/dev/null || cat -`;
  } else {
    // Read stdin (log/JSON output), filter it, print to stdout
    return `${bin} ${cli} filter-log --file /dev/stdin --mode generic 2>/dev/null || cat -`;
  }
}

function mergeHookMatcher(
  existing: HookMatcher[] | undefined,
  newMatcher: HookMatcher
): HookMatcher[] {
  const list = existing ?? [];
  // Don't add duplicate commands
  const alreadyWired = list.some((m) =>
    m.hooks.some((h) => h.command === newMatcher.hooks[0]?.command)
  );
  if (alreadyWired) return list;
  return [...list, newMatcher];
}

async function main(): Promise<void> {
  const path = settingsPath(scope);
  console.log(`\nScope: ${scope}`);
  console.log(`Settings file: ${path}`);
  if (dryRun) console.log("(dry-run — no changes will be written)\n");

  const settings = await loadSettings(path);
  settings.hooks ??= {};

  const preCommand = buildCommand("preToolUse");
  const postCommand = buildCommand("postToolUse");

  // PreToolUse — minify JSON inputs to tools
  settings.hooks.PreToolUse = mergeHookMatcher(settings.hooks.PreToolUse, {
    matcher: "*",
    hooks: [{ type: "command", command: preCommand }],
  });

  // PostToolUse — filter log/JSON outputs from tools
  settings.hooks.PostToolUse = mergeHookMatcher(settings.hooks.PostToolUse, {
    matcher: "*",
    hooks: [{ type: "command", command: postCommand }],
  });

  console.log("Hooks to install:");
  console.log(`  PreToolUse:  ${preCommand.slice(0, 80)}...`);
  console.log(`  PostToolUse: ${postCommand.slice(0, 80)}...`);

  if (!dryRun) {
    await saveSettings(path, settings);
    console.log(`\n✓ Hooks installed in ${path}`);
    console.log("  Restart Claude Code to apply.\n");
  } else {
    console.log("\n[dry-run] Would write:");
    console.log(JSON.stringify(settings, null, 2));
  }
}

main().catch((e) => {
  console.error("install-hooks error:", e);
  process.exit(1);
});
