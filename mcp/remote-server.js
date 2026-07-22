#!/usr/bin/env node
const readline = require("node:readline");
const fs = require("node:fs");

const stateArgIndex = process.argv.indexOf("--state");
const stateFile = stateArgIndex >= 0 ? String(process.argv[stateArgIndex + 1] || "") : "";

function connectionSettings() {
  if (stateFile) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      if (state.bridgeUrl && state.bridgeToken && state.sessionId) {
        return {
          bridgeUrl: String(state.bridgeUrl).replace(/\/$/, ""),
          bridgeToken: String(state.bridgeToken),
          sessionId: String(state.sessionId),
        };
      }
    } catch {
      // Terminal Matrix may not be running or no remote workspace is selected yet.
    }
  }
  const settings = {
    bridgeUrl: String(process.env.TERMINAL_MATRIX_BRIDGE_URL || "").replace(/\/$/, ""),
    bridgeToken: String(process.env.TERMINAL_MATRIX_BRIDGE_TOKEN || ""),
    sessionId: String(process.env.TERMINAL_MATRIX_REMOTE_SESSION || ""),
  };
  if (settings.bridgeUrl && settings.bridgeToken && settings.sessionId) return settings;
  throw new Error("终端矩阵未运行，或尚未在“Agent 工作区”中选择 SSH 会话");
}

const instructions =
  "This server operates on the SSH workspace selected in Terminal Matrix. Prefer remote_list/read/stat for inspection. Use remote_exec and remote_write only when changes are required. All paths are restricted to the configured remote root; never use local shell tools as a substitute for remote workspace operations.";

const tools = [
  {
    name: "remote_connection_info",
    description: "Show the active Terminal Matrix SSH target and allowed remote root.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "remote_list",
    description: "List files and directories on the selected SSH host.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Path relative to the remote root" } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "remote_stat",
    description: "Read metadata for a file or directory on the selected SSH host.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Path relative to the remote root" } },
      required: ["path"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "remote_read",
    description: "Read a UTF-8 or base64 file from the selected SSH host (maximum 2 MiB).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the remote root" },
        encoding: { type: "string", enum: ["utf8", "base64"], default: "utf8" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "remote_exec",
    description: "Execute a shell command on the selected SSH host and return stdout/stderr/exit code.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", minLength: 1, description: "Remote shell command" },
        cwd: { type: "string", description: "Working directory relative to the remote root" },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 300000, default: 60000 },
      },
      required: ["command"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  {
    name: "remote_write",
    description: "Atomically create or replace a file on the selected SSH host (maximum 2 MiB).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the remote root" },
        content: { type: "string", description: "File content" },
        encoding: { type: "string", enum: ["utf8", "base64"], default: "utf8" },
        mode: { type: "integer", minimum: 0, maximum: 511, default: 384 },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  {
    name: "remote_mkdir",
    description: "Create a directory (including parents) inside the allowed remote root.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", minLength: 1, description: "Path relative to the remote root" } },
      required: ["path"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
];

async function callBridge(tool, args = {}) {
  const { bridgeUrl, bridgeToken, sessionId } = connectionSettings();
  const response = await fetch(`${bridgeUrl}/v1/sessions/${encodeURIComponent(sessionId)}/${tool}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bridgeToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(310_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Terminal Matrix bridge error (${response.status})`);
  }
  return payload.result;
}

function validateString(args, key, required = true) {
  if (typeof args[key] === "string" && (!required || args[key].length > 0)) return;
  if (required) throw new Error(`参数 ${key} 必须是非空字符串`);
}

async function callTool(name, rawArgs) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  let bridgeTool;
  if (name === "remote_connection_info") bridgeTool = "info";
  else if (name === "remote_list") {
    if (args.path != null) validateString(args, "path", false);
    bridgeTool = "list";
  } else if (name === "remote_stat") {
    validateString(args, "path");
    bridgeTool = "stat";
  } else if (name === "remote_read") {
    validateString(args, "path");
    if (args.encoding != null && !["utf8", "base64"].includes(args.encoding)) {
      throw new Error("encoding 只能是 utf8 或 base64");
    }
    bridgeTool = "read";
  } else if (name === "remote_exec") {
    validateString(args, "command");
    bridgeTool = "exec";
  } else if (name === "remote_write") {
    validateString(args, "path");
    if (typeof args.content !== "string") throw new Error("参数 content 必须是字符串");
    bridgeTool = "write";
  } else if (name === "remote_mkdir") {
    validateString(args, "path");
    bridgeTool = "mkdir";
  } else {
    throw new Error(`未知 MCP 工具：${name}`);
  }
  const result = await callBridge(bridgeTool, args);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    error(message?.id, -32600, "Invalid Request");
    return;
  }
  const { id, method, params = {} } = message;
  if (method.startsWith("notifications/")) return;
  if (id === undefined) return;
  if (method === "initialize") {
    result(id, {
      protocolVersion: params.protocolVersion || "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: { name: "terminal-matrix-remote", version: "0.1.0" },
      instructions,
    });
    return;
  }
  if (method === "ping") {
    result(id, {});
    return;
  }
  if (method === "tools/list") {
    result(id, { tools });
    return;
  }
  if (method === "tools/call") {
    try {
      result(id, await callTool(params.name, params.arguments));
    } catch (toolError) {
      result(id, {
        isError: true,
        content: [{ type: "text", text: toolError?.message || String(toolError) }],
      });
    }
    return;
  }
  error(id, -32601, `Method not found: ${method}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    error(null, -32700, "Parse error");
    return;
  }
  handle(message).catch((handlerError) => {
    error(message.id, -32603, handlerError?.message || "Internal error");
  });
});

console.error("Terminal Matrix remote MCP server is running on stdio.");
