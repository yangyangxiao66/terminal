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
const petToggleButton = document.getElementById("petToggleButton");
const petToggleLabel = document.getElementById("petToggleLabel");
let petEnabled = false;

const sessions = new Map();
let activeId = null;
let sequence = 1;
let defaultWorkspace = "G:\\myday";
let contextTargetId = null;
/** 拖动调整尺寸时跳过 ResizeObserver，避免 fit 抖动/循环 */
let isResizingPane = false;
/** 网格轨道权重（fr），拖动分割时调整，新建/关闭时重置为均分 */
let colTracks = [1];
let rowTracks = [1];
let gridCols = 1;
let gridRows = 1;
const MIN_TRACK_FR = 0.15;
const GRID_GAP_PX = 4;

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

function syncPetStatus(extra = {}) {
  const active = activeId ? sessions.get(activeId) : null;
  const count = sessions.size;
  let mood = "idle";
  if (count >= 6) mood = "busy";
  else if (count >= 1) mood = "idle";
  window.terminalDeck.updatePetStatus({
    terminalCount: count,
    activeShell: active ? active.shell : shellSelect.value,
    mood: extra.mood || mood,
  });
}

function setPetToggleUi(enabled) {
  petEnabled = Boolean(enabled);
  petToggleButton.classList.toggle("active", petEnabled);
  petToggleButton.setAttribute("aria-pressed", petEnabled ? "true" : "false");
  petToggleLabel.textContent = petEnabled ? "宠物已开" : "矩阵宠物";
  petToggleButton.title = petEnabled
    ? "关闭桌面矩阵宠物（关闭主窗口时宠物会保持显示）"
    : "在桌面显示矩阵宠物";
}

function updateSessionCount() {
  const count = sessions.size;
  sessionCount.textContent = `${count} 个终端`;
  emptyState.classList.toggle("hidden", count > 0);
  syncPetStatus();
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
  if (isResizingPane) return;
  try {
    const host = session.element.querySelector(".terminal-host");
    if (host && (host.clientWidth < 20 || host.clientHeight < 20)) return;
    session.fitAddon.fit();
    const cols = session.terminal.cols;
    const rows = session.terminal.rows;
    if (cols > 1 && rows > 1) {
      window.terminalDeck.resize(session.id, cols, rows);
    }
  } catch {
    // The pane may be between layout states.
  }
}

function fitAllSessions() {
  for (const session of sessions.values()) fitSession(session);
}

function getLayoutMode() {
  return layoutSelect.value || "auto";
}

/**
 * 根据终端数量计算行列，让所有终端铺满可视区域。
 * auto：接近正方形（1→1x1, 2→2x1, 3~4→2x2, 5~6→3x2, 7~9→3x3 …）
 */
