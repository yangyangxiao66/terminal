const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const pty = require("node-pty");

const terminals = new Map();
let nextTerminalId = 1;
let mainWindow = null;
let petWindow = null;
let petEnabled = false;
/** Latest pet status pushed from the main renderer. */
let petStatus = {
  terminalCount: 0,
  activeShell: "powershell",
  mood: "idle",
};

/** Cached User+Machine PATH from the registry (Electron's process.env goes stale). */
let cachedWindowsPath = null;
let cachedWindowsPathAt = 0;
const PATH_CACHE_MS = 30_000;

/**
 * Read the live Windows PATH from Machine + User env (not the parent process).
 * Long-lived Electron apps keep the PATH from launch time, so tools installed
 * later (e.g. grok under %USERPROFILE%\.grok\bin) are invisible to child shells
 * unless we refresh from the registry.
 */
function getFreshWindowsPath() {
  const now = Date.now();
  if (cachedWindowsPath && now - cachedWindowsPathAt < PATH_CACHE_MS) {
    return cachedWindowsPath;
  }

  try {
    const script =
      "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + " +
      "[Environment]::GetEnvironmentVariable('Path','User')";
    const fresh = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", windowsHide: true, timeout: 5000 }
    ).trim();
    if (fresh) {
      cachedWindowsPath = fresh;
      cachedWindowsPathAt = now;
      return fresh;
    }
  } catch {
    // Fall back to process.env below.
  }

  return process.env.Path || process.env.PATH || "";
}

function buildShellEnv() {
  const env = {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  };

  if (process.platform === "win32") {
    const freshPath = getFreshWindowsPath();
    if (freshPath) {
      // Windows and Node both check these; set both for PowerShell/cmd/Git Bash.
      env.Path = freshPath;
      env.PATH = freshPath;
    }
  }

  return env;
}

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

function broadcastPetStatus() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet:status", petStatus);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("pet:state", { enabled: petEnabled });
  }
}

function createTerminal(event, options = {}) {
  const id = String(nextTerminalId++);
  const shell = resolveShell(options.shell);
  const cwd = validWorkingDirectory(options.cwd);
  const cols = Math.max(20, Math.min(400, Number(options.cols) || 100));
  const rows = Math.max(5, Math.min(200, Number(options.rows) || 30));
  const env = buildShellEnv();

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

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "终端矩阵",
    backgroundColor: "#111417",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
  window.once("ready-to-show", () => window.show());

  window.on("close", (event) => {
    // 宠物开启时关闭主窗口只是隐藏，方便常驻桌面
    if (petEnabled && petWindow && !petWindow.isDestroyed()) {
      event.preventDefault();
      window.hide();
    }
  });

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  mainWindow = window;
  return window;
}

function placePetOnDesktop(win) {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const { x: originX, y: originY } = display.workArea;
  const [pw, ph] = win.getSize();
  win.setPosition(originX + width - pw - 24, originY + height - ph - 24);
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show();
    petWindow.focus();
    return petWindow;
  }

  const win = new BrowserWindow({
    width: 168,
    height: 210,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    focusable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload-pet.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, "renderer", "pet.html"));
  placePetOnDesktop(win);

  win.once("ready-to-show", () => {
    win.showInactive();
    broadcastPetStatus();
  });

  win.on("closed", () => {
    if (petWindow === win) petWindow = null;
    const wasEnabled = petEnabled;
    petEnabled = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("pet:state", { enabled: false });
      if (wasEnabled && !mainWindow.isVisible()) showMainWindow();
    }
  });

  petWindow = win;
  petEnabled = true;
  return win;
}

function setPetEnabled(enabled) {
  if (enabled) {
    createPetWindow();
    petEnabled = true;
  } else {
    petEnabled = false;
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.removeAllListeners("closed");
      petWindow.close();
      petWindow = null;
    }
    // 关掉宠物时如果主窗口是隐藏的，重新显示，避免应用“消失”
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      showMainWindow();
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("pet:state", { enabled: petEnabled });
  }
  return petEnabled;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// --- Terminal IPC ---
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

// --- Pet IPC ---
ipcMain.handle("pet:get-state", () => ({ enabled: petEnabled, status: petStatus }));
ipcMain.handle("pet:set-enabled", (_event, enabled) => setPetEnabled(Boolean(enabled)));
ipcMain.on("pet:update-status", (_event, status) => {
  if (!status || typeof status !== "object") return;
  petStatus = {
    terminalCount: Math.max(0, Number(status.terminalCount) || 0),
    activeShell: String(status.activeShell || "powershell"),
    mood: String(status.mood || "idle"),
  };
  broadcastPetStatus();
});
ipcMain.on("pet:show-main", () => showMainWindow());
ipcMain.on("pet:hide-pet", () => setPetEnabled(false));
ipcMain.on("pet:new-terminal", () => {
  showMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("pet:request-new-terminal");
  }
});
ipcMain.on("pet:move-by", (event, { dx, dy }) => {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (event.sender !== petWindow.webContents) return;
  const [x, y] = petWindow.getPosition();
  petWindow.setPosition(Math.round(x + Number(dx || 0)), Math.round(y + Number(dy || 0)));
});
ipcMain.on("pet:quit-app", () => {
  petEnabled = false;
  for (const id of [...terminals.keys()]) closeTerminal(id);
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.removeAllListeners("close");
    petWindow.destroy();
    petWindow = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners("close");
    mainWindow.destroy();
    mainWindow = null;
  }
  app.quit();
});

app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else showMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (petEnabled && petWindow && !petWindow.isDestroyed()) return;
  for (const id of [...terminals.keys()]) closeTerminal(id);
  if (process.platform !== "darwin") app.quit();
});
