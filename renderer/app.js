const grid = document.getElementById("terminalGrid");
const emptyState = document.getElementById("emptyState");
const sessionCount = document.getElementById("sessionCount");
const workspaceButton = document.getElementById("workspaceButton");
const workspacePath = document.getElementById("workspacePath");
const gitBranchControl = document.getElementById("gitBranchControl");
const gitBranchSelect = document.getElementById("gitBranchSelect");
const shellSelect = document.getElementById("shellSelect");
const remoteAgentSelect = document.getElementById("remoteAgentSelect");
const layoutSelect = document.getElementById("layoutSelect");
const skinShopButton = document.getElementById("skinShopButton");
const customSkinButton = document.getElementById("customSkinButton");
const glassControl = document.getElementById("glassControl");
const glassSlider = document.getElementById("glassSlider");
const glassValue = document.getElementById("glassValue");
const newTerminalButton = document.getElementById("newTerminalButton");
const emptyNewButton = document.getElementById("emptyNewButton");
const contextMenu = document.getElementById("terminalContextMenu");
const petToggleButton = document.getElementById("petToggleButton");
const petToggleLabel = document.getElementById("petToggleLabel");
const ultraToggleButton = document.getElementById("ultraToggleButton");
const ultraToggleLabel = document.getElementById("ultraToggleLabel");
const mcpSetupButton = document.getElementById("mcpSetupButton");
const mcpAgentMenu = document.getElementById("mcpAgentMenu");
const sshDialog = document.getElementById("sshDialog");
const sshForm = document.getElementById("sshForm");
const sshHost = document.getElementById("sshHost");
const sshPort = document.getElementById("sshPort");
const sshUser = document.getElementById("sshUser");
const sshAuthMethod = document.getElementById("sshAuthMethod");
const sshAuthPasswordBlock = document.getElementById("sshAuthPasswordBlock");
const sshAuthKeyBlock = document.getElementById("sshAuthKeyBlock");
const sshPassword = document.getElementById("sshPassword");
const sshPassphrase = document.getElementById("sshPassphrase");
const sshRemoteRoot = document.getElementById("sshRemoteRoot");
const sshAgentLaunch = document.getElementById("sshAgentLaunch");
const sshAgentEnabled = document.getElementById("sshAgentEnabled");
const sshAgentOptions = document.getElementById("sshAgentOptions");
const sshAgentDetectionText = document.getElementById("sshAgentDetectionText");
const sshAgentRefresh = document.getElementById("sshAgentRefresh");
const sshIdentity = document.getElementById("sshIdentity");
const sshIdentityDrop = document.getElementById("sshIdentityDrop");
const sshIdentityPick = document.getElementById("sshIdentityPick");
const sshIdentityClear = document.getElementById("sshIdentityClear");
const sshAuthHint = document.getElementById("sshAuthHint");
const sshFormError = document.getElementById("sshFormError");
const sshRecents = document.getElementById("sshRecents");
const sshRecentsList = document.getElementById("sshRecentsList");
const sshConnectButton = document.getElementById("sshConnectButton");
const sshConnectButtonLabel = document.getElementById("sshConnectButtonLabel");
const sshConnectButtonSidebar = document.getElementById("sshConnectButtonSidebar");
const emptySshButton = document.getElementById("emptySshButton");
let petEnabled = false;

const SSH_RECENTS_KEY = "terminal-deck-ssh-recents";
const SSH_RECENTS_MAX = 12;
const REMOTE_AGENT_DEFINITIONS = Object.freeze({
  codex: { id: "codex", label: "Codex", command: "codex" },
  grok: { id: "grok", label: "Grok", command: "grok" },
  claude: { id: "claude", label: "Claude Code", command: "claude" },
});
let sshAgentDetectionRun = 0;
/** @type {null | ((value: object | null) => void)} */
let sshDialogResolve = null;

/**
 * Ultra 模式（静默）：
 * 开启后用户仍只在终端里打自己的话；回车/粘贴时在后台把系统护栏提示拼在前面发给 AI。
 * 界面不展示提示词，也不出现额外输入框。
 */
const ULTRA_STORAGE_KEY = "terminal-deck-ultra-mode";
const ULTRA_SYSTEM_PROMPT =
  "【系统护栏 / Ultra】保持原本逻辑。修改当前功能时，先检查：如果改了此处，会不会导致其他功能出现 bug 或回归。" +
  "有风险先说明影响面，再做最小必要改动；改完列出可能受影响的位置与自检项。";

let ultraMode = false;
try {
  ultraMode = localStorage.getItem(ULTRA_STORAGE_KEY) === "1";
} catch {
  ultraMode = false;
}
/** 图片皮肤通透度 0–100（越低背景越清晰） */
let glassLevel = typeof loadGlassLevel === "function" ? loadGlassLevel() : 22;

/**
 * Grok / Claude / Codex 等全屏 TUI 会用 OSC 11 与 SGR 背景色把 xterm 单元格涂成不透明，
 * 盖住图片皮肤的通透效果。图片皮肤开启时剥掉「设置背景」序列，让单元格走 theme.background（带 alpha）。
 */
function createGlassOutputFilter() {
  let pending = "";

  function stripSgrBackgrounds(body) {
    if (!body) return "";
    // 顶层用 `;` 分段；段内 `:` 为 ITU 子参数（如 48:2::R:G:B）
    const top = String(body).split(";");
    const out = [];

    const takeSemicolonColor = (startIndex, into) => {
      // 消费 mode + (5 → 1 索引 | 2 → 3 通道)
      const mode = Number(top[startIndex + 1]);
      if (mode === 5 && startIndex + 2 < top.length) {
        if (into) into.push(top[startIndex], top[startIndex + 1], top[startIndex + 2]);
        return startIndex + 2;
      }
      if (mode === 2 && startIndex + 4 < top.length) {
        if (into) {
          into.push(
            top[startIndex],
            top[startIndex + 1],
            top[startIndex + 2],
            top[startIndex + 3],
            top[startIndex + 4]
          );
        }
        return startIndex + 4;
      }
      if (into) into.push(top[startIndex]);
      return startIndex;
    };

    for (let i = 0; i < top.length; i += 1) {
      const seg = top[i];
      const colon = seg.indexOf(":");
      const head = colon === -1 ? seg : seg.slice(0, colon);
      const n = Number(head);

      // 标准/亮色背景、默认背景
      if ((n >= 40 && n <= 47) || (n >= 100 && n <= 107) || n === 49) continue;

      // 48… 背景（colon 整段自洽；semicolon 后跟 5/n 或 2/r/g/b）
      if (n === 48) {
        if (colon !== -1) continue;
        i = takeSemicolonColor(i, null);
        continue;
      }

      // 38… 前景 / 58… 下划线色：必须整组保留，否则会拆坏真彩序列
      if (n === 38 || n === 58) {
        if (colon !== -1) {
          out.push(seg);
          continue;
        }
        i = takeSemicolonColor(i, out);
        continue;
      }

      out.push(seg);
    }

    return out.join(";");
  }

  function stripComplete(text) {
    // OSC 11：设置默认背景（查询 11;? 保留）
    text = text.replace(
      /\u001b\]11;([^\u0007\u001b\u009c]*)(?:\u0007|\u001b\\|\u009c)/g,
      (match, payload) => {
        const p = String(payload || "").trim();
        if (p === "?" || p.startsWith("?")) return match;
        return "";
      }
    );

    // SGR：剥掉背景参数，保留前景/粗体等
    text = text.replace(/\u001b\[([0-9;:]*)m/g, (match, body) => {
      if (!body) return match;
      const next = stripSgrBackgrounds(body);
      if (next === body) return match;
      if (!next) return "";
      return `\u001b[${next}m`;
    });

    return text;
  }

  function splitIncomplete(s) {
    const lastEsc = s.lastIndexOf("\u001b");
    if (lastEsc === -1) return { emit: s, hold: "" };
    const tail = s.slice(lastEsc);
    if (tail.startsWith("\u001b]")) {
      if (/\u0007|\u001b\\|\u009c/.test(tail)) return { emit: s, hold: "" };
      return { emit: s.slice(0, lastEsc), hold: tail };
    }
    if (tail.startsWith("\u001b[")) {
      // CSI 终结符 0x40–0x7E
      if (/[\x40-\x7e]/.test(tail.slice(2))) return { emit: s, hold: "" };
      return { emit: s.slice(0, lastEsc), hold: tail };
    }
    if (tail === "\u001b") return { emit: s.slice(0, lastEsc), hold: tail };
    return { emit: s, hold: "" };
  }

  return function filter(chunk, stripBg) {
    const { emit, hold } = splitIncomplete(pending + String(chunk || ""));
    pending = hold;
    if (!emit) return "";
    return stripBg ? stripComplete(emit) : emit;
  };
}

