const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const downloads = new Map();
const downloadFiles = new Map();
const allowedBrowsers = new Set(["none", "chrome", "firefox", "edge", "brave", "safari", "opera", "vivaldi"]);
const allowedModes = new Set(["video", "video-only", "audio"]);
const allowedQualities = new Set(["original", "1080", "720"]);
let hwEncoderCache;

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
    });
  } catch {
    return fallback;
  }
}

function writeSettings(nextSettings) {
  const settings = normalizeSettings({
    ...readSettings(),
    ...nextSettings
  });

  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
  return settings;
}

function normalizeSettings(settings) {
  return {
    downloadPath: typeof settings.downloadPath === "string" ? settings.downloadPath : app.getPath("downloads"),
    mode: allowedModes.has(settings.mode) ? settings.mode : "video",
    quality: allowedQualities.has(settings.quality) ? settings.quality : "original",
    browser: normalizeBrowser(settings.browser)
  };
}

function normalizeDownloadRequest(request) {
  return {
    url: typeof request.url === "string" ? request.url.trim() : "",
    downloadPath: typeof request.downloadPath === "string" ? request.downloadPath : app.getPath("downloads"),
    mode: allowedModes.has(request.mode) ? request.mode : "video",
    quality: allowedQualities.has(request.quality) ? request.quality : "original",
    browser: normalizeBrowser(request.browser)
  };
}

function isSupportedDownloadUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
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

function heightFilter(quality) {
  if (quality === "1080") {
    return "[height<=1080]";
  }

  if (quality === "720") {
    return "[height<=720]";
  }

  return "";
}

function normalizeBrowser(browser) {
  return allowedBrowsers.has(browser) ? browser : "none";
}

function videoFormatSelector({ mode, quality }) {
  const height = heightFilter(quality);

  // For specific resolutions, prefer H.264+AAC to avoid transcoding
  if (quality !== "original") {
    if (mode === "video-only") {
      return `bestvideo[vcodec^=avc1]${height}/bestvideo${height}/best${height || ""}`;
    }
    return `bestvideo[vcodec^=avc1]${height}+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]${height}+bestaudio/bv*${height}+ba/b${height}/best${height || ""}`;
  }

  // Original: prefer H.264 at best resolution, fall back to any codec if H.264 not available at that res
  if (mode === "video-only") {
    return `bestvideo[vcodec^=avc1]/bv*/bestvideo/best`;
  }
  return `bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bv*+ba/b/best`;
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
    "--paths",
    downloadPath,
    "--output",
    "%(title)s [%(id)s].%(ext)s"
  ];

  const ffmpegLocation = getFfmpegLocation();
  if (ffmpegLocation) {
    args.push("--ffmpeg-location", ffmpegLocation);
  }

  if (mode === "audio") {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
  } else {
    args.push(
      "-f",
      videoFormatSelector({ mode, quality }),
      "-S", "res,vcodec:h264,acodec:m4a",
      "--merge-output-format",
      "mp4"
    );
  }

  const safeBrowser = normalizeBrowser(browser);
  if (safeBrowser !== "none") {
    args.push("--cookies-from-browser", safeBrowser);
  }

  args.push(url);
  return args;
}

function cleanOutputPath(outputPath) {
  return outputPath.replace(/\u001b\[[0-9;]*m/g, "").trim();
}

function normalizeComparablePathName(fileName) {
  return fileName
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

  const wantedName = normalizeComparablePathName(parsed.name);
  const wantedExtension = parsed.ext.toLowerCase();
  const candidates = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => path.extname(fileName).toLowerCase() === wantedExtension);

  const match = candidates.find((fileName) => {
    const candidateName = normalizeComparablePathName(path.parse(fileName).name);
    return candidateName === wantedName
      || candidateName.includes(wantedName)
      || wantedName.includes(candidateName);
  });

  return match ? path.join(directory, match) : cleanPath;
}

function editingOutputPaths(inputPath) {
  const parsed = path.parse(resolveExistingOutputPath(inputPath));
  const finalPath = path.join(parsed.dir, `${parsed.name}.mp4`);
  const tempPath = path.join(parsed.dir, `${parsed.name}.novadl-editing.tmp.mp4`);

  return { finalPath, tempPath };
}

