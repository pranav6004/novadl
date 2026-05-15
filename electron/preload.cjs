const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ytDlpUi", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings) => ipcRenderer.invoke("settings:set", settings),
  chooseDownloadPath: () => ipcRenderer.invoke("dialog:chooseDownloadPath"),
  startDownload: (request) => ipcRenderer.invoke("downloads:start", request),
  cancelDownload: (id) => ipcRenderer.invoke("downloads:cancel", id),
  removeDownload: (id) => ipcRenderer.invoke("downloads:remove", id),
  openFolder: (folderPath) => ipcRenderer.invoke("folder:open", folderPath),
  onDownloadEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("download:event", listener);
    return () => ipcRenderer.removeListener("download:event", listener);
  }
});