const sessions = new Map();
let activeId = null;
let sequence = 1;
let defaultWorkspace = "G:\\myday";
let contextTargetId = null;
/** 拖动调整尺寸时跳过 ResizeObserver，避免 fit 抖动/循环 */
let isResizingPane = false;
/** 网格轨道权重（fr），拖动分割时调整；仅行列数变化时重置为均分 */
let colTracks = [1];
let rowTracks = [1];
let gridCols = 1;
let gridRows = 1;
const MIN_TRACK_FR = 0.15;
const GRID_GAP_PX = 4;
/** 全量 fit 防抖，避免开第 N 个终端时对已有会话连打多次 PTY resize（TUI 会乱） */
let fitAllTimer = 0;
const FIT_DEBOUNCE_MS = 48;

/** 当前皮肤 id + xterm 主题（由 skins.js 驱动） */
let currentSkinId = typeof loadSavedSkinId === "function" ? loadSavedSkinId() : "matrix";
let customSkinImage = typeof loadCustomImage === "function" ? loadCustomImage() : "";
let currentXtermTheme =
  typeof applySkinToDocument === "function"
    ? applySkinToDocument(currentSkinId, { customImage: customSkinImage })
    : null;

function isCurrentImageSkin() {
  const skin = typeof getSkin === "function" ? getSkin(currentSkinId) : null;
  if (typeof isImageSkinId === "function") return isImageSkinId(currentSkinId, skin);
  return (
    currentSkinId === "wallpaper" ||
    Boolean(skin && skin.ui && skin.ui.backgroundImage)
  );
}

function syncGlassControlUi() {
  const show = isCurrentImageSkin();
  if (glassControl) glassControl.hidden = !show;
  if (glassSlider) glassSlider.value = String(glassLevel);
  if (glassValue) glassValue.textContent = String(glassLevel);
}

function refreshTerminalTheme(session, theme) {
  if (!session || !session.terminal || !theme) return;
  session.terminal.options.theme = { ...theme };
  try {
    session.terminal.refresh(0, Math.max(0, session.terminal.rows - 1));
  } catch {
    // ignore
  }
}

/** 当前面板用较高 alpha，其余更透，多开时背景图能从 inactive 透出 */
function applyXtermGlassByFocus() {
  if (!currentXtermTheme || !isCurrentImageSkin()) return;
  const glass = currentXtermTheme._glass;
  if (!glass || typeof makeRgba !== "function") {
    for (const session of sessions.values()) {
      refreshTerminalTheme(session, currentXtermTheme);
    }
    return;
  }
  const activeBg = makeRgba(glass.xtermAlpha);
  const inactiveBg = makeRgba(glass.xtermAlphaInactive);
  for (const [sessionId, session] of sessions) {
    const bg = sessionId === activeId ? activeBg : inactiveBg;
    refreshTerminalTheme(session, { ...currentXtermTheme, background: bg });
  }
}

function applyCurrentSkin() {
  if (typeof applySkinToDocument !== "function") return;
  // 图片预设皮肤自带 backgroundImage；wallpaper 用自定义图
  const imageSkin = isCurrentImageSkin();
  currentXtermTheme = applySkinToDocument(currentSkinId, {
    customImage: imageSkin ? customSkinImage : "",
    glassLevel,
    sessionCount: sessions.size,
  });
  if (imageSkin) {
    applyXtermGlassByFocus();
  } else {
    for (const session of sessions.values()) {
      refreshTerminalTheme(session, currentXtermTheme);
    }
  }
  syncGlassControlUi();
}

function setSkin(skinId) {
  currentSkinId = skinId || "matrix";
  if (typeof saveSkinId === "function") saveSkinId(currentSkinId);
  applyCurrentSkin();
  if (window.skinShop && typeof window.skinShop.refresh === "function" && window.skinShop.isOpen()) {
    window.skinShop.refresh();
  }
}

/** 皮肤商城 ↔ app 桥接 */
window.__getCurrentSkinId = () => currentSkinId;
window.__hasCustomSkinImage = () => Boolean(customSkinImage);
window.__getCustomSkinPreview = () => customSkinImage || "";
window.__applySkinFromShop = (skinId) => {
  setSkin(skinId);
};
window.__uploadSkinFromShop = async () => {
  if (!window.terminalDeck.chooseSkinImage) return;
  const result = await window.terminalDeck.chooseSkinImage();
  if (!result) return;
  if (result.error) {
    window.alert(result.error);
    return;
  }
  if (!result.dataUrl) return;
  customSkinImage = result.dataUrl;
  const saved = typeof saveCustomImage === "function" ? saveCustomImage(customSkinImage) : true;
  setSkin("wallpaper");
  if (window.skinShop && typeof window.skinShop.refresh === "function") {
    window.skinShop.refresh();
  }
  if (!saved) {
    window.alert("图片已应用，但太大无法记住（请换更小的图，建议 2MB 以内）");
  }
};

function setGlassLevel(level) {
  const next = Math.min(100, Math.max(0, Math.round(Number(level) || 0)));
  glassLevel = next;
  if (typeof saveGlassLevel === "function") saveGlassLevel(glassLevel);
  syncGlassControlUi();
  if (isCurrentImageSkin()) applyCurrentSkin();
}

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

/**
 * 静默拼装：系统护栏 + 用户正文（用户界面不展示系统段）。
 * @param {string} userText
 * @param {{ enter?: boolean }} [options] enter=true 时用 \\r 结尾（终端回车）
 */
function buildUltraPayload(userText, options = {}) {
  const body = String(userText || "").replace(/^\uFEFF/, "");
  const trimmed = body.trim();
  if (!trimmed) return "";
  // 已含护栏标记则不再重复
  if (trimmed.includes("【系统护栏 / Ultra】") || trimmed.startsWith("【系统护栏")) {
    if (options.enter) return trimmed.endsWith("\r") || trimmed.endsWith("\n") ? trimmed : `${trimmed}\r`;
    return body.endsWith("\n") ? body : `${body}\n`;
  }
  const payload = `${ULTRA_SYSTEM_PROMPT}\n\n${trimmed}`;
  if (options.enter) return `${payload}\r`;
  return payload.endsWith("\n") ? payload : `${payload}\n`;
}

function setUltraMode(on) {
  ultraMode = Boolean(on);
  try {
    localStorage.setItem(ULTRA_STORAGE_KEY, ultraMode ? "1" : "0");
  } catch {
    // ignore
  }
  document.body.classList.toggle("ultra-on", ultraMode);
  if (ultraToggleButton) {
    ultraToggleButton.classList.toggle("active", ultraMode);
    ultraToggleButton.setAttribute("aria-pressed", ultraMode ? "true" : "false");
    ultraToggleButton.title = ultraMode
      ? "Ultra 已开：你只打自己的话，回车/粘贴时在后台静默附带护栏提示（界面不显示提示词）"
      : "开启 Ultra：静默附带「先查回归」系统提示，不弹出输入框";
  }
  if (ultraToggleLabel) {
    ultraToggleLabel.textContent = ultraMode ? "Ultra 开" : "Ultra";
  }
  // 关闭时把各会话未提交的本地缓冲直接交给 PTY，避免丢字
  if (!ultraMode) {
    for (const session of sessions.values()) {
      flushUltraBufferToPty(session, { withPrompt: false });
    }
  }
}

