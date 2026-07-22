const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile, execFileSync } = require("node:child_process");
const { promisify } = require("node:util");
const pty = require("node-pty");
const { RemoteBridgeServer } = require("./remote/bridge-server");
const { createSsh2ShellHandle, shouldUseSsh2Shell } = require("./remote/shell-handle");
const { AGENTS, installAgentMcp, resolveAgentCli } = require("./agent/mcp-installer");

const execFileAsync = promisify(execFile);

const terminals = new Map();
const remoteBridge = new RemoteBridgeServer();
let nextTerminalId = 1;
let mainWindow = null;
let petWindow = null;
let petEnabled = false;
let stableMcpServerPath = "";
let stableMcpLauncherPath = "";
let mcpBridgeStatePath = "";
let activeMcpRemoteId = "";
/** Latest pet status pushed from the main renderer. */
let petStatus = {
  terminalCount: 0,
  activeShell: "powershell",
  mood: "idle",
};

/** Cap pre-attach PTY output so a slow/missing attach cannot unbounded-grow heap. */
const MAX_PREATTACH_CHUNKS = 200;
const MAX_PREATTACH_CHARS = 512 * 1024;

/** Cached User+Machine PATH from the registry (Electron's process.env goes stale). */
let cachedWindowsPath = null;
let cachedWindowsPathAt = 0;
const PATH_CACHE_MS = 30_000;

/**
 * Read the live Windows PATH from Machine + User env (not the parent process).
 * Long-lived Electron apps keep the PATH from launch time, so tools installed
 * later (e.g. grok under %USERPROFILE%\.grok\bin) are invisible to child shells
 * unless we refresh from the registry.
 */
function getFreshWindowsPath() {
  const now = Date.now();
  if (cachedWindowsPath && now - cachedWindowsPathAt < PATH_CACHE_MS) {
    return cachedWindowsPath;
  }

  try {
    const script =
      "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + " +
      "[Environment]::GetEnvironmentVariable('Path','User')";
    const fresh = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", windowsHide: true, timeout: 5000 }
    ).trim();
    if (fresh) {
      cachedWindowsPath = fresh;
      cachedWindowsPathAt = now;
      return fresh;
    }
  } catch {
    // Fall back to process.env below.
  }

  return process.env.Path || process.env.PATH || "";
}

function buildShellEnv() {
  const env = {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  };

  if (process.platform === "win32") {
    const freshPath = getFreshWindowsPath();
    if (freshPath) {
      // Windows and Node both check these; set both for PowerShell/cmd/Git Bash.
      env.Path = freshPath;
      env.PATH = freshPath;
    }
  }

  return env;
}

function ensureStableMcpServer() {
  const source = path.join(__dirname, "mcp", "remote-server.js");
  const launcherSource = path.join(__dirname, "mcp", "launcher.ps1");
  const targetDir = path.join(app.getPath("userData"), "mcp");
  const target = path.join(targetDir, "terminal-matrix-remote.js");
  const launcherTarget = path.join(targetDir, "terminal-matrix-mcp-launcher.ps1");
  fs.mkdirSync(targetDir, { recursive: true });
  for (const [sourceFile, targetFile] of [
    [source, target],
    [launcherSource, launcherTarget],
  ]) {
    const sourceData = fs.readFileSync(sourceFile);
    let shouldCopy = true;
    try {
      const targetData = fs.readFileSync(targetFile);
      shouldCopy = !sourceData.equals(targetData);
    } catch {
      shouldCopy = true;
    }
    if (shouldCopy) fs.writeFileSync(targetFile, sourceData, { mode: 0o600 });
  }
  stableMcpServerPath = target;
  stableMcpLauncherPath = launcherTarget;
  mcpBridgeStatePath = path.join(targetDir, "bridge-state.json");
  return target;
}

function mcpLaunchSpec() {
  if (!stableMcpServerPath || !stableMcpLauncherPath || !mcpBridgeStatePath) {
    ensureStableMcpServer();
  }
  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        stableMcpLauncherPath,
        "-State",
        mcpBridgeStatePath,
      ],
    };
  }
  return {
    command: process.execPath,
    args: [stableMcpServerPath, "--state", mcpBridgeStatePath],
    env: { ELECTRON_RUN_AS_NODE: "1" },
  };
}

