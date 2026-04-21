# claude-token-optimizer

Production-ready token optimization for Claude Code prompts, logs, JSON payloads, diffs, and reusable context snippets.

> English documentation | [Turkce dokumantasyon](docs/tr/README.md)

## Overview

`claude-token-optimizer` combines a CLI, a library API, Claude Code hook helpers, and an MCP server. It reduces noisy or repetitive content before it reaches the model while keeping the original meaning intact enough for safe use in developer workflows.

Primary use cases:

- Compress verbose prompts without losing intent
- Minify JSON payloads before sending them to tools or models
- Filter noisy logs down to actionable lines
- Reduce large git diffs to more relevant output
- Store oversized context on disk and refer to it with `CTX_*` handles
- Learn reusable semantic phrase replacements for future optimizations

## Installation

Node.js `18+` is required.

```bash
git clone <repo>
cd claude-token-optimizer
npm install
```

Run in development mode:

```bash
npm run dev -- --help
```

Build the CLI:

```bash
npm run build
node dist/cli.js --help
```

Optional global command:

```bash
npm link
claude-token-optimizer --help
```

## Quick Start

Optimize inline text:

```bash
claude-token-optimizer optimize \
  --input "Please could you kindly analyze the database connection timeout error in the authentication service logs"
```

Optimize a prompt file:

```bash
claude-token-optimizer optimize-file ./prompts/error-report.txt
```

Filter logs:

```bash
claude-token-optimizer filter-log --file ./app.log --mode docker --tail 30
```

Minify JSON:

```bash
claude-token-optimizer minify-json \
  --input '{"name":"test","value":null}' \
  --remove-nulls
```

Store large context:

```bash
claude-token-optimizer cache put --file ./huge-context.txt --tags "incident,auth"
claude-token-optimizer cache list
```

## CLI Syntax

Base pattern:

```bash
claude-token-optimizer [global-options] <command> [command-options]
```

Practical rule:

- Put global options before the command
- Put command-specific flags after the command
- Quote inline text values
- Use `--file` for file input and `--input` for direct inline input

Example:

```bash
claude-token-optimizer --debug --config ./optimizer.config.json optimize --input "Summarize this log"
```

## Flag Guide

### Global options

These affect the full invocation:

| Flag | What it does | Notes |
|------|---------------|-------|
| `--config <path>` | Loads a JSON config file | Useful for shared defaults across commands |
| `--dry-run` | Simulates changes without applying them | Especially useful for optimization workflows |
| `--estimator <type>` | Chooses the token estimator | `heuristic` or `claude` |
| `--debug` | Enables verbose logging | Good for troubleshooting |
| `--quiet` | Suppresses info/debug logs | Keeps output script-friendly |

Examples:

```bash
claude-token-optimizer --quiet optimize-file ./prompt.txt
claude-token-optimizer --config ./optimizer.config.json filter-log --file ./app.log
```

### Command-scoped options

These apply only to the command they follow:

```bash
claude-token-optimizer optimize --input "Explain the error"
claude-token-optimizer filter-log --file ./app.log --mode npm --tail 50
claude-token-optimizer semantic learn --from "database connection" --to "db conn"
```

### `--file` vs `--input`

- Use `--file` when the source data already exists on disk
- Use `--input` for short inline content
- If both are present on commands that allow both, `--file` takes precedence

Examples:

```bash
claude-token-optimizer minify-json --file ./response.json
claude-token-optimizer minify-json --input '{"ok":true}'
```

### `--dry-run`

`--dry-run` lets you inspect what would happen without applying the modification path.

```bash
claude-token-optimizer --dry-run optimize --input "Please carefully analyze this issue"
claude-token-optimizer optimize-file ./prompt.txt --dry-run
```

### Config plus flags

Config is loaded first, then command-line flags override the relevant parts of it.

```bash
claude-token-optimizer \
  --config ./optimizer.config.json \
  filter-log \
  --file ./app.log \
  --mode docker \
  --tail 100
```

In this example, `mode` and `tail` come from the CLI while the remaining `logFilter` settings can still come from the config file.

## Command Reference

### `optimize`

Optimizes an inline prompt string.

```bash
claude-token-optimizer optimize --input "Analyze the authentication timeout issue"
```

| Flag | Required | Description |
|------|----------|-------------|
| `--input <text>` | Yes | Prompt text to optimize |
| `--config <path>` | No | Command-local config file |
| `--dry-run` | No | Simulate the optimization |

Tip: use the global `--estimator heuristic` or `--estimator claude` flag to choose token estimation mode.

### `optimize-file`

Optimizes the contents of a prompt file.

```bash
claude-token-optimizer optimize-file ./my-prompt.txt
claude-token-optimizer --estimator heuristic optimize-file ./my-prompt.txt --dry-run
```

| Flag / Argument | Required | Description |
|-----------------|----------|-------------|
| `<file>` | Yes | Input file path |
| `--config <path>` | No | Config file |
| `--dry-run` | No | Simulate only |

### `filter-log`

Filters log output down to the lines most likely to matter.

```bash
claude-token-optimizer filter-log --file ./app.log --mode docker
claude-token-optimizer filter-log --file ./worker.log --mode npm --tail 30
```

| Flag | Required | Description |
|------|----------|-------------|
| `--file <path>` | Yes | Log file to process |
| `--mode <mode>` | No | `docker`, `journalctl`, `dotnet`, `npm`, `generic` |
| `--tail <n>` | No | Keep the last N matching lines |

Note: `includeErrors`, `includeWarnings`, and `includeFailures` are config fields, not CLI flags.

### `minify-json`

Minifies JSON from a file or inline string.

```bash
claude-token-optimizer minify-json --file ./payload.json
claude-token-optimizer minify-json --input '{"a":1,"b":null}' --remove-nulls
```

