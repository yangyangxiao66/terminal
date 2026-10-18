const assert = require("node:assert/strict");
const path = require("node:path");
const {
  LAUNCHPAD_AGENTS,
  buildInstallCommand,
  buildLaunchCommand,
  detectLaunchpadAgent,
  launchpadAgent,
  listLaunchpadAgents,
  sanitizeExtraArgs,
} = require("../agent/launchpad");

async function main() {
  const ids = LAUNCHPAD_AGENTS.map((agent) => agent.id);
  for (const id of ["claude", "codex", "grok", "gemini", "qwen", "opencode"]) {
    assert.ok(ids.includes(id), `missing agent ${id}`);
  }

  // 白名单：未知 id / 注入式 id 一律拒绝
  assert.throws(() => launchpadAgent("bash"));
  assert.throws(() => launchpadAgent("claude; rm -rf /"));
  assert.throws(() => buildLaunchCommand("../codex"));
  assert.equal(launchpadAgent("CLAUDE").id, "claude");

  assert.equal(buildLaunchCommand("claude"), "claude");
  assert.equal(buildLaunchCommand("codex", "  --model gpt-5  "), "codex --model gpt-5");
  assert.equal(buildLaunchCommand("gemini", '-p "解释 这个 仓库"'), 'gemini -p "解释 这个 仓库"');
  assert.equal(buildLaunchCommand("qwen", "--add-dir C:\\work\\repo"), "qwen --add-dir C:\\work\\repo");

  for (const bad of [
    "--x; calc",
    "--x & calc",
    "--x | more",
    "--x > out.txt",
    "--x `whoami`",
    "--x $(whoami)",
    "--x (Remove-Item a)",
    "--x %PATH%",
    "--x\r\ncalc",
    '--x "unterminated',
    "a".repeat(600),
  ]) {
    assert.throws(() => sanitizeExtraArgs(bad), undefined, `should reject: ${JSON.stringify(bad)}`);
  }

  assert.equal(buildInstallCommand("claude"), "npm i -g @anthropic-ai/claude-code");
  assert.equal(buildInstallCommand("codex"), "npm i -g @openai/codex");
  assert.equal(buildInstallCommand("gemini"), "npm i -g @google/gemini-cli");
  assert.equal(buildInstallCommand("qwen"), "npm i -g @qwen-code/qwen-code");

  // Windows：已知 npm 全局位置命中即视为已安装，不执行 CLI
  const appData = path.join("C:", "Users", "dev", "AppData", "Roaming");
  const fakeEnv = { USERPROFILE: path.join("C:", "Users", "dev"), APPDATA: appData };
  const geminiCmd = path.join(appData, "npm", "gemini.cmd");
  const winHit = await detectLaunchpadAgent("gemini", {
    env: fakeEnv,
    platform: "win32",
    exists: (candidate) => candidate === geminiCmd,
    finder: async () => [],
  });
  // path.isAbsolute 依宿主平台判断，在 Linux 上 C: 路径不是绝对路径，因此只在 Windows 断言命中
  if (process.platform === "win32") assert.equal(winHit, geminiCmd);

  const fromWhere = await detectLaunchpadAgent("qwen", {
    env: fakeEnv,
    platform: "win32",
    exists: () => false,
    finder: async () => ["D:\\tools\\qwen.cmd"],
  });
  assert.equal(fromWhere, "D:\\tools\\qwen.cmd");

  const missing = await detectLaunchpadAgent("opencode", {
    platform: "linux",
    finder: async () => [],
  });
  assert.equal(missing, "");

  const list = await listLaunchpadAgents();
  assert.equal(list.length, LAUNCHPAD_AGENTS.length);
  for (const item of list) {
    assert.equal(typeof item.installed, "boolean");
    assert.ok(item.installCommand.startsWith("npm i -g "));
  }
  console.log(JSON.stringify(list.map(({ id, installed, path: p }) => ({ id, installed, path: p }))));
  console.log("agent launchpad smoke ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
