const assert = require("node:assert/strict");
const {
  buildAddArgs,
  buildRemoveArgs,
  installAgentMcp,
  resolveAgentCli,
  SERVER_NAME,
} = require("../agent/mcp-installer");

async function main() {
  const launch = {
    command: "powershell.exe",
    args: ["-NoProfile", "-File", "C:\\Terminal Matrix\\launcher.ps1", "-State", "C:\\state.json"],
  };
  for (const agent of ["codex", "grok", "claude"]) {
    const add = buildAddArgs(agent, launch);
    assert.equal(add[0], "mcp");
    assert.equal(add[1], "add");
    assert.ok(add.includes(SERVER_NAME));
    assert.ok(add.includes("powershell.exe"));
    assert.ok(add.includes("C:\\Terminal Matrix\\launcher.ps1"));
    const remove = buildRemoveArgs(agent);
    assert.equal(remove.at(-1), SERVER_NAME);
  }

  const calls = [];
  const installed = await installAgentMcp("grok", launch, {
    executable: "grok-test",
    runner: async (executable, args) => {
      calls.push({ executable, args });
      return { stdout: "configured", stderr: "" };
    },
  });
  assert.equal(installed.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, buildAddArgs("grok", launch));

  let duplicateAttempt = 0;
  const replaced = await installAgentMcp("claude", launch, {
    executable: "claude-test",
    runner: async (_executable, args) => {
      duplicateAttempt += 1;
      if (duplicateAttempt === 1) {
        const error = new Error("server already exists");
        error.stderr = "already exists";
        throw error;
      }
      if (duplicateAttempt === 2) assert.deepEqual(args, buildRemoveArgs("claude"));
      if (duplicateAttempt === 3) assert.deepEqual(args, buildAddArgs("claude", launch));
      return { stdout: "updated", stderr: "" };
    },
  });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.updated, true);
  assert.equal(duplicateAttempt, 3);

  const discovered = {};
  for (const agent of ["codex", "grok", "claude"]) {
    discovered[agent] = await resolveAgentCli(agent);
  }
  console.log(JSON.stringify({ ok: true, discovered }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
