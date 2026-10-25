const { app, BrowserWindow, dialog, ipcMain, shell, protocol, net } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const url = require("node:url");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "novadl-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  }
]);

const {
  normalizeBrowser,
  normalizeSettings,
  normalizeDownloadRequest,
  isSupportedDownloadUrl,
  videoFormatSelector,
  buildArgs,
  cleanOutputPath,
  normalizeComparablePathName,
  sanitizeStemTitle,
  getStemSeparationFilters,
  DEFAULT_STEMS,
  STEM_CONFIG,
  detectStemKitEngine,
  parseProgress
} = require("./utils.cjs");

const downloads = new Map();
const downloadFiles = new Map();
let hwEncoderCache;
let hwEncoderPromise;
const downloadQueue = [];
let activeDownloadsCount = 0;
const transcodeQueue = [];
let activeTranscodesCount = 0;
const MAX_CONCURRENT_DOWNLOADS = 2;
const MAX_CONCURRENT_TRANSCODES = 1;

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

    return normalizeSettings({
      ...fallback,
      ...JSON.parse(fs.readFileSync(settingsPath, "utf8"))
    }, app.getPath("downloads"));
  } catch {
    return fallback;
  }
}

function writeSettings(nextSettings) {
  try {
    const settings = normalizeSettings({
      ...readSettings(),
      ...nextSettings
    }, app.getPath("downloads"));

    const settingsDir = path.dirname(getSettingsPath());
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
    return settings;
  } catch {
    return readSettings();
  }
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

function getFfmpegLocation() {
  const exeName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const bundledPath = path.join(process.resourcesPath, "bin", exeName);
  if (app.isPackaged && fs.existsSync(bundledPath)) {
    return path.dirname(bundledPath);
  }

  const devPath = path.join(app.getAppPath(), "bin", exeName);
  if (!app.isPackaged && fs.existsSync(devPath)) {
    return path.dirname(devPath);
  }

  return null;
}

function getFfmpegCommand() {
  const exeName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const bundledPath = path.join(process.resourcesPath, "bin", exeName);
  if (app.isPackaged && fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  const devPath = path.join(app.getAppPath(), "bin", exeName);
  if (!app.isPackaged && fs.existsSync(devPath)) {
    return devPath;
  }

  return "ffmpeg";
}

function getFfprobeCommand() {
  const exeName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const bundledPath = path.join(process.resourcesPath, "bin", exeName);
  if (app.isPackaged && fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  const devPath = path.join(app.getAppPath(), "bin", exeName);
  if (!app.isPackaged && fs.existsSync(devPath)) {
    return devPath;
  }

  return "ffprobe";
}

let updaterListenersAttached = false;

function setupAutoUpdater(mainWindow) {
  if (updaterListenersAttached) return;
  updaterListenersAttached = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:status", { status: "checking" });
    }
  });

  autoUpdater.on("update-available", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:status", {
        status: "available",
        version: info?.version,
        releaseDate: info?.releaseDate
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:status", {
        status: "up-to-date",
        version: app.getVersion()
      });
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:status", {
        status: "downloading",
        percent: Math.round(progress.percent || 0),
        bytesPerSecond: progress.bytesPerSecond || 0,
        transferred: progress.transferred || 0,
        total: progress.total || 0
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:status", {
        status: "downloaded",
        version: info?.version
      });
    }
  });

  autoUpdater.on("error", (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("updater:status", {
        status: "error",
        message: err ? err.message : "Update check failed"
      });
    }
  });
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
      sandbox: true
    }
  };

  const iconCandidates = [
    path.join(__dirname, "..", "public", "icon.ico"),
    path.join(__dirname, "..", "dist", "icon.ico"),
    path.join(__dirname, "..", "public", "icon.png"),
    path.join(__dirname, "..", "dist", "icon.png")
  ];
  for (const candidate of iconCandidates) {
    if (fs.existsSync(candidate)) {
      windowConfig.icon = candidate;
      break;
    }
  }

  const mainWindow = new BrowserWindow(windowConfig);

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, navUrl) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl && navUrl.startsWith(devUrl)) return;
    if (!devUrl && navUrl.startsWith("file://")) return;
    event.preventDefault();
  });

  setupAutoUpdater(mainWindow);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.log("Background auto-update check:", err?.message);
      });
    }, 4000);
  }
}

function resolveExistingOutputPath(outputPath) {
  const cleanPath = cleanOutputPath(outputPath);
  if (fs.existsSync(cleanPath)) {
    return cleanPath;
  }

  const directory = path.dirname(cleanPath);
  const parsed = path.parse(cleanPath);
  if (!fs.existsSync(directory)) {
    return cleanPath;
  }

  const wantedExtension = parsed.ext.toLowerCase();
  const candidates = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => path.extname(fileName).toLowerCase() === wantedExtension);

  // 1. Try matching by YouTube ID in brackets: [id]
  const idMatch = parsed.name.match(/\[([a-zA-Z0-9_-]{6,})\]/);
  if (idMatch) {
    const wantedId = idMatch[1];
    const idCandidate = candidates.find((fileName) => {
      const m = fileName.match(/\[([a-zA-Z0-9_-]{6,})\]/);
      return m && m[1] === wantedId;
    });
    if (idCandidate) {
      return path.join(directory, idCandidate);
    }
  }

  // 2. Exact normalized equality match
  const wantedName = normalizeComparablePathName(parsed.name);
  const exactMatch = candidates.find((fileName) => {
    return normalizeComparablePathName(path.parse(fileName).name) === wantedName;
  });

  return exactMatch ? path.join(directory, exactMatch) : cleanPath;
}