| Flag | Required | Description |
|------|----------|-------------|
| `--file <path>` | Conditional | JSON file input |
| `--input <text>` | Conditional | Inline JSON string |
| `--remove-nulls` | No | Removes `null` fields |

### `filter-diff`

Filters git diff content into a more model-friendly output.

```bash
claude-token-optimizer filter-diff --file ./changes.diff
claude-token-optimizer filter-diff --file ./changes.diff --no-hide-whitespace
```

| Flag | Required | Description |
|------|----------|-------------|
| `--file <path>` | Yes | Diff file to process |
| `--no-hide-whitespace` | No | Keeps whitespace-only changes in the result |

### `cache`

Stores and retrieves large content by reference.

Store content:

```bash
claude-token-optimizer cache put --input "very large context" --tags "session-1,debug"
claude-token-optimizer cache put --file ./context.txt
```

Retrieve content:

```bash
claude-token-optimizer cache get CTX_ab12cd34
```

List entries:

```bash
claude-token-optimizer cache list
```

`cache put` flags:

| Flag | Required | Description |
|------|----------|-------------|
| `--file <path>` | Conditional | File to store |
| `--input <text>` | Conditional | Inline text to store |
| `--tags <tags>` | No | Comma-separated tags |

### `semantic`

Manages learned semantic replacements.

Learn a phrase:

```bash
claude-token-optimizer semantic learn \
  --from "database connection" \
  --to "db conn" \
  --locale en
```

List phrases:

```bash
claude-token-optimizer semantic list --locale any
```

Import phrases:

```bash
claude-token-optimizer semantic import --file ./phrases.json --locale tr
```

`semantic learn`:

| Flag | Required | Description |
|------|----------|-------------|
| `--from <text>` | Yes | Verbose source phrase |
| `--to <text>` | Yes | Shorter approved replacement |
| `--locale <locale>` | No | `en`, `tr`, `any` |

`semantic list`:

| Flag | Required | Description |
|------|----------|-------------|
| `--locale <locale>` | No | Filters the listing by locale |

`semantic import`:

| Flag | Required | Description |
|------|----------|-------------|
| `--file <path>` | Yes | JSON array to import |
| `--locale <locale>` | No | Default locale when a record omits it |

Expected JSON shape:

```json
[
  { "from": "database connection", "to": "db conn", "locale": "en" },
  { "from": "kimlik dogrulama servisi", "to": "auth servis", "locale": "tr" }
]
```

## Configuration

Start from the example file:

```bash
cp src/examples/example-config.json ./optimizer.config.json
```

Then run:

```bash
claude-token-optimizer --config ./optimizer.config.json optimize --input "Explain this stack trace"
```

Important fields:

| Field | Default | Description |
|------|---------|-------------|
| `safety.threshold` | `0.40` | Safety threshold used for fallback decisions |
| `promptOptimizer.removeBoilerplate` | `true` | Removes filler phrases |
| `promptOptimizer.deduplicateSentences` | `true` | Removes repeated sentences |
| `promptOptimizer.semanticCompression.enabled` | `true` | Enables semantic compression |
| `promptOptimizer.semanticCompression.projectPhraseDbPath` | `.claude-token-optimizer/semantic-phrases.json` | Phrase DB location |
| `logFilter.customPatterns` | `[]` | Extra matching patterns |
| `contextRegistry.cacheDir` | `.claude-token-optimizer/cache` | Registry cache location |
| `diffFilter.hideWhitespaceOnly` | `true` | Hides whitespace-only changes |

`logFilter` behavior matrix:

| `includeErrors` | `includeWarnings` | `includeFailures` | Result |
|-----------------|-------------------|-------------------|--------|
| `true` | `false` | `false` | Error / fatal / exception lines only |
| `false` | `true` | `false` | Warning / notice lines only |
| `false` | `false` | `true` | Failed / crash / exit-code lines only |
| `false` | `false` | `false` | Empty result `[]` |

## Claude Code Hooks

Install globally:

```bash
npm run hooks:install
```

Install into the current project only:

```bash
npm run hooks:install:project
```

Preview without writing:

```bash
npm run hooks:dry-run
```

Remove hooks:

```bash
npm run hooks:uninstall
```

These scripts wire `PreToolUse` and `PostToolUse` hooks. The `--project` flag writes to the current project's `.claude/settings.json` instead of the global `~/.claude/settings.json`.

## MCP Server

Start the stdio JSON-RPC server:

```bash
npm run mcp
```

Alternative:

```bash
npx tsx src/mcp-server.ts
```

Available MCP tools:

- `optimize_prompt`
- `minify_json`
- `filter_log`
- `filter_diff`
- `cache_put`
- `cache_get`

## Library API

```ts
import { OptimizationPipeline, mergeConfig } from "claude-token-optimizer";

const config = mergeConfig({
  policy: { shortOutputPolicy: true },
  safety: { threshold: 0.45 },
});

const pipeline = new OptimizationPipeline(config);
const result = await pipeline.run({ prompt: "Analyze the auth timeout log" });

console.log(result.optimized);
console.log(result.fallbackUsed);
```

## Tests

```bash
npm test
npm run test:watch
npm run test:coverage
```

## Project Layout

```text
src/
├── cli.ts
├── config.ts
├── mcp-server.ts
├── core/
├── modules/
├── adapters/
└── utils/
```

Core modules:

- `promptOptimizer`: prompt compression and variant generation
- `jsonMinifier`: JSON compaction
- `logFilter`: log filtering
- `diffFilter`: diff cleanup
- `contextRegistry`: disk-backed `CTX_` registry
- `englishSemanticProvider`: learned semantic phrase replacements
