import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Folder,
  Music2,
  Play,
  RefreshCw,
  Square,
  Trash2,
  Video,
  XCircle
} from "lucide-react";

interface DownloadItem {
  id: string;
  url: string;
  mode: DownloadMode;
  quality: DownloadQuality;
  downloadPath: string;
  status: DownloadStatus;
  progress: number;
  size: string;
  speed: string;
  eta: string;
  logs: string[];
  message: string;
}

const qualityLabels: Record<DownloadQuality, string> = {
  original: "Original",
  "1080": "1080p",
  "720": "720p"
};

const browsers = ["none", "chrome", "firefox", "edge", "brave", "safari", "opera", "vivaldi"];

const statusLabels: Record<DownloadStatus, string> = {
  queued: "Queued",
  running: "Running",
  complete: "Complete",
  error: "Error",
  cancelled: "Cancelled"
};

function App() {
  const [url, setUrl] = useState("");
  const [settings, setSettings] = useState<AppSettings>({
    downloadPath: "",
    mode: "video",
    quality: "original",
    browser: "none"
  });
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [isStarting, setIsStarting] = useState(false);

  const activeCount = useMemo(
    () => downloads.filter((item) => item.status === "running" || item.status === "queued").length,
    [downloads]
  );

  useEffect(() => {
    window.ytDlpUi.getSettings().then(setSettings);

    return window.ytDlpUi.onDownloadEvent((event) => {
      setDownloads((items) =>
        items.map((item) => {
          if (item.id !== event.id) {
            return item;
          }

          if (event.type === "started") {
            return { ...item, status: "running", message: "Starting download" };
          }

          if (event.type === "progress") {
            return {
              ...item,
              status: "running",
              progress: event.percent ?? item.progress,
              size: event.size ?? item.size,
              speed: event.speed ?? item.speed,
              eta: event.eta ?? item.eta,
              logs: event.line ? appendLog(item.logs, event.line) : item.logs,
              message: "Downloading"
            };
          }

          if (event.type === "log") {
            return {
              ...item,
              logs: event.line ? appendLog(item.logs, event.line) : item.logs,
              message: event.level === "error" ? "Reading error output" : item.message
            };
          }

          if (event.type === "complete") {
            return { ...item, status: "complete", progress: 100, message: event.message ?? "Complete" };
          }

          if (event.type === "cancelled") {
            return { ...item, status: "cancelled", message: event.message ?? "Cancelled" };
          }

          return { ...item, status: "error", message: event.message ?? "Download failed" };
        })
      );
    });
  }, []);

  async function updateSettings(nextSettings: Partial<AppSettings>) {
    const updated = await window.ytDlpUi.setSettings(nextSettings);
    setSettings(updated);
  }

  async function chooseFolder() {
    const folder = await window.ytDlpUi.chooseDownloadPath();
    if (folder) {
      await updateSettings({ downloadPath: folder });
    }
  }

  async function startDownload() {
    const cleanUrl = url.trim();

    if (!cleanUrl || !settings.downloadPath || isStarting) {
      return;
    }

    setIsStarting(true);
    try {
      const request = { ...settings, url: cleanUrl };
      const { id } = await window.ytDlpUi.startDownload(request);

      setDownloads((items) => [
        {
          id,
          url: cleanUrl,
          mode: settings.mode,
          quality: settings.quality,
          downloadPath: settings.downloadPath,
          status: "queued",
          progress: 0,
          size: "",
          speed: "",
          eta: "",
          logs: [],
          message: "Queued"
        },
        ...items
      ]);
      setUrl("");
    } finally {
      setIsStarting(false);
    }
  }

  async function cancelDownload(id: string) {
    await window.ytDlpUi.cancelDownload(id);
  }

  async function removeDownload(id: string) {
    const shouldRemove = await window.ytDlpUi.removeDownload(id);
    if (shouldRemove) {
      setDownloads((items) => items.filter((item) => item.id !== id));
    }
  }

  async function retryDownload(item: DownloadItem) {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const request = {
        downloadPath: item.downloadPath,
        mode: item.mode,
        quality: item.quality,
        browser: settings.browser,
        url: item.url
      };
      const { id } = await window.ytDlpUi.startDownload(request);

      setDownloads((items) => {
        const filtered = items.filter((i) => i.id !== item.id);
        return [
          {
            id,
            url: item.url,
            mode: item.mode,
            quality: item.quality,
            downloadPath: item.downloadPath,
            status: "queued",
            progress: 0,
            size: "",
            speed: "",
            eta: "",
            logs: [],
            message: "Queued"
          },
          ...filtered
        ];
      });
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <img src="./icon.png" alt="NovaDL Logo" style={{ width: 32, height: 32 }} />
          </div>
          <div>
            <h1>NovaDL</h1>
            <p>Desktop downloads without the command line.</p>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric">
            <span>{downloads.length}</span>
            <p>Total</p>
          </div>
          <div className="metric">
            <span>{activeCount}</span>
            <p>Active</p>
          </div>
        </div>

        <div className="settings-panel">
          <h2>Settings</h2>

          <label className="field-label" htmlFor="download-path">
            Download folder
          </label>
          <div className="path-row">
            <input id="download-path" value={settings.downloadPath} readOnly />
            <button className="icon-button" type="button" onClick={chooseFolder} aria-label="Choose folder">
              <Folder size={18} />
            </button>
          </div>

          <label className="field-label">Mode</label>
          <div className="segmented">
            <button
              className={settings.mode === "video" ? "active" : ""}
              type="button"
              onClick={() => updateSettings({ mode: "video" })}
            >
              <Video size={17} />
              Video + Audio
            </button>
            <button
              className={settings.mode === "video-only" ? "active" : ""}
              type="button"
              onClick={() => updateSettings({ mode: "video-only" })}
            >
              <Video size={17} />
              Video Only
            </button>
            <button
              className={settings.mode === "audio" ? "active" : ""}
              type="button"
              onClick={() => updateSettings({ mode: "audio", quality: "original" })}
            >
              <Music2 size={17} />
              Audio
            </button>
          </div>

          <label className="field-label">Quality</label>
          <div className="quality-list">
            {(Object.keys(qualityLabels) as DownloadQuality[]).map((quality) => (
              <button
                key={quality}
                className={settings.quality === quality ? "active" : ""}
                type="button"
                onClick={() => updateSettings({ quality })}
                disabled={settings.mode === "audio" && quality !== "original"}
              >
                {qualityLabels[quality]}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="browser">
            Browser Cookies
          </label>
          <select
            id="browser"
            value={settings.browser || "none"}
            onChange={(e) => updateSettings({ browser: e.target.value })}
          >
            {browsers.map(b => (
              <option key={b} value={b}>
                {b === "none" ? "None" : b.charAt(0).toUpperCase() + b.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="workspace">
        <div className="download-composer">
          <div>
            <h2>New Download</h2>
            <p>Paste a video URL and send it straight to the queue.</p>
          </div>
          <div className="composer-row">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  startDownload();
                }
              }}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <button
              className="primary-button"
              type="button"
              onClick={startDownload}
              disabled={!url.trim() || !settings.downloadPath || isStarting}
            >
              <Play size={18} />
              Start
            </button>
          </div>
        </div>

        <div className="queue-header">
          <div>
            <h2>Queue</h2>
            <p>{downloads.length === 0 ? "No downloads yet" : `${downloads.length} downloads in this session`}</p>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => window.ytDlpUi.openFolder(settings.downloadPath)}
            disabled={!settings.downloadPath}
          >
            <Folder size={17} />
            Open Folder
          </button>
        </div>

        <div className="download-list">
          {downloads.length === 0 ? (
            <div className="empty-state">
              <Download size={42} />
              <h3>Ready when you are</h3>
              <p>Add a URL to start your first download.</p>
            </div>
          ) : (
            downloads.map((item) => (
              <article className="download-card" key={item.id}>
                <div className="download-main">
                  <div className={`status-icon ${item.status}`}>
                    {item.status === "complete" ? <CheckCircle2 size={20} /> : null}
                    {item.status === "error" ? <XCircle size={20} /> : null}
                    {item.status === "running" || item.status === "queued" ? <Clock3 size={20} /> : null}
                    {item.status === "cancelled" ? <Square size={20} /> : null}
                  </div>
                  <div className="download-copy">
                    <div className="download-title-row">
                      <h3>{item.url}</h3>
                      <span className={`status-pill ${item.status}`}>{statusLabels[item.status]}</span>
                    </div>
                    <p>
                      {item.mode === "audio" ? "Audio MP3" : item.mode === "video-only" ? `${qualityLabels[item.quality]} video (no audio)` : `${qualityLabels[item.quality]} video`} to {item.downloadPath}
                    </p>
                  </div>
                </div>

                <div className="progress-wrap">
                  <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }} />
                </div>

                <div className="download-meta">
                  <span>{Math.round(item.progress)}%</span>
                  <span>{item.size || "Unknown size"}</span>
                  <span>{item.speed || "Waiting"}</span>
                  <span>{item.eta ? `ETA ${item.eta}` : item.message}</span>
                </div>

                {item.logs.length > 0 ? (
                  <details className="log-panel">
                    <summary>Logs</summary>
                    <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: "8px" }}>
                      <button
                        className="ghost-button compact"
                        type="button"
                        onClick={() => navigator.clipboard.writeText(item.logs.join("\n"))}
                      >
                        <Copy size={14} />
                        Copy
                      </button>
                    </div>
                    <pre>{item.logs.join("\n")}</pre>
                  </details>
                ) : null}

                <div className="card-actions">
                  {item.status === "running" || item.status === "queued" ? (
                    <button className="danger-button" type="button" onClick={() => cancelDownload(item.id)}>
                      <Square size={16} />
                      Cancel
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: "8px" }}>
                      {(item.status === "error" || item.status === "cancelled") && (
                        <button className="ghost-button compact" type="button" onClick={() => retryDownload(item)}>
                          <RefreshCw size={16} />
                          Retry
                        </button>
                      )}
                      <button className="ghost-button compact" type="button" onClick={() => removeDownload(item.id)}>
                        <Trash2 size={16} />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function appendLog(logs: string[], line: string) {
  return [...logs.slice(-24), line];
}

export default App;