function detectHardwareEncoder() {
  if (hwEncoderCache !== undefined) return Promise.resolve(hwEncoderCache);

  const candidates = ["h264_nvenc", "h264_amf", "h264_qsv"];
  let idx = 0;

  return new Promise((resolve) => {
    function tryNext() {
      if (idx >= candidates.length) {
        hwEncoderCache = null;
        resolve(null);
        return;
      }

      const encoder = candidates[idx++];
      const nullDest = process.platform === "win32" ? "NUL" : "/dev/null";
      const tempTest = path.join(app.getPath("temp"), `nvenc_test_${Date.now()}.mp4`);
      const proc = spawn(getFfmpegCommand(), [
        "-y", "-f", "lavfi", "-i", "color=size=256x256:rate=25:duration=0.2,format=yuv420p",
        "-frames:v", "1", "-c:v", encoder, tempTest
      ], { windowsHide: true, stdio: "pipe" });

      const timeout = setTimeout(() => { proc.kill(); }, 3000);
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
      proc.on("error", () => { clearTimeout(timeout); try { fs.unlinkSync(tempTest); } catch {} tryNext(); });
    }

    tryNext();
  });
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

  const { finalPath, tempPath } = editingOutputPaths(resolvedInputPath);

  // Already editing-compatible — skip transcoding entirely
  if (isMP4 && isH264 && audioOk) {
    sendDownloadEvent(id, { type: "log", line: "Source is already H.264/AAC MP4 \u2014 no transcoding needed" });
    if (resolvedInputPath.toLowerCase() !== finalPath.toLowerCase()) {
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      fs.renameSync(resolvedInputPath, finalPath);
      const files = downloadFiles.get(id);
      if (files) {
        files.add(finalPath);
        files.delete(inputPath);
        files.delete(resolvedInputPath);
      }
    }
    return { finalPath, sourcePath: resolvedInputPath, skipped: true };
  }

  if (download?.cancelled) throw new Error("Download was cancelled");

  // Build ffmpeg args — copy compatible streams, only re-encode what is needed
  const args = ["-y", "-i", resolvedInputPath];

  if (isH264) {
    args.push("-c:v", "copy");
    sendDownloadEvent(id, { type: "log", line: "Video is already H.264 \u2014 copying without re-encoding" });
  } else {
    const hwEncoder = await detectHardwareEncoder();
    args.push(...hwEncoderArgs(hwEncoder));
    if (hwEncoder) {
      sendDownloadEvent(id, { type: "log", line: `Converting ${source.videoCodec || "unknown"} video to H.264 (GPU: ${hwEncoder})` });
    } else {
      sendDownloadEvent(id, { type: "log", line: `Converting ${source.videoCodec || "unknown"} video to H.264 (CPU)` });
    }
  }

  if (!needsAudio) {
    args.push("-an");
  } else if (isAAC) {
    args.push("-c:a", "copy");
    sendDownloadEvent(id, { type: "log", line: "Audio is already AAC \u2014 copying without re-encoding" });
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

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (download) download.ffmpeg = null;

      if (code !== 0) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }

      try {
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        fs.renameSync(tempPath, finalPath);

        const files = downloadFiles.get(id);
        if (files) {
          files.add(finalPath);
          if (resolvedInputPath.toLowerCase() !== finalPath.toLowerCase()) {
            files.delete(inputPath);
            files.delete(resolvedInputPath);
          }
        }

        resolve({ finalPath, sourcePath: resolvedInputPath, skipped: false });
      } catch (error) {
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
  const safeRequest = normalizeDownloadRequest(request);
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

  const child = spawn(getYtDlpCommand(), buildArgs({ ...safeRequest, ...settings }), {
    windowsHide: true
  });

  const download = { child, cancelled: false, mode: safeRequest.mode, outputPath: "", ffmpeg: null, stderrLines: [] };
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
  });

  child.on("close", async (code) => {
    // Helper: retry file deletion with backoff (Windows holds handles briefly after process exit)
    async function tryDelete(filePath, retries = 3) {
      for (let i = 0; i < retries; i++) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          return;
        } catch (e) {
          if (i < retries - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        }
      }
    }
    if (download.cancelled) {
      downloads.delete(id);
      return;
    }

    if (code !== 0) {
      downloads.delete(id);
      const stderr = download.stderrLines.join("\n");
      let message = `yt-dlp exited with code ${code}`;

      if (stderr.includes("Could not copy Chrome cookie database") || stderr.includes("Could not copy cookie database")) {
        const browser = safeRequest.browser || "your browser";
        message = `Could not read ${browser} cookies \u2014 close ${browser} and retry.`;
      } else if (stderr.includes("Failed to decrypt with DPAPI") || stderr.includes("Failed to decrypt")) {
        message = `Could not decrypt ${safeRequest.browser || "browser"} cookies. Try selecting Firefox instead, or update your browser.`;
      } else if (stderr.includes("Sign in to confirm") || stderr.includes("confirm you\u2019re not a bot") || stderr.includes("confirm you're not a bot")) {
        message = safeRequest.browser === "none"
          ? "YouTube requires sign-in. Select a browser in settings to use your cookies."
          : `YouTube requires sign-in. Close ${safeRequest.browser} and retry so cookies can be read.`;
      } else if (stderr.includes("HTTP Error 429") || stderr.includes("Too Many Requests")) {
        message = "YouTube is rate-limiting requests. Wait a minute and retry.";
      } else if (stderr.includes("is not a valid URL") || stderr.includes("Unsupported URL")) {
        message = "This URL is not supported.";
      }

      sendDownloadEvent(id, { type: "error", message });
      return;
    }

    try {
      if (download.mode !== "audio") {
        sendDownloadEvent(id, { type: "log", line: "Download finished. Checking source codecs..." });
        const result = await transcodeForEditing({ id, download, inputPath: download.outputPath, mode: download.mode });
        if (download.cancelled) return;
        await validateEditingOutput(result.finalPath, download.mode);

        // Delete source only after validation succeeds
        if (!result.skipped && result.sourcePath.toLowerCase() !== result.finalPath.toLowerCase() && fs.existsSync(result.sourcePath)) {
          await tryDelete(result.sourcePath);
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
  });

  return { id };
});

ipcMain.handle("downloads:cancel", (_event, id) => {
  const download = downloads.get(id);
  if (!download) {
    return false;
  }

  download.cancelled = true;

  // Kill ffmpeg if transcoding is in progress
  if (download.ffmpeg) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", download.ffmpeg.pid, "/f", "/t"], { windowsHide: true });
    } else {
      download.ffmpeg.kill("SIGKILL");
    }
  }

  // Kill yt-dlp child process
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", download.child.pid, "/f", "/t"], { windowsHide: true });
  } else {
    download.child.kill("SIGKILL");
  }

  // Clean up transcode temp file
  if (download.outputPath) {
    try {
      const { tempPath } = editingOutputPaths(download.outputPath);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
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
        } catch {
          // Best-effort cleanup — file may be locked by antivirus
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
