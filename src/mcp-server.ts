#!/usr/bin/env node
/**
 * mcp-server.ts — claude-token-optimizer MCP Server
 *
 * Implements the Model Context Protocol (MCP) over stdio JSON-RPC 2.0.
 * Exposes optimizer capabilities as MCP tools that Claude can call directly.
 *
 * Start: npx tsx src/mcp-server.ts
 * Or add to Claude Code's mcp config:
 *   {
 *     "mcpServers": {
 *       "token-optimizer": {
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/src/mcp-server.ts"]
 *       }
 *     }
 *   }
 */

import { createInterface } from "readline";
import { defaultConfig } from "./config.js";
import { McpAdapter } from "./adapters/mcpAdapter.js";
import { logger } from "./logger.js";

// ─── JSON-RPC 2.0 types ───────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── Tool definitions (MCP tools/list format) ─────────────────────────────────

const TOOLS = [
  {
    name: "optimize_prompt",
    description: "Compress a prompt to reduce token usage while preserving semantic meaning",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The prompt text to optimize" },
        dryRun: { type: "boolean", description: "If true, returns analysis without applying changes" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "minify_json",
    description: "Compact a JSON string to reduce token count",
    inputSchema: {
      type: "object",
      properties: {
        json: { type: "string", description: "JSON string to minify" },
      },
      required: ["json"],
    },
  },
  {
    name: "filter_log",
    description: "Filter log output to only error/warning/failure lines",
    inputSchema: {
      type: "object",
      properties: {
        log: { type: "string", description: "Raw log text to filter" },
        mode: {
          type: "string",
          enum: ["docker", "journalctl", "dotnet", "npm", "generic"],
          description: "Log format mode",
        },
      },
      required: ["log"],
    },
  },
  {
    name: "filter_diff",
    description: "Summarize large git diffs, hiding whitespace-only changes",
    inputSchema: {
      type: "object",
      properties: {
        diff: { type: "string", description: "Git diff text to filter" },
      },
      required: ["diff"],
    },
  },
  {
    name: "cache_put",
    description: "Store large content in the context registry, returns a CTX_ reference",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Content to store" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
      },
      required: ["content"],
    },
  },
  {
    name: "cache_get",
    description: "Retrieve content from the context registry by CTX_ reference",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "CTX_ reference (e.g. CTX_ab12cd34)" },
      },
      required: ["ref"],
    },
  },
];

// ─── Server ───────────────────────────────────────────────────────────────────

logger.setQuiet(true); // MCP uses stdio — no extra output

const adapter = new McpAdapter(defaultConfig);

function send(msg: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function ok(id: number | string | null, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function err(id: number | string | null, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleRequest(req: JsonRpcRequest): Promise<void> {
  const { id, method, params = {} } = req;

  switch (method) {
    // ── MCP lifecycle ──────────────────────────────────────────────────────
    case "initialize":
      ok(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "claude-token-optimizer", version: "1.0.0" },
      });
      break;

    case "initialized":
      // notification — no response needed
      break;

    case "tools/list":
      ok(id, { tools: TOOLS });
      break;

    // ── Tool calls ─────────────────────────────────────────────────────────
    case "tools/call": {
      const name = params["name"] as string;
      const args = (params["arguments"] ?? {}) as Record<string, unknown>;

      try {
        let result: unknown;

        switch (name) {
          case "optimize_prompt": {
            const r = await adapter.optimizePrompt(
              args["prompt"] as string,
              (args["dryRun"] as boolean | undefined) ?? false
            );
            result = {
              content: [{ type: "text", text: JSON.stringify(r, null, 2) }],
            };
            break;
          }

          case "minify_json": {
            const r = adapter.minifyJson(args["json"] as string);
            result = {
              content: [{ type: "text", text: r.output }],
              _meta: { originalTokens: r.originalTokens, minifiedTokens: r.minifiedTokens },
            };
            break;
          }

          case "filter_log": {
            const r = adapter.filterLog(args["log"] as string);
            result = {
              content: [{ type: "text", text: r.lines.join("\n") }],
              _meta: { totalInput: r.totalInput, totalOutput: r.totalOutput },
            };
            break;
          }

          case "filter_diff": {
            const r = adapter.filterDiff(args["diff"] as string);
            result = {
              content: [{ type: "text", text: r.output }],
              _meta: { filesIncluded: r.filesIncluded, filesSkipped: r.filesSkipped },
            };
            break;
          }

          case "cache_put": {
            const r = await adapter.cachePut(
              args["content"] as string,
              args["tags"] as string[] | undefined
            );
            result = {
              content: [{ type: "text", text: r.ref }],
            };
            break;
          }

          case "cache_get": {
            const r = await adapter.cacheGet(args["ref"] as string);
            result = {
              content: [{ type: "text", text: r.content ?? "" }],
              isError: r.content === null,
            };
            break;
          }

          default:
            err(id, -32601, `Unknown tool: ${name}`);
            return;
        }

        ok(id, result);
      } catch (e) {
        err(id, -32603, `Tool error: ${(e as Error).message}`);
      }
      break;
    }

    // ── Ping ──────────────────────────────────────────────────────────────
    case "ping":
      ok(id, {});
      break;

    default:
      err(id, -32601, `Method not found: ${method}`);
  }
}

// ─── Stdio transport ──────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  void handleRequest(req);
});

rl.on("close", () => process.exit(0));

process.stderr.write("[token-optimizer MCP] server started\n");
