import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  isSupportedDownloadUrl,
  normalizeBrowser,
  normalizeSettings,
  normalizeDownloadRequest,
  videoFormatSelector,
  buildArgs,
  cleanOutputPath,
  normalizeComparablePathName,
  sanitizeStemTitle,
  getStemSeparationFilters,
  detectMediaPlatform,
  DEFAULT_STEMS,
  STEM_CONFIG,
  parseProgress
} = require("../electron/utils.cjs");

describe("isSupportedDownloadUrl", () => {
  test("accepts valid http and https URLs", () => {
    assert.equal(isSupportedDownloadUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
    assert.equal(isSupportedDownloadUrl("http://example.com/video.mp4"), true);
  });

  test("rejects non-http URLs and invalid inputs", () => {
    assert.equal(isSupportedDownloadUrl("ftp://example.com/file"), false);
    assert.equal(isSupportedDownloadUrl("file:///C:/test.mp4"), false);
    assert.equal(isSupportedDownloadUrl("javascript:alert(1)"), false);
    assert.equal(isSupportedDownloadUrl(""), false);
    assert.equal(isSupportedDownloadUrl("not-a-url"), false);
  });
});

describe("normalizeBrowser", () => {
  test("allows supported browsers", () => {
    assert.equal(normalizeBrowser("chrome"), "chrome");
    assert.equal(normalizeBrowser("firefox"), "firefox");
    assert.equal(normalizeBrowser("edge"), "edge");
    assert.equal(normalizeBrowser("brave"), "brave");
  });

  test("falls back to none for invalid or unsupported browsers", () => {
    assert.equal(normalizeBrowser("internet-explorer"), "none");
    assert.equal(normalizeBrowser(""), "none");
    assert.equal(normalizeBrowser(null), "none");
  });
});

describe("normalizeSettings and normalizeDownloadRequest", () => {
  test("normalizes settings with defaults", () => {
    const normalized = normalizeSettings({}, "C:\\Downloads");
    assert.equal(normalized.downloadPath, "C:\\Downloads");
    assert.equal(normalized.mode, "video");
    assert.equal(normalized.quality, "original");
    assert.equal(normalized.browser, "none");
  });

  test("normalizes download request and trims url", () => {
    const request = normalizeDownloadRequest({
      url: "  https://youtu.be/test  ",
      mode: "audio",
      quality: "720",
      browser: "firefox"
    }, "C:\\Downloads");

    assert.equal(request.url, "https://youtu.be/test");
    assert.equal(request.mode, "audio");
    assert.equal(request.quality, "720");
    assert.equal(request.browser, "firefox");
  });
});

describe("videoFormatSelector", () => {
  test("prefers H.264 and AAC for standard resolutions", () => {
    const f1080 = videoFormatSelector({ mode: "video", quality: "1080" });
    assert.match(f1080, /height<=1080/);
    assert.match(f1080, /vcodec\^=avc1/);
    assert.match(f1080, /acodec\^=mp4a/);

    const f720 = videoFormatSelector({ mode: "video", quality: "720" });
    assert.match(f720, /height<=720/);
  });

  test("configures video-only formats without audio selector", () => {
    const vOnly = videoFormatSelector({ mode: "video-only", quality: "1080" });
    assert.doesNotMatch(vOnly, /bestaudio/);
  });
});

describe("buildArgs", () => {
  test("includes print after_move:filepath, paths, and delimiter protection", () => {
    const args = buildArgs({
      url: "https://www.youtube.com/watch?v=123",
      mode: "video",
      quality: "1080",
      downloadPath: "C:\\TargetDir",
      browser: "none"
    });

    assert.ok(args.includes("--print"));
    assert.ok(args.includes("after_move:filepath"));
    assert.ok(args.includes("--paths"));
    assert.ok(args.includes("C:\\TargetDir"));
    assert.ok(args.includes("--newline"));
    assert.ok(args.includes("--merge-output-format"));
    assert.ok(args.includes("mp4"));

    // Delimiter protection before url
    const delimIdx = args.lastIndexOf("--");
    assert.ok(delimIdx !== -1);
    assert.equal(args[delimIdx + 1], "https://www.youtube.com/watch?v=123");
  });

  test("configures extract-audio in audio mode", () => {
    const args = buildArgs({
      url: "https://www.youtube.com/watch?v=123",
      mode: "audio",
      quality: "original",
      downloadPath: "C:\\TargetDir",
      browser: "chrome"
    }, "C:\\bin");

    assert.ok(args.includes("--extract-audio"));
    assert.ok(args.includes("--audio-format"));
    assert.ok(args.includes("mp3"));
    assert.ok(args.includes("--cookies-from-browser"));
    assert.ok(args.includes("chrome"));
    assert.ok(args.includes("--ffmpeg-location"));
    assert.ok(args.includes("C:\\bin"));
  });

  test("configures extract-audio with wav in stems mode", () => {
    const args = buildArgs({
      url: "https://youtu.be/song",
      mode: "stems",
      quality: "original",
      downloadPath: "C:\\Downloads",
      browser: "none"
    });
    assert.ok(args.includes("--extract-audio"));
    assert.ok(args.includes("--audio-format"));
    assert.ok(args.includes("wav"));
  });

  test("includes universal media args: windows-filenames and concurrent fragments", () => {
    const args = buildArgs({
      url: "https://www.tiktok.com/@creator/video/123",
      mode: "video",
      quality: "original",
      downloadPath: "C:\\Downloads",
      browser: "none"
    });
    assert.ok(args.includes("--windows-filenames"));
    assert.ok(args.includes("--concurrent-fragments"));
    assert.ok(args.includes("4"));
  });
});

describe("detectMediaPlatform", () => {
  test("identifies popular media platforms", () => {
    assert.equal(detectMediaPlatform("https://www.youtube.com/watch?v=123").key, "youtube");
    assert.equal(detectMediaPlatform("https://youtu.be/123").key, "youtube");
    assert.equal(detectMediaPlatform("https://www.tiktok.com/@creator/video/123").key, "tiktok");
    assert.equal(detectMediaPlatform("https://x.com/user/status/123").key, "twitter");
    assert.equal(detectMediaPlatform("https://twitter.com/user/status/123").key, "twitter");
    assert.equal(detectMediaPlatform("https://www.instagram.com/reel/abc/").key, "instagram");
    assert.equal(detectMediaPlatform("https://www.reddit.com/r/funny/comments/123").key, "reddit");
    assert.equal(detectMediaPlatform("https://soundcloud.com/artist/track").key, "soundcloud");
    assert.equal(detectMediaPlatform("https://www.twitch.tv/streamer").key, "twitch");
  });

  test("identifies direct media files and streams", () => {
    assert.equal(detectMediaPlatform("https://cdn.example.com/video.mp4").key, "direct-video");
    assert.equal(detectMediaPlatform("https://stream.example.com/live/playlist.m3u8?token=123").key, "direct-video");
    assert.equal(detectMediaPlatform("https://audio.example.com/podcast.mp3").key, "direct-audio");
  });

  test("falls back gracefully for generic web media or invalid URLs", () => {
    assert.equal(detectMediaPlatform("https://vimeo.com/123456").key, "vimeo");
    assert.equal(detectMediaPlatform("https://unknown-site.org/media/123").key, "web-media");
    assert.equal(detectMediaPlatform("not-a-url").key, "generic");
    assert.equal(detectMediaPlatform(null).key, "generic");
  });
});

describe("StemKit configuration & separation filters", () => {
  test("defines all 4 core stems with metadata", () => {
    assert.deepEqual(DEFAULT_STEMS, ["vocals", "drums", "bass", "other"]);
    assert.equal(STEM_CONFIG.vocals.label, "Vocals");
    assert.equal(STEM_CONFIG.drums.label, "Drums");
    assert.equal(STEM_CONFIG.bass.label, "Bass");
    assert.equal(STEM_CONFIG.other.label, "Other");
  });

  test("sanitizes stem project titles safely", () => {
    assert.equal(sanitizeStemTitle("Queen: Bohemian Rhapsody / Live?"), "Queen_ Bohemian Rhapsody _ Live_");
    assert.equal(sanitizeStemTitle(""), "Audio");
  });

  test("generates DSP separation filters for all 4 stems", () => {
    const filters = getStemSeparationFilters();
    assert.ok(filters.vocals.includes("bandpass"));
    assert.ok(filters.bass.includes("lowpass"));
    assert.ok(filters.drums.includes("highpass"));
    assert.ok(filters.other.includes("bandpass"));
  });
});

describe("cleanOutputPath & normalizeComparablePathName", () => {
  test("strips ANSI color codes and whitespace", () => {
    const raw = "\u001b[0;32m C:\\Videos\\MyVideo.mp4 \u001b[0m";
    assert.equal(cleanOutputPath(raw), "C:\\Videos\\MyVideo.mp4");
  });

  test("normalizes unicode fullwidth characters and collapses whitespace", () => {
    const raw = "My　Title：Episode　1";
    const normalized = normalizeComparablePathName(raw);
    assert.equal(normalized, "my titleepisode 1");
  });
});

describe("parseProgress", () => {
  test("parses yt-dlp download progress output lines", () => {
    const line = "[download]  45.2% of ~  24.50MiB at    3.25MiB/s ETA 00:04";
    const parsed = parseProgress(line);
    assert.ok(parsed);
    assert.equal(parsed.percent, 45.2);
    assert.equal(parsed.speed, "3.25MiB/s");
    assert.equal(parsed.eta, "00:04");
    assert.equal(parsed.size, "24.50MiB");
  });

  test("returns null for non-progress lines", () => {
    assert.equal(parseProgress("[Merger] Merging formats into file.mp4"), null);
    assert.equal(parseProgress("[info] Extracting URL: ..."), null);
  });
});