function editingOutputPaths(inputPath) {
  const resolvedInputPath = resolveExistingOutputPath(inputPath);
  const parsed = path.parse(resolvedInputPath);
  const finalPath = path.join(parsed.dir, `${parsed.name}.mp4`);
  const tempPath = path.join(parsed.dir, `${parsed.name}.novadl-editing.tmp.mp4`);
  const backupSourcePath = path.join(parsed.dir, `${parsed.name}.novadl-source.tmp${parsed.ext}`);

  return { finalPath, tempPath, backupSourcePath, resolvedInputPath };
}

function detectHardwareEncoder() {
  if (hwEncoderCache !== undefined) return Promise.resolve(hwEncoderCache);
  if (hwEncoderPromise) return hwEncoderPromise;

  const candidates = ["h264_nvenc", "h264_amf", "h264_qsv"];
  let idx = 0;

  hwEncoderPromise = new Promise((resolve) => {
    function tryNext() {
      if (idx >= candidates.length) {
        hwEncoderCache = null;
        resolve(null);
        return;
      }

      const encoder = candidates[idx++];
      const tempTest = path.join(app.getPath("temp"), `nvenc_test_${Date.now()}_${idx}.mp4`);
      const proc = spawn(getFfmpegCommand(), [
        "-y", "-f", "lavfi", "-i", "color=size=256x256:rate=25:duration=0.2,format=yuv420p",
        "-frames:v", "1", "-c:v", encoder, tempTest
      ], { windowsHide: true, stdio: "ignore" });

      const timeout = setTimeout(() => {
        try { proc.kill(); } catch {}
      }, 3000);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        try { fs.unlinkSync(tempTest); } catch {}
        if (code === 0) {
          hwEncoderCache = encoder;
          resolve(encoder);
        } else {
          tryNext();
        }
      });
      proc.on("error", () => {
        clearTimeout(timeout);
        try { fs.unlinkSync(tempTest); } catch {}
        tryNext();
      });
    }

    tryNext();
  });

  return hwEncoderPromise;
}

function hwEncoderArgs(encoder) {
  switch (encoder) {
    case "h264_nvenc":
      return ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "20", "-pix_fmt", "yuv420p"];
    case "h264_amf":
      return ["-c:v", "h264_amf", "-quality", "balanced", "-pix_fmt", "yuv420p"];
    case "h264_qsv":
      return ["-c:v", "h264_qsv", "-preset", "medium", "-global_quality", "20"];
    default:
      return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"];
  }
}

