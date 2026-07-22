const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { RemoteBridgeServer } = require("../remote/bridge-server");

async function main() {
  const bridge = new RemoteBridgeServer();
  const sessionId = "smoke";
  const testPath = ".terminal-matrix-mcp-protocol-smoke.txt";
  await bridge.start();
  bridge.register(sessionId, {
    host: process.env.TM_TEST_SSH_HOST,
    port: Number(process.env.TM_TEST_SSH_PORT) || 22,
    user: process.env.TM_TEST_SSH_USER,
    password: process.env.TM_TEST_SSH_PASSWORD,
    identityFile: process.env.TM_TEST_SSH_IDENTITY,
    remoteRoot: process.env.TM_TEST_REMOTE_ROOT,
  });

  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-matrix-mcp-smoke-"));
  const statePath = path.join(stateDir, "bridge-state.json");
  const bridgeEnv = bridge.environment(sessionId);
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      bridgeUrl: bridgeEnv.TERMINAL_MATRIX_BRIDGE_URL,
      bridgeToken: bridgeEnv.TERMINAL_MATRIX_BRIDGE_TOKEN,
      sessionId: bridgeEnv.TERMINAL_MATRIX_REMOTE_SESSION,
      runtimeExecutable: process.execPath,
    })
  );

  const serverScript = path.resolve(__dirname, "..", "mcp", "remote-server.js");
  const transportCommand = process.platform === "win32" ? "powershell.exe" : process.execPath;
  const transportArgs = process.platform === "win32"
    ? [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.resolve(__dirname, "..", "mcp", "launcher.ps1"),
        "-State",
        statePath,
      ]
    : [serverScript, "--state", statePath];
  const transport = new StdioClientTransport({
    command: transportCommand,
    args: transportArgs,
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env },
    stderr: "pipe",
  });
  const client = new Client({ name: "terminal-matrix-smoke", version: "0.1.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    for (const expected of [
      "remote_connection_info",
      "remote_exec",
      "remote_list",
      "remote_mkdir",
      "remote_read",
      "remote_stat",
      "remote_write",
    ]) {
      if (!names.includes(expected)) throw new Error(`Missing MCP tool: ${expected}`);
    }
    const info = await client.callTool({ name: "remote_connection_info", arguments: {} });
    const list = await client.callTool({ name: "remote_list", arguments: { path: "." } });
    const content = `terminal-matrix-mcp-protocol-${Date.now()}\n`;
    const write = await client.callTool({
      name: "remote_write",
      arguments: { path: testPath, content, mode: 384 },
    });
    const read = await client.callTool({
      name: "remote_read",
      arguments: { path: testPath, encoding: "utf8" },
    });
    if (read.structuredContent?.content !== content) {
      throw new Error("MCP remote_write/remote_read round trip failed");
    }
    const cleanup = await client.callTool({
      name: "remote_exec",
      arguments: { command: `rm -f -- '${testPath}' && printf MCP_EXEC_OK` },
    });
    if (cleanup.structuredContent?.stdout !== "MCP_EXEC_OK") {
      throw new Error("MCP remote_exec cleanup failed");
    }
    console.log(
      JSON.stringify(
        {
          tools: names,
          connection: info.structuredContent,
          listedEntries: list.structuredContent?.entries?.length,
          write: write.structuredContent,
          readBytes: read.structuredContent?.size,
          exec: cleanup.structuredContent?.stdout,
        },
        null,
        2
      )
    );
  } finally {
    await client.close().catch(() => {});
    await bridge.close();
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
