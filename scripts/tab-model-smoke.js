const assert = require("node:assert/strict");
const {
  DEFAULT_VIEW_MODE,
  cycleId,
  idForShortcut,
  neighborAfterClose,
  reorderIds,
  resolveViewMode,
  sanitizeTabTitle,
  shouldConfirmClose,
  tabAttention,
  tabLabel,
} = require("../renderer/tab-model");

// 视图模式：默认标签页，保存的选择优先，非法值回退
assert.equal(DEFAULT_VIEW_MODE, "tabs");
assert.equal(resolveViewMode(null), "tabs");
assert.equal(resolveViewMode("grid"), "grid");
assert.equal(resolveViewMode("TABS"), "tabs");
assert.equal(resolveViewMode("weird"), "tabs");

// 拖动排序
const ids = ["1", "2", "3", "4"];
assert.deepEqual(reorderIds(ids, "1", "3"), ["2", "1", "3", "4"]);
assert.deepEqual(reorderIds(ids, "1", "3", true), ["2", "3", "1", "4"]);
assert.deepEqual(reorderIds(ids, "4", "1"), ["4", "1", "2", "3"]);
assert.deepEqual(reorderIds(ids, "2", "4", true), ["1", "3", "4", "2"]);
assert.deepEqual(reorderIds(ids, "2", "2"), ids);
assert.deepEqual(reorderIds(ids, "9", "1"), ids);
assert.deepEqual(ids, ["1", "2", "3", "4"], "input must not be mutated");

// 循环切换
assert.equal(cycleId(ids, "4", 1), "1");
assert.equal(cycleId(ids, "1", -1), "4");
assert.equal(cycleId(ids, "2", 1), "3");
assert.equal(cycleId(ids, "missing", 1), "1");
assert.equal(cycleId([], "1", 1), null);

// Ctrl+数字
assert.equal(idForShortcut(ids, 1), "1");
assert.equal(idForShortcut(ids, 4), "4");
assert.equal(idForShortcut(ids, 5), null); // 不存在 → 透传给终端
assert.equal(idForShortcut(ids, 9), "4"); // 9 = 最后一个
assert.equal(idForShortcut([], 1), null);

// 关闭后的焦点
assert.equal(neighborAfterClose(ids, "2", "2"), "3");
assert.equal(neighborAfterClose(ids, "4", "4"), "3");
assert.equal(neighborAfterClose(["1"], "1", "1"), null);
assert.equal(neighborAfterClose(ids, "3", "1"), "1"); // 关的不是当前标签：保持不变

// 关闭确认与提醒
assert.equal(shouldConfirmClose("running"), true);
assert.equal(shouldConfirmClose("approval"), true);
assert.equal(shouldConfirmClose("waiting"), true);
assert.equal(shouldConfirmClose("idle"), false);
assert.equal(shouldConfirmClose("none"), false);
assert.equal(shouldConfirmClose("exited"), false);
assert.equal(tabAttention("approval", true), "approval");
assert.equal(tabAttention("waiting", false), "waiting");
assert.equal(tabAttention("waiting", true), "");
assert.equal(tabAttention("running", false), "");

// 标签文案
const labels = { claude: "Claude Code", codex: "Codex" };
assert.deepEqual(tabLabel({ agentId: "claude", agentState: "running", paneTitle: "PowerShell" }, labels), {
  text: "Claude Code", icon: "✻", isAgent: true,
});
assert.equal(tabLabel({ agentId: "codex", agentState: "none", paneTitle: "PowerShell" }, labels).text, "PowerShell");
assert.equal(tabLabel({ agentId: "codex", agentState: "exited", paneTitle: "PowerShell" }, labels).text, "Codex");
assert.equal(tabLabel({ customTitle: "  修 bug  ", agentId: "claude", agentState: "running" }, labels).text, "修 bug");
assert.equal(tabLabel({ shell: "ssh", paneTitle: "root@host" }).icon, "⇄");
assert.equal(tabLabel({}).text, "终端");

assert.equal(sanitizeTabTitle("  a\u0007b \n  c "), "ab c");
assert.equal(sanitizeTabTitle("x".repeat(60)).length, 40);
assert.equal(sanitizeTabTitle("   "), "");

console.log("tab model smoke ok");
