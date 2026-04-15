#!/usr/bin/env tsx
/**
 * uninstall-hooks.ts — removes claude-token-optimizer hooks from settings.json
 */

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

type HookScope = "global" | "project";
const args = process.argv.slice(2);
const scope: HookScope = args.includes("--project") ? "project" : "global";

function settingsPath(s: HookScope): string {
  return s === "global"
    ? join(homedir(), ".claude", "settings.json")
    : join(process.cwd(), ".claude", "settings.json");
}

interface HookEntry { type: string; command: string; }
interface HookMatcher { matcher: string; hooks: HookEntry[]; }
interface ClaudeSettings {
  hooks?: { PreToolUse?: HookMatcher[]; PostToolUse?: HookMatcher[] };
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const path = settingsPath(scope);
  if (!existsSync(path)) {
    console.log("No settings file found — nothing to remove.");
    return;
  }

  const settings = JSON.parse(await readFile(path, "utf8")) as ClaudeSettings;
  const TOKEN_OPTIMIZER_MARKER = "claude-token-optimizer";

  for (const event of ["PreToolUse", "PostToolUse"] as const) {
    if (!settings.hooks?.[event]) continue;
    settings.hooks[event] = settings.hooks[event]!.filter(
      (m) => !m.hooks.some((h) => h.command.includes(TOKEN_OPTIMIZER_MARKER) || h.command.includes("cli.ts"))
    );
    if (settings.hooks[event]!.length === 0) {
      delete settings.hooks[event];
    }
  }

  await writeFile(path, JSON.stringify(settings, null, 2), "utf8");
  console.log(`✓ Removed claude-token-optimizer hooks from ${path}`);
}

main().catch(console.error);
