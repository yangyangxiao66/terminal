const { app } = require("electron");
const pty = require("node-pty");

const timeout = setTimeout(() => {
  console.error("ConPTY smoke test timed out.");
  app.exit(1);
}, 10000);

app.whenReady().then(() => {
  let output = "";
  const terminal = pty.spawn("powershell.exe", ["-NoLogo", "-NoProfile"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
    useConpty: true,
  });

  terminal.onData((data) => {
    output += data;
    if (!output.includes("TERMINAL_DECK_PTY_OK")) return;
    clearTimeout(timeout);
    terminal.kill();
    console.log("ConPTY interactive shell: OK");
    app.exit(0);
  });

  terminal.write("Write-Output TERMINAL_DECK_PTY_OK\r");
});