function probeCodecs(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-show_entries", "format=format_name,duration:stream=codec_type,codec_name",
      "-of", "json",
      filePath
    ];
    const ffprobe = spawn(getFfprobeCommand(), args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    ffprobe.stdout.on("data", (b) => { stdout += b.toString(); });
    ffprobe.stderr.on("data", (b) => { stderr += b.toString(); });
    ffprobe.on("error", reject);
    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffprobe exited with code ${code}`));
        return;
      }
      try {
        const info = JSON.parse(stdout);
        const streams = Array.isArray(info.streams) ? info.streams : [];
        const video = streams.find((s) => s.codec_type === "video");
        const audio = streams.find((s) => s.codec_type === "audio");
        resolve({
          videoCodec: video?.codec_name ?? null,
          audioCodec: audio?.codec_name ?? null,
          format: info.format?.format_name ?? "",
          duration: parseFloat(info.format?.duration) || 0
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function transcodeForEditing({ id, download, inputPath, mode }) {
  const resolvedInputPath = inputPath ? resolveExistingOutputPath(inputPath) : "";
  if (!resolvedInputPath || !fs.existsSync(resolvedInputPath)) {
    throw new Error("Could not determine downloaded file path for transcoding.");
  }

  const source = await probeCodecs(resolvedInputPath);
  const isMP4 = source.format.includes("mp4") || source.format.includes("mov");
  const isH264 = source.videoCodec === "h264";
  const isAAC = source.audioCodec === "aac";
  const needsAudio = mode !== "video-only";
  const audioOk = !needsAudio || isAAC || !source.audioCodec;

  const { finalPath, tempPath, backupSourcePath } = editingOutputPaths(resolvedInputPath);
  const isSameFile = resolvedInputPath.toLowerCase() === finalPath.toLowerCase();

  // Already editing-compatible — skip transcoding entirely
  if (isMP4 && isH264 && audioOk) {
    sendDownloadEvent(id, { type: "log", line: "Source is already H.264/AAC MP4 — no transcoding needed" });
    if (!isSameFile) {
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      fs.renameSync(resolvedInputPath, finalPath);
      const files = downloadFiles.get(id);
      if (files) {
        files.add(finalPath);
        files.delete(inputPath);
        files.delete(resolvedInputPath);
      }
    }
    return { finalPath, sourcePath: resolvedInputPath, isBackup: false, skipped: true };
  }

  if (download?.cancelled) throw new Error("Download was cancelled");

  // Protect against in-place overwriting: if input and output are both .mp4, move source to backup first
  let ffmpegInputPath = resolvedInputPath;
  if (isSameFile) {
    if (fs.existsSync(backupSourcePath)) {
      try { fs.unlinkSync(backupSourcePath); } catch {}
    }
    fs.renameSync(resolvedInputPath, backupSourcePath);
    ffmpegInputPath = backupSourcePath;
    const files = downloadFiles.get(id);
    if (files) {
      files.add(backupSourcePath);
      files.delete(resolvedInputPath);
      files.delete(inputPath);
    }
  }

  // Build ffmpeg args — copy compatible streams, only re-encode what is needed
  const args = ["-y", "-i", ffmpegInputPath];

  if (isH264) {
    args.push("-c:v", "copy");
    sendDownloadEvent(id, { type: "log", line: "Video is already H.264 — copying without re-encoding" });
  } else {
    const hwEncoder = await detectHardwareEncoder();
    args.push(...hwEncoderArgs(hwEncoder));
    if (hwEncoder) {
      sendDownloadEvent(id, { type: "log", line: `Converting ${source.videoCodec || "unknown"} video to H.264 (GPU: ${hwEncoder})` });
    } else {
      sendDownloadEvent(id, { type: "log", line: `Converting ${source.videoCodec || "unknown"} video to H.264 (CPU)` });
    }
  }

  if (!needsAudio || !source.audioCodec) {
    args.push("-an");
  } else if (isAAC) {
    args.push("-c:a", "copy");
    sendDownloadEvent(id, { type: "log", line: "Audio is already AAC — copying without re-encoding" });
  } else {
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  args.push("-movflags", "+faststart", tempPath);
  sendDownloadEvent(id, { type: "progress", percent: 80, speed: "", eta: "" });

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(getFfmpegCommand(), args, { windowsHide: true });
    if (download) download.ffmpeg = ffmpeg;

    ffmpeg.stderr.on("data", (buffer) => {
      const lines = buffer.toString().split(/\r?\n/).filter((l) => l.trim());
      const lastLine = lines.at(-1);
      if (!lastLine) return;

      const timeMatch = lastLine.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (timeMatch && source.duration > 0) {
        const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
        const pct = Math.min(99, Math.round((secs / source.duration) * 100));
        const speedMatch = lastLine.match(/speed=\s*([\d.]+)/);
        const speedVal = speedMatch ? parseFloat(speedMatch[1]) : 0;
        let eta = "";
        if (speedVal > 0) {
          const remaining = Math.round((source.duration - secs) / speedVal);
          if (remaining >= 60) {
            eta = `${Math.floor(remaining / 60)}m ${remaining % 60}s`;
          } else {
            eta = `${remaining}s`;
          }
        }
        sendDownloadEvent(id, {
          type: "progress",
          percent: 80 + Math.round(pct * 0.2),
          eta,
          line: lastLine
        });
      } else {
        sendDownloadEvent(id, { type: "log", line: lastLine });
      }
    });

    ffmpeg.on("error", (err) => {
      if (download) download.ffmpeg = null;
      if (isSameFile && fs.existsSync(backupSourcePath) && !fs.existsSync(resolvedInputPath)) {
        try { fs.renameSync(backupSourcePath, resolvedInputPath); } catch {}
      }
      reject(err);
    });

    ffmpeg.on("close", (code) => {
      if (download) download.ffmpeg = null;

      if (code !== 0) {
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch {}
        }
        if (isSameFile && fs.existsSync(backupSourcePath) && !fs.existsSync(resolvedInputPath)) {
          try { fs.renameSync(backupSourcePath, resolvedInputPath); } catch {}
        }
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }

      try {
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        fs.renameSync(tempPath, finalPath);

        const files = downloadFiles.get(id);
        if (files) {
          files.add(finalPath);
          if (!isSameFile) {
            files.delete(inputPath);
            files.delete(resolvedInputPath);
          }
        }

        resolve({
          finalPath,
          sourcePath: isSameFile ? backupSourcePath : resolvedInputPath,
          isBackup: isSameFile,
          originalPath: resolvedInputPath,
          skipped: false
        });
      } catch (error) {
        if (isSameFile && fs.existsSync(backupSourcePath) && !fs.existsSync(resolvedInputPath)) {
          try { fs.renameSync(backupSourcePath, resolvedInputPath); } catch {}
        }
        reject(error);
      }
    });
  });
}

function validateEditingOutput(filePath, mode) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "format=format_name:stream=codec_type,codec_name",
      "-of",
      "json",
      filePath
    ];
    const ffprobe = spawn(getFfprobeCommand(), args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    ffprobe.stdout.on("data", (buffer) => {
      stdout += buffer.toString();
    });

    ffprobe.stderr.on("data", (buffer) => {
      stderr += buffer.toString();
    });

    ffprobe.on("error", reject);
    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffprobe exited with code ${code}`));
        return;
      }

      try {
        const info = JSON.parse(stdout);
        const formatName = info.format?.format_name ?? "";
        const streams = Array.isArray(info.streams) ? info.streams : [];
        const video = streams.find((stream) => stream.codec_type === "video");
        const audio = streams.find((stream) => stream.codec_type === "audio");

        if (!formatName.includes("mp4") && !formatName.includes("mov")) {
          reject(new Error("Final file is not an MP4 container."));
          return;
        }

        if (video?.codec_name !== "h264") {
          reject(new Error("Final file is not H.264 video."));
          return;
        }

        if (mode !== "video-only" && audio && audio.codec_name !== "aac") {
          reject(new Error("Final file audio is not AAC."));
          return;
        }

        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendDownloadEvent(id, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("download:event", { id, ...payload });
  }
}

