const { clipboard, contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("terminalDeck", {
  create: (options) => ipcRenderer.invoke("terminal:create", options),
  attach: (id) => ipcRenderer.invoke("terminal:attach", id),
  write: (id, data) => ipcRenderer.send("terminal:write", { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send("terminal:resize", { id, cols, rows }),
  close: (id) => ipcRenderer.send("terminal:close", id),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  readClipboard: () => clipboard.readText(),
  writeClipboard: (text) => clipboard.writeText(String(text || "")),
  chooseWorkspace: () => ipcRenderer.invoke("workspace:choose"),
  onData: (callback) => ipcRenderer.on("terminal:data", (_event, payload) => callback(payload)),
  onExit: (callback) => ipcRenderer.on("terminal:exit", (_event, payload) => callback(payload)),

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
