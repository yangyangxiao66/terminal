/**
 * Agent 启动台：选择工作目录 → 一键在新本地终端里启动 AI 编程 CLI。
 * 命令文本由主进程按白名单生成（launchpad:prepare），这里只负责界面与会话创建。
 * 依赖 app.js 中的 createSession / shellSelect / defaultWorkspace。
 */
const LAUNCHPAD_RECENTS_KEY = "terminal-deck-launchpad-recent-dirs";
const LAUNCHPAD_ARGS_KEY = "terminal-deck-launchpad-args";
const LAUNCHPAD_RECENTS_MAX = 5;

const launchpadDialog = document.getElementById("launchpadDialog");
const launchpadButton = document.getElementById("launchpadButton");
const launchpadDir = document.getElementById("launchpadDir");
const launchpadPickDir = document.getElementById("launchpadPickDir");
const launchpadRecents = document.getElementById("launchpadRecents");
const launchpadRecentList = document.getElementById("launchpadRecentList");
const launchpadArgs = document.getElementById("launchpadArgs");
const launchpadGrid = document.getElementById("launchpadGrid");
const launchpadDetectText = document.getElementById("launchpadDetectText");
const launchpadRefresh = document.getElementById("launchpadRefresh");
const launchpadError = document.getElementById("launchpadError");
const agentNotifyToggle = document.getElementById("agentNotifyToggle");

let launchpadAgents = [];
let launchpadDetectRun = 0;
let launchpadBusy = false;

function loadLaunchpadRecents() {
  try {
    const list = JSON.parse(localStorage.getItem(LAUNCHPAD_RECENTS_KEY) || "[]");
    if (!Array.isArray(list)) return [];
    return list.filter((item) => typeof item === "string" && item).slice(0, LAUNCHPAD_RECENTS_MAX);
  } catch {
    return [];
  }
}

function saveLaunchpadRecent(dir) {
  const value = String(dir || "").trim();
  if (!value) return;
  // Windows 路径大小写不敏感：去重时忽略大小写
  const key = value.toLowerCase();
  const list = [value, ...loadLaunchpadRecents().filter((item) => item.toLowerCase() !== key)];
  try {
    localStorage.setItem(LAUNCHPAD_RECENTS_KEY, JSON.stringify(list.slice(0, LAUNCHPAD_RECENTS_MAX)));
  } catch {
    // localStorage 不可用时只是不记住
  }
}