ipcMain.handle("settings:get", () => readSettings());
ipcMain.handle("settings:set", (_event, settings) => writeSettings(settings));

ipcMain.handle("dialog:chooseDownloadPath", async () => {
  const currentPath = readSettings().downloadPath;
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    title: "Choose download folder",
    defaultPath: currentPath && fs.existsSync(currentPath) ? currentPath : undefined
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

function queueTranscode(task) {
  return new Promise((resolve, reject) => {
    transcodeQueue.push({ task, resolve, reject });
    pumpTranscodeQueue();
  });
}

function pumpTranscodeQueue() {
  while (activeTranscodesCount < MAX_CONCURRENT_TRANSCODES && transcodeQueue.length > 0) {
    const job = transcodeQueue.shift();
    activeTranscodesCount++;
    job.task()
      .then(job.resolve, job.reject)
      .finally(() => {
        activeTranscodesCount--;
        pumpTranscodeQueue();
      });
  }
}

function pumpDownloadQueue() {
  while (activeDownloadsCount < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
    const job = downloadQueue.shift();
    if (job.download.cancelled) continue;
    activeDownloadsCount++;
    runDownload(job).finally(() => {
      activeDownloadsCount--;
      pumpDownloadQueue();
    });
  }
}

async function tryDeleteFile(filePath, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return;
    } catch {
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

function extractWavWaveform(wavPath, numBars = 64) {
  try {
    const fd = fs.openSync(wavPath, "r");
    const stat = fs.fstatSync(fd);
    const dataSize = Math.max(0, stat.size - 44);
    if (dataSize <= 0) {
      fs.closeSync(fd);
      return Array(numBars).fill(0.15);
    }

    const peaks = [];
    const samplesPerBar = Math.floor(dataSize / (numBars * 4));
    const buffer = Buffer.alloc(Math.min(4096, Math.max(256, samplesPerBar * 4)));

    for (let i = 0; i < numBars; i++) {
      const offset = 44 + Math.floor((i / numBars) * dataSize);
      const bytesToRead = Math.min(buffer.length, stat.size - offset);
      if (bytesToRead <= 0) {
        peaks.push(0.1);
        continue;
      }
      fs.readSync(fd, buffer, 0, bytesToRead, offset);
      let maxAmp = 0;
      for (let b = 0; b < bytesToRead - 1; b += 2) {
        const val = Math.abs(buffer.readInt16LE(b));
        if (val > maxAmp) maxAmp = val;
      }
      const norm = Math.max(0.08, Math.min(0.98, maxAmp / 32768));
      peaks.push(Number(norm.toFixed(3)));
    }
    fs.closeSync(fd);
    return peaks;
  } catch {
    return Array.from({ length: numBars }, (_, i) => {
      const wave = Math.sin((i / numBars) * Math.PI) * 0.7 + Math.cos(i * 0.5) * 0.2 + 0.1;
      return Math.max(0.08, Math.min(0.95, Number(wave.toFixed(3))));
    });
  }
}

function runFfmpegCommand(args, onProc) {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegCommand(), args, { windowsHide: true });
    if (onProc) onProc(proc);
    let stderr = "";
    proc.stderr.on("data", (b) => { stderr += b.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-300)}`));
    });
    proc.on("error", (err) => reject(err));
  });
}

async function separateAudioStems({ id, download, sourceWavPath, downloadPath, titleOverride }) {
  const resolvedSource = resolveExistingOutputPath(sourceWavPath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Stem source file not found: ${sourceWavPath}`);
  }

  let duration = 0;
  try {
    const codecs = await probeCodecs(resolvedSource);
    duration = codecs.duration || 0;
  } catch {}

  const rawTitle = titleOverride || path.basename(resolvedSource, path.extname(resolvedSource));
  const cleanTitle = rawTitle.replace(/\s*\[[a-zA-Z0-9_-]+\]$/, "").trim() || "Stem Track";
  const safeFolderName = sanitizeStemTitle(cleanTitle);

  const stemsBaseDir = path.join(downloadPath, "NovaDL_Stems");
  const projectDir = path.join(stemsBaseDir, safeFolderName);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const filters = getStemSeparationFilters();
  const stemFiles = {};
  const waveforms = {};

  const engine = detectStemKitEngine();
  let aiSeparationSucceeded = false;

  if (engine.detected && engine.ready) {
    try {
      if (id) {
        sendDownloadEvent(id, {
          type: "progress",
          percent: 75,
          message: "Starting StemKit AI separation engine (GPU accelerated)…"
        });
      }

      // 1. Separate vocals if RoFormer script and model exist
      if (engine.hasRoformer && fs.existsSync(engine.roformerScript)) {
        if (id) {
          sendDownloadEvent(id, {
            type: "progress",
            percent: 78,
            message: "StemKit AI: Extracting studio vocals with MelBandRoformer…"
          });
        }
        await new Promise((resolve, reject) => {
          const proc = spawn(engine.pythonPath, [
            engine.roformerScript,
            "--input", resolvedSource,
            "--out", projectDir,
            "--ckpt-dir", engine.modelsDir,
            "--device", "auto"
          ], { windowsHide: true });
          if (download) download.ffmpeg = proc;

          proc.stdout?.on("data", (chunk) => {
            for (const line of chunk.toString().split(/\r?\n/)) {
              try {
                const parsed = JSON.parse(line.trim());
                if (parsed.type === "progress" && id) {
                  sendDownloadEvent(id, {
                    type: "progress",
                    percent: Math.round(75 + (parsed.pct || 0) * 0.12),
                    message: parsed.message || `MelBandRoformer vocals: ${parsed.pct || 0}%`
                  });
                }
              } catch {}
            }
          });
          proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`RoFormer exited with code ${code}`)));
          proc.on("error", reject);
        });
      }

      // 2. Separate remaining stems (drums, bass, other) via Demucs
      if (fs.existsSync(engine.separateScript)) {
        if (id) {
          sendDownloadEvent(id, {
            type: "progress",
            percent: 88,
            message: "StemKit AI: Separating drums, bass, and instruments with Demucs…"
          });
        }
        await new Promise((resolve, reject) => {
          const onlyArg = engine.hasRoformer ? "drums,bass,other" : "drums,bass,other,vocals";
          const proc = spawn(engine.pythonPath, [
            engine.separateScript,
            "--input", resolvedSource,
            "--out", projectDir,
            "--model", "htdemucs",
            "--device", "auto",
            "--only", onlyArg
          ], { windowsHide: true });
          if (download) download.ffmpeg = proc;

          proc.stdout?.on("data", (chunk) => {
            for (const line of chunk.toString().split(/\r?\n/)) {
              try {
                const parsed = JSON.parse(line.trim());
                if (parsed.type === "progress" && id) {
                  sendDownloadEvent(id, {
                    type: "progress",
                    percent: Math.round(87 + (parsed.pct || 0) * 0.12),
                    message: parsed.message || `Demucs stems: ${parsed.pct || 0}%`
                  });
                }
              } catch {}
            }
          });
          proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Demucs exited with code ${code}`)));
          proc.on("error", reject);
        });
      }

      const allExist = DEFAULT_STEMS.every((stemId) => fs.existsSync(path.join(projectDir, `${stemId}.wav`)));
      if (allExist) {
        aiSeparationSucceeded = true;
        for (const stemId of DEFAULT_STEMS) {
          const stemPath = path.join(projectDir, `${stemId}.wav`);
          stemFiles[stemId] = `${stemId}.wav`;
          waveforms[stemId] = extractWavWaveform(stemPath, 64);
        }
      }
    } catch (err) {
      console.warn("StemKit AI separation error, using DSP fallback:", err ? err.message : err);
    }
  }

  // DSP Fallback if AI separation was not ready or did not produce all stems
  if (!aiSeparationSucceeded) {
    const totalStems = DEFAULT_STEMS.length;
    for (let idx = 0; idx < totalStems; idx++) {
      if (download && download.cancelled) throw new Error("Separation cancelled");

      const stemId = DEFAULT_STEMS[idx];
      const outStemPath = path.join(projectDir, `${stemId}.wav`);
      const filter = filters[stemId];

      if (id) {
        sendDownloadEvent(id, {
          type: "progress",
          percent: Math.round(75 + ((idx + 1) / totalStems) * 23),
          message: `Extracting ${STEM_CONFIG[stemId]?.label || stemId} stem…`
        });
      }

      const ffmpegArgs = [
        "-y",
        "-i", resolvedSource,
        "-af", filter,
        "-ar", "44100",
        "-ac", "2",
        "-c:a", "pcm_s16le",
        outStemPath
      ];

      await runFfmpegCommand(ffmpegArgs, (proc) => {
        if (download) download.ffmpeg = proc;
      });

      stemFiles[stemId] = `${stemId}.wav`;
      waveforms[stemId] = extractWavWaveform(outStemPath, 64);
    }
  }

  const projectMeta = {
    id: id || crypto.randomUUID(),
    title: cleanTitle,
    folder: projectDir,
    createdAt: Date.now(),
    duration,
    stems: stemFiles,
    waveforms,
    engine: aiSeparationSucceeded ? "stemkit_ai" : "dsp_filter"
  };

  fs.writeFileSync(
    path.join(projectDir, "project.json"),
    JSON.stringify(projectMeta, null, 2),
    "utf8"
  );

  return projectMeta;
}

function runDownload({ id, safeRequest, settings, download }) {
  return new Promise((resolve) => {
    const child = spawn(getYtDlpCommand(), buildArgs({ ...safeRequest, ...settings }, getFfmpegLocation()), {
      windowsHide: true
    });
    download.child = child;

    sendDownloadEvent(id, { type: "started" });

    child.stdout.on("data", (buffer) => {
      for (const rawLine of buffer.toString().split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const files = downloadFiles.get(id);
        if (files) {
          // Check for absolute output path line emitted by --print after_move:filepath
          const cleanLine = cleanOutputPath(line);
          if (cleanLine && (cleanLine.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(cleanLine))) {
            download.outputPath = cleanLine;
            files.add(cleanLine);
          }

          const destMatch = line.match(/Destination:\s+(.*)$/);
          if (destMatch) {
            download.outputPath = cleanOutputPath(destMatch[1]);
            files.add(download.outputPath);
          }

          const mergeMatch = line.match(/Merging formats into\s+"([^"]+)"/);
          if (mergeMatch) {
            download.outputPath = cleanOutputPath(mergeMatch[1]);
            files.add(download.outputPath);
          }

          const alreadyMatch = line.match(/\[download\]\s+(.*)\s+has already been downloaded/);
          if (alreadyMatch) {
            download.outputPath = cleanOutputPath(alreadyMatch[1]);
            files.add(download.outputPath);
          }
        }

        const progress = parseProgress(line);
        if (progress && download.mode !== "audio") {
          sendDownloadEvent(id, { type: "progress", percent: Math.round(progress.percent * 0.8), speed: progress.speed, eta: progress.eta, size: progress.size, line });
        } else {
          sendDownloadEvent(id, progress ? { type: "progress", ...progress, line } : { type: "log", line });
        }
      }
    });

    child.stderr.on("data", (buffer) => {
      for (const line of buffer.toString().split(/\r?\n/)) {
        if (line.trim()) {
          download.stderrLines.push(line);
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
      resolve();
    });

    child.on("close", async (code) => {
      if (download.cancelled) {
        downloads.delete(id);
        resolve();
        return;
      }

      if (code !== 0) {
        downloads.delete(id);
        const stderr = download.stderrLines.join("\n");
        let message = `yt-dlp exited with code ${code}`;

        if (stderr.includes("Could not copy Chrome cookie database") || stderr.includes("Could not copy cookie database")) {
          const browser = safeRequest.browser || "your browser";
          message = `Could not read ${browser} cookies — close ${browser} and retry.`;
        } else if (stderr.includes("Failed to decrypt with DPAPI") || stderr.includes("Failed to decrypt")) {
          message = `Could not decrypt ${safeRequest.browser || "browser"} cookies. Try selecting Firefox instead, or update your browser.`;
        } else if (stderr.includes("HTTP Error 403: Forbidden") || stderr.includes("403 Forbidden")) {
          message = "Access forbidden (HTTP 403). Try selecting your browser in Settings to use session cookies.";
        } else if (stderr.includes("Sign in to confirm") || stderr.includes("confirm you\u2019re not a bot") || stderr.includes("confirm you're not a bot") || stderr.includes("login required") || stderr.includes("Sign in")) {
          message = safeRequest.browser === "none"
            ? "Sign-in required for this site. Select a browser in Settings to use your cookies."
            : `Sign-in required. Close ${safeRequest.browser} and retry so cookies can be read.`;
        } else if (stderr.includes("HTTP Error 429") || stderr.includes("Too Many Requests")) {
          message = "This site is rate-limiting requests. Wait a minute and retry.";
        } else if (stderr.includes("is not a valid URL") || stderr.includes("Unsupported URL")) {
          message = "This URL is not supported or no downloadable media was found.";
        }

        sendDownloadEvent(id, { type: "error", message });
        resolve();
        return;
      }

      try {
        if (download.mode === "stems") {
          sendDownloadEvent(id, { type: "log", line: "Audio downloaded. Extracting stems (StemKit engine)..." });
          const stemProject = await separateAudioStems({
            id,
            download,
            sourceWavPath: download.outputPath,
            downloadPath: settings.downloadPath
          });

          if (fs.existsSync(download.outputPath)) {
            await tryDeleteFile(download.outputPath);
          }

          if (stemProject?.folder) {
            const files = downloadFiles.get(id);
            if (files) files.add(stemProject.folder);
          }

          downloads.delete(id);
          sendDownloadEvent(id, {
            type: "complete",
            message: "Stems ready in Stem Studio",
            stemProject
          });
          resolve();
          return;
        }

        if (download.mode !== "audio") {
          sendDownloadEvent(id, { type: "log", line: "Download finished. Checking source codecs..." });
          const result = await queueTranscode(() =>
            transcodeForEditing({ id, download, inputPath: download.outputPath, mode: download.mode })
          );
          if (download.cancelled) {
            resolve();
            return;
          }
          await validateEditingOutput(result.finalPath, download.mode);

          // Validation succeeded — safely delete source or temporary backup
          if (!result.skipped) {
            if (result.isBackup && fs.existsSync(result.sourcePath)) {
              await tryDeleteFile(result.sourcePath);
            } else if (result.sourcePath.toLowerCase() !== result.finalPath.toLowerCase() && fs.existsSync(result.sourcePath)) {
              await tryDeleteFile(result.sourcePath);
            }
          }
        }

        downloads.delete(id);
        sendDownloadEvent(id, {
          type: "complete",
          message: "Download complete"
        });
      } catch (error) {
        downloads.delete(id);
        if (!download.cancelled) {
          sendDownloadEvent(id, {
            type: "error",
            message: error.message
          });
        }
      }

      resolve();
    });
  });
}

ipcMain.handle("downloads:start", (_event, request) => {
  const id = request?.id && typeof request.id === "string" ? request.id : crypto.randomUUID();
  const safeRequest = normalizeDownloadRequest(request || {});
  if (!isSupportedDownloadUrl(safeRequest.url)) {
    setImmediate(() => sendDownloadEvent(id, { type: "error", message: "Enter a valid http or https URL." }));
    return { id };
  }

  const settings = writeSettings({
    downloadPath: safeRequest.downloadPath,
    mode: safeRequest.mode,
    quality: safeRequest.quality,
    browser: safeRequest.browser
  });

  const download = {
    child: null,
    cancelled: false,
    mode: safeRequest.mode,
    outputPath: "",
    ffmpeg: null,
    stderrLines: []
  };

  downloads.set(id, download);
  downloadFiles.set(id, new Set());

  downloadQueue.push({ id, safeRequest, settings, download });
  pumpDownloadQueue();

  return { id };
});

ipcMain.handle("downloads:cancel", (_event, id) => {
  // If download is waiting in queue, cancel immediately
  const queuedIdx = downloadQueue.findIndex((job) => job.id === id);
  if (queuedIdx !== -1) {
    const [queuedJob] = downloadQueue.splice(queuedIdx, 1);
    queuedJob.download.cancelled = true;
    downloads.delete(id);
    downloadFiles.delete(id);
    sendDownloadEvent(id, { type: "cancelled", message: "Download cancelled" });
    return true;
  }

  const download = downloads.get(id);
  if (!download) {
    return false;
  }

  download.cancelled = true;

  // Kill ffmpeg safely if transcoding is active
  if (download.ffmpeg?.pid) {
    const pid = String(download.ffmpeg.pid);
    if (process.platform === "win32") {
      try {
        spawn("taskkill", ["/pid", pid, "/f", "/t"], { windowsHide: true, stdio: "ignore" })
          .on("error", () => {});
      } catch {}
    } else {
      try { download.ffmpeg.kill("SIGKILL"); } catch {}
    }
  }

  // Kill yt-dlp child process safely
  if (download.child?.pid) {
    const pid = String(download.child.pid);
    if (process.platform === "win32") {
      try {
        spawn("taskkill", ["/pid", pid, "/f", "/t"], { windowsHide: true, stdio: "ignore" })
          .on("error", () => {});
      } catch {}
    } else {
      try { download.child.kill("SIGKILL"); } catch {}
    }
  }

  // Clean up transcode temp files and restore backup if present
  if (download.outputPath) {
    try {
      const { tempPath, backupSourcePath, resolvedInputPath } = editingOutputPaths(download.outputPath);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      if (fs.existsSync(backupSourcePath) && !fs.existsSync(resolvedInputPath)) {
        fs.renameSync(backupSourcePath, resolvedInputPath);
      }
    } catch {}
  }

  downloads.delete(id);
  downloadFiles.delete(id);
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
          if (fs.existsSync(file)) {
            const stat = fs.statSync(file);
            if (stat.isDirectory()) {
              fs.rmSync(file, { recursive: true, force: true });
            } else {
              fs.unlinkSync(file);
            }
          }
          if (fs.existsSync(file + ".part")) fs.unlinkSync(file + ".part");
          if (fs.existsSync(file + ".ytdl")) fs.unlinkSync(file + ".ytdl");
        } catch {
          // Best-effort cleanup
        }
      }
    }
  }

  downloadFiles.delete(id);
  return true;
});

ipcMain.handle("folder:open", async () => {
  try {
    const settings = readSettings();
    const folderPath = settings.downloadPath;
    if (folderPath && fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
      await shell.openPath(folderPath);
      return true;
    }
  } catch {}
  return false;
});

// StemKit Integration IPC Handlers
ipcMain.handle("stems:list", async () => {
  try {
    const settings = readSettings();
    const stemsBase = path.join(settings.downloadPath, "NovaDL_Stems");
    if (!fs.existsSync(stemsBase)) return [];

    const dirs = fs.readdirSync(stemsBase);
    const projects = [];
    for (const d of dirs) {
      const projFile = path.join(stemsBase, d, "project.json");
      if (fs.existsSync(projFile)) {
        try {
          const meta = JSON.parse(fs.readFileSync(projFile, "utf8"));
          projects.push(meta);
        } catch {}
      }
    }
    return projects.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
});

ipcMain.handle("stems:read-audio", async (_event, filePath) => {
  try {
    if (!filePath || typeof filePath !== "string") return null;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return null;
    const ext = path.extname(resolved).toLowerCase();
    if (![".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"].includes(ext)) return null;
    const buffer = fs.readFileSync(resolved);
    return `data:audio/wav;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
});

ipcMain.handle("stems:choose-local-file", async () => {
  const res = await dialog.showOpenDialog({
    title: "Select Audio or Video File to Extract Stems",
    properties: ["openFile"],
    filters: [
      { name: "Audio & Video", extensions: ["mp3", "wav", "flac", "m4a", "aac", "ogg", "mp4", "mkv", "webm", "mov"] }
    ]
  });
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
});

ipcMain.handle("stems:process-local", async (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Selected file does not exist");
  }
  const settings = readSettings();
  const id = crypto.randomUUID();
  const title = path.basename(filePath, path.extname(filePath));
  const tempWav = path.join(app.getPath("temp"), `novadl-stem-local-${id}.wav`);

  await runFfmpegCommand([
    "-y",
    "-i", filePath,
    "-af", "aresample=44100",
    "-ar", "44100",
    "-ac", "2",
    "-c:a", "pcm_s16le",
    tempWav
  ]);

  const project = await separateAudioStems({
    id,
    sourceWavPath: tempWav,
    downloadPath: settings.downloadPath,
    titleOverride: title
  });

  try { if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav); } catch {}
  return project;
});

