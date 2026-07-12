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
    return JSON.stringify({
      pathBridge: typeof window.terminalDeck.getPathForFile,
      clipboardBridge: typeof window.terminalDeck.readClipboard,
      clipboardRoundTrip,
      contextMenu: Boolean(document.getElementById("terminalContextMenu")),
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
    value.panes < 1
  ) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
