/**
 * 标签页纯逻辑（无 DOM）：顺序调整、切换、关闭后的焦点、视图模式、标签文案。
 * 渲染进程以全局 TabModel 使用，Node 冒烟测试通过 require 使用。
 */
(function initTabModel(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TabModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const VIEW_MODES = Object.freeze(["tabs", "grid"]);
  const DEFAULT_VIEW_MODE = "tabs";

  const AGENT_ICONS = Object.freeze({
    claude: "✻",
    codex: "◎",
    grok: "✕",
    gemini: "✦",
    qwen: "◆",
    opencode: "▣",
  });
  const SHELL_ICONS = Object.freeze({ ssh: "⇄", default: "›_" });

  /** 用户保存的选择优先，否则默认标签页模式 */
  function resolveViewMode(stored) {
    const value = String(stored || "").toLowerCase();
    return VIEW_MODES.includes(value) ? value : DEFAULT_VIEW_MODE;
  }

  /** 把 fromId 移到 toId 前（或后）；返回新数组，非法输入原样返回副本 */
  function reorderIds(ids, fromId, toId, placeAfter = false) {
    const list = [...(ids || [])];
    const from = list.indexOf(fromId);
    if (from < 0 || fromId === toId || list.indexOf(toId) < 0) return list;
    list.splice(from, 1);
    let to = list.indexOf(toId);
    if (placeAfter) to += 1;
    list.splice(to, 0, fromId);
    return list;
  }

  /** 循环切换：delta=1 下一个，-1 上一个 */
  function cycleId(ids, currentId, delta = 1) {
    const list = ids || [];
    if (!list.length) return null;
    const index = list.indexOf(currentId);
    if (index < 0) return list[delta < 0 ? list.length - 1 : 0];
    const next = (index + (delta < 0 ? -1 : 1) + list.length) % list.length;
    return list[next];
  }

  /** Ctrl+1..9：第 n 个；9 固定跳到最后一个（与浏览器一致）；不存在返回 null */
  function idForShortcut(ids, digit) {
    const list = ids || [];
    const n = Number(digit);
    if (!Number.isInteger(n) || n < 1 || n > 9 || !list.length) return null;
    if (n === 9) return list[list.length - 1];
    return list[n - 1] ?? null;
  }

  /** 关闭当前标签后激活谁：优先右侧，其次左侧 */
  function neighborAfterClose(ids, closingId, activeId) {
    const list = ids || [];
    if (closingId !== activeId) return list.includes(activeId) ? activeId : list.find((id) => id !== closingId) ?? null;
    const index = list.indexOf(closingId);
    const rest = list.filter((id) => id !== closingId);
    if (!rest.length) return null;
    if (index < 0) return rest[rest.length - 1];
    return rest[Math.min(index, rest.length - 1)];
  }

  const LIVE_AGENT_STATES = Object.freeze(["running", "waiting", "approval", "idle"]);

  function isAgentState(state) {
    return LIVE_AGENT_STATES.includes(state) || state === "exited";
  }

  /** Agent 仍在运行或在等你时，关闭前需要确认 */
  function shouldConfirmClose(state) {
    return state === "running" || state === "waiting" || state === "approval";
  }

  /** 非当前标签需要关注的程度：approval 强提醒，waiting 弱提醒 */
  function tabAttention(state, isActive) {
    if (state === "approval") return "approval";
    if (state === "waiting" && !isActive) return "waiting";
    return "";
  }

  /**
   * 标签文案：用户重命名 > 识别到的 Agent 名 > 终端标题。
   * @returns {{ text: string, icon: string, isAgent: boolean }}
   */
  function tabLabel({ customTitle, agentId, agentState, paneTitle, shell } = {}, agentLabels = {}) {
    const agentShown = Boolean(agentId) && isAgentState(agentState);
    const icon = agentShown
      ? AGENT_ICONS[agentId] || "✦"
      : shell === "ssh"
      ? SHELL_ICONS.ssh
      : SHELL_ICONS.default;
    const custom = String(customTitle || "").trim();
    if (custom) return { text: custom, icon, isAgent: agentShown };
    if (agentShown) return { text: agentLabels[agentId] || agentId, icon, isAgent: true };
    return { text: String(paneTitle || "终端"), icon, isAgent: false };
  }

  /** 重命名输入清理：去控制字符、折叠空白、限长；空串表示恢复默认 */
  function sanitizeTabTitle(value, maxLength = 40) {
    return String(value ?? "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  return {
    VIEW_MODES,
    DEFAULT_VIEW_MODE,
    AGENT_ICONS,
    resolveViewMode,
    reorderIds,
    cycleId,
    idForShortcut,
    neighborAfterClose,
    isAgentState,
    shouldConfirmClose,
    tabAttention,
    tabLabel,
    sanitizeTabTitle,
  };
});