function pasteClipboard(session) {
  if (!session) return;
  let text = window.terminalDeck.readClipboard();
  if (!text) return;
  // Ultra：粘贴内容在后台加护栏，终端里用户仍只「感到」自己在贴自己的字
  // 若缓冲里已有半行，先并入再统一发送
  if (ultraMode) {
    const pending = session.ultraBuffer || "";
    session.ultraBuffer = "";
    const merged = pending + text;
    // 清掉本地回显的半行（用退格），再整段写入 PTY
    eraseUltraLocalEcho(session, pending.length);
    window.terminalDeck.write(session.id, buildUltraPayload(merged));
    return;
  }
  window.terminalDeck.write(session.id, text);
}

/** 擦除 Ultra 本地回显的字符（未进 PTY 的那一行） */
function eraseUltraLocalEcho(session, count) {
  if (!session || !session.terminal || count <= 0) return;
  try {
    session.terminal.write("\b \b".repeat(count));
  } catch {
    // ignore
  }
}

/**
 * 把会话缓冲交给 PTY。withPrompt=true 时静默加系统护栏。
 */
function flushUltraBufferToPty(session, options = {}) {
  if (!session) return;
  const buf = session.ultraBuffer || "";
  session.ultraBuffer = "";
  if (!buf) return;
  const withPrompt = options.withPrompt !== false && ultraMode;
  if (withPrompt) {
    // 用户已在屏幕上看到自己的字（本地回显）；整段重写前先擦掉本地回显
    eraseUltraLocalEcho(session, buf.length);
    window.terminalDeck.write(session.id, buildUltraPayload(buf, { enter: Boolean(options.enter) }));
  } else {
    window.terminalDeck.write(session.id, options.enter ? `${buf}\r` : buf);
  }
}

/**
 * Ultra 开启时拦截终端按键：本地回显用户输入，回车时静默附加系统提示再写入 PTY。
 * 关闭时原样透传。
 */
function handleTerminalUserInput(session, data) {
  if (!session) return;
  if (!ultraMode) {
    window.terminalDeck.write(session.id, data);
    return;
  }

  if (session.ultraBuffer == null) session.ultraBuffer = "";

  // Ctrl+C：清空缓冲并透传中断
  if (data === "\x03") {
    const n = session.ultraBuffer.length;
    session.ultraBuffer = "";
    eraseUltraLocalEcho(session, n);
    window.terminalDeck.write(session.id, data);
    return;
  }

  // 回车：静默带护栏发送
  if (data === "\r" || data === "\n") {
    if (!session.ultraBuffer.trim()) {
      // 空行：直接回车，不套提示词
      window.terminalDeck.write(session.id, "\r");
      return;
    }
    flushUltraBufferToPty(session, { withPrompt: true, enter: true });
    return;
  }

  // 退格
  if (data === "\x7f" || data === "\b") {
    if (session.ultraBuffer.length > 0) {
      session.ultraBuffer = session.ultraBuffer.slice(0, -1);
      try {
        session.terminal.write("\b \b");
      } catch {
        // ignore
      }
    }
    return;
  }

  // 其他控制序列（方向键等）：先冲掉缓冲再透传，避免和 TUI 冲突
  if (data.length > 0 && data.charCodeAt(0) < 32 && data !== "\t") {
    flushUltraBufferToPty(session, { withPrompt: false, enter: false });
    window.terminalDeck.write(session.id, data);
    return;
  }
  // ESC 序列（方向键 CSI）
  if (data.startsWith("\x1b")) {
    flushUltraBufferToPty(session, { withPrompt: false, enter: false });
    window.terminalDeck.write(session.id, data);
    return;
  }

  // 普通字符：只进缓冲 + 本地回显（不进 PTY，回车时再带提示词一次写入）
  session.ultraBuffer += data;
  try {
    session.terminal.write(data);
  } catch {
    // ignore
  }
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
  // 图片皮肤间距已固定，不再随数量改 gap（3→4 时改 gap 会触发全局 reflow，TUI 边框乱）
}

function setActive(id) {
  activeId = id;
  for (const [sessionId, session] of sessions) {
    session.element.classList.toggle("active", sessionId === id);
  }
  applyXtermGlassByFocus();
  const active = sessions.get(id);
  if (active) active.terminal.focus();
}

/**
 * 按 DOM 尺寸 fit xterm，仅在 cols/rows 真正变化时通知 ConPTY。
 * 重复 resize 会打乱 Grok/Claude 等全屏 TUI 的边框绘制。
 * 2→1 分屏变宽时若未配置 windowsPty，xterm 会对 ConPTY 缓冲错误 reflow 导致乱字。
 */
function fitSession(session, options = {}) {
  if (!session || !document.body.contains(session.element)) return;
  if (isResizingPane && !options.force) return;
  try {
    const host = session.element.querySelector(".terminal-host");
    if (host && (host.clientWidth < 20 || host.clientHeight < 20)) return;

    const prevCols = session.terminal.cols;
    const prevRows = session.terminal.rows;
    session.fitAddon.fit();
    const cols = session.terminal.cols;
    const rows = session.terminal.rows;
    if (cols <= 1 || rows <= 1) return;

    const dimsChanged = cols !== prevCols || rows !== prevRows;

    // 与上次通知 ConPTY 的尺寸相同则跳过（避免 SIGWINCH 把 Grok 等 TUI 边框画花）
    if (
      !options.force &&
      session.lastPtyCols === cols &&
      session.lastPtyRows === rows
    ) {
      // 布局变了但 PTY 尺寸未变时仍刷新画面（避免 canvas 拉伸残影）
      if (dimsChanged) {
        try {
          session.terminal.refresh(0, Math.max(0, rows - 1));
        } catch {
          // ignore
        }
      }
      return;
    }

    session.lastPtyCols = cols;
    session.lastPtyRows = rows;
    window.terminalDeck.resize(session.id, cols, rows);

    // 行列变化后强制重绘，减少分屏合并时的花屏/叠字
    if (dimsChanged || options.force) {
      try {
        session.terminal.refresh(0, Math.max(0, rows - 1));
      } catch {
        // ignore
      }
    }
  } catch {
    // The pane may be between layout states.
  }
}

function fitAllSessions(options = {}) {
  for (const session of sessions.values()) fitSession(session, options);
}

function scheduleFitAllSessions(options = {}) {
  if (fitAllTimer) window.clearTimeout(fitAllTimer);
  fitAllTimer = window.setTimeout(() => {
    fitAllTimer = 0;
    fitAllSessions(options);
  }, FIT_DEBOUNCE_MS);
}

function scheduleFitSession(session) {
  if (!session) return;
  if (session._fitTimer) window.clearTimeout(session._fitTimer);
  session._fitTimer = window.setTimeout(() => {
    session._fitTimer = 0;
    fitSession(session);
  }, FIT_DEBOUNCE_MS);
}

function getLayoutMode() {
  return layoutSelect.value || "auto";
}

/**
 * 根据终端数量计算行列，让所有终端铺满可视区域。
 * auto：1→1x1, 2→2x1, 3→2x2(空一格), 4→2x2, 5~6→3x2, 7~9→3x3 …
 * 注意：3 与 4 同为 2x2，开第 4 个只填空位，不应重置轨道比例。
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
 * 行列数未变时保留用户拖动的分割比例，避免已有终端被无故缩放。
 */
