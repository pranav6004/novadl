/// <reference types="vite/client" />

type DownloadMode = "video" | "video-only" | "audio";
type DownloadQuality = "original" | "1080" | "720";
type DownloadStatus = "queued" | "running" | "complete" | "error" | "cancelled";

interface AppSettings {
  downloadPath: string;
  mode: DownloadMode;
  quality: DownloadQuality;
  browser?: string;
}

interface DownloadRequest extends AppSettings {
  url: string;
}

interface DownloadEvent {
  id: string;
  type: "started" | "progress" | "log" | "complete" | "error" | "cancelled";
  percent?: number;
  size?: string;
  speed?: string;
  eta?: string;
  line?: string;
  level?: "error";
  message?: string;
}

interface Window {
  ytDlpUi: {
    getSettings: () => Promise<AppSettings>;
    setSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
    chooseDownloadPath: () => Promise<string | null>;
    startDownload: (request: DownloadRequest) => Promise<{ id: string }>;
    cancelDownload: (id: string) => Promise<boolean>;
    removeDownload: (id: string) => Promise<boolean>;
    openFolder: (folderPath: string) => Promise<void>;
    onDownloadEvent: (callback: (event: DownloadEvent) => void) => () => void;
  };
}
