const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const SERVER_NAME = "terminal-matrix-remote";

const AGENTS = Object.freeze({
  codex: { id: "codex", label: "Codex", command: "codex" },
  grok: { id: "grok", label: "Grok", command: "grok" },
  claude: { id: "claude", label: "Claude Code", command: "claude" },
});

function agentDefinition(agentId) {
  const agent = AGENTS[String(agentId || "").toLowerCase()];
  if (!agent) throw new Error("不支持的 Agent");
  return agent;
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = process.platform === "win32" ? String(value).toLowerCase() : String(value);
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function knownWindowsCandidates(agent, env) {
  const profile = env.USERPROFILE || os.homedir();
  const appData = env.APPDATA || (profile ? path.join(profile, "AppData", "Roaming") : "");
  if (agent.id === "codex") {
    return [
      path.join(profile, ".codex", ".sandbox-bin", "codex.exe"),
      path.join(profile, ".codex", "plugins", ".plugin-appserver", "codex.exe"),
      path.join(appData, "npm", "codex.cmd"),
    ];
  }
  if (agent.id === "grok") {
    return [
      path.join(profile, ".grok", "bin", "grok.exe"),
      path.join(appData, "npm", "grok.cmd"),
    ];
  }
  return [
    path.join(profile, ".local", "bin", "claude.exe"),
    path.join(appData, "npm", "claude.cmd"),
  ];
}

function quoteCmdArg(value) {
  const text = String(value);
  if (!/[\s&|<>^()%!"]/u.test(text)) return text;
  return `"${text.replace(/%/g, "%%").replace(/"/g, '\\"')}"`;
}

async function runExecutable(executable, args, options = {}) {
  const execOptions = {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeout || 20_000,
    maxBuffer: options.maxBuffer || 1024 * 1024,
  };
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(executable)) {
    const commandLine = [executable, ...args].map(quoteCmdArg).join(" ");
    return execFileAsync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine], execOptions);
  }
  return execFileAsync(executable, args, execOptions);
}

async function pathCandidates(agent, env) {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("where.exe", [agent.command], {
        env,
        encoding: "utf8",
        windowsHide: true,
        timeout: 5000,
      });
      return stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    }
    const { stdout } = await execFileAsync("which", [agent.command], {
      env,
      encoding: "utf8",
      timeout: 5000,
    });
    return stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function resolveAgentCli(agentId, options = {}) {
  const agent = agentDefinition(agentId);
  const env = options.env || process.env;
  const known = process.platform === "win32" ? knownWindowsCandidates(agent, env) : [];
  const fromPath = await pathCandidates(agent, env);
  const candidates = unique([...known, ...fromPath, agent.command]);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    try {
      await runExecutable(candidate, ["mcp", "--help"], {
        env,
        cwd: options.cwd,
        timeout: options.timeout || 7000,
      });
      return candidate;
    } catch {
      // Try the next installation location. WindowsApps aliases can be visible
      // to PATH while still rejecting direct child-process execution.
    }
  }
  return "";
}

function buildAddArgs(agentId, launch) {
  const agent = agentDefinition(agentId);
  const command = String(launch.command || "");
  const commandArgs = Array.isArray(launch.args) ? launch.args.map(String) : [];
  const envEntries = Object.entries(launch.env || {}).map(([key, value]) => `${key}=${value}`);
  if (!command) throw new Error("MCP 启动命令为空");

  if (agent.id === "codex") {
    return [
      "mcp", "add",
      ...envEntries.flatMap((entry) => ["--env", entry]),
      SERVER_NAME, "--", command, ...commandArgs,
    ];
  }
  if (agent.id === "grok") {
    return [
      "mcp", "add", "--scope", "user",
      ...envEntries.flatMap((entry) => ["--env", entry]),
      SERVER_NAME, "--", command, ...commandArgs,
    ];
  }
  return [
    "mcp", "add", "--scope", "user",
    ...envEntries.flatMap((entry) => ["--env", entry]),
    "--transport", "stdio", SERVER_NAME, "--", command, ...commandArgs,
  ];
}

function buildRemoveArgs(agentId) {
  const agent = agentDefinition(agentId);
  if (agent.id === "claude") return ["mcp", "remove", "--scope", "user", SERVER_NAME];
  return ["mcp", "remove", SERVER_NAME];
}

function outputText(result) {
  return [result?.stdout, result?.stderr].filter(Boolean).join("\n").trim();
}

function errorText(error) {
  return [error?.message, error?.stdout, error?.stderr].filter(Boolean).join("\n").trim();
}

async function installAgentMcp(agentId, launch, options = {}) {
  const agent = agentDefinition(agentId);
  const env = options.env || process.env;
  const runner = options.runner || runExecutable;
  const resolver = options.resolver || resolveAgentCli;
  const executable = options.executable || await resolver(agent.id, {
    env,
    cwd: options.cwd,
  });
  if (!executable) {
    return {
      ok: false,
      agent: agent.id,
      label: agent.label,
      code: "agent-not-found",
      error: `未检测到 ${agent.label}。请先确认它能在终端矩阵中正常启动。`,
    };
  }

  const addArgs = buildAddArgs(agent.id, launch);
  try {
    const result = await runner(executable, addArgs, {
      env,
      cwd: options.cwd,
      timeout: options.timeout || 30_000,
    });
    return {
      ok: true,
      agent: agent.id,
      label: agent.label,
      executable,
      updated: false,
      output: outputText(result),
    };
  } catch (firstError) {
    const detail = errorText(firstError);
    if (!/(?:already|exist|duplicate|已存在|重复)/iu.test(detail)) {
      return { ok: false, agent: agent.id, label: agent.label, executable, error: detail || "MCP 注册失败" };
    }

    // The fixed name belongs to Terminal Matrix. Replace only that entry when
    // an older registration already exists, then retry once.
    try {
      await runner(executable, buildRemoveArgs(agent.id), {
        env,
        cwd: options.cwd,
        timeout: options.timeout || 30_000,
      });
      const result = await runner(executable, addArgs, {
        env,
        cwd: options.cwd,
        timeout: options.timeout || 30_000,
      });
      return {
        ok: true,
        agent: agent.id,
        label: agent.label,
        executable,
        updated: true,
        output: outputText(result),
      };
    } catch (retryError) {
      return {
        ok: false,
        agent: agent.id,
        label: agent.label,
        executable,
        error: errorText(retryError) || "MCP 注册失败",
      };
    }
  }
}

module.exports = {
  AGENTS,
  SERVER_NAME,
  buildAddArgs,
  buildRemoveArgs,
  installAgentMcp,
  resolveAgentCli,
  runExecutable,
};
