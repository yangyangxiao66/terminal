async function main() {
  const targets = await fetch("http://127.0.0.1:9333/json").then((response) => response.json());
  const target = targets.find((item) => item.type === "page" && item.url.includes("renderer/index.html"));
  if (!target) throw new Error("Terminal Deck renderer target was not found.");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  const expression = `(async () => {
    if (document.querySelectorAll(".terminal-pane").length === 0) await createSession();
    const previousClipboard = window.terminalDeck.readClipboard();
    window.terminalDeck.writeClipboard("TERMINAL_DECK_CLIPBOARD_OK");
    const clipboardRoundTrip = window.terminalDeck.readClipboard();
    window.terminalDeck.writeClipboard(previousClipboard);
    const sshProbe = typeof window.terminalDeck.probeSsh === "function"
      ? await window.terminalDeck.probeSsh()
      : null;
    const mcpSetup = typeof window.terminalDeck.getMcpSetupCommand === "function"
      ? await window.terminalDeck.getMcpSetupCommand()
      : null;
    const mcpAgentStatus = typeof window.terminalDeck.getMcpAgentStatus === "function"
      ? await window.terminalDeck.getMcpAgentStatus()
      : null;
    const sshAgentToggleElement = document.getElementById("sshAgentEnabled");
    if (sshAgentToggleElement) {
      sshAgentToggleElement.checked = true;
      syncSshAgentLaunchUi({ detect: false });
      await refreshSshAgentDetection();
      syncSshAgentLaunchUi({ detect: false });
    }
    const sshDetectedAgents = [...document.querySelectorAll("#sshAgentOptions input[name='launchAgent']:not(:disabled)")]
      .map((input) => input.value);
    const sshSelectedAgent = document.querySelector("#sshAgentOptions input[name='launchAgent']:checked")?.value || "";
    const sshAgentSelectedLabel = document.getElementById("sshConnectButtonLabel")?.textContent || "";
    if (sshAgentToggleElement) {
      sshAgentToggleElement.checked = false;
      syncSshAgentLaunchUi({ detect: false });
    }
    return JSON.stringify({
      pathBridge: typeof window.terminalDeck.getPathForFile,
      clipboardBridge: typeof window.terminalDeck.readClipboard,
      clipboardRoundTrip,
      contextMenu: Boolean(document.getElementById("terminalContextMenu")),
      sshBridge: typeof window.terminalDeck.probeSsh,
      sshProbe,
      mcpSetupBridge: typeof window.terminalDeck.getMcpSetupCommand,
      mcpSetupCommand: mcpSetup?.command || "",
      mcpAgentStatusBridge: typeof window.terminalDeck.getMcpAgentStatus,
      mcpAgentInstallBridge: typeof window.terminalDeck.installMcpForAgent,
      mcpAgentIds: Array.isArray(mcpAgentStatus) ? mcpAgentStatus.map((item) => item.id) : [],
      mcpAgentOptions: document.querySelectorAll("#mcpAgentMenu [data-mcp-agent]").length,
      remoteAgentSelect: Boolean(document.getElementById("remoteAgentSelect")),
      sshPasswordField: document.getElementById("sshPassword")?.type || "",
      sshAgentToggle: document.getElementById("sshAgentEnabled")?.type || "",
      sshAgentChoices: document.querySelectorAll("#sshAgentOptions [data-ssh-agent]").length,
      sshAgentConnectLabel: document.getElementById("sshConnectButtonLabel")?.textContent || "",
      sshDetectedAgents,
      sshSelectedAgent,
      sshAgentSelectedLabel,
      powershell: quoteDroppedPath("C:\\\\Work Folder\\\\it's.txt", "powershell"),
      cmd: quoteDroppedPath("C:\\\\Work Folder\\\\file.txt", "cmd"),
      bash: quoteDroppedPath("C:\\\\Work Folder\\\\it's.txt", "git-bash"),
      panes: document.querySelectorAll(".terminal-pane").length
    });
  })()`;

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CDP evaluation timed out.")), 5000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      resolve(message);
    });
    socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
  });

  socket.close();
  if (result.result.exceptionDetails) {
    throw new Error(result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text);
  }
  const value = JSON.parse(result.result.result.value);
  console.log(JSON.stringify(value, null, 2));

  if (
    value.pathBridge !== "function" ||
    value.clipboardBridge !== "function" ||
    value.clipboardRoundTrip !== "TERMINAL_DECK_CLIPBOARD_OK" ||
    !value.contextMenu ||
    value.sshBridge !== "function" ||
    !value.sshProbe?.ok ||
    value.mcpSetupBridge !== "function" ||
    !value.mcpSetupCommand.includes("terminal-matrix-remote") ||
    value.mcpAgentStatusBridge !== "function" ||
    value.mcpAgentInstallBridge !== "function" ||
    value.mcpAgentOptions !== 3 ||
    !["codex", "grok", "claude"].every((id) => value.mcpAgentIds.includes(id)) ||
    !value.remoteAgentSelect ||
    value.sshPasswordField !== "password" ||
    value.sshAgentToggle !== "checkbox" ||
    value.sshAgentChoices !== 3 ||
    value.sshAgentConnectLabel !== "连接" ||
    !["codex", "grok", "claude"].every((id) => value.sshDetectedAgents.includes(id)) ||
    !value.sshSelectedAgent ||
    !value.sshAgentSelectedLabel.startsWith("连接并启动") ||
    value.panes < 1
  ) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
