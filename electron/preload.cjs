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
  getStemEngineStatus: () => ipcRenderer.invoke("stems:get-engine-status"),
  getStemMediaUrl: (filePath) => `novadl-media://local/${encodeURI(String(filePath || "").replace(/\\/g, "/"))}`,
  readStemAudio: (filePath) => ipcRenderer.invoke("stems:read-audio", filePath),
  chooseLocalFile: () => ipcRenderer.invoke("stems:choose-local-file"),
  processLocalFile: (filePath) => ipcRenderer.invoke("stems:process-local", filePath),
  exportStems: (options) => ipcRenderer.invoke("stems:export", options),
  openStemFolder: (folderPath) => ipcRenderer.invoke("stems:open-folder", folderPath),
  deleteStemProject: (folderPath) => ipcRenderer.invoke("stems:delete", folderPath),
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  installUpdate: () => ipcRenderer.invoke("updater:install"),
  getAppVersion: () => ipcRenderer.invoke("updater:get-version"),
  onUpdateEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  },
  onDownloadEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("download:event", listener);
    return () => ipcRenderer.removeListener("download:event", listener);
  }
});
