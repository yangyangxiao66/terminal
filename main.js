const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const pty = require("node-pty");

const terminals = new Map();
let nextTerminalId = 1;

function resolveShell(shellName) {
  if (shellName === "cmd") {
    return { executable: process.env.ComSpec || "cmd.exe", args: ["/K"] };
  }

  if (shellName === "git-bash") {
    const candidates = [
      "F:\\git\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ];
    const executable = candidates.find((candidate) => fs.existsSync(candidate));
    if (executable) {
      return { executable, args: ["--login", "-i"] };
    }
  }

  return {
    executable: "powershell.exe",
    args: ["-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass"],
  };
}

function validWorkingDirectory(value) {
  if (typeof value === "string" && fs.existsSync(value)) {
    try {
      if (fs.statSync(value).isDirectory()) return path.resolve(value);
    } catch {
      // Fall through to a known directory.
    }
  }
  return fs.existsSync("G:\\myday") ? "G:\\myday" : app.getPath("home");
}

function createTerminal(event, options = {}) {
  const id = String(nextTerminalId++);
  const shell = resolveShell(options.shell);
  const cwd = validWorkingDirectory(options.cwd);
  const cols = Math.max(20, Math.min(400, Number(options.cols) || 100));
  const rows = Math.max(5, Math.min(200, Number(options.rows) || 30));
  const env = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" };

  const processHandle = pty.spawn(shell.executable, shell.args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env,
    useConpty: true,
  });

  const entry = {
    id,
    owner: event.sender,
    processHandle,
    buffer: [],
    attached: false,
  };
  terminals.set(id, entry);

  processHandle.onData((data) => {
    if (!entry.attached) {
      entry.buffer.push(data);
      return;
    }
    if (!entry.owner.isDestroyed()) entry.owner.send("terminal:data", { id, data });
  });

  processHandle.onExit(({ exitCode }) => {
    if (!entry.owner.isDestroyed()) entry.owner.send("terminal:exit", { id, exitCode });
  });

  return { id, cwd, shell: options.shell || "powershell" };
}

function closeTerminal(id) {
  const entry = terminals.get(String(id));
  if (!entry) return;
  terminals.delete(String(id));
  try {
    entry.processHandle.kill();
  } catch {
    // The shell may already have exited.
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "终端矩阵",
    backgroundColor: "#111417",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("terminal:create", createTerminal);
ipcMain.handle("terminal:attach", (event, id) => {
  const entry = terminals.get(String(id));
  if (!entry || entry.owner !== event.sender) return false;
  entry.attached = true;
  for (const data of entry.buffer) entry.owner.send("terminal:data", { id: entry.id, data });
  entry.buffer.length = 0;
  return true;
});
ipcMain.on("terminal:write", (event, { id, data }) => {
  const entry = terminals.get(String(id));
  if (entry && entry.owner === event.sender && typeof data === "string") entry.processHandle.write(data);
});
ipcMain.on("terminal:resize", (event, { id, cols, rows }) => {
  const entry = terminals.get(String(id));
  if (!entry || entry.owner !== event.sender) return;
  const safeCols = Math.max(20, Math.min(400, Number(cols) || 80));
  const safeRows = Math.max(5, Math.min(200, Number(rows) || 24));
  try {
    entry.processHandle.resize(safeCols, safeRows);
  } catch {
    // Ignore resize races while a shell is exiting.
  }
});
ipcMain.on("terminal:close", (event, id) => {
  const entry = terminals.get(String(id));
  if (entry && entry.owner === event.sender) closeTerminal(id);
});
ipcMain.handle("workspace:choose", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择终端工作目录",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const id of [...terminals.keys()]) closeTerminal(id);
  if (process.platform !== "darwin") app.quit();
});
