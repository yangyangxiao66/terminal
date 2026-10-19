/**
 * Agent 状态检测（纯逻辑，无 DOM 依赖）：渲染进程以全局 AgentStatus 使用，
 * Node 冒烟测试通过 require 使用。只保留输出尾部，按时间判断「运行中 / 等待输入 / 需要确认」。
 */
(function initAgentStatus(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AgentStatus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const AGENT_LABELS = Object.freeze({
    claude: "Claude Code",
    codex: "Codex",
    grok: "Grok",
    gemini: "Gemini CLI",
    qwen: "Qwen Code",
    opencode: "opencode",
  });

  const STATE_LABELS = Object.freeze({
    none: "",
    running: "运行中",
    waiting: "等待输入",
    approval: "需要确认",
    idle: "空闲",
    exited: "已退出",
  });

  /** 输出安静多久后不再算「运行中」 */
  const QUIET_MS = 2500;
  /** 等待输入超过该时长视为「空闲」 */
  const IDLE_AFTER_MS = 5 * 60 * 1000;
  /** 键入回显：按键后短时间内的小块输出不算 Agent 在输出 */
  const ECHO_WINDOW_MS = 250;
  const ECHO_MAX_CHARS = 512;
  const TAIL_MAX = 2048;
  const CHUNK_SCAN_MAX = 4096;
  const PROMPT_SCAN = 480;
  const LINE_MAX = 256;

  // CSI / OSC / 其他 ESC 序列，以及除换行外的控制字符
  // eslint-disable-next-line no-control-regex
  const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[P^_][^\x1b]*(?:\x1b\\)?|\x1b[@-Z\\-_]|\x1b./g;
  // eslint-disable-next-line no-control-regex
  const CTRL_RE = /[\x00-\x08\x0b-\x1f\x7f]/g;

  function stripAnsi(text) {
    return String(text ?? "").replace(ANSI_RE, "").replace(/\r\n?/g, "\n").replace(CTRL_RE, "");
  }

  /** 启动命令：claude / codex.cmd / npx @google/gemini-cli … */
  const COMMAND_RE = /^\s*(?:&\s*)?(?:npx\s+(?:-y\s+)?)?(?:[\w.\\/:~-]*[\\/])?(claude|codex|grok|gemini|qwen|opencode)(?:\.(?:cmd|exe|ps1))?(?=\s|$)/i;
  const NPX_PACKAGE_RE = /^\s*npx\s+(?:-y\s+)?(@anthropic-ai\/claude-code|@openai\/codex|@google\/gemini-cli|@qwen-code\/qwen-code|opencode-ai)(?=\s|@|$)/i;
  const NPX_MAP = {
    "@anthropic-ai/claude-code": "claude",
    "@openai/codex": "codex",
    "@google/gemini-cli": "gemini",
    "@qwen-code/qwen-code": "qwen",
    "opencode-ai": "opencode",
  };

  function detectAgentCommand(line) {
    const text = String(line || "");
    const npx = text.match(NPX_PACKAGE_RE);
    if (npx) return NPX_MAP[npx[1].toLowerCase()] || "";
    const match = text.match(COMMAND_RE);
    return match ? match[1].toLowerCase() : "";
  }

  /** 输出里的启动横幅（仅用于未知 Agent 的会话，挑辨识度高的） */
  const OUTPUT_SIGNATURES = [
    ["claude", /Welcome to Claude Code|Claude Code v\d/i],
    ["codex", /OpenAI Codex/i],
    ["qwen", /Welcome to Qwen Code|Qwen Code v\d/i],
    ["gemini", /Gemini CLI v\d|Welcome to Gemini CLI/i],
    ["opencode", /opencode v\d/i],
    ["grok", /Welcome to Grok\b|Grok CLI v\d/i],
  ];

  function detectAgentFromOutput(text) {
    const value = String(text || "");
    for (const [id, re] of OUTPUT_SIGNATURES) if (re.test(value)) return id;
    return "";
  }

  const APPROVAL_PATTERNS = [
    /Do you want to/i,
    /\bAllow\b[^\n]{0,80}\?/i,
    /Allow (?:once|always|for this session)/i,
    /\((?:y\/n|Y\/n|y\/N|yes\/no)\)|\[(?:y\/n|Y\/n|y\/N|yes\/no)\]/,
    /[❯›>]\s*1\.\s*Yes/,
    /Press Enter to/i,
    /\bApprove\b/i,
    /Waiting for (?:your )?(?:approval|confirmation)/i,
    /是否(?:继续|允许|确认|执行)|请确认/,
  ];

  function matchesApprovalPrompt(tail) {
    const text = String(tail || "").slice(-PROMPT_SCAN);
    return APPROVAL_PATTERNS.some((re) => re.test(text));
  }

  /** Agent 退出后回到 shell 提示符（PowerShell / CMD / bash / 远端 user@host） */
  const SHELL_PROMPT_PATTERNS = [
    /(?:^|\n)PS [A-Za-z]:\\[^\n]*>$/,
    /(?:^|\n)PS \/[^\n]*>$/,
    /(?:^|\n)[A-Za-z]:\\[^\n<>|"]*>$/,
    /(?:^|\n)[\w.-]+@[\w.-]+(?::| )[^\n]*[$#]$/,
    /(?:^|\n)(?:[\w.-]+)?\$$/,
  ];

  function matchesShellPrompt(tail) {
    const text = String(tail || "").slice(-PROMPT_SCAN).replace(/[ \t]+$/, "");
    return SHELL_PROMPT_PATTERNS.some((re) => re.test(text));
  }

  function createAgentStatusTracker(options = {}) {
    const clock = typeof options.now === "function" ? options.now : () => Date.now();
    const known = AGENT_LABELS[options.agentId] ? options.agentId : "";
    const self = {
      agentId: known,
      /** Agent 进程是否仍在前台（回到 shell 提示符后为 false） */
      active: Boolean(known),
      tail: "",
      line: "",
      lastOutputAt: 0,
      lastInputAt: 0,
      startedAt: known ? clock() : 0,
      hadOutputSinceStart: false,
      exited: false,
      exitCode: null,
    };

    function startAgent(id, at) {
      self.agentId = id;
      self.active = true;
      self.tail = "";
      self.startedAt = at;
      self.hadOutputSinceStart = false;
    }

    /** 用户输入（或程序代输入的启动命令）。只在没有 Agent 前台运行时解析命令行。 */
    function input(data, at = clock()) {
      const text = String(data ?? "");
      // 只有普通按键才可能产生「回显」；回车提交后的输出算作真实输出
      self.lastInputAt = /[\r\n]/.test(text) ? 0 : at;
      // Agent 前台时，用户的任何回应都意味着旧的确认提示已过期
      if (self.active) self.tail = "";
      if (text.startsWith("\x1b")) return; // 方向键等
      for (const ch of text) {
        if (ch === "\r" || ch === "\n") {
          const line = self.line;
          self.line = "";
          if (!self.active) {
            const id = detectAgentCommand(line);
            if (id) startAgent(id, at);
          }
        } else if (ch === "\x7f" || ch === "\b") {
          self.line = self.line.slice(0, -1);
        } else if (ch === "\x03" || ch === "\x15") {
          self.line = "";
        } else if (ch >= " " && self.line.length < LINE_MAX) {
          self.line += ch;
        }
      }
    }

    /** 终端输出。只处理每块的尾部，保持 O(块尾) 的开销。 */
    function feed(data, at = clock()) {
      const raw = String(data ?? "");
      if (!raw) return;
      const clean = stripAnsi(raw.length > CHUNK_SCAN_MAX ? raw.slice(-CHUNK_SCAN_MAX) : raw);
      self.tail = (self.tail + clean).slice(-TAIL_MAX);
      const isEcho = at - self.lastInputAt <= ECHO_WINDOW_MS && clean.length <= ECHO_MAX_CHARS;
      if (!isEcho && clean.trim()) {
        self.lastOutputAt = at;
        if (self.active) self.hadOutputSinceStart = true;
      }
      if (!self.active) {
        const id = detectAgentFromOutput(clean);
        if (id) {
          startAgent(id, at);
          self.lastOutputAt = at;
          self.hadOutputSinceStart = true;
        }
      }
    }

    function markExited(code, at = clock()) {
      self.exited = true;
      self.exitCode = Number.isFinite(Number(code)) ? Number(code) : null;
      self.lastOutputAt = self.lastOutputAt || at;
    }

    /** @returns {{ state: string, agentId: string, label: string, exitCode: number|null }} */
    function evaluate(at = clock()) {
      const result = (state) => ({
        state,
        agentId: self.agentId,
        label: STATE_LABELS[state] || "",
        exitCode: state === "exited" ? self.exitCode : null,
      });
      if (self.exited) return result(self.agentId ? "exited" : "none");
      if (!self.agentId) return result("none");
      const quietFor = at - self.lastOutputAt;
      if (self.active && self.hadOutputSinceStart && quietFor < QUIET_MS) return result("running");
      if (!self.active) return result("none");
      if (self.hadOutputSinceStart && matchesShellPrompt(self.tail)) {
        // Agent 已退出回到 shell：不再显示状态，后续可再次识别
        self.active = false;
        return result("none");
      }
      if (!self.hadOutputSinceStart) {
        return result(at - self.startedAt < QUIET_MS ? "running" : "idle");
      }
      if (matchesApprovalPrompt(self.tail)) return result("approval");
      if (quietFor >= IDLE_AFTER_MS) return result("idle");
      return result("waiting");
    }

    return { input, feed, markExited, evaluate, get snapshot() { return { ...self }; } };
  }

  function summarizeStates(states) {
    const counts = { running: 0, waiting: 0, approval: 0, idle: 0, exited: 0 };
    for (const state of states || []) if (state in counts) counts[state] += 1;
    const parts = [];
    if (counts.running) parts.push([counts.running, "运行中"]);
    if (counts.approval) parts.push([counts.approval, "需要确认"]);
    if (counts.waiting) parts.push([counts.waiting, "等待输入"]);
    if (!parts.length && counts.idle) parts.push([counts.idle, "空闲"]);
    const text = parts
      .map(([n, label], index) => (index === 0 ? `${n} 个 Agent ${label}` : `${n} 个${label}`))
      .join(" · ");
    return { counts, text };
  }

  return {
    AGENT_LABELS,
    STATE_LABELS,
    QUIET_MS,
    IDLE_AFTER_MS,
    stripAnsi,
    detectAgentCommand,
    detectAgentFromOutput,
    matchesApprovalPrompt,
    matchesShellPrompt,
    createAgentStatusTracker,
    summarizeStates,
  };
});