function writeMcpBridgeState(sessionId = activeMcpRemoteId) {
  if (!mcpBridgeStatePath) ensureStableMcpServer();
  const id = String(sessionId || "");
  activeMcpRemoteId = remoteBridge.has(id) ? id : "";
  const state = activeMcpRemoteId
    ? {
        bridgeUrl: remoteBridge.clientBaseUrl(),
        bridgeToken: remoteBridge.token,
        sessionId: activeMcpRemoteId,
        runtimeExecutable: process.execPath,
      }
    : {
        bridgeUrl: "",
        bridgeToken: "",
        sessionId: "",
        runtimeExecutable: process.execPath,
      };
  fs.writeFileSync(mcpBridgeStatePath, JSON.stringify(state), { mode: 0o600 });
  return { active: Boolean(activeMcpRemoteId), sessionId: activeMcpRemoteId };
}

function resolveShell(shellName) {
  if (shellName === "cmd") {
    return { executable: process.env.ComSpec || "cmd.exe", args: ["/K"] };
  }

  if (shellName === "git-bash") {
    const candidates = [
      "F:\\git\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ];
    const executable = candidates.find((candidate) => fs.existsSync(candidate));
    if (executable) {
      return { executable, args: ["--login", "-i"] };
    }
  }

  return {
    executable: "powershell.exe",
    args: ["-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass"],
  };
}

/** Cached OpenSSH client path (or null if missing). */
let cachedSshExecutable = undefined;

/**
 * Resolve Windows OpenSSH client (ssh.exe).
 * Prefer System32 OpenSSH, then resolve ssh.exe from PATH.
 */
function resolveSshExecutable() {
  if (cachedSshExecutable !== undefined) return cachedSshExecutable;

  const candidates = [];
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    candidates.push(
      path.join(systemRoot, "System32", "OpenSSH", "ssh.exe"),
      path.join(systemRoot, "Sysnative", "OpenSSH", "ssh.exe")
    );
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      cachedSshExecutable = candidate;
      return candidate;
    }
  }

  if (process.platform === "win32") {
    try {
      const systemRoot = process.env.SystemRoot || "C:\\Windows";
      const whereExe = path.join(systemRoot, "System32", "where.exe");
      const output = execFileSync(whereExe, ["ssh.exe"], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const fromPath = String(output)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && fs.existsSync(line));
      if (fromPath) {
        cachedSshExecutable = fromPath;
        return fromPath;
      }
    } catch {
      // OpenSSH is not installed or is not available on PATH.
    }
    cachedSshExecutable = null;
    return null;
  }

  // Terminal Deck currently targets Windows; retain the conventional name for
  // development on other platforms and let spawn report a platform error.
  cachedSshExecutable = "ssh";
  return cachedSshExecutable;
}

/**
 * Validate and normalize SSH connection options from the renderer.
 * authMethod: "password" | "key" | "ask"
 */