function removeLaunchpadRecent(dir) {
  const key = String(dir || "").toLowerCase();
  const list = loadLaunchpadRecents().filter((item) => item.toLowerCase() !== key);
  try {
    localStorage.setItem(LAUNCHPAD_RECENTS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function currentLaunchpadDir() {
  return String(launchpadDir?.value || "").trim();
}

function setLaunchpadDir(dir) {
  if (!launchpadDir) return;
  launchpadDir.value = dir || "";
  launchpadDir.title = dir || "";
  renderLaunchpadRecents();
}

function showLaunchpadError(message) {
  if (!launchpadError) return;
  launchpadError.textContent = message || "";
  launchpadError.hidden = !message;
}

function renderLaunchpadRecents() {
  if (!launchpadRecentList || !launchpadRecents) return;
  const recents = loadLaunchpadRecents();
  const current = currentLaunchpadDir().toLowerCase();
  launchpadRecentList.replaceChildren();
  for (const dir of recents) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ssh-recent-item launchpad-recent-item";
    if (dir.toLowerCase() === current) button.classList.add("is-current");
    button.title = dir;
    const label = document.createElement("span");
    label.className = "ssh-recent-label";
    label.textContent = dir;
    button.appendChild(label);
    button.addEventListener("click", () => {
      showLaunchpadError("");
      setLaunchpadDir(dir);
    });
    li.appendChild(button);
    launchpadRecentList.appendChild(li);
  }
  launchpadRecents.hidden = recents.length === 0;
}

function launchpadAgentCard(agent) {
  const card = document.createElement("article");
  card.className = "launchpad-card";
  card.classList.add(agent.installed ? "is-installed" : "is-missing");
  card.dataset.launchpadAgent = agent.id;

  const head = document.createElement("div");
  head.className = "launchpad-card-head";
  const name = document.createElement("strong");
  name.textContent = agent.label;
  const badge = document.createElement("span");
  badge.className = "launchpad-badge";
  badge.textContent = agent.installed ? "已安装" : "未安装";
  head.append(name, badge);

  const command = document.createElement("code");
  command.className = "launchpad-command";
  command.textContent = agent.command;
  command.title = agent.path ? `位置：${agent.path}` : `命令：${agent.command}`;

  const meta = document.createElement("small");
  meta.className = "launchpad-meta";
  meta.textContent = agent.installed
    ? agent.vendor || ""
    : agent.installCommand || "请参考官方文档安装";
  meta.title = meta.textContent;
  if (!agent.installed && agent.installCommand) meta.classList.add("is-install-command");

  const actions = document.createElement("div");
  actions.className = "launchpad-card-actions";
  if (agent.installed) {
    const launch = document.createElement("button");
    launch.type = "button";
    launch.className = "primary-button launchpad-launch";
    launch.textContent = "启动";
    launch.title = `在新终端中启动 ${agent.label}`;
    launch.addEventListener("click", () => runLaunchpad(agent, "launch"));
    actions.appendChild(launch);
  } else {
    if (agent.installCommand) {
      const install = document.createElement("button");
      install.type = "button";
      install.className = "ghost-button launchpad-install";
      install.textContent = "安装";
      install.title = `在新终端中执行：${agent.installCommand}`;
      install.addEventListener("click", () => runLaunchpad(agent, "install"));
      actions.appendChild(install);
    }
    // 检测可能漏掉（自定义安装位置），仍允许尝试直接启动
    const tryLaunch = document.createElement("button");
    tryLaunch.type = "button";
    tryLaunch.className = "launchpad-link-button";
    tryLaunch.textContent = "仍然启动";
    tryLaunch.title = "未检测到也可尝试直接运行命令";
    tryLaunch.addEventListener("click", () => runLaunchpad(agent, "launch"));
    actions.appendChild(tryLaunch);
  }

  card.append(head, command, meta, actions);
  return card;
}

function renderLaunchpadAgents() {
  if (!launchpadGrid) return;
  launchpadGrid.replaceChildren(...launchpadAgents.map(launchpadAgentCard));
}

async function refreshLaunchpadAgents() {
  if (!window.terminalDeck || typeof window.terminalDeck.listLaunchpadAgents !== "function") return;
  const run = ++launchpadDetectRun;
  if (launchpadDetectText) launchpadDetectText.textContent = "正在检测本机 Agent…";
  if (launchpadRefresh) launchpadRefresh.disabled = true;
  try {
    const list = await window.terminalDeck.listLaunchpadAgents();
    if (run !== launchpadDetectRun) return;
    launchpadAgents = Array.isArray(list) ? list : [];
    const count = launchpadAgents.filter((agent) => agent.installed).length;
    if (launchpadDetectText) {
      launchpadDetectText.textContent = `已检测到 ${count} / ${launchpadAgents.length} 个`;
    }
    renderLaunchpadAgents();
  } catch (error) {
    if (run !== launchpadDetectRun) return;
    if (launchpadDetectText) launchpadDetectText.textContent = "检测失败";
    showLaunchpadError(`检测 Agent 失败：${error?.message || error}`);
  } finally {
    if (run === launchpadDetectRun && launchpadRefresh) launchpadRefresh.disabled = false;
  }
}

/** 启动台总是开本地终端：当前选择 SSH 时退回 PowerShell */
function launchpadShell() {
  const value = typeof shellSelect !== "undefined" && shellSelect ? shellSelect.value : "";
  return value && value !== "ssh" ? value : "powershell";
}

async function runLaunchpad(agent, mode) {
  if (launchpadBusy) return;
  showLaunchpadError("");
  const cwd = currentLaunchpadDir();
  if (mode === "launch" && !cwd) {
    showLaunchpadError("请先选择工作目录");
    return;
  }
  const args = mode === "launch" ? String(launchpadArgs?.value || "") : "";
  launchpadBusy = true;
  try {
    const prepared = await window.terminalDeck.prepareLaunchpad({ agent: agent.id, mode, cwd, args });
    if (!prepared || !prepared.ok) {
      if (mode === "launch" && /工作目录不存在/.test(prepared?.error || "")) {
        removeLaunchpadRecent(cwd);
        renderLaunchpadRecents();
      }
      showLaunchpadError(prepared?.error || "无法生成启动命令");
      return;
    }
    if (mode === "launch") {
      saveLaunchpadRecent(prepared.cwd || cwd);
      try {
        localStorage.setItem(LAUNCHPAD_ARGS_KEY, args.trim());
      } catch {
        // ignore
      }
    }
    closeLaunchpad();
    const session = await createSession({
      shell: launchpadShell(),
      cwd: prepared.cwd || undefined,
      title: mode === "install" ? `安装 ${prepared.label}` : prepared.label,
      launchpadAgent: mode === "launch" ? prepared.agent : "",
      startCommand: prepared.command,
    });
    if (session && session.terminal) session.terminal.focus();
  } catch (error) {
    showLaunchpadError(error?.message || String(error));
  } finally {
    launchpadBusy = false;
  }
}

async function pickLaunchpadDirectory() {
  if (!window.terminalDeck || typeof window.terminalDeck.chooseLaunchpadDirectory !== "function") return;
  showLaunchpadError("");
  try {
    const dir = await window.terminalDeck.chooseLaunchpadDirectory(currentLaunchpadDir() || undefined);
    if (dir) {
      saveLaunchpadRecent(dir);
      setLaunchpadDir(dir);
    }
  } catch (error) {
    showLaunchpadError(`选择目录失败：${error?.message || error}`);
  }
}

function isLaunchpadOpen() {
  return Boolean(launchpadDialog && !launchpadDialog.hidden);
}

function openLaunchpad() {
  if (!launchpadDialog) return;
  showLaunchpadError("");
  const recents = loadLaunchpadRecents();
  const fallback = typeof defaultWorkspace === "string" ? defaultWorkspace : "";
  setLaunchpadDir(currentLaunchpadDir() || recents[0] || fallback);
  if (launchpadArgs && !launchpadArgs.value) {
    try {
      launchpadArgs.value = localStorage.getItem(LAUNCHPAD_ARGS_KEY) || "";
    } catch {
      // ignore
    }
  }
  if (agentNotifyToggle && typeof isAgentNotifyEnabled === "function") {
    agentNotifyToggle.checked = isAgentNotifyEnabled();
  }
  launchpadDialog.hidden = false;
  requestAnimationFrame(() => {
    launchpadDialog.classList.add("is-open");
    launchpadButton?.setAttribute("aria-expanded", "true");
  });
  refreshLaunchpadAgents();
}

function closeLaunchpad() {
  if (!launchpadDialog) return;
  launchpadDialog.hidden = true;
  launchpadDialog.classList.remove("is-open");
  launchpadButton?.setAttribute("aria-expanded", "false");
}

function toggleLaunchpad() {
  if (isLaunchpadOpen()) closeLaunchpad();
  else openLaunchpad();
}

launchpadButton?.addEventListener("click", toggleLaunchpad);
launchpadPickDir?.addEventListener("click", pickLaunchpadDirectory);
launchpadRefresh?.addEventListener("click", refreshLaunchpadAgents);
launchpadDialog?.addEventListener("click", (event) => {
  if (event.target.closest("[data-launchpad-close]")) closeLaunchpad();
});
agentNotifyToggle?.addEventListener("change", () => {
  if (typeof setAgentNotifyEnabled === "function") setAgentNotifyEnabled(agentNotifyToggle.checked);
});