ipcMain.handle("stems:export", async (_event, { projectFolder, stemIds, format = "wav" }) => {
  if (!projectFolder || !fs.existsSync(projectFolder)) {
    throw new Error("Project folder not found");
  }

  const res = await dialog.showOpenDialog({
    title: "Select Destination Directory to Export Stems",
    properties: ["openDirectory", "createDirectory"]
  });

  if (res.canceled || !res.filePaths.length) {
    return { cancelled: true };
  }

  const exportDir = res.filePaths[0];
  const stemsToExport = Array.isArray(stemIds) && stemIds.length > 0 ? stemIds : DEFAULT_STEMS;

  for (const stem of stemsToExport) {
    const srcFile = path.join(projectFolder, `${stem}.wav`);
    if (!fs.existsSync(srcFile)) continue;

    if (format === "mp3") {
      const destFile = path.join(exportDir, `${stem}.mp3`);
      await runFfmpegCommand([
        "-y",
        "-i", srcFile,
        "-c:a", "libmp3lame",
        "-b:a", "320k",
        destFile
      ]);
    } else {
      const destFile = path.join(exportDir, `${stem}.wav`);
      if (path.resolve(srcFile) !== path.resolve(destFile)) {
        fs.copyFileSync(srcFile, destFile);
      }
    }
  }

  await shell.openPath(exportDir);
  return { success: true, exportDir };
});