function relayoutGrid(options = {}) {
  const count = sessions.size;
  const mode = getLayoutMode();
  const shape = computeGridShape(count, mode);
  const shapeChanged = shape.cols !== gridCols || shape.rows !== gridRows;

  gridCols = shape.cols;
  gridRows = shape.rows;

  if (shapeChanged || options.resetTracks) {
    colTracks = Array.from({ length: gridCols }, () => 1);
    rowTracks = Array.from({ length: gridRows }, () => 1);
  } else {
    // 补齐/裁剪轨道长度（极少见：mode 不变但算法微调）
    while (colTracks.length < gridCols) colTracks.push(1);
    while (rowTracks.length < gridRows) rowTracks.push(1);
    if (colTracks.length > gridCols) colTracks = colTracks.slice(0, gridCols);
    if (rowTracks.length > gridRows) rowTracks = rowTracks.slice(0, gridRows);
  }

  applyTrackStyles();
  updatePaneEdgeClasses();

  // 等布局稳定后一次性 fit，避免 ResizeObserver 连环触发
  // close 导致 2→1 形状剧变时传 force，确保最终尺寸写入 ConPTY
  const fitOptions = options.fitOptions || {};
  requestAnimationFrame(() => {
    requestAnimationFrame(() => scheduleFitAllSessions(fitOptions));
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
  if (session._fitTimer) {
    window.clearTimeout(session._fitTimer);
    session._fitTimer = 0;
  }
  session.resizeObserver.disconnect();
  window.terminalDeck.close(id);
  session.terminal.dispose();
  session.element.remove();
  sessions.delete(id);
  refreshRemoteAgentOptions();
  if (activeId === id) {
    const remaining = [...sessions.keys()];
    activeId = remaining.length ? remaining[remaining.length - 1] : null;
    if (activeId) setActive(activeId);
  }
  updateSessionCount();
  // 2→1 等形状剧变：force fit，避免中间尺寸写进 ConPTY / 错误 reflow 叠字
  relayoutGrid({ fitOptions: { force: true } });
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

function shellDisplayTitle(shell, result) {
  if (shell === "ssh") {
    return (result && result.ssh && result.ssh.label) || "SSH";
  }
  if (shell === "git-bash") return "Git Bash";
  if (shell === "cmd") return "CMD";
  return "PowerShell";
}

function loadSshRecents() {
  try {
    const raw = localStorage.getItem(SSH_RECENTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((item) => item && item.host) : [];
  } catch {
    return [];
  }
}

function saveSshRecent(conn) {
  if (!conn || !conn.host) return;
  const next = {
    host: String(conn.host),
    port: Number(conn.port) || 22,
    user: String(conn.user || ""),
    authMethod: String(conn.authMethod || "password"),
    identityFile: String(conn.identityFile || ""),
    remoteRoot: String(conn.remoteRoot || ""),
    launchAgent: REMOTE_AGENT_DEFINITIONS[conn.launchAgent] ? String(conn.launchAgent) : "",
  };
  const list = loadSshRecents().filter(
    (item) =>
      !(
        item.host === next.host &&
        Number(item.port || 22) === next.port &&
        String(item.user || "") === next.user &&
        String(item.authMethod || "password") === next.authMethod &&
        String(item.identityFile || "") === next.identityFile
      )
  );
  list.unshift(next);
  try {
    localStorage.setItem(SSH_RECENTS_KEY, JSON.stringify(list.slice(0, SSH_RECENTS_MAX)));
  } catch {
    // ignore quota errors
  }
}

function syncSshAuthMethodUi() {
  const method = sshAuthMethod?.value || "password";
  if (sshAuthPasswordBlock) sshAuthPasswordBlock.hidden = method !== "password";
  if (sshAuthKeyBlock) sshAuthKeyBlock.hidden = method !== "key";
  if (sshAuthHint) {
    if (method === "key") {
      sshAuthHint.textContent =
        "秘钥登录：加载私钥文件，并在「秘钥密码」填写私钥加密口令（出现 Enter passphrase for key 时必填，不是服务器登录密码）。";
    } else if (method === "ask") {
      sshAuthHint.textContent =
        "每次询问：连接后在终端内手动输入密码或秘钥口令，不自动填写。";
    } else {
      sshAuthHint.textContent =
        "密码登录：可预填登录密码自动应答；密码仅保存在本次运行的内存中，不会写入最近连接。";
    }
  }
}

function selectedSshAgentId() {
  if (!sshAgentEnabled?.checked || !sshAgentOptions) return "";
  return String(sshAgentOptions.querySelector('input[name="launchAgent"]:checked')?.value || "");
}

function setSshAgentChoiceState(agentId, available, detail) {
  const choice = sshAgentOptions?.querySelector(`[data-ssh-agent="${agentId}"]`);
  const input = choice?.querySelector('input[type="radio"]');
  const status = choice?.querySelector("small");
  if (!choice || !input || !status) return;
  input.disabled = !available;
  if (!available) input.checked = false;
  choice.classList.toggle("is-available", available);
  choice.classList.toggle("is-missing", !available);
  status.textContent = detail || (available ? "可用" : "未安装");
}

async function refreshSshAgentDetection(preferredAgent = selectedSshAgentId()) {
  if (!sshAgentEnabled?.checked || !sshAgentOptions) return;
  const run = ++sshAgentDetectionRun;
  if (sshAgentDetectionText) sshAgentDetectionText.textContent = "正在检测本机 Agent…";
  if (sshAgentRefresh) sshAgentRefresh.disabled = true;
  for (const agentId of Object.keys(REMOTE_AGENT_DEFINITIONS)) {
    setSshAgentChoiceState(agentId, false, "检测中…");
  }
  try {
    const statuses = await window.terminalDeck.getMcpAgentStatus();
    if (run !== sshAgentDetectionRun || !sshAgentEnabled.checked) return;
    const available = [];
    for (const status of statuses || []) {
      const isAvailable = Boolean(status.available);
      setSshAgentChoiceState(status.id, isAvailable, isAvailable ? "已检测到" : "未检测到");
      if (isAvailable) available.push(status.id);
    }
    const next = available.includes(preferredAgent) ? preferredAgent : available[0] || "";
    const input = next
      ? sshAgentOptions.querySelector(`input[name="launchAgent"][value="${next}"]`)
      : null;
    if (input) input.checked = true;
    if (sshConnectButtonLabel) {
      const label = next ? REMOTE_AGENT_DEFINITIONS[next]?.label : "Agent";
      sshConnectButtonLabel.textContent = `连接并启动 ${label}`;
    }
    if (sshAgentDetectionText) {
      sshAgentDetectionText.textContent = available.length
        ? `检测到 ${available.length} 个可用 Agent，连接后将在右侧启动`
        : "没有检测到可启动的 Agent";
    }
  } catch {
    if (run !== sshAgentDetectionRun) return;
    if (sshAgentDetectionText) sshAgentDetectionText.textContent = "Agent 检测失败，请重新检测";
    for (const agentId of Object.keys(REMOTE_AGENT_DEFINITIONS)) {
      setSshAgentChoiceState(agentId, false, "检测失败");
    }
  } finally {
    if (run === sshAgentDetectionRun && sshAgentRefresh) sshAgentRefresh.disabled = false;
  }
}

function syncSshAgentLaunchUi(options = {}) {
  const enabled = Boolean(sshAgentEnabled?.checked);
  if (sshAgentLaunch) sshAgentLaunch.classList.toggle("is-enabled", enabled);
  if (sshAgentOptions) sshAgentOptions.hidden = !enabled;
  if (sshConnectButtonLabel) {
    const selected = selectedSshAgentId();
    const label = selected ? REMOTE_AGENT_DEFINITIONS[selected]?.label : "Agent";
    sshConnectButtonLabel.textContent = enabled ? `连接并启动 ${label}` : "连接";
  }
  if (enabled && options.detect !== false) {
    refreshSshAgentDetection(options.preferredAgent || selectedSshAgentId()).then(() => {
      if (sshConnectButtonLabel && sshAgentEnabled.checked) {
        const selected = selectedSshAgentId();
        const label = selected ? REMOTE_AGENT_DEFINITIONS[selected]?.label : "Agent";
        sshConnectButtonLabel.textContent = `连接并启动 ${label}`;
      }
    });
  } else if (!enabled) {
    sshAgentDetectionRun += 1;
  }
}

function setSshIdentityPath(filePath) {
  if (!sshIdentity) return;
  sshIdentity.value = filePath ? String(filePath) : "";
  if (sshIdentityClear) sshIdentityClear.hidden = !sshIdentity.value;
  if (sshIdentityDrop) sshIdentityDrop.classList.toggle("has-file", Boolean(sshIdentity.value));
}

function setSshFormError(message) {
  if (!sshFormError) return;
  if (!message) {
    sshFormError.hidden = true;
    sshFormError.textContent = "";
    return;
  }
  sshFormError.hidden = false;
  sshFormError.textContent = message;
}

function fillSshForm(conn) {
  if (!sshHost) return;
  sshHost.value = conn && conn.host ? String(conn.host) : "";
  if (sshPort) sshPort.value = String((conn && Number(conn.port)) || 22);
  if (sshUser) sshUser.value = conn && conn.user ? String(conn.user) : "";
  if (sshPassword) sshPassword.value = "";
  if (sshPassphrase) sshPassphrase.value = "";
  if (sshRemoteRoot) {
    sshRemoteRoot.value = conn && conn.remoteRoot ? String(conn.remoteRoot) : "";
  }
  const method =
    conn && conn.authMethod
      ? String(conn.authMethod)
      : conn && conn.identityFile
        ? "key"
        : "password";
  if (sshAuthMethod) sshAuthMethod.value = ["password", "key", "ask"].includes(method) ? method : "password";
  setSshIdentityPath(conn && conn.identityFile ? String(conn.identityFile) : "");
  syncSshAuthMethodUi();
  const preferredAgent = REMOTE_AGENT_DEFINITIONS[conn?.launchAgent] ? String(conn.launchAgent) : "";
  if (sshAgentEnabled) sshAgentEnabled.checked = Boolean(preferredAgent);
  if (preferredAgent && sshAgentOptions) {
    const input = sshAgentOptions.querySelector(
      `input[name="launchAgent"][value="${preferredAgent}"]`
    );
    if (input) input.checked = true;
  }
  syncSshAgentLaunchUi({ preferredAgent });
  setSshFormError("");
}

function renderSshRecents() {
  if (!sshRecents || !sshRecentsList) return;
  const list = loadSshRecents();
  sshRecentsList.innerHTML = "";
  if (!list.length) {
    sshRecents.hidden = true;
    return;
  }
  sshRecents.hidden = false;
  for (const item of list) {
    const port = Number(item.port) || 22;
    const target = item.user ? `${item.user}@${item.host}` : item.host;
    const label = port === 22 ? target : `${target}:${port}`;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ssh-recent-item";
    const method = item.authMethod || (item.identityFile ? "key" : "password");
    const authTitle =
      method === "key" && item.identityFile
        ? `秘钥: ${item.identityFile}`
        : method === "ask"
          ? "每次询问"
          : "密码登录";
    const recentAgent = REMOTE_AGENT_DEFINITIONS[item.launchAgent]?.label;
    btn.title = recentAgent ? `${authTitle} · 启动 ${recentAgent}` : authTitle;
    const labelSpan = document.createElement("span");
    labelSpan.className = "ssh-recent-label";
    labelSpan.textContent = label;
    btn.appendChild(labelSpan);
    if (method === "key" || item.identityFile) {
      const keySpan = document.createElement("span");
      keySpan.className = "ssh-recent-key";
      keySpan.title = "使用私钥";
      keySpan.textContent = "🔑";
      btn.appendChild(keySpan);
    }
    btn.addEventListener("click", () => fillSshForm(item));
    li.appendChild(btn);
    sshRecentsList.appendChild(li);
  }
}

function closeSshDialog(result) {
  if (!sshDialog) return;
  sshDialog.hidden = true;
  sshDialog.classList.remove("is-open");
  if (sshPassword) sshPassword.value = "";
  if (sshPassphrase) sshPassphrase.value = "";
  const resolve = sshDialogResolve;
  sshDialogResolve = null;
  if (resolve) resolve(result);
}

function openSshDialog() {
  return new Promise((resolve) => {
    if (!sshDialog || !sshForm) {
      resolve(null);
      return;
    }
    if (sshDialogResolve) {
      // 已有未完成的对话框：先取消上一次
      closeSshDialog(null);
    }
    sshDialogResolve = resolve;
    const recents = loadSshRecents();
    fillSshForm(recents[0] || { host: "", port: 22, user: "", identityFile: "" });
    renderSshRecents();
    sshDialog.hidden = false;
    // 下一帧再加 is-open，触发过渡
    requestAnimationFrame(() => {
      sshDialog.classList.add("is-open");
      if (sshHost) sshHost.focus();
    });
  });
}

async function promptSshConnection() {
  try {
    const probe = await window.terminalDeck.probeSsh();
    if (!probe || !probe.ok) {
      window.alert(
        "未找到 OpenSSH 客户端。请在 Windows 设置 → 系统 → 可选功能中安装 OpenSSH 客户端。"
      );
      return null;
    }
  } catch {
    window.alert("无法检测 OpenSSH 客户端，请检查应用安装是否完整。");
    return null;
  }
  return openSshDialog();
}

/** 侧栏 / 空状态的显式 SSH 入口 */
function connectSshSession() {
  if (shellSelect) shellSelect.value = "ssh";
  return createSession({ shell: "ssh" });
}

function readSshFormValues() {
  const host = String(sshHost?.value || "").trim();
  let port = Number(sshPort?.value);
  if (!Number.isFinite(port) || port <= 0) port = 22;
  const user = String(sshUser?.value || "").trim();
  const authMethod = String(sshAuthMethod?.value || "password");
  const password = String(sshPassword?.value || "");
  const passphrase = String(sshPassphrase?.value || "");
  const remoteRoot = String(sshRemoteRoot?.value || "").trim();
  const identityFile = String(sshIdentity?.value || "").trim();
  const launchAgent = selectedSshAgentId();
  return {
    host,
    port,
    user,
    authMethod,
    password: authMethod === "password" && password ? password : undefined,
    passphrase: authMethod === "key" && passphrase ? passphrase : undefined,
    remoteRoot: remoteRoot || undefined,
    identityFile: authMethod === "key" || (authMethod === "ask" && identityFile) ? identityFile || undefined : undefined,
    launchAgent: launchAgent || undefined,
  };
}

function refreshRemoteAgentOptions(preferredId = null) {
  if (!remoteAgentSelect) return;
  const previous = preferredId == null ? remoteAgentSelect.value : String(preferredId || "");
  remoteAgentSelect.innerHTML = "";
  const localOption = document.createElement("option");
  localOption.value = "";
  localOption.textContent = "本机";
  remoteAgentSelect.appendChild(localOption);
  for (const session of sessions.values()) {
    if (session.shell !== "ssh" || !session.ssh?.bridgeReady) continue;
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = session.ssh.label || `SSH ${session.id}`;
    remoteAgentSelect.appendChild(option);
  }
  remoteAgentSelect.disabled = remoteAgentSelect.options.length <= 1;
  if ([...remoteAgentSelect.options].some((option) => option.value === previous)) {
    remoteAgentSelect.value = previous;
  } else {
    remoteAgentSelect.value = "";
  }
  window.terminalDeck.setMcpRemoteSession(remoteAgentSelect.value).catch(() => {});
}

async function launchAgentForRemoteSession(remoteSession, agentId) {
  const agent = REMOTE_AGENT_DEFINITIONS[agentId];
  if (!remoteSession || !agent) return null;
  if (!remoteSession.ssh?.bridgeReady) {
    window.alert("SSH 已连接，但远端 Agent 桥未就绪。请检查用户名和远端根目录后重试。");
    return null;
  }
  const remoteLabel = remoteSession.ssh?.label || "SSH 远端";
  const remoteStatus = remoteSession.element.querySelector(".pane-status");
  if (remoteStatus) remoteStatus.title = `正在配置并启动 ${agent.label}`;
  try {
    await window.terminalDeck.setMcpRemoteSession(remoteSession.id);
    const installed = await window.terminalDeck.installMcpForAgent(agent.id);
    if (!installed?.ok) throw new Error(installed?.error || `${agent.label} MCP 配置失败`);
    const agentSession = await createSession({
      shell: "powershell",
      remoteSessionId: remoteSession.id,
      startCommand: agent.command,
      agent: {
        id: agent.id,
        label: agent.label,
        remoteLabel,
      },
    });
    if (!agentSession) throw new Error(`${agent.label} 终端创建失败`);
    if (remoteStatus) remoteStatus.title = `远端已连接 · ${agent.label} 已在右侧启动`;
    return agentSession;
  } catch (error) {
    if (remoteStatus) remoteStatus.title = `${agent.label} 启动失败`;
    window.alert(
      `SSH 已连接，但 ${agent.label} 未能自动启动：\n${error?.message || error}\n\n你可以在顶部“Agent MCP”中重试。`
    );
    return null;
  }
}

async function createSession(options = {}) {
  // 启动时默认本地终端；options.shell 可强制指定（宠物请求等仍走下拉当前值）
  let shell = options.shell || shellSelect.value;
  let ssh = options.ssh || null;

  if (shell === "ssh" && !ssh) {
    ssh = await promptSshConnection();
    if (!ssh) return; // 用户取消
  }
  const launchAgent = shell === "ssh" && REMOTE_AGENT_DEFINITIONS[ssh?.launchAgent]
    ? String(ssh.launchAgent)
    : "";
  const sshConnection = ssh ? { ...ssh } : null;
  if (sshConnection) delete sshConnection.launchAgent;

  let result;
  try {
    result = await window.terminalDeck.create({
      shell,
      cwd: defaultWorkspace,
      cols: 100,
      rows: 30,
      ssh: shell === "ssh" ? sshConnection : undefined,
      remoteSessionId:
        shell === "ssh" || !remoteAgentSelect
          ? undefined
          : options.remoteSessionId || remoteAgentSelect.value || undefined,
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    window.alert(`创建终端失败：${message}`);
    return;
  }

  if (result && result.error) {
    window.alert(result.error);
    return;
  }
  if (!result || !result.id) {
    window.alert("创建终端失败：未知错误");
    return;
  }

  if (shell === "ssh" && ssh) {
    saveSshRecent({
      host: ssh.host,
      port: ssh.port,
      user: ssh.user,
      authMethod: ssh.authMethod || (result.ssh && result.ssh.authMethod) || "password",
      identityFile: ssh.identityFile || (result.ssh && result.ssh.identityFile) || "",
      remoteRoot: ssh.remoteRoot || (result.ssh && result.ssh.remoteRoot) || "",
      launchAgent,
    });
  }

  const number = sequence++;
  const title = options.agent
    ? `${options.agent.label} · 远端开发`
    : shellDisplayTitle(shell, result);
  const pathLabel =
    options.agent
      ? `MCP → ${options.agent.remoteLabel}`
      : shell === "ssh" && result.ssh
      ? result.ssh.label
      : result.cwd || defaultWorkspace;

  const element = document.createElement("section");
  element.className = "terminal-pane";
  if (shell === "ssh") element.classList.add("is-ssh");
  if (options.agent) element.classList.add("is-agent");
  element.dataset.terminalId = result.id;
  element.innerHTML = `
    <div class="pane-header">
      <span class="pane-index">${String(number).padStart(2, "0")}</span>
      <span class="pane-title"></span>
      <span class="pane-path"></span>
      <div class="pane-actions">
        <span class="pane-status" title="运行中"></span>
        <button class="icon-button maximize" type="button" title="放大或还原终端" aria-label="放大或还原">
          <span class="icon-glyph" aria-hidden="true">□</span>
        </button>
        <button class="icon-button close" type="button" title="关闭终端" aria-label="关闭">
          <span class="icon-glyph" aria-hidden="true">×</span>
        </button>
      </div>
    </div>
    <div class="terminal-host"></div>
    <div class="resize-handle resize-e" data-dir="e" title="拖动调整宽度"></div>
    <div class="resize-handle resize-s" data-dir="s" title="拖动调整高度"></div>
    <div class="resize-handle resize-se" data-dir="se" title="拖动调整大小"></div>
  `;
  const paneTitleEl = element.querySelector(".pane-title");
  paneTitleEl.textContent = title;
  paneTitleEl.title = title;
  const panePathEl = element.querySelector(".pane-path");
  panePathEl.textContent = pathLabel;
  panePathEl.title = pathLabel;
  grid.appendChild(element);

  // ConPTY 必须声明 windowsPty：否则分屏变宽时 xterm 会 Unix 式 reflow，中文/TUI 必乱
  const windowsPty =
    typeof window.terminalDeck.getWindowsPty === "function"
      ? window.terminalDeck.getWindowsPty()
      : null;

  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: "bar",
    fontFamily: "Cascadia Mono, Consolas, Microsoft YaHei UI, monospace",
    fontSize: 14,
    lineHeight: 1.12,
    scrollback: 50000,
    allowProposedApi: false,
    // 图片皮肤需要半透明背景；纯色皮肤仍用主题里的不透明色
    allowTransparency: true,
    ...(windowsPty ? { windowsPty } : {}),
    theme: currentXtermTheme || {
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
    ssh: result.ssh || null,
    agent: options.agent || null,
    element,
    terminal,
    fitAddon,
    resizeObserver: null,
    glassFilter: createGlassOutputFilter(),
  };
  sessions.set(result.id, session);
  if (shell === "ssh") refreshRemoteAgentOptions(result.id);
  bindResizeHandles(session);
  // 每新建一个终端：立刻按数量重算行列，全部铺满窗口
  relayoutGrid();

  // 双保险：图片皮肤下吞掉 TUI 的 OSC 11 设背景，避免盖住通透
  if (typeof terminal.registerOscHandler === "function") {
    terminal.registerOscHandler(11, (data) => {
      if (!isCurrentImageSkin()) return false;
      const payload = String(data || "").trim();
      if (payload === "?" || payload.startsWith("?")) return false;
      applyXtermGlassByFocus();
      return true;
    });
  }

  session.ultraBuffer = "";
  terminal.onData((data) => handleTerminalUserInput(session, data));
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

  session.lastPtyCols = 0;
  session.lastPtyRows = 0;
  session._fitTimer = 0;
  session.resizeObserver = new ResizeObserver(() => {
    if (isResizingPane) return;
    // 防抖：新建邻格时 DOM 会连跳几次，合并成一次 fit
    scheduleFitSession(session);
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

    // SSH 远程会话：粘贴本地路径通常无意义，仍允许（用户可能 scp/路径参考）
    const pathShell = shell === "ssh" ? "git-bash" : shell;
    const input = paths.map((filePath) => quoteDroppedPath(filePath, pathShell)).join(" ");
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
  if (options.startCommand) {
    window.setTimeout(() => {
      if (sessions.has(result.id)) window.terminalDeck.write(result.id, `${options.startCommand}\r`);
    }, 120);
  }
  // attach 后再 fit 一次，确保 PTY 行列与网格一致
  requestAnimationFrame(() => {
    requestAnimationFrame(fitAllSessions);
  });
  if (shell === "ssh" && launchAgent) {
    await launchAgentForRemoteSession(session, launchAgent);
  }
  return session;
}

window.terminalDeck.onData(({ id, data }) => {
  const session = sessions.get(id);
  if (!session) return;
  const stripBg = isCurrentImageSkin();
  const filtered =
    typeof session.glassFilter === "function" ? session.glassFilter(data, stripBg) : data;
  if (filtered) session.terminal.write(filtered);
});

window.terminalDeck.onExit(({ id, exitCode }) => {
  const session = sessions.get(id);
  if (!session) return;
  const status = session.element.querySelector(".pane-status");
  status.classList.add("exited");
  status.title = `进程已退出，代码 ${exitCode}`;
  session.terminal.write(`\r\n\x1b[33m[进程已退出，代码 ${exitCode}]\x1b[0m\r\n`);
});

/** Git 分支切换：仅本地 checkout，不拉取/推送 */
let gitBranchState = { isRepo: false, current: "", branches: [], detached: false };
let gitBranchBusy = false;
let gitErrorTimer = 0;

function clearGitBranchError() {
  if (gitErrorTimer) {
    clearTimeout(gitErrorTimer);
    gitErrorTimer = 0;
  }
  if (gitBranchControl) gitBranchControl.classList.remove("is-error");
}

function flashGitBranchError(message) {
  if (!gitBranchControl || !gitBranchSelect) return;
  clearGitBranchError();
  const text = String(message || "切换分支失败").trim() || "切换分支失败";
  gitBranchControl.classList.add("is-error");
  gitBranchControl.title = text;
  gitBranchSelect.title = text;
  gitErrorTimer = window.setTimeout(() => {
    gitErrorTimer = 0;
    gitBranchControl.classList.remove("is-error");
    const tip = "切换本地 Git 分支（仅切换，不拉取/推送）";
    gitBranchControl.title = tip;
    gitBranchSelect.title = tip;
  }, 5000);
}

function hideGitBranchControl() {
  gitBranchState = { isRepo: false, current: "", branches: [], detached: false };
  if (!gitBranchControl || !gitBranchSelect) return;
  clearGitBranchError();
  gitBranchControl.hidden = true;
  gitBranchSelect.disabled = true;
  gitBranchSelect.innerHTML = '<option value="">非 Git 仓库</option>';
}

function renderGitBranchSelect(info) {
  if (!gitBranchControl || !gitBranchSelect) return;

  if (!info || !info.isRepo) {
    hideGitBranchControl();
    return;
  }

  const branches = Array.isArray(info.branches) ? info.branches.slice() : [];
  const current = String(info.current || "");
  const detached = Boolean(info.detached);

  gitBranchState = {
    isRepo: true,
    current,
    branches,
    detached,
  };

  clearGitBranchError();
  gitBranchControl.hidden = false;
  gitBranchSelect.disabled = gitBranchBusy || branches.length === 0;

  const previous = gitBranchSelect.value;
  gitBranchSelect.innerHTML = "";

  if (detached) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = current || "detached HEAD";
    opt.disabled = true;
    opt.selected = true;
    gitBranchSelect.appendChild(opt);
  }

  for (const name of branches) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (!detached && name === current) opt.selected = true;
    gitBranchSelect.appendChild(opt);
  }

  if (!detached && current && branches.includes(current)) {
    gitBranchSelect.value = current;
  } else if (!detached && previous && branches.includes(previous)) {
    gitBranchSelect.value = previous;
  }

  const tip = detached
    ? `当前处于分离 HEAD（${current}），可切换到本地分支`
    : `当前分支：${current || "未知"}（仅本地切换，不拉取/推送）`;
  gitBranchControl.title = tip;
  gitBranchSelect.title = tip;
}

async function refreshGitBranchInfo() {
  if (!window.terminalDeck || typeof window.terminalDeck.getGitBranchInfo !== "function") {
    hideGitBranchControl();
    return;
  }
  try {
    const info = await window.terminalDeck.getGitBranchInfo(defaultWorkspace);
    renderGitBranchSelect(info);
  } catch {
    hideGitBranchControl();
  }
}

async function onGitBranchChange() {
  if (!gitBranchSelect || gitBranchBusy) return;
  const next = gitBranchSelect.value;
  if (!next) return;
  if (!gitBranchState.detached && next === gitBranchState.current) return;

  gitBranchBusy = true;
  gitBranchSelect.disabled = true;
  clearGitBranchError();

  const previousState = { ...gitBranchState, branches: gitBranchState.branches.slice() };

  try {
    const result = await window.terminalDeck.checkoutGitBranch(defaultWorkspace, next);
    if (result && result.ok) {
      renderGitBranchSelect({
        isRepo: true,
        current: result.current,
        branches: result.branches || previousState.branches,
        detached: Boolean(result.detached),
      });
      return;
    }

    flashGitBranchError(result && result.error);
    if (result && Array.isArray(result.branches) && result.branches.length) {
      renderGitBranchSelect({
        isRepo: true,
        current: result.current || previousState.current,
        branches: result.branches,
        detached: Boolean(result.detached),
      });
    } else {
      renderGitBranchSelect(previousState);
    }
  } catch (error) {
    flashGitBranchError(error && error.message);
    renderGitBranchSelect(previousState);
  } finally {
    gitBranchBusy = false;
    if (gitBranchSelect) {
      gitBranchSelect.disabled = !gitBranchState.isRepo || gitBranchState.branches.length === 0;
    }
  }
}

workspaceButton.addEventListener("click", async () => {
  const selected = await window.terminalDeck.chooseWorkspace();
  if (!selected) return;
  defaultWorkspace = selected;
  workspacePath.textContent = selected;
  workspaceButton.title = selected;
  refreshGitBranchInfo();
});

if (gitBranchSelect) {
  gitBranchSelect.addEventListener("change", () => {
    onGitBranchChange();
  });
  // 展开时刷新一次，便于外部终端改分支后同步
  gitBranchSelect.addEventListener("focus", () => {
    if (!gitBranchBusy) refreshGitBranchInfo();
  });
}

// 启动时探测默认工作区是否为 Git 仓库
refreshGitBranchInfo();

layoutSelect.addEventListener("change", () => {
  grid.className = `terminal-grid layout-${layoutSelect.value}`;
  // 切换布局模式：强制均分轨道
  relayoutGrid({ resetTracks: true });
});

syncGlassControlUi();
applyCurrentSkin();

/** 扫描 skins 目录，未在 catalog 登记的图片自动上架商城 */
async function loadSkinImagesFromDisk() {
  if (!window.terminalDeck || typeof window.terminalDeck.listSkinImages !== "function") return;
  if (typeof registerSkinImagesFromDisk !== "function") return;
  try {
    const files = await window.terminalDeck.listSkinImages();
    const added = registerSkinImagesFromDisk(files || []);
    if (added > 0 && window.skinShop && typeof window.skinShop.refresh === "function") {
      window.skinShop.refresh();
    }
  } catch {
    // ignore scan failures
  }
}
loadSkinImagesFromDisk();

if (skinShopButton) {
  skinShopButton.addEventListener("click", () => {
    if (window.skinShop) window.skinShop.toggle();
  });
}

if (glassSlider) {
  glassSlider.addEventListener("input", () => {
    setGlassLevel(glassSlider.value);
  });
}

if (customSkinButton) {
  customSkinButton.addEventListener("click", () => {
    window.__uploadSkinFromShop();
  });
}

window.addEventListener("resize", () => {
  hideMcpAgentMenu();
  if (isResizingPane) return;
  // 窗口尺寸变化：保持当前行列与轨道比例，只重新 fit
  requestAnimationFrame(fitAllSessions);
});

// --- SSH 对话框事件 ---
if (sshDialog) {
  sshDialog.addEventListener("click", (event) => {
    if (event.target && event.target.closest && event.target.closest("[data-ssh-close]")) {
      event.preventDefault();
      closeSshDialog(null);
    }
  });
}

if (sshAuthMethod) {
  sshAuthMethod.addEventListener("change", () => {
    syncSshAuthMethodUi();
    setSshFormError("");
  });
}

if (sshAgentEnabled) {
  sshAgentEnabled.addEventListener("change", () => {
    setSshFormError("");
    syncSshAgentLaunchUi();
  });
}

if (sshAgentRefresh) {
  sshAgentRefresh.addEventListener("click", () => {
    refreshSshAgentDetection();
  });
}

if (sshAgentOptions) {
  sshAgentOptions.addEventListener("change", (event) => {
    if (!event.target.matches('input[name="launchAgent"]')) return;
    syncSshAgentLaunchUi({ detect: false });
    setSshFormError("");
  });
}

if (sshForm) {
  sshForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = readSshFormValues();
    if (!values.host) {
      setSshFormError("请填写主机地址");
      if (sshHost) sshHost.focus();
      return;
    }
    if (!values.user) {
      setSshFormError("请填写用户名（Agent MCP 桥接与远端根目录需要用户名）");
      if (sshUser) sshUser.focus();
      return;
    }
    if (values.authMethod === "key" && !values.identityFile) {
      setSshFormError("请加载登录私钥文件");
      if (sshIdentityPick) sshIdentityPick.focus();
      return;
    }
    if (sshAgentEnabled?.checked && !values.launchAgent) {
      setSshFormError("请先选择一个已检测到的 Agent");
      if (sshAgentRefresh) sshAgentRefresh.focus();
      return;
    }
    if (values.launchAgent && values.authMethod === "ask") {
      setSshFormError("自动启动 Agent 需要预填密码或私钥，不能使用“每次询问”");
      if (sshAuthMethod) sshAuthMethod.focus();
      return;
    }
    if (values.launchAgent && values.authMethod === "password" && !values.password) {
      setSshFormError("自动启动 Agent 时请填写 SSH 登录密码");
      if (sshPassword) sshPassword.focus();
      return;
    }
    setSshFormError("");
    closeSshDialog(values);
  });
}

if (sshIdentityPick) {
  sshIdentityPick.addEventListener("click", async () => {
    try {
      const file = await window.terminalDeck.chooseSshIdentity();
      if (file) setSshIdentityPath(file);
    } catch {
      // ignore
    }
  });
}

if (sshIdentityClear) {
  sshIdentityClear.addEventListener("click", () => {
    setSshIdentityPath("");
  });
}

// 拖放私钥到秘钥区域
if (sshIdentityDrop) {
  let dropDepth = 0;
  sshIdentityDrop.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dropDepth += 1;
    sshIdentityDrop.classList.add("is-drop-target");
  });
  sshIdentityDrop.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  sshIdentityDrop.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dropDepth = Math.max(0, dropDepth - 1);
    if (dropDepth === 0) sshIdentityDrop.classList.remove("is-drop-target");
  });
  sshIdentityDrop.addEventListener("drop", (event) => {
    event.preventDefault();
    dropDepth = 0;
    sshIdentityDrop.classList.remove("is-drop-target");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      const filePath = window.terminalDeck.getPathForFile(file);
      if (filePath) {
        setSshIdentityPath(filePath);
        if (sshAuthMethod && sshAuthMethod.value !== "key") {
          sshAuthMethod.value = "key";
          syncSshAuthMethodUi();
        }
        setSshFormError("");
      }
    } catch {
      setSshFormError("无法读取拖入的私钥路径");
    }
  });
}

