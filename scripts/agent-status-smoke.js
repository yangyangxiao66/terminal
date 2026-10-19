const assert = require("node:assert/strict");
const {
  QUIET_MS,
  IDLE_AFTER_MS,
  createAgentStatusTracker,
  detectAgentCommand,
  detectAgentFromOutput,
  matchesApprovalPrompt,
  matchesShellPrompt,
  stripAnsi,
  summarizeStates,
} = require("../renderer/agent-status");

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms) => { now += ms; return now; } };
}

// ANSI 清理
assert.equal(stripAnsi("\x1b[1;32mOK\x1b[0m \x1b]0;title\x07done\r\n"), "OK done\n");
assert.equal(stripAnsi("\x1b[?25l\x1b[2K\x1b[1G> hi"), "> hi");

// 启动命令识别
assert.equal(detectAgentCommand("claude"), "claude");
assert.equal(detectAgentCommand("  codex --model gpt-5"), "codex");
assert.equal(detectAgentCommand("C:\\Users\\me\\AppData\\Roaming\\npm\\gemini.cmd -p hi"), "gemini");
assert.equal(detectAgentCommand("& qwen.exe"), "qwen");
assert.equal(detectAgentCommand("npx -y @anthropic-ai/claude-code"), "claude");
assert.equal(detectAgentCommand("opencode"), "opencode");
assert.equal(detectAgentCommand("grok -p 'explain'"), "grok");
assert.equal(detectAgentCommand("cat claude.md"), "");
assert.equal(detectAgentCommand("claudette"), "");
assert.equal(detectAgentCommand("git commit -m codex"), "");

assert.equal(detectAgentFromOutput("✻ Welcome to Claude Code!"), "claude");
assert.equal(detectAgentFromOutput(">_ OpenAI Codex (v0.50.0)"), "codex");
assert.equal(detectAgentFromOutput("hello world"), "");

// 确认提示
for (const sample of [
  "Do you want to make this edit to app.js?\n❯ 1. Yes\n  2. No",
  "Allow command `npm test`? (y/n)",
  "Overwrite file? [Y/n] ",
  "Press Enter to continue…",
  "  › 1. Yes, proceed",
  "Waiting for approval",
  "是否继续执行？",
]) assert.ok(matchesApprovalPrompt(sample), `approval: ${sample}`);
for (const sample of ["Here is the summary of the change.", "> ", "Tests passed: 12"]) {
  assert.ok(!matchesApprovalPrompt(sample), `not approval: ${sample}`);
}

// shell 提示符
for (const sample of [
  "PS C:\\work\\repo> ",
  "Windows PowerShell\nPS G:\\myday>",
  "C:\\Users\\me>",
  "me@box MINGW64 ~/repo (main)\n$ ",
  "root@server:~/app# ",
  "bash-5.2$ ",
]) assert.ok(matchesShellPrompt(sample), `prompt: ${sample}`);
for (const sample of ["│ > Try \"fix lint\"", "Thinking…", "> "]) {
  assert.ok(!matchesShellPrompt(sample), `not prompt: ${sample}`);
}

