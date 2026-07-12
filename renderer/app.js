const grid = document.getElementById("terminalGrid");
const emptyState = document.getElementById("emptyState");
const sessionCount = document.getElementById("sessionCount");
const workspaceButton = document.getElementById("workspaceButton");
const workspacePath = document.getElementById("workspacePath");
const shellSelect = document.getElementById("shellSelect");
const layoutSelect = document.getElementById("layoutSelect");
const newTerminalButton = document.getElementById("newTerminalButton");
const emptyNewButton = document.getElementById("emptyNewButton");
const contextMenu = document.getElementById("terminalContextMenu");

const sessions = new Map();
let activeId = null;
let sequence = 1;
let defaultWorkspace = "G:\\myday";
let contextTargetId = null;

function hideContextMenu() {
  contextMenu.hidden = true;
  contextTargetId = null;
}

function showContextMenu(event, id) {
  event.preventDefault();
  contextTargetId = id;
  contextMenu.hidden = false;
  const width = contextMenu.offsetWidth;
  const height = contextMenu.offsetHeight;
  contextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - width - 8)}px`;
  contextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - height - 8)}px`;
}

function copySelection(session) {
  if (!session || !session.terminal.hasSelection()) return;
  window.terminalDeck.writeClipboard(session.terminal.getSelection());
}

function pasteClipboard(session) {
  if (!session) return;
  const text = window.terminalDeck.readClipboard();
  if (text) window.terminalDeck.write(session.id, text);
}

function updateSessionCount() {
  const count = sessions.size;
  sessionCount.textContent = `${count} 个终端`;
  emptyState.classList.toggle("hidden", count > 0);
}

function setActive(id) {
  activeId = id;
  for (const [sessionId, session] of sessions) {
    session.element.classList.toggle("active", sessionId === id);
  }
  const active = sessions.get(id);
  if (active) active.terminal.focus();
}

function fitSession(session) {
  if (!session || !document.body.contains(session.element)) return;
  try {
    session.fitAddon.fit();
    window.terminalDeck.resize(session.id, session.terminal.cols, session.terminal.rows);
  } catch {
    // The pane may be between layout states.
  }
}

function closeSession(id) {
  const session = sessions.get(id);
  if (!session) return;
  session.resizeObserver.disconnect();
  window.terminalDeck.close(id);
  session.terminal.dispose();
  session.element.remove();
  sessions.delete(id);
  if (activeId === id) {
    const remaining = [...sessions.keys()];
    activeId = remaining.length ? remaining[remaining.length - 1] : null;
    if (activeId) setActive(activeId);
  }
  updateSessionCount();
}

function toggleMaximize(id) {
  const session = sessions.get(id);
  if (!session) return;
  const next = !session.element.classList.contains("maximized");
  for (const item of sessions.values()) item.element.classList.remove("maximized");
  session.element.classList.toggle("maximized", next);
  requestAnimationFrame(() => fitSession(session));
}

function quoteDroppedPath(filePath, shell) {
  if (shell === "cmd") {
    return `"${filePath.replace(/"/g, '""')}"`;
  }
  if (shell === "git-bash") {
    return `'${filePath.replace(/'/g, `'\\''`)}'`;
  }
  return `'${filePath.replace(/'/g, "''")}'`;
}