function hideMcpAgentMenu() {
  if (!mcpAgentMenu || mcpAgentMenu.hidden) return;
  mcpAgentMenu.hidden = true;
  if (mcpSetupButton) {
    mcpSetupButton.classList.remove("active");
    mcpSetupButton.setAttribute("aria-expanded", "false");
  }
}

function positionMcpAgentMenu() {
  if (!mcpAgentMenu || !mcpSetupButton) return;
  const anchor = mcpSetupButton.getBoundingClientRect();
  const width = 286;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.right - width));
  const estimatedHeight = 205;
  const placeAbove = anchor.bottom + estimatedHeight + 8 > window.innerHeight;
  const top = placeAbove
    ? Math.max(8, anchor.top - estimatedHeight - 6)
    : anchor.bottom + 6;
  mcpAgentMenu.style.left = `${Math.round(left)}px`;
  mcpAgentMenu.style.top = `${Math.round(top)}px`;
}

function setMcpAgentStatus(agentId, text, state = "") {
  if (!mcpAgentMenu) return;
  const status = mcpAgentMenu.querySelector(
    `button[data-mcp-agent="${agentId}"] .agent-mcp-status`
  );
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("is-missing", state === "missing");
  status.classList.toggle("is-success", state === "success");
}

async function refreshMcpAgentStatus() {
  if (!mcpAgentMenu) return;
  for (const button of mcpAgentMenu.querySelectorAll("button[data-mcp-agent]")) {
    setMcpAgentStatus(button.dataset.mcpAgent, "检测中…");
  }
  try {
    const statuses = await window.terminalDeck.getMcpAgentStatus();
    for (const status of statuses || []) {
      setMcpAgentStatus(status.id, status.available ? "可一键启用" : "未检测到", status.available ? "" : "missing");
    }
  } catch {
    for (const button of mcpAgentMenu.querySelectorAll("button[data-mcp-agent]")) {
      setMcpAgentStatus(button.dataset.mcpAgent, "检测失败", "missing");
    }
  }
}

