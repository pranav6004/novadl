const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const allowedBrowsers = new Set(["none", "chrome", "firefox", "edge", "brave", "safari", "opera", "vivaldi"]);
const allowedModes = new Set(["video", "video-only", "audio", "stems"]);
const allowedQualities = new Set(["original", "1080", "720"]);

const DEFAULT_STEMS = ["vocals", "drums", "bass", "other"];

const STEM_CONFIG = {
  vocals: { id: "vocals", label: "Vocals", color: "#a78bfa", desc: "Lead & backing vocals" },
  drums: { id: "drums", label: "Drums", color: "#f87171", desc: "Percussion, kick, snare" },
  bass: { id: "bass", label: "Bass", color: "#38bdf8", desc: "Bass guitar & low synths" },
  other: { id: "other", label: "Other", color: "#34d399", desc: "Melody, guitars, keys" }
};

function normalizeBrowser(browser) {
  return allowedBrowsers.has(browser) ? browser : "none";
}

function normalizeSettings(settings, fallbackDownloadPath = "") {
  return {
    downloadPath: typeof settings.downloadPath === "string" ? settings.downloadPath : fallbackDownloadPath,
    mode: allowedModes.has(settings.mode) ? settings.mode : "video",
    quality: allowedQualities.has(settings.quality) ? settings.quality : "original",
    browser: normalizeBrowser(settings.browser)
  };
}

