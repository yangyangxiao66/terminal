const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("matrixPet", {
  getState: () => ipcRenderer.invoke("pet:get-state"),
  onStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:status", handler);
    return () => ipcRenderer.removeListener("pet:status", handler);
  },
  showMain: () => ipcRenderer.send("pet:show-main"),
  hidePet: () => ipcRenderer.send("pet:hide-pet"),
  newTerminal: () => ipcRenderer.send("pet:new-terminal"),
  moveBy: (dx, dy) => ipcRenderer.send("pet:move-by", { dx, dy }),
  quitApp: () => ipcRenderer.send("pet:quit-app"),
});