if (mcpSetupButton && mcpAgentMenu) {
  mcpSetupButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!mcpAgentMenu.hidden) {
      hideMcpAgentMenu();
      return;
    }
    hideContextMenu();
    mcpAgentMenu.hidden = false;
    mcpSetupButton.classList.add("active");
    mcpSetupButton.setAttribute("aria-expanded", "true");
    positionMcpAgentMenu();
    refreshMcpAgentStatus();
  });

  mcpAgentMenu.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-mcp-agent]");
    if (!button || button.disabled) return;
    const agent = button.dataset.mcpAgent;
    const label = button.querySelector("strong")?.textContent || agent;
    button.disabled = true;
    setMcpAgentStatus(agent, "正在启用…");
    try {
      const result = await window.terminalDeck.installMcpForAgent(agent);
      if (!result?.ok) throw new Error(result?.error || "MCP 启用失败");
      setMcpAgentStatus(agent, "已启用", "success");
      window.alert(
        `${label} 已启用终端矩阵远端工具。\n\n新启动的 Agent 会自动生效；如果 ${label} 已经在运行，请刷新 MCP 或重新启动该会话。`
      );
      hideMcpAgentMenu();
    } catch (error) {
      const message = error?.message || String(error);
      setMcpAgentStatus(agent, /未检测到/.test(message) ? "未检测到" : "启用失败", "missing");
      window.alert(`${label} 启用失败：\n${message}`);
    } finally {
      button.disabled = false;
    }
  });
}