ipcMain.handle("stems:open-folder", async (_event, projectFolder) => {
  if (projectFolder && fs.existsSync(projectFolder)) {
    await shell.openPath(projectFolder);
    return true;
  }
  return false;
});

ipcMain.handle("stems:delete", async (_event, projectFolder) => {
  if (projectFolder && fs.existsSync(projectFolder)) {
    try {
      fs.rmSync(projectFolder, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }
  return false;
});

ipcMain.handle("updater:check", async () => {
  if (!app.isPackaged) {
    return { status: "dev", message: "Auto-update is available in installed application builds." };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (err) {
    return { success: false, error: err ? err.message : "Failed to check for updates" };
  }
});

ipcMain.handle("updater:install", () => {
  autoUpdater.quitAndInstall(false, true);
  return true;
});

ipcMain.handle("updater:get-version", () => {
  return app.getVersion();
});

ipcMain.handle("stems:get-engine-status", () => {
  return detectStemKitEngine();
});

app.whenReady().then(() => {
  protocol.handle("novadl-media", (request) => {
    try {
      const urlObj = new URL(request.url);
      let filePath = decodeURIComponent(urlObj.pathname);
      if (process.platform === "win32" && filePath.startsWith("/") && filePath[2] === ":") {
        filePath = filePath.slice(1);
      }
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        return new Response("Not found", { status: 404 });
      }
      const ext = path.extname(resolved).toLowerCase();
      if (![".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"].includes(ext)) {
        return new Response("Forbidden", { status: 403 });
      }

      const stat = fs.statSync(resolved);
      const fileSize = stat.size;
      const range = request.headers.get("range");
      const contentType = ext === ".wav" ? "audio/wav" : ext === ".mp3" ? "audio/mpeg" : ext === ".flac" ? "audio/flac" : "application/octet-stream";

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const stream = fs.createReadStream(resolved, { start, end });
        return new Response(stream, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunksize),
            "Content-Type": contentType
          }
        });
      }

      const stream = fs.createReadStream(resolved);
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Length": String(fileSize),
          "Accept-Ranges": "bytes",
          "Content-Type": contentType
        }
      });
    } catch (err) {
      return new Response(err ? err.message : "Media streaming error", { status: 500 });
    }
  });

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
