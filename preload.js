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
});