if (remoteAgentSelect) {
  remoteAgentSelect.addEventListener("change", () => {
    window.terminalDeck.setMcpRemoteSession(remoteAgentSelect.value).catch(() => {});
  });
}

newTerminalButton.addEventListener("click", () => createSession());
emptyNewButton.addEventListener("click", () => createSession());
if (sshConnectButtonSidebar) {
  sshConnectButtonSidebar.addEventListener("click", () => connectSshSession());
}
if (emptySshButton) {
  emptySshButton.addEventListener("click", () => connectSshSession());
}

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

if (ultraToggleButton) {
  ultraToggleButton.addEventListener("click", () => {
    setUltraMode(!ultraMode);
  });
}

// 恢复上次 Ultra 开关（仅高亮按钮，无额外输入框）
setUltraMode(ultraMode);

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    if (sshDialog && !sshDialog.hidden) {
      event.preventDefault();
      closeSshDialog(null);
      return;
    }
    if (!contextMenu.hidden) {
      hideContextMenu();
      return;
    }
    if (mcpAgentMenu && !mcpAgentMenu.hidden) {
      hideMcpAgentMenu();
      return;
    }
  }
  // Ctrl+Shift+U 切换 Ultra
  if (event.ctrlKey && event.shiftKey && event.code === "KeyU") {
    event.preventDefault();
    setUltraMode(!ultraMode);
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
  if (
    mcpAgentMenu &&
    !mcpAgentMenu.hidden &&
    !mcpAgentMenu.contains(event.target) &&
    !mcpSetupButton?.contains(event.target)
  ) hideMcpAgentMenu();
});
window.addEventListener("blur", () => {
  hideContextMenu();
  hideMcpAgentMenu();
});

window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

updateSessionCount();
createSession();
