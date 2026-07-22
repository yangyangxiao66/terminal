const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

async function main() {
  if (process.platform !== "win32") {
    console.log(JSON.stringify({ ok: true, skipped: "Windows-only bundled runtime smoke" }));
    return;
  }
  const mcpDir = path.join(process.env.APPDATA, "terminal-deck", "mcp");
  const statePath = path.join(mcpDir, "bridge-state.json");
  const launcherPath = path.join(mcpDir, "terminal-matrix-mcp-launcher.ps1");
  if (!fs.existsSync(statePath) || !fs.existsSync(launcherPath)) {
    throw new Error("Run Terminal Matrix before the bundled runtime smoke test");
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (!state.runtimeExecutable || !fs.existsSync(state.runtimeExecutable)) {
    throw new Error("The running Terminal Matrix executable was not published to bridge state");
  }

  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      launcherPath,
      "-State",
      statePath,
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  let stdoutBuffer = "";
  let stderr = "";
  const responses = new Map();
  const completion = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Bundled MCP runtime timed out"));
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/u);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        responses.set(message.id, message);
        if (message.id === 2) child.stdin.end();
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(stderr || `Bundled MCP runtime exited with ${code}`));
      else resolve();
    });
  });
  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "terminal-matrix-bundled-runtime-smoke", version: "0.1.0" },
    },
  })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  await completion;
  const tools = responses.get(2)?.result?.tools || [];
  if (tools.length !== 7) throw new Error(`Expected 7 MCP tools, got ${tools.length}`);
  console.log(JSON.stringify({
    ok: true,
    runtimeExecutable: state.runtimeExecutable,
    tools: tools.map((tool) => tool.name).sort(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