function normalizeSshOptions(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const host = String(input.host || "")
    .trim()
    .replace(/^\[|\]$/g, "");
  if (!host) {
    throw new Error("请填写 SSH 主机地址");
  }
  // Host may be hostname, IPv4, or IPv6 (without brackets after strip).
  if (/[\s"';|&<>]/.test(host) || host.includes("://")) {
    throw new Error("主机地址包含非法字符");
  }

  let port = Number(input.port);
  if (!Number.isFinite(port) || port <= 0) port = 22;
  port = Math.max(1, Math.min(65535, Math.floor(port)));

  const user = String(input.user || "").trim();
  if (!user) {
    throw new Error("请填写 SSH 用户名");
  }
  if (/[\s@/\\"';|&<>]/.test(user)) {
    throw new Error("用户名包含非法字符");
  }

  let authMethod = String(input.authMethod || "password").trim().toLowerCase();
  if (!["password", "key", "ask"].includes(authMethod)) {
    // Infer from fields when older clients omit authMethod.
    authMethod = input.identityFile ? "key" : "password";
  }

  let identityFile = null;
  if (typeof input.identityFile === "string" && input.identityFile.trim()) {
    const resolved = path.resolve(input.identityFile.trim());
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error("私钥文件不存在或不可读");
    }
    identityFile = resolved;
  }

  if (authMethod === "key" && !identityFile) {
    throw new Error("请选择登录私钥文件");
  }

  // Secrets stay in-memory for this session only (never persisted by renderer recents).
  const password =
    authMethod === "password" && typeof input.password === "string" ? input.password : "";
  const passphrase =
    authMethod === "key" && typeof input.passphrase === "string" ? input.passphrase : "";

  let remoteRoot = String(input.remoteRoot || "").trim();
  if (!remoteRoot) remoteRoot = user === "root" ? "/root" : user ? `/home/${user}` : "/";
  if (!remoteRoot.startsWith("/") || /[\r\n\0]/.test(remoteRoot)) {
    throw new Error("远端根目录必须是合法的绝对路径");
  }

  const target = user ? `${user}@${host}` : host;
  const label = port === 22 ? target : `${target}:${port}`;
  return {
    host,
    port,
    user,
    authMethod,
    // Keep path only when useful for key/ask modes (password mode ignores it for CLI auth).
    identityFile: authMethod === "password" ? null : identityFile,
    password,
    passphrase,
    remoteRoot,
    target,
    label,
  };
}

/**
 * Build OpenSSH CLI args for an interactive session over ConPTY.
 */
function buildSshArgs(ssh) {
  const args = [
    // Force remote TTY so interactive shells / password prompts work.
    "-tt",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
  ];
  if (ssh.port !== 22) {
    args.push("-p", String(ssh.port));
  }
  if (ssh.authMethod === "key" && ssh.identityFile) {
    args.push("-i", ssh.identityFile);
    args.push("-o", "IdentitiesOnly=yes");
    args.push("-o", "PreferredAuthentications=publickey");
    args.push("-o", "PubkeyAuthentication=yes");
    args.push("-o", "PasswordAuthentication=no");
  } else if (ssh.authMethod === "password") {
    // Prefer password; still allow keyboard-interactive (common on cloud hosts).
    args.push("-o", "PreferredAuthentications=password,keyboard-interactive");
    args.push("-o", "PubkeyAuthentication=no");
    if (ssh.identityFile) {
      // Ignore accidental key path in password mode.
    }
  } else if (ssh.identityFile) {
    // ask: optional key path, but leave auth negotiation to OpenSSH.
    args.push("-i", ssh.identityFile);
    args.push("-o", "IdentitiesOnly=yes");
  }
  args.push(ssh.target);
  return args;
}

function resolveShellOrSsh(shellName, sshOptions) {
  if (shellName === "ssh") {
    const ssh = normalizeSshOptions(sshOptions);
    const executable = resolveSshExecutable();
    if (!executable) {
      throw new Error(
        "未找到 OpenSSH 客户端。请在 Windows 设置 → 系统 → 可选功能中安装 OpenSSH 客户端。"
      );
    }
    return {
      executable,
      args: buildSshArgs(ssh),
      ssh,
      shell: "ssh",
    };
  }
  return { ...resolveShell(shellName), ssh: null, shell: shellName || "powershell" };
}

function validWorkingDirectory(value) {
  if (typeof value === "string" && fs.existsSync(value)) {
    try {
      if (fs.statSync(value).isDirectory()) return path.resolve(value);
    } catch {
      // Fall through to a known directory.
    }
  }
  return fs.existsSync("G:\\myday") ? "G:\\myday" : app.getPath("home");
}

/** Resolve git.exe; prefer PATH, then common Git for Windows installs. */
let cachedGitExecutable = null;
function resolveGitExecutable() {
  if (cachedGitExecutable) return cachedGitExecutable;

  const candidates = [];
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files\\Git\\bin\\git.exe",
      "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
      "C:\\Program Files (x86)\\Git\\bin\\git.exe"
    );
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      cachedGitExecutable = candidate;
      return candidate;
    }
  }

  cachedGitExecutable = "git";
  return cachedGitExecutable;
}

function gitErrorMessage(error) {
  const stderr = String(error?.stderr || "").trim();
  const stdout = String(error?.stdout || "").trim();
  const message = String(error?.message || "").trim();
  if (stderr) return stderr.split(/\r?\n/).filter(Boolean).slice(-3).join("\n");
  if (stdout) return stdout.split(/\r?\n/).filter(Boolean).slice(-3).join("\n");
  if (message) return message;
  return "Git 操作失败";
}

async function runGit(cwd, args) {
  const git = resolveGitExecutable();
  return execFileAsync(git, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: 20_000,
    maxBuffer: 2 * 1024 * 1024,
    env: buildShellEnv(),
  });
}

/**
 * Inspect workspace for local Git branches (no fetch/pull/push).
 * @returns {{ isRepo: false } | { isRepo: true, current: string, branches: string[], detached: boolean }}
 */