async function createSession() {
  const shell = shellSelect.value;
  const result = await window.terminalDeck.create({ shell, cwd: defaultWorkspace, cols: 100, rows: 30 });
  const number = sequence++;

  const element = document.createElement("section");
  element.className = "terminal-pane";
  element.dataset.terminalId = result.id;
  element.innerHTML = `
    <div class="pane-header">
      <span class="pane-index">${String(number).padStart(2, "0")}</span>
      <span class="pane-title">${shell === "git-bash" ? "Git Bash" : shell === "cmd" ? "CMD" : "PowerShell"}</span>
      <span class="pane-path" title="${result.cwd}"></span>
      <span class="pane-status" title="运行中"></span>
      <button class="icon-button maximize" title="放大或还原终端">□</button>
      <button class="icon-button close" title="关闭终端">×</button>
    </div>
    <div class="terminal-host"></div>
  `;
  element.querySelector(".pane-path").textContent = result.cwd;
  grid.appendChild(element);

  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: "bar",
    fontFamily: "Cascadia Mono, Consolas, Microsoft YaHei UI, monospace",
    fontSize: 14,
    lineHeight: 1.12,
    scrollback: 10000,
    allowProposedApi: false,
    theme: {
      background: "#101316",
      foreground: "#e1e7eb",
      cursor: "#73d5ad",
      cursorAccent: "#101316",
      selectionBackground: "#345d70",
      black: "#181b1e",
      red: "#df6b6b",
      green: "#73c991",
      yellow: "#d7ba7d",
      blue: "#75a7d8",
      magenta: "#c48ad6",
      cyan: "#66c2c2",
      white: "#d4d4d4",
      brightBlack: "#6d7780",
      brightRed: "#f07b7b",
      brightGreen: "#8bd6a4",
      brightYellow: "#e4c98c",
      brightBlue: "#8bb9e4",
      brightMagenta: "#d29ae0",
      brightCyan: "#7bd1d1",
      brightWhite: "#ffffff",
    },
  });
  const fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(element.querySelector(".terminal-host"));

  const session = { id: result.id, shell, element, terminal, fitAddon, resizeObserver: null };
  sessions.set(result.id, session);

  terminal.onData((data) => window.terminalDeck.write(result.id, data));
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") return true;
    if ((event.ctrlKey && event.shiftKey && event.code === "KeyC") || (event.ctrlKey && event.code === "Insert")) {
      if (!terminal.hasSelection()) return true;
      copySelection(session);
      return false;
    }
    if ((event.ctrlKey && event.shiftKey && event.code === "KeyV") || (event.shiftKey && event.code === "Insert")) {
      pasteClipboard(session);
      return false;
    }
    if (event.ctrlKey && event.shiftKey && event.code === "KeyA") {
      terminal.selectAll();
      return false;
    }
    return true;
  });

  session.resizeObserver = new ResizeObserver(() => fitSession(session));
  const terminalHost = element.querySelector(".terminal-host");
  session.resizeObserver.observe(terminalHost);

  let dragDepth = 0;
  element.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    element.classList.add("drop-target");
  });
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  element.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) element.classList.remove("drop-target");
  });
  element.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    element.classList.remove("drop-target");

    const paths = [...event.dataTransfer.files]
      .map((file) => window.terminalDeck.getPathForFile(file))
      .filter(Boolean);
    if (!paths.length) return;

    const input = paths.map((filePath) => quoteDroppedPath(filePath, shell)).join(" ");
    setActive(result.id);
    window.terminalDeck.write(result.id, input);
  });

  element.addEventListener("mousedown", () => setActive(result.id));
  terminalHost.addEventListener("contextmenu", (event) => {
    setActive(result.id);
    showContextMenu(event, result.id);
  });
  element.querySelector(".maximize").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMaximize(result.id);
  });
  element.querySelector(".close").addEventListener("click", (event) => {
    event.stopPropagation();
    closeSession(result.id);
  });
  element.querySelector(".pane-header").addEventListener("dblclick", () => toggleMaximize(result.id));

  updateSessionCount();
  setActive(result.id);
  requestAnimationFrame(() => fitSession(session));
  await window.terminalDeck.attach(result.id);
}

window.terminalDeck.onData(({ id, data }) => {
  const session = sessions.get(id);
  if (session) session.terminal.write(data);
});

window.terminalDeck.onExit(({ id, exitCode }) => {
  const session = sessions.get(id);
  if (!session) return;
  const status = session.element.querySelector(".pane-status");
  status.classList.add("exited");
  status.title = `进程已退出，代码 ${exitCode}`;
  session.terminal.write(`\r\n\x1b[33m[进程已退出，代码 ${exitCode}]\x1b[0m\r\n`);
});

workspaceButton.addEventListener("click", async () => {
  const selected = await window.terminalDeck.chooseWorkspace();
  if (!selected) return;
  defaultWorkspace = selected;
  workspacePath.textContent = selected;
  workspaceButton.title = selected;
});

layoutSelect.addEventListener("change", () => {
  grid.className = `terminal-grid layout-${layoutSelect.value}`;
  requestAnimationFrame(() => {
    for (const session of sessions.values()) fitSession(session);
  });
});

newTerminalButton.addEventListener("click", createSession);
emptyNewButton.addEventListener("click", createSession);

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && !contextMenu.hidden) {
    hideContextMenu();
    return;
  }
  if (event.ctrlKey && event.shiftKey && event.code === "KeyT") {
    event.preventDefault();
    createSession();
    return;
  }
  if (event.ctrlKey && event.shiftKey && event.code === "KeyW" && activeId) {
    event.preventDefault();
    closeSession(activeId);
    return;
  }
  if (event.altKey && /^Digit[1-9]$/.test(event.code)) {
    const index = Number(event.code.slice(-1)) - 1;
    const id = [...sessions.keys()][index];
    if (id) {
      event.preventDefault();
      setActive(id);
    }
  }
});

contextMenu.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !contextTargetId) return;
  const session = sessions.get(contextTargetId);
  if (button.dataset.action === "copy") copySelection(session);
  if (button.dataset.action === "paste") pasteClipboard(session);
  if (button.dataset.action === "select-all" && session) session.terminal.selectAll();
  hideContextMenu();
  if (session) session.terminal.focus();
});

window.addEventListener("mousedown", (event) => {
  if (!contextMenu.hidden && !contextMenu.contains(event.target)) hideContextMenu();
});
window.addEventListener("blur", hideContextMenu);

window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

updateSessionCount();
createSession();
