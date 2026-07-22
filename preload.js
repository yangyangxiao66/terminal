const { clipboard, contextBridge, ipcRenderer, webUtils } = require("electron");
const os = require("os");

/** xterm windowsPty 需要 Windows build（如 19045）；ConPTY 在 <21376 时禁用 reflow */
function getWindowsPtyInfo() {
  if (process.platform !== "win32") return null;
  const parts = String(os.release() || "").split(".");
  const buildNumber = Number(parts[2]) || 0;
  return {
    backend: "conpty",
    buildNumber: buildNumber > 0 ? buildNumber : 19045,
  };
}

const windowsPtyInfo = getWindowsPtyInfo();

contextBridge.exposeInMainWorld("terminalDeck", {
  create: (options) => ipcRenderer.invoke("terminal:create", options),
  attach: (id) => ipcRenderer.invoke("terminal:attach", id),
  write: (id, data) => ipcRenderer.send("terminal:write", { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send("terminal:resize", { id, cols, rows }),
  close: (id) => ipcRenderer.send("terminal:close", id),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  readClipboard: () => clipboard.readText(),
  writeClipboard: (text) => clipboard.writeText(String(text || "")),
  /** @returns {{ backend: 'conpty', buildNumber: number } | null} */
  getWindowsPty: () => windowsPtyInfo,
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  chooseSshIdentity: () => ipcRenderer.invoke("ssh:choose-identity"),
  probeSsh: () => ipcRenderer.invoke("ssh:probe"),
  getMcpSetupCommand: () => ipcRenderer.invoke("mcp:setup-command"),
  getMcpAgentStatus: () => ipcRenderer.invoke("mcp:agent-status"),
  installMcpForAgent: (agent) => ipcRenderer.invoke("mcp:install-agent", agent),
  setMcpRemoteSession: (id) => ipcRenderer.invoke("mcp:set-remote-session", id),
  getGitBranchInfo: (cwd) => ipcRenderer.invoke("git:branch-info", cwd),
  checkoutGitBranch: (cwd, branch) =>
    ipcRenderer.invoke("git:checkout", { cwd, branch }),
  chooseSkinImage: () => ipcRenderer.invoke("skin:choose-image"),
  listSkinImages: () => ipcRenderer.invoke("skin:list-images"),
  onData: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:data", handler);
    return () => ipcRenderer.removeListener("terminal:data", handler);
  },
  onExit: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:exit", handler);
    return () => ipcRenderer.removeListener("terminal:exit", handler);
  },

  // Matrix desktop pet
  getPetState: () => ipcRenderer.invoke("pet:get-state"),
  setPetEnabled: (enabled) => ipcRenderer.invoke("pet:set-enabled", enabled),
  updatePetStatus: (status) => ipcRenderer.send("pet:update-status", status),
  onPetState: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:state", handler);
    return () => ipcRenderer.removeListener("pet:state", handler);
  },
  onPetRequestNewTerminal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("pet:request-new-terminal", handler);
    return () => ipcRenderer.removeListener("pet:request-new-terminal", handler);
  },
});