function computeGridShape(count, mode) {
  const n = Math.max(1, count);
  if (mode === "columns") return { cols: n, rows: 1 };
  if (mode === "rows") return { cols: 1, rows: n };
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

function applyTrackStyles() {
  grid.style.gridTemplateColumns = colTracks.map((fr) => `minmax(0, ${fr}fr)`).join(" ");
  grid.style.gridTemplateRows = rowTracks.map((fr) => `minmax(0, ${fr}fr)`).join(" ");
}

function updatePaneEdgeClasses() {
  const list = [...sessions.values()];
  list.forEach((session, index) => {
    const col = index % gridCols;
    const row = Math.floor(index / gridCols);
    session.element.classList.toggle("edge-last-col", col === gridCols - 1);
    session.element.classList.toggle("edge-last-row", row === gridRows - 1);
  });
}

/**
 * 重新排布网格：新建/关闭/切换布局时调用。
 * 始终让全部终端出现在可视区域内，无需滚动。
 */
function relayoutGrid() {
  const count = sessions.size;
  const mode = getLayoutMode();
  const shape = computeGridShape(count, mode);
  gridCols = shape.cols;
  gridRows = shape.rows;

  // 新建/关闭后恢复均分，保证自适应
  colTracks = Array.from({ length: gridCols }, () => 1);
  rowTracks = Array.from({ length: gridRows }, () => 1);
  applyTrackStyles();
  updatePaneEdgeClasses();

  // 等一帧让 grid 完成布局后再 fit
  requestAnimationFrame(() => {
    requestAnimationFrame(fitAllSessions);
  });
}

function getSessionGridIndex(session) {
  return [...sessions.values()].indexOf(session);
}

function splitTracks(tracks, index, pixelDelta, containerPx) {
  if (index < 0 || index >= tracks.length - 1) return false;
  const gapTotal = GRID_GAP_PX * Math.max(0, tracks.length - 1);
  const usable = Math.max(1, containerPx - gapTotal);
  const sum = tracks.reduce((a, b) => a + b, 0) || 1;
  const pxPerFr = usable / sum;
  if (pxPerFr <= 0) return false;

  const pairFr = tracks[index] + tracks[index + 1];
  let leftFr = tracks[index] + pixelDelta / pxPerFr;
  leftFr = Math.max(MIN_TRACK_FR, Math.min(pairFr - MIN_TRACK_FR, leftFr));
  tracks[index] = leftFr;
  tracks[index + 1] = pairFr - leftFr;
  return true;
}

function bindResizeHandles(session) {
  const handles = session.element.querySelectorAll(".resize-handle");
  for (const handle of handles) {
    handle.addEventListener("pointerdown", (event) => {
      if (session.element.classList.contains("maximized")) return;
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      activeId = session.id;
      for (const [sessionId, item] of sessions) {
        item.element.classList.toggle("active", sessionId === session.id);
      }
      startPaneResize(session, handle.dataset.dir || "se", event, handle);
    });
  }
}

function startPaneResize(session, direction, event, handle) {
  const layout = getLayoutMode();
  const index = getSessionGridIndex(session);
  if (index < 0) return;

  const col = index % gridCols;
  const row = Math.floor(index / gridCols);
  const canResizeX = direction.includes("e") && layout !== "rows" && col < gridCols - 1;
  const canResizeY = direction.includes("s") && layout !== "columns" && row < gridRows - 1;
  if (!canResizeX && !canResizeY) return;

  const startX = event.clientX;
  const startY = event.clientY;
  const startCols = colTracks.slice();
  const startRows = rowTracks.slice();
  const gridRect = grid.getBoundingClientRect();

  if (handle) handle.classList.add("active");
  const cursor = canResizeX && canResizeY ? "nwse-resize" : canResizeX ? "ew-resize" : "ns-resize";
  isResizingPane = true;
  document.body.classList.add("is-resizing-pane");
  document.body.style.cursor = cursor;

  let usedCapture = false;
  try {
    handle.setPointerCapture(event.pointerId);
    usedCapture = true;
  } catch {
    usedCapture = false;
  }

  let frame = 0;
  const onMove = (moveEvent) => {
    moveEvent.preventDefault();
    colTracks = startCols.slice();
    rowTracks = startRows.slice();

    if (canResizeX) {
      splitTracks(colTracks, col, moveEvent.clientX - startX, gridRect.width);
    }
    if (canResizeY) {
      splitTracks(rowTracks, row, moveEvent.clientY - startY, gridRect.height);
    }
    applyTrackStyles();

    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const prev = isResizingPane;
      isResizingPane = false;
      fitAllSessions();
      isResizingPane = prev;
    });
  };

  const target = usedCapture ? handle : document;
  const onUp = (upEvent) => {
    if (frame) cancelAnimationFrame(frame);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
    try {
      if (usedCapture && upEvent && handle.hasPointerCapture?.(upEvent.pointerId)) {
        handle.releasePointerCapture(upEvent.pointerId);
      }
    } catch {
      // ignore
    }
    isResizingPane = false;
    document.body.classList.remove("is-resizing-pane");
    document.body.style.cursor = "";
    if (handle) handle.classList.remove("active");
    requestAnimationFrame(fitAllSessions);
  };

  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
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
  relayoutGrid();
}

function toggleMaximize(id) {
  const session = sessions.get(id);
  if (!session) return;
  const next = !session.element.classList.contains("maximized");
  for (const item of sessions.values()) item.element.classList.remove("maximized");
  session.element.classList.toggle("maximized", next);
  requestAnimationFrame(() => {
    fitSession(session);
    if (!next) fitAllSessions();
  });
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
    <div class="resize-handle resize-e" data-dir="e" title="拖动调整宽度"></div>
    <div class="resize-handle resize-s" data-dir="s" title="拖动调整高度"></div>
    <div class="resize-handle resize-se" data-dir="se" title="拖动调整大小"></div>
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

  const session = {
    id: result.id,
    shell,
    element,
    terminal,
    fitAddon,
    resizeObserver: null,
  };
  sessions.set(result.id, session);
  bindResizeHandles(session);
  // 每新建一个终端：立刻按数量重算行列，全部铺满窗口
  relayoutGrid();

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

  session.resizeObserver = new ResizeObserver(() => {
    if (isResizingPane) return;
    fitSession(session);
  });
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
  await window.terminalDeck.attach(result.id);
  // attach 后再 fit 一次，确保 PTY 行列与网格一致
  requestAnimationFrame(() => {
    requestAnimationFrame(fitAllSessions);
  });
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
  relayoutGrid();
});

window.addEventListener("resize", () => {
  if (isResizingPane) return;
  // 窗口尺寸变化：保持当前行列与轨道比例，只重新 fit
  requestAnimationFrame(fitAllSessions);
});

newTerminalButton.addEventListener("click", createSession);
emptyNewButton.addEventListener("click", createSession);

petToggleButton.addEventListener("click", async () => {
  const next = !petEnabled;
  const enabled = await window.terminalDeck.setPetEnabled(next);
  setPetToggleUi(enabled);
  if (enabled) syncPetStatus({ mood: "happy" });
});

window.terminalDeck.onPetState((payload) => {
  setPetToggleUi(payload && payload.enabled);
});

window.terminalDeck.onPetRequestNewTerminal(() => {
  createSession();
});

window.terminalDeck.getPetState().then((state) => {
  if (state) setPetToggleUi(state.enabled);
}).catch(() => {});

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
