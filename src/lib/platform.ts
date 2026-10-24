export interface MediaPlatformInfo {
  name: string;
  key: string;
  badge: string;
  color: string;
}

export function detectMediaPlatform(url: string): MediaPlatformInfo {
  if (!url || typeof url !== "string") {
    return { name: "Universal", key: "generic", badge: "Any Media", color: "#64748b" };
  }
  try {
    const trimmed = url.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return { name: "Universal", key: "generic", badge: "Any Media", color: "#64748b" };
    }
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Direct stream or file formats
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

export const POPULAR_MEDIA_PLATFORMS = [
  { name: "YouTube", tag: "youtube" },
  { name: "TikTok", tag: "tiktok" },
  { name: "X (Twitter)", tag: "x" },
  { name: "Instagram", tag: "instagram" },
  { name: "Reddit", tag: "reddit" },
  { name: "SoundCloud", tag: "soundcloud" },
  { name: "Twitch", tag: "twitch" },
  { name: "Direct .mp4/.m3u8", tag: "direct" },
  { name: "1,800+ sites", tag: "more" }
];
