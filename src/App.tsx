import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Video,
  Music2,
  Sparkles,
  Sliders,
  Settings as SettingsIcon,
  FolderOpen,
  Folder,
  Trash2,
  XCircle,
  Play,
  RotateCw,
  CheckCircle2,
  ExternalLink,
  ClipboardPaste,
  Layers,
  ArrowRight
} from "lucide-react";
import { Logo } from "./components/Logo";
import { StemMixer } from "./components/StemMixer";
import { detectMediaPlatform, POPULAR_MEDIA_PLATFORMS } from "./lib/platform";

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
  stemProject?: StemProject;
}

const qualityLabels: Record<DownloadQuality, string> = {
  original: "Original",
  "1080": "1080p",
  "720": "720p"
};

const browsers = ["none", "chrome", "firefox", "edge", "brave", "safari", "opera", "vivaldi"];

export function App() {
  const [activeTab, setActiveTab] = useState<"downloader" | "studio" | "settings">("downloader");
  const [url, setUrl] = useState("");
  const detectedPlatform = useMemo(() => detectMediaPlatform(url), [url]);
  const [settings, setSettings] = useState<AppSettings>({
    downloadPath: "",
    mode: "video",
    quality: "original",
    browser: "none"
  });
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [isStarting, setIsStarting] = useState(false);

  // Stem Studio state
  const [stemProjects, setStemProjects] = useState<StemProject[]>([]);
  const [activeStemProject, setActiveStemProject] = useState<StemProject | null>(null);

  const activeCount = useMemo(
    () => downloads.filter((item) => item.status === "running" || item.status === "queued").length,
    [downloads]
  );

  // Initial load
  useEffect(() => {
    window.ytDlpUi.getSettings().then(setSettings);
    refreshStemProjects();

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
              message: event.message ?? "Downloading"
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
            if (event.stemProject) {
              refreshStemProjects();
            }
            return {
              ...item,
              status: "complete",
              progress: 100,
              message: event.message ?? "Complete",
              stemProject: event.stemProject ?? item.stemProject
            };
          }

          if (event.type === "error") {
            return {
              ...item,
              status: "error",
              message: event.message ?? "Download failed",
              logs: event.message ? appendLog(item.logs, event.message) : item.logs
            };
          }

          if (event.type === "cancelled") {
            return { ...item, status: "cancelled", message: event.message ?? "Cancelled" };
          }

          return item;
        })
      );
    });
  }, []);

  const refreshStemProjects = async () => {
    try {
      const list = await window.ytDlpUi.listStemProjects();
      setStemProjects(list);
      if (list.length > 0 && !activeStemProject) {
        setActiveStemProject(list[0]);
      }
    } catch {}
  };

  const appendLog = (logs: string[], line: string) => {
    return [...logs.slice(-40), line];
  };

  const handleStartDownload = async () => {
    const trimmed = url.trim();
    if (!trimmed || isStarting) return;

    setIsStarting(true);
    const id = crypto.randomUUID();

    const newItem: DownloadItem = {
      id,
      url: trimmed,
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
    };

    setDownloads((prev) => [newItem, ...prev]);
    setUrl("");

    try {
      await window.ytDlpUi.startDownload({
        id,
        url: trimmed,
        mode: settings.mode,
        quality: settings.quality,
        downloadPath: settings.downloadPath,
        browser: settings.browser
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to queue download";
      setDownloads((items) =>
        items.map((item) => (item.id === id ? { ...item, status: "error", message } : item))
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {}
  };

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await window.ytDlpUi.setSettings({ [key]: value });
  };

  const chooseDownloadPath = async () => {
    const selected = await window.ytDlpUi.chooseDownloadPath();
    if (selected) {
      await updateSetting("downloadPath", selected);
    }
  };

  const openInStemStudio = (project: StemProject) => {
    setActiveStemProject(project);
    setActiveTab("studio");
  };

  const handleExportStems = async (project: StemProject) => {
    const res = await window.ytDlpUi.exportStems({
      projectFolder: project.folder,
      format: "wav"
    });
    if (res.success) {
      // notification / feedback
    }
  };

  const handleDeleteStemProject = async (project: StemProject) => {
    const ok = await window.ytDlpUi.deleteStemProject(project.folder);
    if (ok) {
      const updated = stemProjects.filter((p) => p.folder !== project.folder);
      setStemProjects(updated);
      setActiveStemProject(updated[0] || null);
    }
  };

  return (
    <div className="app-layout">
      {/* Chrome Navigation Header */}
      <header className="app-header">
        <div className="header-left">
          <Logo size={32} showWordmark={true} />

          {/* Tab Navigation */}
          <nav className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === "downloader" ? "active" : ""}`}
              onClick={() => setActiveTab("downloader")}
            >
              <Download size={15} />
              <span>Downloader</span>
            </button>
            <button
              className={`nav-tab ${activeTab === "studio" ? "active" : ""}`}
              onClick={() => setActiveTab("studio")}
            >
              <Sparkles size={15} />
              <span>Stem Studio</span>
            </button>
            <button
              className={`nav-tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <SettingsIcon size={15} />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        <div className="header-right">
          {activeCount > 0 && (
            <div className="badge-active-tasks">
              <span className="pulse-dot" />
              <span>{activeCount} active</span>
            </div>
          )}
          <button
            className="secondary-btn icon-btn"
            title="Open Downloads Folder"
            onClick={() => window.ytDlpUi.openFolder()}
          >
            <FolderOpen size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-content">
        {activeTab === "downloader" && (
          <div className="downloader-view">
            {/* Hero Input Area */}
            <div className="downloader-hero">
              <div className="url-input-wrapper">
                {url.trim() && (
                  <span
                    className="detected-platform-badge"
                    style={{
                      backgroundColor: `${detectedPlatform.color}20`,
                      color: detectedPlatform.color,
                      borderColor: `${detectedPlatform.color}55`
                    }}
                  >
                    {detectedPlatform.badge}
                  </span>
                )}
                <input
                  type="text"
                  className="url-input"
                  placeholder="Paste any video, audio, or social stream link (YouTube, TikTok, X, Instagram, Reddit, .mp4...)"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStartDownload()}
                />
                {!url && (
                  <button className="secondary-btn icon-btn" title="Paste from clipboard" onClick={handlePaste}>
                    <ClipboardPaste size={15} />
                  </button>
                )}
                <button
                  className="primary-btn"
                  onClick={handleStartDownload}
                  disabled={!url.trim() || isStarting}
                >
                  <Download size={15} />
                  <span>{settings.mode === "stems" ? "Extract Stems" : "Download"}</span>
                </button>
              </div>

              {/* Supported Platforms Strip */}
              <div className="supported-platforms-bar">
                <span className="supported-label">Universal Media:</span>
                <div className="supported-chips">
                  {POPULAR_MEDIA_PLATFORMS.map((p) => (
                    <span key={p.tag} className="platform-chip">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Mode & Quality Selector */}
              <div className="downloader-options">
                <div className="mode-segmented-group">
                  <button
                    className={`mode-pill ${settings.mode === "video" ? "active" : ""}`}
                    onClick={() => updateSetting("mode", "video")}
                  >
                    <Video size={14} />
                    <span>Video (Editing MP4)</span>
                  </button>
                  <button
                    className={`mode-pill ${settings.mode === "audio" ? "active" : ""}`}
                    onClick={() => updateSetting("mode", "audio")}
                  >
                    <Music2 size={14} />
                    <span>Audio (MP3)</span>
                  </button>
                  <button
                    className={`mode-pill ${settings.mode === "stems" ? "stems-active" : ""}`}
                    onClick={() => updateSetting("mode", "stems")}
                  >
                    <Sparkles size={14} color="#a78bfa" />
                    <span>AI Stems (StemKit)</span>
                  </button>
                </div>

                {settings.mode === "video" && (
                  <div className="quality-pills">
                    {(["original", "1080", "720"] as DownloadQuality[]).map((q) => (
                      <button
                        key={q}
                        className={`quality-pill ${settings.quality === q ? "active" : ""}`}
                        onClick={() => updateSetting("quality", q)}
                      >
                        {qualityLabels[q]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Active Downloads Queue */}
            <div className="queue-section">
              <div className="queue-header">
                <div className="queue-title">Activity Queue ({downloads.length})</div>
              </div>

              {downloads.length === 0 ? (
                <div className="stem-studio-empty" style={{ padding: "50px 24px" }}>
                  <p>Queue is empty. Paste a link above to start downloading or extracting stems.</p>
                </div>
              ) : (
                <div className="queue-list">
                  {downloads.map((item) => (
                    <div key={item.id} className="queue-card">
                      <div className="queue-card-top">
                        <div className="queue-card-meta">
                          {(() => {
                            const platform = detectMediaPlatform(item.url);
                            return (
                              <span
                                className="queue-platform-badge"
                                style={{
                                  backgroundColor: `${platform.color}18`,
                                  color: platform.color,
                                  borderColor: `${platform.color}40`
                                }}
                              >
                                {platform.name}
                              </span>
                            );
                          })()}
                          <span className={`queue-mode-badge ${item.mode === "stems" ? "stems" : ""}`}>
                            {item.mode === "stems" ? "AI Stems" : item.mode}
                          </span>
                          <span className="queue-item-url" title={item.url}>
                            {item.url}
                          </span>
                        </div>

                        <div className="queue-card-actions">
                          {item.stemProject && (
                            <button
                              className="primary-btn"
                              style={{ padding: "6px 12px", fontSize: "12px" }}
                              onClick={() => openInStemStudio(item.stemProject!)}
                            >
                              <Sparkles size={13} /> Open in Stem Studio
                            </button>
                          )}
                          {(item.status === "running" || item.status === "queued") && (
                            <button
                              className="secondary-btn icon-btn"
                              title="Cancel"
                              onClick={() => window.ytDlpUi.cancelDownload(item.id)}
                            >
                              <XCircle size={15} />
                            </button>
                          )}
                          {(item.status === "complete" || item.status === "error" || item.status === "cancelled") && (
                            <button
                              className="secondary-btn icon-btn danger-hover"
                              title="Remove"
                              onClick={() => {
                                void window.ytDlpUi.removeDownload(item.id);
                                setDownloads((prev) => prev.filter((d) => d.id !== item.id));
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="progress-container">
                        <div className="progress-track">
                          <div
                            className={`progress-fill ${item.mode === "stems" ? "stems-fill" : ""}`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <div className="progress-stats">
                          <span className="progress-status-msg">{item.message}</span>
                          <div style={{ display: "flex", gap: "12px" }}>
                            {item.speed && <span>{item.speed}</span>}
                            {item.size && <span>{item.size}</span>}
                            {item.eta && <span>ETA {item.eta}</span>}
                            <span>{Math.round(item.progress)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stem Studio View */}
        {activeTab === "studio" && (
          <div className="studio-view">
            <StemMixer
              project={activeStemProject}
              onOpenFolder={(folder) => window.ytDlpUi.openStemFolder(folder)}
              onExport={handleExportStems}
              onDelete={handleDeleteStemProject}
              onSelectProject={(proj) => setActiveStemProject(proj)}
              allProjects={stemProjects}
            />
          </div>
        )}

        {/* Settings View */}
        {activeTab === "settings" && (
          <div className="settings-view">
            <div className="downloader-hero" style={{ maxWidth: "700px", margin: "0 auto" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>App Settings</h2>

              {/* Download Directory */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Download & Stems Directory
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    readOnly
                    value={settings.downloadPath}
                    className="url-input-wrapper"
                    style={{ flex: 1, padding: "8px 12px", background: "rgba(0,0,0,0.3)" }}
                  />
                  <button className="secondary-btn" onClick={chooseDownloadPath}>
                    Change
                  </button>
                  <button className="secondary-btn icon-btn" onClick={() => window.ytDlpUi.openFolder()}>
                    <FolderOpen size={16} />
                  </button>
                </div>
              </div>

              {/* Browser Cookies for Multi-Platform Media */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Browser Session Cookies (for Age-gated / Private / Members-only Media)
                </label>
                <select
                  value={settings.browser || "none"}
                  onChange={(e) => updateSetting("browser", e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid var(--border-medium)",
                    color: "#fff",
                    outline: "none"
                  }}
                >
                  {browsers.map((b) => (
                    <option key={b} value={b} style={{ background: "#0e121d" }}>
                      {b === "none" ? "None (Public media only)" : `${b.charAt(0).toUpperCase() + b.slice(1)}`}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Borrow cookies from your browser to download private videos, member streams, or age-gated media across YouTube, TikTok, X, Instagram, Reddit, and 1,800+ sites.
                </p>
              </div>

              {/* StemKit AI Engine Details */}
              <div style={{ marginTop: "16px", padding: "14px", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "14px", color: "var(--stem-vocals)" }}>
                  <Sparkles size={16} /> StemKit AI Integration
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px", lineHeight: 1.5 }}>
                  NovaDL includes offline 4-track stem separation (Vocals, Drums, Bass, Instruments) with automated waveform generation, mini-DAW mixer playback, pan controls, and lossless export.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