async function getGitBranchInfo(cwdInput) {
  const cwd = validWorkingDirectory(cwdInput);
  try {
    const { stdout } = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
    if (String(stdout).trim() !== "true") {
      return { isRepo: false };
    }
  } catch {
    return { isRepo: false };
  }

  let current = "";
  let detached = false;
  try {
    const { stdout } = await runGit(cwd, ["branch", "--show-current"]);
    current = String(stdout).trim();
  } catch {
    current = "";
  }

  if (!current) {
    detached = true;
    try {
      const { stdout } = await runGit(cwd, ["rev-parse", "--short", "HEAD"]);
      current = `detached@${String(stdout).trim()}`;
    } catch {
      current = "HEAD";
    }
  }

  let branches = [];
  try {
    const { stdout } = await runGit(cwd, ["branch", "--list", "--format=%(refname:short)"]);
    branches = String(stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    branches = [];
  }

  // Ensure current local branch appears even if list was empty/odd.
  if (!detached && current && !branches.includes(current)) {
    branches = [current, ...branches];
  }

  return { isRepo: true, current, branches, detached };
}

/**
 * Switch to an existing local branch only. No create / pull / push.
 */
async function checkoutGitBranch(cwdInput, branchName) {
  const cwd = validWorkingDirectory(cwdInput);
  const branch = typeof branchName === "string" ? branchName.trim() : "";
  if (!branch) {
    return { ok: false, error: "未指定分支" };
  }

  const info = await getGitBranchInfo(cwd);
  if (!info.isRepo) {
    return { ok: false, error: "当前目录不是 Git 仓库" };
  }
  if (!info.branches.includes(branch)) {
    return { ok: false, error: "只能切换到已有本地分支" };
  }
  if (!info.detached && info.current === branch) {
    return { ok: true, current: branch, branches: info.branches, detached: false };
  }

  try {
    // Only local branches from the whitelist above; never pull/push/fetch.
    await runGit(cwd, ["checkout", branch]);
  } catch (error) {
    return { ok: false, error: gitErrorMessage(error) };
  }

  const after = await getGitBranchInfo(cwd);
  if (!after.isRepo) {
    return { ok: false, error: "切换后无法读取仓库状态" };
  }
  if (after.detached || after.current !== branch) {
    return {
      ok: false,
      error: `切换未成功（当前：${after.current}）`,
      current: after.current,
      branches: after.branches,
      detached: after.detached,
    };
  }
  return {
    ok: true,
    current: after.current,
    branches: after.branches,
    detached: false,
  };
}

/** Safe IPC send — never touch destroyed BrowserWindow / WebContents. */
function safeSend(win, channel, payload) {
  try {
    if (!win || win.isDestroyed()) return false;
    const contents = win.webContents;
    if (!contents || contents.isDestroyed()) return false;
    contents.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}

function broadcastPetStatus() {
  safeSend(petWindow, "pet:status", petStatus);
  safeSend(mainWindow, "pet:state", { enabled: petEnabled });
}

/** Drop terminals whose owner WebContents is already gone. */
function closeOrphanTerminals() {
  for (const [id, entry] of [...terminals.entries()]) {
    let dead = !entry.owner;
    if (!dead) {
      try {
        dead = entry.owner.isDestroyed();
      } catch {
        dead = true;
      }
    }
    if (dead) closeTerminal(id);
  }
}

function pushPreattachBuffer(entry, data) {
  const chunk = typeof data === "string" ? data : String(data ?? "");
  entry.buffer.push(chunk);
  entry.bufferChars += chunk.length;

  while (
    entry.buffer.length > MAX_PREATTACH_CHUNKS ||
    entry.bufferChars > MAX_PREATTACH_CHARS
  ) {
    if (!entry.buffer.length) {
      entry.bufferChars = 0;
      break;
    }
    const dropped = entry.buffer.shift();
    entry.bufferChars = Math.max(0, entry.bufferChars - dropped.length);
  }
}

function clearPreattachBuffer(entry) {
  entry.buffer.length = 0;
  entry.bufferChars = 0;
}

/**
 * Release a terminal entry. When the shell already exited, pass kill:false.
 * Always drops Map membership, buffer, owner-destroyed hook, and PTY listeners.
 */
function closeTerminal(id, { kill = true } = {}) {
  const key = String(id);
  const entry = terminals.get(key);
  if (!entry) return;
  terminals.delete(key);
  remoteBridge.unregister(key);
  if (activeMcpRemoteId === key) writeMcpBridgeState("");

  entry.attached = false;
  clearPreattachBuffer(entry);

  if (entry.onOwnerDestroyed && entry.owner && !entry.owner.isDestroyed()) {
    try {
      entry.owner.removeListener("destroyed", entry.onOwnerDestroyed);
    } catch {
      // WebContents may already be tearing down.
    }
  }
  entry.onOwnerDestroyed = null;

  const processHandle = entry.processHandle;
  entry.processHandle = null;
  if (!processHandle) return;

  try {
    processHandle.removeAllListeners("data");
    processHandle.removeAllListeners("exit");
  } catch {
    // node-pty implementations vary; kill path still runs below.
  }

  if (kill && !entry.exited) {
    try {
      processHandle.kill();
    } catch {
      // The shell may already have exited.
    }
  }
}

function closeTerminalsOwnedBy(webContents) {
  for (const [id, entry] of [...terminals.entries()]) {
    if (entry.owner === webContents) closeTerminal(id);
  }
}

async function createTerminal(event, options = {}) {
  const id = String(nextTerminalId++);
  const cols = Math.max(20, Math.min(400, Number(options.cols) || 100));
  const rows = Math.max(5, Math.min(200, Number(options.rows) || 30));
  const env = buildShellEnv();
  const owner = event.sender;

  let resolved;
  try {
    resolved = resolveShellOrSsh(options.shell, options.ssh);
  } catch (error) {
    return {
      error: error && error.message ? error.message : "无法创建终端",
    };
  }

  if (resolved.shell !== "ssh" && options.remoteSessionId) {
    const bridgeEnv = remoteBridge.environment(options.remoteSessionId);
    if (bridgeEnv) Object.assign(env, bridgeEnv);
  }

  // SSH 客户端本地工作目录用用户主目录即可；远程 cwd 由远端 shell 决定。
  const cwd =
    resolved.shell === "ssh"
      ? app.getPath("home")
      : validWorkingDirectory(options.cwd);

  let processHandle;
  let usedSsh2 = false;
  try {
    if (resolved.shell === "ssh" && resolved.ssh && shouldUseSsh2Shell(resolved.ssh)) {
      // Password / key(+passphrase): unlock in-process via ssh2 — no OpenSSH passphrase TTY.
      processHandle = await createSsh2ShellHandle(resolved.ssh, { cols, rows });
      usedSsh2 = true;
    } else {
      processHandle = pty.spawn(resolved.executable, resolved.args, {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env,
        useConpty: true,
      });
    }
  } catch (error) {
    const msg = error && error.message ? error.message : String(error);
    if (resolved.shell === "ssh") {
      return {
        error:
          (usedSsh2 || shouldUseSsh2Shell(resolved.ssh)
            ? "SSH 连接失败：\n"
            : "无法启动 SSH。请确认已安装 OpenSSH 客户端（设置 → 应用 → 可选功能 → OpenSSH 客户端）。\n") +
          msg,
      };
    }
    return { error: `无法启动终端：${msg}` };
  }

  const entry = {
    id,
    owner,
    processHandle,
    buffer: [],
    bufferChars: 0,
    attached: false,
    exited: false,
    onOwnerDestroyed: null,
    shell: resolved.shell,
    sshLabel: resolved.ssh ? resolved.ssh.label : null,
    // Only used for OpenSSH CLI fallback auto-type.
    pendingSshPassword: usedSsh2 ? "" : resolved.ssh?.password || "",
    pendingSshPassphrase: usedSsh2 ? "" : resolved.ssh?.passphrase || "",
    sshPromptTail: "",
    usedSsh2,
  };
  terminals.set(id, entry);
  // 结构化远端桥（SFTP/exec/MCP）与交互式 shell 共用同一会话 id。
  if (resolved.ssh) {
    try {
      remoteBridge.register(id, resolved.ssh);
    } catch (error) {
      // 交互终端仍可创建；Agent 桥不可用时 bridgeReady 为 false。
      console.warn("[remote-bridge] register failed:", error?.message || error);
    }
  }

  // Renderer crash/reload must not leave orphan ConPTY processes.
  entry.onOwnerDestroyed = () => {
    closeTerminal(id);
  };
  if (owner && !owner.isDestroyed()) {
    owner.once("destroyed", entry.onOwnerDestroyed);
  }

  processHandle.onData((data) => {
    if (entry.exited || !entry.processHandle) return;
    if (entry.pendingSshPassword || entry.pendingSshPassphrase) {
      // Strip CSI sequences so "Enter passphrase for key ...:" still matches.
      const raw = String(data ?? "");
      const clean = raw.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
      entry.sshPromptTail = `${entry.sshPromptTail}${clean}`.slice(-2048);
      const tail = entry.sshPromptTail;
      const respond = (secret) => {
        entry.sshPromptTail = "";
        const writeSecret = () => {
          try {
            // OpenSSH on Windows often accepts \r; some builds want \n — send both-safe \r.
            entry.processHandle.write(`${secret}\r`);
          } catch {
            // Shell may have exited.
          }
        };
        // Delay slightly so the prompt has fully armed input.
        setTimeout(writeSecret, 40);
      };
      // Encrypted private key: "Enter passphrase for key '...':"
      if (entry.pendingSshPassphrase && /passphrase/i.test(tail) && /:\s*$/.test(tail.trim())) {
        const secret = entry.pendingSshPassphrase;
        entry.pendingSshPassphrase = "";
        respond(secret);
      } else if (
        entry.pendingSshPassword &&
        /password\s*:\s*$/i.test(tail.trim()) &&
        !/passphrase/i.test(tail)
      ) {
        const secret = entry.pendingSshPassword;
        entry.pendingSshPassword = "";
        respond(secret);
      }
    }
    if (!entry.attached) {
      pushPreattachBuffer(entry, data);
      return;
    }
    if (entry.owner && !entry.owner.isDestroyed()) {
      entry.owner.send("terminal:data", { id, data });
    }
  });

  processHandle.onExit(({ exitCode }) => {
    entry.exited = true;
    if (entry.owner && !entry.owner.isDestroyed()) {
      entry.owner.send("terminal:exit", { id, exitCode });
    }
    // Drop Map + listeners; process already gone so do not kill again.
    // UI pane may stay open until the user closes it.
    closeTerminal(id, { kill: false });
  });

  const result = {
    id,
    cwd,
    shell: resolved.shell === "ssh" ? "ssh" : options.shell || "powershell",
  };
  if (resolved.ssh) {
    result.ssh = {
      host: resolved.ssh.host,
      port: resolved.ssh.port,
      user: resolved.ssh.user,
      label: resolved.ssh.label,
      authMethod: resolved.ssh.authMethod,
      identityFile: resolved.ssh.identityFile,
      remoteRoot: resolved.ssh.remoteRoot,
      bridgeReady: remoteBridge.has(id),
      transport: usedSsh2 ? "ssh2" : "openssh",
    };
  }
  return result;
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "终端矩阵",
    backgroundColor: "#111417",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
  window.once("ready-to-show", () => window.show());

  window.on("close", (event) => {
    // 宠物开启时关闭主窗口只是隐藏，方便常驻桌面
    if (petEnabled && petWindow && !petWindow.isDestroyed()) {
      event.preventDefault();
      window.hide();
    }
  });

  window.on("closed", () => {
    // After "closed", BrowserWindow/webContents are unusable — do NOT access them
    // (would throw TypeError: Object has been destroyed).
    // Owner webContents "destroyed" hooks already closed PTYs; sweep orphans as fallback.
    if (mainWindow === window) mainWindow = null;
    closeOrphanTerminals();
  });

  mainWindow = window;
  return window;
}

function placePetOnDesktop(win) {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const { x: originX, y: originY } = display.workArea;
  const [pw, ph] = win.getSize();
  win.setPosition(originX + width - pw - 24, originY + height - ph - 24);
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show();
    petWindow.focus();
    return petWindow;
  }

  const win = new BrowserWindow({
    width: 168,
    height: 210,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    focusable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload-pet.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, "renderer", "pet.html"));
  placePetOnDesktop(win);

  win.once("ready-to-show", () => {
    win.showInactive();
    broadcastPetStatus();
  });

  win.on("closed", () => {
    if (petWindow === win) petWindow = null;
    const wasEnabled = petEnabled;
    petEnabled = false;
    safeSend(mainWindow, "pet:state", { enabled: false });
    try {
      if (
        wasEnabled &&
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.isVisible()
      ) {
        showMainWindow();
      }
    } catch {
      // Main window may already be tearing down during app quit.
    }
  });

  petWindow = win;
  petEnabled = true;
  return win;
}

function setPetEnabled(enabled) {
  if (enabled) {
    createPetWindow();
    petEnabled = true;
  } else {
    petEnabled = false;
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.removeAllListeners("closed");
      petWindow.close();
      petWindow = null;
    }
    // 关掉宠物时如果主窗口是隐藏的，重新显示，避免应用“消失”
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      showMainWindow();
    }
  }
  safeSend(mainWindow, "pet:state", { enabled: petEnabled });
  return petEnabled;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// --- Terminal IPC ---