// 完整流程：PowerShell 中启动 claude → 运行 → 等待确认 → 继续 → 等待输入 → 空闲 → 退出回 shell
{
  const c = clock();
  const t = createAgentStatusTracker({ now: c.now });
  t.feed("Windows PowerShell\r\nPS C:\\repo> ");
  assert.equal(t.evaluate().state, "none");

  for (const ch of "claude") t.input(ch);
  t.input("\r");
  t.feed("claude\r\n"); // 回显
  assert.equal(t.evaluate().agentId, "claude");
  assert.equal(t.evaluate().state, "running"); // 刚启动

  c.advance(400);
  t.feed("\x1b[2J\x1b[H✻ Welcome to Claude Code!\r\n│ > \x1b[7m \x1b[0m");
  assert.equal(t.evaluate().state, "running");
  c.advance(QUIET_MS + 100);
  assert.equal(t.evaluate().state, "waiting");
  assert.equal(t.evaluate().label, "等待输入");

  t.input("fix the bug\r");
  c.advance(500);
  t.feed("\x1b[33m✶ Thinking…\x1b[0m (3s · esc to interrupt)");
  c.advance(800);
  t.feed("● Update(app.js)\r\n");
  assert.equal(t.evaluate().state, "running");
  c.advance(600);
  t.feed("Do you want to make this edit to app.js?\r\n\x1b[36m❯ 1. Yes\x1b[0m\r\n  2. Yes, allow all edits\r\n  3. No\r\n");
  c.advance(QUIET_MS + 50);
  const approval = t.evaluate();
  assert.equal(approval.state, "approval");
  assert.equal(approval.label, "需要确认");

  t.input("1");
  assert.notEqual(t.evaluate().state, "approval"); // 已回应
  c.advance(300);
  t.feed("Updated app.js with 3 additions\r\n".repeat(3));
  assert.equal(t.evaluate().state, "running");
  c.advance(QUIET_MS);
  assert.equal(t.evaluate().state, "waiting");
  c.advance(IDLE_AFTER_MS);
  assert.equal(t.evaluate().state, "idle");

  // /exit 回到 PowerShell
  t.input("/exit\r");
  c.advance(300);
  t.feed("Bye!\r\nPS C:\\repo> ");
  c.advance(QUIET_MS);
  assert.equal(t.evaluate().state, "none");

  // 再次启动其它 Agent
  t.input("codex\r");
  c.advance(300);
  t.feed(">_ OpenAI Codex (v0.50.0)\r\n▌ Ask Codex to do anything");
  assert.equal(t.evaluate().agentId, "codex");
  assert.equal(t.evaluate().state, "running");
}

// 打字回显不会让状态跳回「运行中」
{
  const c = clock();
  const t = createAgentStatusTracker({ now: c.now });
  t.input("gemini\r");
  c.advance(300);
  t.feed("Gemini CLI v1.0\r\n> ");
  c.advance(QUIET_MS + 10);
  assert.equal(t.evaluate().state, "waiting");
  t.input("h");
  c.advance(20);
  t.feed("h");
  assert.equal(t.evaluate().state, "waiting");
}

// 启动很快的 Agent：回车后立刻输出的提示不应被当成键入回显
{
  const c = clock();
  const t = createAgentStatusTracker({ now: c.now });
  t.input("gemini\r");
  c.advance(30);
  t.feed("Gemini CLI v1.0\r\n> ");
  c.advance(QUIET_MS + 10);
  assert.equal(t.evaluate().state, "waiting");
}

// 输出横幅识别（未通过命令启动）+ 进程退出
{
  const c = clock();
  const t = createAgentStatusTracker({ now: c.now });
  t.feed("\x1b[1mWelcome to Qwen Code\x1b[0m\r\n");
  assert.equal(t.evaluate().agentId, "qwen");
  assert.equal(t.evaluate().state, "running");
  t.markExited(1);
  const exited = t.evaluate();
  assert.equal(exited.state, "exited");
  assert.equal(exited.exitCode, 1);
}

// 非 Agent 会话退出不显示 Agent 状态
{
  const t = createAgentStatusTracker();
  t.feed("PS C:\\> ");
  t.markExited(0);
  assert.equal(t.evaluate().state, "none");
}

// 启动失败（命令不存在）后回到提示符
{
  const c = clock();
  const t = createAgentStatusTracker({ now: c.now });
  t.input("opencode\r");
  c.advance(400);
  t.feed("opencode : The term 'opencode' is not recognized...\r\nPS C:\\repo> ");
  c.advance(QUIET_MS);
  assert.equal(t.evaluate().state, "none");
}

// 大块输出只保留尾部，开销有界
{
  const c = clock();
  const t = createAgentStatusTracker({ now: c.now });
  t.input("codex\r");
  c.advance(300);
  const big = "x".repeat(1024 * 1024);
  const started = process.hrtime.bigint();
  for (let i = 0; i < 50; i += 1) t.feed(big);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(t.snapshot.tail.length <= 2048);
  assert.ok(ms < 500, `feed too slow: ${ms}ms`);
}

// 汇总文案
assert.equal(
  summarizeStates(["running", "running", "approval", "none"]).text,
  "2 个 Agent 运行中 · 1 个需要确认"
);
assert.equal(summarizeStates(["waiting"]).text, "1 个 Agent 等待输入");
assert.equal(summarizeStates(["approval", "waiting"]).text, "1 个 Agent 需要确认 · 1 个等待输入");
assert.equal(summarizeStates(["none"]).text, "");

console.log("agent status smoke ok");
