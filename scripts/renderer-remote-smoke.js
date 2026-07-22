async function main() {
  const host = process.env.TM_TEST_SSH_HOST;
  const port = Number(process.env.TM_TEST_SSH_PORT) || 22;
  const user = process.env.TM_TEST_SSH_USER;
  const password = process.env.TM_TEST_SSH_PASSWORD;
  const remoteRoot = process.env.TM_TEST_REMOTE_ROOT;
  if (!host || !user || !password) throw new Error("Missing remote renderer smoke credentials");

  const targets = await fetch("http://127.0.0.1:9333/json").then((response) => response.json());
  const target = targets.find((item) => item.type === "page" && item.url.includes("renderer/index.html"));
  if (!target) throw new Error("Terminal Deck renderer target was not found.");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  const config = JSON.stringify({ host, port, user, password, remoteRoot });
  const expression = `(async () => {
    const before = new Set(sessions.keys());
    await createSession({ shell: "ssh", ssh: ${config} });
    const session = [...sessions.values()].find((item) => !before.has(item.id));
    if (!session) throw new Error("SSH renderer session was not created");
    await new Promise((resolve) => setTimeout(resolve, 4200));
    window.terminalDeck.write(session.id, "printf 'TM_SSH_UI_OK\\n'\\r");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const buffer = session.terminal.buffer.active;
    const lines = [];
    const start = Math.max(0, buffer.length - 200);
    for (let i = start; i < buffer.length; i += 1) lines.push(buffer.getLine(i)?.translateToString(true) || "");
    const output = lines.join("\\n");
    const hasRemoteOption = [...remoteAgentSelect.options].some((option) => option.value === session.id);
    const selectedRemote = remoteAgentSelect.value === session.id;
    const beforeLocal = new Set(sessions.keys());
    await createSession({
      shell: "powershell",
      remoteSessionId: session.id,
      startCommand: "Write-Output 'TM_AUTO_AGENT_OK'",
      agent: { id: "smoke", label: "Agent Smoke", remoteLabel: session.ssh?.label || "SSH" }
    });
    const localSession = [...sessions.values()].find((item) => !beforeLocal.has(item.id));
    if (!localSession) throw new Error("Bound local renderer session was not created");
    await new Promise((resolve) => setTimeout(resolve, 500));
    window.terminalDeck.write(
      localSession.id,
      "$ok=$env:TERMINAL_MATRIX_BRIDGE_URL -and $env:TERMINAL_MATRIX_BRIDGE_TOKEN -and $env:TERMINAL_MATRIX_REMOTE_SESSION; if($ok){Write-Output 'TM_MCP_ENV_OK'}\\r"
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    const localBuffer = localSession.terminal.buffer.active;
    const localLines = [];
    for (let i = Math.max(0, localBuffer.length - 20); i < localBuffer.length; i += 1) {
      localLines.push(localBuffer.getLine(i)?.translateToString(true) || "");
    }
    const mcpEnvInjected = localLines.join("\\n").includes("TM_MCP_ENV_OK");
    const autoAgentStarted = localLines.join("\\n").includes("TM_AUTO_AGENT_OK");
    const result = {
      connected: output.includes("TM_SSH_UI_OK") && !/permission denied/i.test(output),
      bridgeReady: Boolean(session.ssh?.bridgeReady),
      hasRemoteOption,
      selectedRemote,
      mcpEnvInjected,
      autoAgentStarted,
      agentPaneClass: localSession.element.classList.contains("is-agent"),
      label: session.ssh?.label || "",
      sshPaneStatus: session.element.querySelector(".pane-status")?.title || "",
      outputTail: output.slice(-1200),
    };
    closeSession(localSession.id);
    closeSession(session.id);
    return JSON.stringify(result);
  })()`;

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CDP remote evaluation timed out.")), 16_000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      resolve(message);
    });
    socket.send(
      JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true, awaitPromise: true },
      })
    );
  });
  socket.close();
  if (result.result.exceptionDetails) {
    throw new Error(result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text);
  }
  const value = JSON.parse(result.result.result.value);
  console.log(JSON.stringify(value, null, 2));
  if (
    !value.connected ||
    !value.bridgeReady ||
    !value.hasRemoteOption ||
    !value.selectedRemote ||
    !value.mcpEnvInjected ||
    !value.autoAgentStarted ||
    !value.agentPaneClass
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
