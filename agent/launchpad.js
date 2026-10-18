const fs = require("node:fs");
const path = require("node:path");
const { knownWindowsCandidates, pathCandidates } = require("./mcp-installer");

/**
 * Agent 启动台白名单。渲染进程只传 id，命令与安装包名一律以这里为准，
 * 避免把任意字符串拼进终端。
 */
const LAUNCHPAD_AGENTS = Object.freeze([
  { id: "claude", label: "Claude Code", command: "claude", npmPackage: "@anthropic-ai/claude-code", vendor: "Anthropic" },
  { id: "codex", label: "Codex", command: "codex", npmPackage: "@openai/codex", vendor: "OpenAI" },
  { id: "grok", label: "Grok", command: "grok", npmPackage: "@xai-official/grok", vendor: "xAI" },
  { id: "gemini", label: "Gemini CLI", command: "gemini", npmPackage: "@google/gemini-cli", vendor: "Google" },
  { id: "qwen", label: "Qwen Code", command: "qwen", npmPackage: "@qwen-code/qwen-code", vendor: "Qwen" },
  { id: "opencode", label: "opencode", command: "opencode", npmPackage: "opencode-ai", vendor: "SST" },
].map((agent) => Object.freeze(agent)));

const MAX_EXTRA_ARGS_LENGTH = 512;

function launchpadAgent(agentId) {
  const id = String(agentId || "").toLowerCase();
  const agent = LAUNCHPAD_AGENTS.find((item) => item.id === id);
  if (!agent) throw new Error("不支持的 Agent");
  return agent;
}

function installCommandFor(agent) {
  return agent.npmPackage ? `npm i -g ${agent.npmPackage}` : "";
}

/**
 * 额外参数会作为命令行的一部分输入到 PowerShell / CMD / Git Bash。
 * 允许普通参数与引号，拒绝换行/控制字符和命令串联、重定向、变量展开、子表达式等元字符，
 * 保证一次启动只执行一条 Agent 命令。
 */
function sanitizeExtraArgs(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length > MAX_EXTRA_ARGS_LENGTH) {
    throw new Error(`额外参数过长（最多 ${MAX_EXTRA_ARGS_LENGTH} 个字符）`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/u.test(text)) {
    throw new Error("额外参数不能包含换行或控制字符");
  }
  if (/[;&|<>`$%^(){}]/u.test(text)) {
    throw new Error("额外参数不能包含 ; & | < > ` $ % ^ ( ) { } 等特殊字符");
  }
  const quotes = (text.match(/"/g) || []).length;
  if (quotes % 2 !== 0) throw new Error("额外参数中的双引号未配对");
  return text;
}

function buildLaunchCommand(agentId, extraArgs) {
  const agent = launchpadAgent(agentId);
  const args = sanitizeExtraArgs(extraArgs);
  return args ? `${agent.command} ${args}` : agent.command;
}

function buildInstallCommand(agentId) {
  const agent = launchpadAgent(agentId);
  const command = installCommandFor(agent);
  if (!command) throw new Error(`${agent.label} 暂无 npm 安装命令`);
  return command;
}

/**
 * 只检测 CLI 是否存在（已知安装位置 + where/which），不执行它：
 * 启动台打开时要快，也不应该为了检测去跑第三方程序。
 */
async function detectLaunchpadAgent(agentId, options = {}) {
  const agent = launchpadAgent(agentId);
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const finder = options.finder || pathCandidates;
  const exists = options.exists || fs.existsSync;

  const known = platform === "win32" ? knownWindowsCandidates(agent, env) : [];
  for (const candidate of known) {
    if (candidate && path.isAbsolute(candidate) && exists(candidate)) return candidate;
  }
  const fromPath = await finder(agent, env);
  return fromPath.find(Boolean) || "";
}

async function listLaunchpadAgents(options = {}) {
  return Promise.all(
    LAUNCHPAD_AGENTS.map(async (agent) => {
      let resolvedPath = "";
      try {
        resolvedPath = await detectLaunchpadAgent(agent.id, options);
      } catch {
        resolvedPath = "";
      }
      return {
        id: agent.id,
        label: agent.label,
        command: agent.command,
        vendor: agent.vendor,
        npmPackage: agent.npmPackage,
        installCommand: installCommandFor(agent),
        installed: Boolean(resolvedPath),
        path: resolvedPath,
      };
    })
  );
}

module.exports = {
  LAUNCHPAD_AGENTS,
  MAX_EXTRA_ARGS_LENGTH,
  buildInstallCommand,
  buildLaunchCommand,
  detectLaunchpadAgent,
  launchpadAgent,
  listLaunchpadAgents,
  sanitizeExtraArgs,
};
