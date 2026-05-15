const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const downloads = new Map();
const downloadFiles = new Map();

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function readSettings() {
  const fallback = {
    downloadPath: app.getPath("downloads"),
    mode: "video",
    quality: "original",
    browser: "none"
  };

  try {
    const settingsPath = getSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return fallback;
    }

    return {
      ...fallback,
      ...JSON.parse(fs.readFileSync(settingsPath, "utf8"))
    };
  } catch {
    return fallback;
  }
}

function writeSettings(nextSettings) {
  const settings = {
    ...readSettings(),
    ...nextSettings
  };

  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
  return settings;
}

function getYtDlpCommand() {
  const exeName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  
  // Packaged app path
  const bundledPath = path.join(process.resourcesPath, "bin", exeName);
  if (app.isPackaged && fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  // Development path
  const devPath = path.join(app.getAppPath(), "bin", exeName);
  if (!app.isPackaged && fs.existsSync(devPath)) {
    return devPath;
  }

  return "yt-dlp";
}

function createWindow() {
  const windowConfig = {
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    title: "NovaDL",
    backgroundColor: "#10131f",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };

  if (process.env.VITE_DEV_SERVER_URL) {
    windowConfig.icon = path.join(__dirname, "..", "public", "icon.png");
  } else if (process.platform !== "win32") {
    windowConfig.icon = path.join(__dirname, "..", "dist", "icon.png");
  }

  const mainWindow = new BrowserWindow(windowConfig);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function buildArgs({ url, mode, quality, downloadPath, browser }) {
  const args = [
    "--newline",
    "--no-playlist",
    "--progress",
    "--progress-delta",
    "1",
    "--merge-output-format",
    "mkv",
    "--paths",
    downloadPath,
    "--output",
    "%(title)s.%(ext)s"
  ];

  if (mode === "audio") {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
  } else if (mode === "video-only") {
    if (quality === "1080") {
      args.push("-f", "bv*[height<=1080]/bestvideo[height<=1080]/best[height<=1080]");
    } else if (quality === "720") {
      args.push("-f", "bv*[height<=720]/bestvideo[height<=720]/best[height<=720]");
    } else {
      args.push("-f", "bv*/bestvideo/best");
    }
  } else {
    if (quality === "1080") {
      args.push("-f", "bv*[height<=1080]+ba/b[height<=1080]/best");
    } else if (quality === "720") {
      args.push("-f", "bv*[height<=720]+ba/b[height<=720]/best");
    } else {
      args.push("-f", "bv*+ba/best");
    }
  }

  if (browser && browser !== "none") {
    args.push("--cookies-from-browser", browser);
  }

  args.push(url);
  return args;
}

function parseProgress(line) {
  const progressMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  const speedMatch = line.match(/at\s+([^\s]+\/s)/);
  const etaMatch = line.match(/ETA\s+([^\s]+)/);
  const sizeMatch = line.match(/of\s+~?\s*([\d.]+[a-zA-Z]+)/);

  if (!progressMatch) {
    return null;
  }

  return {
    percent: Number(progressMatch[1]),
    speed: speedMatch?.[1] ?? "",
    eta: etaMatch?.[1] ?? "",
    size: sizeMatch?.[1] ?? ""
  };
}

function sendDownloadEvent(id, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("download:event", { id, ...payload });
  }
}

ipcMain.handle("settings:get", () => readSettings());
ipcMain.handle("settings:set", (_event, settings) => writeSettings(settings));

ipcMain.handle("dialog:chooseDownloadPath", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    title: "Choose download folder"
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("downloads:start", (_event, request) => {
  const id = crypto.randomUUID();
  const settings = writeSettings({
    downloadPath: request.downloadPath,
    mode: request.mode,
    quality: request.quality
  });

  const child = spawn(getYtDlpCommand(), buildArgs({ ...request, ...settings }), {
    windowsHide: true
  });

  const download = { child, cancelled: false };
  downloads.set(id, download);
  downloadFiles.set(id, new Set());
  setImmediate(() => sendDownloadEvent(id, { type: "started" }));

  child.stdout.on("data", (buffer) => {
    for (const line of buffer.toString().split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      const files = downloadFiles.get(id);
      if (files) {
        const destMatch = line.match(/Destination:\s+(.*)$/);
        if (destMatch) files.add(destMatch[1].trim());

        const mergeMatch = line.match(/Merging formats into\s+"([^"]+)"/);
        if (mergeMatch) files.add(mergeMatch[1]);

        const alreadyMatch = line.match(/\[download\]\s+(.*)\s+has already been downloaded/);
        if (alreadyMatch) files.add(alreadyMatch[1].trim());
      }

      const progress = parseProgress(line);
      sendDownloadEvent(id, progress ? { type: "progress", ...progress, line } : { type: "log", line });
    }
  });

  child.stderr.on("data", (buffer) => {
    for (const line of buffer.toString().split(/\r?\n/)) {
      if (line.trim()) {
        sendDownloadEvent(id, { type: "log", level: "error", line });
      }
    }
  });

  child.on("error", (error) => {
    downloads.delete(id);
    sendDownloadEvent(id, {
      type: "error",
      message: error.code === "ENOENT" ? "yt-dlp was not found. Install it or bundle it with the app." : error.message
    });
  });

  child.on("close", (code) => {
    downloads.delete(id);
    if (download.cancelled) {
      return;
    }

    sendDownloadEvent(id, {
      type: code === 0 ? "complete" : "error",
      message: code === 0 ? "Download complete" : `yt-dlp exited with code ${code}`
    });
  });

  return { id };
});

ipcMain.handle("downloads:cancel", (_event, id) => {
  const download = downloads.get(id);
  if (!download) {
    return false;
  }

  download.cancelled = true;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", download.child.pid, "/f", "/t"], { windowsHide: true });
  } else {
    download.child.kill("SIGKILL");
  }

  downloads.delete(id);
  sendDownloadEvent(id, { type: "cancelled", message: "Download cancelled" });
  return true;
});

ipcMain.handle("downloads:remove", async (_event, id) => {
  const result = await dialog.showMessageBox({
    type: "question",
    buttons: ["Remove", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Remove Download",
    message: "Remove this download from the list?",
    checkboxLabel: "Delete downloaded files from disk",
    checkboxChecked: false
  });

  if (result.response === 1) {
    return false;
  }

  if (result.checkboxChecked) {
    const files = downloadFiles.get(id);
    if (files) {
      for (const file of files) {
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file);
          if (fs.existsSync(file + ".part")) fs.unlinkSync(file + ".part");
          if (fs.existsSync(file + ".ytdl")) fs.unlinkSync(file + ".ytdl");
        } catch (e) {
          console.error("Failed to delete", file, e);
        }
      }
    }
  }

  downloadFiles.delete(id);
  return true;
});

ipcMain.handle("folder:open", async (_event, folderPath) => {
  await shell.openPath(folderPath);
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
