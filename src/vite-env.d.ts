/// <reference types="vite/client" />

type DownloadMode = "video" | "video-only" | "audio" | "stems";
type DownloadQuality = "original" | "1080" | "720";
type DownloadStatus = "queued" | "running" | "complete" | "error" | "cancelled";
type StemId = "vocals" | "drums" | "bass" | "other";

interface StemProject {
  id: string;
  title: string;
  folder: string;
  createdAt: number;
  duration: number;
  stems: Record<StemId, string>;
  waveforms?: Record<StemId, number[]>;
}

interface AppSettings {
  downloadPath: string;
  mode: DownloadMode;
  quality: DownloadQuality;
  browser?: string;
}

interface DownloadRequest extends AppSettings {
  id?: string;
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
  stemProject?: StemProject;
}

interface UpdateStatusEvent {
  status: "checking" | "available" | "up-to-date" | "downloading" | "downloaded" | "error" | "dev";
  version?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
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
    openFolder: () => Promise<void>;
    listStemProjects: () => Promise<StemProject[]>;
    readStemAudio: (filePath: string) => Promise<string | null>;
    chooseLocalFile: () => Promise<string | null>;
    processLocalFile: (filePath: string) => Promise<StemProject>;
    exportStems: (options: { projectFolder: string; stemIds?: StemId[]; format?: "wav" | "mp3" }) => Promise<{ success?: boolean; exportDir?: string; cancelled?: boolean }>;
    openStemFolder: (folderPath: string) => Promise<boolean>;
    deleteStemProject: (folderPath: string) => Promise<boolean>;
    checkForUpdates: () => Promise<{ success?: boolean; updateInfo?: unknown; status?: string; message?: string; error?: string }>;
    installUpdate: () => Promise<boolean>;
    getAppVersion: () => Promise<string>;
    onUpdateEvent: (callback: (event: UpdateStatusEvent) => void) => () => void;
    onDownloadEvent: (callback: (event: DownloadEvent) => void) => () => void;
  };
}