ipcMain.handle("terminal:create", createTerminal);
ipcMain.handle("terminal:attach", (event, id) => {
  const entry = terminals.get(String(id));
  if (!entry || entry.owner !== event.sender || entry.exited || !entry.processHandle) {
    return false;
  }
  entry.attached = true;
  if (!entry.owner.isDestroyed()) {
    for (const data of entry.buffer) {
      entry.owner.send("terminal:data", { id: entry.id, data });
    }
  }
  clearPreattachBuffer(entry);
  return true;
});
ipcMain.on("terminal:write", (event, { id, data }) => {
  const entry = terminals.get(String(id));
  if (
    !entry ||
    entry.owner !== event.sender ||
    entry.exited ||
    !entry.processHandle ||
    typeof data !== "string"
  ) {
    return;
  }
  try {
    entry.processHandle.write(data);
  } catch {
    // Shell may have exited between checks.
  }
});
ipcMain.on("terminal:resize", (event, { id, cols, rows }) => {
  const entry = terminals.get(String(id));
  if (!entry || entry.owner !== event.sender || entry.exited || !entry.processHandle) return;
  const safeCols = Math.max(20, Math.min(400, Number(cols) || 80));
  const safeRows = Math.max(5, Math.min(200, Number(rows) || 24));
  try {
    entry.processHandle.resize(safeCols, safeRows);
  } catch {
    // Ignore resize races while a shell is exiting.
  }
});
ipcMain.on("terminal:close", (event, id) => {
  const entry = terminals.get(String(id));
  if (entry && entry.owner === event.sender) closeTerminal(id);
});
ipcMain.handle("workspace:choose", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择终端工作目录",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

/** Pick a local private key for SSH (-i). */
ipcMain.handle("ssh:choose-identity", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择 SSH 私钥",
    properties: ["openFile"],
    defaultPath: app.getPath("home"),
    filters: [
      { name: "OpenSSH 私钥 / PEM", extensions: ["pem", "key"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
});

/** Probe whether OpenSSH client binary exists (best-effort). */
ipcMain.handle("ssh:probe", async () => {
  const executable = resolveSshExecutable();
  if (!executable) return { ok: false, path: null };
  if (!path.isAbsolute(executable)) return { ok: true, path: executable };
  return { ok: fs.existsSync(executable), path: executable };
});

ipcMain.handle("mcp:setup-command", () => {
  const script = stableMcpServerPath || ensureStableMcpServer();
  const launch = mcpLaunchSpec();
  const quotePowerShell = (value) => `'${String(value).replace(/'/g, "''")}'`;
  return {
    command:
      `codex mcp add terminal-matrix-remote -- ${quotePowerShell(launch.command)} ` +
      launch.args.map(quotePowerShell).join(" "),
    script,
  };
});

ipcMain.handle("mcp:agent-status", async () => {
  const env = buildShellEnv();
  const cwd = app.getPath("home");
  const statuses = await Promise.all(
    Object.values(AGENTS).map(async (agent) => ({
      id: agent.id,
      label: agent.label,
      available: Boolean(await resolveAgentCli(agent.id, { env, cwd })),
    }))
  );
  return statuses;
});

ipcMain.handle("mcp:install-agent", async (_event, agentId) => {
  try {
    ensureStableMcpServer();
    writeMcpBridgeState(activeMcpRemoteId);
    return await installAgentMcp(agentId, mcpLaunchSpec(), {
      env: buildShellEnv(),
      cwd: app.getPath("home"),
    });
  } catch (error) {
    return {
      ok: false,
      agent: String(agentId || ""),
      error: error?.message || String(error),
    };
  }
});

ipcMain.handle("mcp:set-remote-session", (event, id) => {
  const key = String(id || "");
  if (key) {
    const terminal = terminals.get(key);
    if (!terminal || terminal.owner !== event.sender || !remoteBridge.has(key)) {
      return writeMcpBridgeState("");
    }
  }
  return writeMcpBridgeState(key);
});

/** Git branch switcher: list local branches / checkout only (no pull/push/fetch). */
ipcMain.handle("git:branch-info", async (_event, cwd) => {
  try {
    return await getGitBranchInfo(cwd);
  } catch (error) {
    return { isRepo: false, error: gitErrorMessage(error) };
  }
});

ipcMain.handle("git:checkout", async (_event, { cwd, branch } = {}) => {
  try {
    return await checkoutGitBranch(cwd, branch);
  } catch (error) {
    return { ok: false, error: gitErrorMessage(error) };
  }
});

/**
 * 递归列出 renderer/skins 下图片（含合集子目录）。
 * 返回 { file, image, title, group, folder }
 * group = 一级子目录名；根目录散图 group 为空。
 */
ipcMain.handle("skin:list-images", async () => {
  const root = path.join(__dirname, "renderer", "skins");
  const exts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
  const out = [];

  function walk(absDir, relParts) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const abs = path.join(absDir, ent.name);
      if (ent.isDirectory()) {
        // 只扫一级合集目录（skins/合集/图），避免过深
        if (relParts.length === 0) walk(abs, [ent.name]);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!exts.has(ext)) continue;
      const base = path.basename(ent.name, ext);
      const relPath = ["skins", ...relParts, ent.name].join("/");
      out.push({
        file: ent.name,
        image: relPath,
        title: base,
        folder: relParts[0] || "",
        group: relParts[0] || "",
      });
    }
  }

  try {
    if (fs.existsSync(root)) walk(root, []);
  } catch {
    return [];
  }
  out.sort((a, b) => {
    const g = String(a.group || "").localeCompare(String(b.group || ""), "zh");
    if (g !== 0) return g;
    return a.title.localeCompare(b.title, "zh");
  });
  return out;
});

/** Pick a skin wallpaper and return a data URL (safe for packaged app + localStorage). */
ipcMain.handle("skin:choose-image", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择皮肤背景图",
    properties: ["openFile"],
    filters: [
      { name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;

  const filePath = result.filePaths[0];
  try {
    const stat = fs.statSync(filePath);
    // Cap ~4MB raw file to avoid huge data URLs / localStorage blowups
    if (stat.size > 4 * 1024 * 1024) {
      return { error: "图片过大，请选择 4MB 以内的图片" };
    }
    const ext = path.extname(filePath).toLowerCase().replace(".", "") || "png";
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : ext === "bmp"
              ? "image/bmp"
              : "image/png";
    const buf = fs.readFileSync(filePath);
    return { dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
  } catch (err) {
    return { error: err && err.message ? err.message : "读取图片失败" };
  }
});

// --- Pet IPC ---
ipcMain.handle("pet:get-state", () => ({ enabled: petEnabled, status: petStatus }));
ipcMain.handle("pet:set-enabled", (_event, enabled) => setPetEnabled(Boolean(enabled)));
ipcMain.on("pet:update-status", (_event, status) => {
  if (!status || typeof status !== "object") return;
  petStatus = {
    terminalCount: Math.max(0, Number(status.terminalCount) || 0),
    activeShell: String(status.activeShell || "powershell"),
    mood: String(status.mood || "idle"),
  };
  broadcastPetStatus();
});
ipcMain.on("pet:show-main", () => showMainWindow());
ipcMain.on("pet:hide-pet", () => setPetEnabled(false));
ipcMain.on("pet:new-terminal", () => {
  showMainWindow();
  safeSend(mainWindow, "pet:request-new-terminal");
});
ipcMain.on("pet:move-by", (event, { dx, dy }) => {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (event.sender !== petWindow.webContents) return;
  const [x, y] = petWindow.getPosition();
  petWindow.setPosition(Math.round(x + Number(dx || 0)), Math.round(y + Number(dy || 0)));
});
ipcMain.on("pet:quit-app", () => {
  petEnabled = false;
  for (const id of [...terminals.keys()]) closeTerminal(id);
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.removeAllListeners("close");
    petWindow.destroy();
    petWindow = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners("close");
    mainWindow.destroy();
    mainWindow = null;
  }
  app.quit();
});

app.whenReady().then(async () => {
  ensureStableMcpServer();
  await remoteBridge.start();
  writeMcpBridgeState("");
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (petEnabled && petWindow && !petWindow.isDestroyed()) return;
  for (const id of [...terminals.keys()]) closeTerminal(id);
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try {
    if (mcpBridgeStatePath) fs.rmSync(mcpBridgeStatePath, { force: true });
  } catch {
    // Best-effort removal of the ephemeral bridge capability.
  }
  remoteBridge.close().catch(() => {});
});