function normalizeDownloadRequest(request, fallbackDownloadPath = "") {
  return {
    url: typeof request.url === "string" ? request.url.trim() : "",
    downloadPath: typeof request.downloadPath === "string" ? request.downloadPath : fallbackDownloadPath,
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

function heightFilter(quality) {
  if (quality === "1080") {
    return "[height<=1080]";
  }

  if (quality === "720") {
    return "[height<=720]";
  }

  return "";
}

function videoFormatSelector({ mode, quality }) {
  const height = heightFilter(quality);

  if (quality !== "original") {
    if (mode === "video-only") {
      return `bestvideo[vcodec^=avc1]${height}/bestvideo${height}/best${height || ""}`;
    }
    return `bestvideo[vcodec^=avc1]${height}+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]${height}+bestaudio/bv*${height}+ba/b${height}/best${height || ""}`;
  }

  if (mode === "video-only") {
    return `bestvideo[vcodec^=avc1]/bv*/bestvideo/best`;
  }
  return `bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bv*+ba/b/best`;
}

function buildArgs({ url, mode, quality, downloadPath, browser }, ffmpegLocation = null) {
  const args = [
    "--newline",
    "--no-playlist",
    "--progress",
    "--progress-delta",
    "1",
    "--print",
    "after_move:filepath",
    "--paths",
    downloadPath,
    "--output",
    "%(title)s [%(id)s].%(ext)s",
    "--windows-filenames",
    "--concurrent-fragments",
    "4"
  ];

  if (ffmpegLocation) {
    args.push("--ffmpeg-location", ffmpegLocation);
  }

  if (mode === "audio") {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
  } else if (mode === "stems") {
    args.push("--extract-audio", "--audio-format", "wav");
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

  args.push("--", url);
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

function detectMediaPlatform(url) {
  if (!url || typeof url !== "string") {
    return { name: "Universal", key: "generic", badge: "Any Media", color: "#64748b" };
  }
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (/\.(mp4|mkv|webm|mov|avi|flv|m4v|m3u8|mpd)($|\?)/i.test(pathname)) {
      return { name: "Direct Video Stream", key: "direct-video", badge: "Stream / MP4", color: "#10b981" };
    }
    if (/\.(mp3|wav|flac|m4a|aac|ogg|opus)($|\?)/i.test(pathname)) {
      return { name: "Direct Audio Stream", key: "direct-audio", badge: "Audio Stream", color: "#10b981" };
    }

    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      return { name: "YouTube", key: "youtube", badge: "YouTube", color: "#ef4444" };
    }
    if (host.includes("tiktok.com")) {
      return { name: "TikTok", key: "tiktok", badge: "TikTok", color: "#06b6d4" };
    }
    if (host.includes("twitter.com") || host.includes("x.com")) {
      return { name: "X (Twitter)", key: "twitter", badge: "X / Twitter", color: "#e2e8f0" };
    }
    if (host.includes("instagram.com")) {
      return { name: "Instagram", key: "instagram", badge: "Instagram", color: "#ec4899" };
    }
    if (host.includes("reddit.com") || host.includes("v.redd.it")) {
      return { name: "Reddit", key: "reddit", badge: "Reddit", color: "#f97316" };
    }
    if (host.includes("twitch.tv")) {
      return { name: "Twitch", key: "twitch", badge: "Twitch", color: "#a855f7" };
    }
    if (host.includes("soundcloud.com")) {
      return { name: "SoundCloud", key: "soundcloud", badge: "SoundCloud", color: "#f97316" };
    }
    if (host.includes("vimeo.com")) {
      return { name: "Vimeo", key: "vimeo", badge: "Vimeo", color: "#0ea5e9" };
    }
    if (host.includes("facebook.com") || host.includes("fb.watch")) {
      return { name: "Facebook", key: "facebook", badge: "Facebook", color: "#3b82f6" };
    }
    if (host.includes("bilibili.com")) {
      return { name: "Bilibili", key: "bilibili", badge: "Bilibili", color: "#06b6d4" };
    }
    if (host.includes("threads.net")) {
      return { name: "Threads", key: "threads", badge: "Threads", color: "#f1f5f9" };
    }
    if (host.includes("pinterest.com") || host.includes("pin.it")) {
      return { name: "Pinterest", key: "pinterest", badge: "Pinterest", color: "#e11d48" };
    }
    if (host.includes("bandcamp.com")) {
      return { name: "Bandcamp", key: "bandcamp", badge: "Bandcamp", color: "#14b8a6" };
    }
    if (host.includes("mixcloud.com")) {
      return { name: "Mixcloud", key: "mixcloud", badge: "Mixcloud", color: "#38bdf8" };
    }

    const domain = host.replace(/^www\./, "");
    return { name: domain, key: "web-media", badge: domain, color: "#6366f1" };
  } catch {
    return { name: "Universal", key: "generic", badge: "Any Media", color: "#64748b" };
  }
}

function sanitizeStemTitle(title) {
  return String(title || "Audio")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function getStemSeparationFilters() {
  return {
    vocals: "pan=stereo|c0=c0-c1|c1=c1-c0,bandpass=f=1800:width_type=h:w=2600",
    bass: "lowpass=f=250,bass=g=4",
    drums: "highpass=f=70,bandpass=f=3500:width_type=h:w=4000,acompressor=threshold=0.25:ratio=4",
    other: "bandpass=f=1200:width_type=h:w=1800"
  };
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

function detectStemKitEngine(customPaths = {}) {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");

  const candidates = [
    {
      name: "StemKit Local Install",
      resourcesPython: customPaths.resourcesPython || path.join(localAppData, "Programs", "stemkit", "resources", "python"),
      venvPython: customPaths.venvPython || path.join(appData, "StemKit", "venv", "Scripts", "python.exe"),
      modelsDir: customPaths.modelsDir || path.join(appData, "StemKit", "models"),
      readyMarker: path.join(appData, "StemKit", "venv", ".ready")
    },
    {
      name: "StemKit System/Posix",
      resourcesPython: path.join(os.homedir(), ".stemkit", "python"),
      venvPython: path.join(os.homedir(), ".stemkit", "venv", "bin", "python"),
      modelsDir: path.join(os.homedir(), ".stemkit", "models"),
      readyMarker: path.join(os.homedir(), ".stemkit", "venv", ".ready")
    }
  ];

  for (const c of candidates) {
    const hasPython = fs.existsSync(c.venvPython);
    const hasSeparate = fs.existsSync(path.join(c.resourcesPython, "separate.py"));
    const hasRoformer = fs.existsSync(path.join(c.resourcesPython, "roformer.py"));
    const hasVocalsModel = fs.existsSync(path.join(c.modelsDir, "MelBandRoformer.ckpt"));
    const isReady = hasPython && hasSeparate;

    if (hasPython && hasSeparate) {
      return {
        detected: true,
        ready: isReady,
        pythonPath: c.venvPython,
        resourcesPython: c.resourcesPython,
        separateScript: path.join(c.resourcesPython, "separate.py"),
        roformerScript: path.join(c.resourcesPython, "roformer.py"),
        modelsDir: c.modelsDir,
        hasRoformer: hasRoformer && hasVocalsModel,
        hasVocalsModel,
        hasDemucs: true,
        hasGpu: true,
        name: c.name,
        engineType: "stemkit_ai",
        message: hasVocalsModel
          ? "StemKit AI Engine ready (MelBandRoformer + Demucs with GPU acceleration)."
          : "StemKit detected. Vocal model (MelBandRoformer) downloading or missing."
      };
    }
  }

  return {
    detected: false,
    ready: false,
    hasGpu: false,
    hasRoformer: false,
    hasVocalsModel: false,
    hasDemucs: false,
    engineType: "dsp_fallback",
    message: "StemKit AI separation requirements not found. Install StemKit to unlock studio-quality AI stem splitting."
  };
}

module.exports = {
  allowedBrowsers,
  allowedModes,
  allowedQualities,
  DEFAULT_STEMS,
  STEM_CONFIG,
  normalizeBrowser,
  normalizeSettings,
  normalizeDownloadRequest,
  isSupportedDownloadUrl,
  detectMediaPlatform,
  heightFilter,
  videoFormatSelector,
  buildArgs,
  cleanOutputPath,
  normalizeComparablePathName,
  sanitizeStemTitle,
  getStemSeparationFilters,
  detectStemKitEngine,
  parseProgress
};
