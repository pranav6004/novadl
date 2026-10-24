const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ytDlpUi", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings) => ipcRenderer.invoke("settings:set", settings),
  chooseDownloadPath: () => ipcRenderer.invoke("dialog:chooseDownloadPath"),
  startDownload: (request) => ipcRenderer.invoke("downloads:start", request),
  cancelDownload: (id) => ipcRenderer.invoke("downloads:cancel", id),
  removeDownload: (id) => ipcRenderer.invoke("downloads:remove", id),
  openFolder: () => ipcRenderer.invoke("folder:open"),
  listStemProjects: () => ipcRenderer.invoke("stems:list"),
  readStemAudio: (filePath) => ipcRenderer.invoke("stems:read-audio", filePath),
  chooseLocalFile: () => ipcRenderer.invoke("stems:choose-local-file"),
  processLocalFile: (filePath) => ipcRenderer.invoke("stems:process-local", filePath),
  exportStems: (options) => ipcRenderer.invoke("stems:export", options),
  openStemFolder: (folderPath) => ipcRenderer.invoke("stems:open-folder", folderPath),
  deleteStemProject: (folderPath) => ipcRenderer.invoke("stems:delete", folderPath),
  onDownloadEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("download:event", listener);
    return () => ipcRenderer.removeListener("download:event", listener);
  }
});
