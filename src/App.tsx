import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Video,
  Music2,
  Sparkles,
  Settings as SettingsIcon,
  FolderOpen,
  Trash2,
  XCircle,
  ClipboardPaste,
  RefreshCw,
  ArrowUpCircle,
  CheckCircle2,
  AlertCircle
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

import React from "react";

class ErrorBoundary extends React.Component<
  { fallbackTitle: string; onReset: () => void; children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { fallbackTitle: string; onReset: () => void; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="stem-studio-empty" style={{ padding: "40px 20px", textAlign: "center" }}>
          <div className="stem-empty-icon" style={{ borderColor: "var(--semantic-error)" }}>
            <AlertCircle size={28} color="var(--semantic-error)" aria-hidden="true" />
          </div>
          <h3>{this.props.fallbackTitle}</h3>
          <p style={{ color: "var(--text-subtle)", maxWidth: "460px", margin: "8px auto" }}>
            {this.state.error?.message || "An unexpected error occurred while loading this view."}
          </p>
          <button
            className="secondary-btn"
            style={{ marginTop: "12px" }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset();
            }}
          >
            Return to Downloader
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  // Auto-updater state
  const [appVersion, setAppVersion] = useState<string>("0.2.4");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusEvent>({ status: "up-to-date" });
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const activeCount = useMemo(
    () => downloads.filter((item) => item.status === "running" || item.status === "queued").length,
    [downloads]
  );

  // Initial load
  useEffect(() => {
    window.ytDlpUi.getSettings().then(setSettings);
    window.ytDlpUi.getAppVersion().then((v) => {
      if (v) setAppVersion(v);
    }).catch(() => {});
    refreshStemProjects();

    const unsubDownload = window.ytDlpUi.onDownloadEvent((event) => {
      setDownloads((items) =>
        items.map((item) => {
          if (item.id !== event.id) {
            return item;
          }

          if (event.type === "started") {
            return { ...item, status: "running", message: "Starting download…" };
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
              message: event.message ?? "Downloading…"
            };
          }

          if (event.type === "log") {
            return {
              ...item,
              logs: event.line ? appendLog(item.logs, event.line) : item.logs,
              message: event.level === "error" ? "Reading error output…" : item.message
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

    const unsubUpdate = window.ytDlpUi.onUpdateEvent((event) => {
      setUpdateStatus(event);
    });

    return () => {
      unsubDownload();
      if (unsubUpdate) unsubUpdate();
    };
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
    await window.ytDlpUi.exportStems({
      projectFolder: project.folder,
      format: "wav"
    });
  };

  const handleDeleteStemProject = async (project: StemProject) => {
    const ok = await window.ytDlpUi.deleteStemProject(project.folder);
    if (ok) {
      const updated = stemProjects.filter((p) => p.folder !== project.folder);
      setStemProjects(updated);
      setActiveStemProject(updated[0] || null);
    }
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await window.ytDlpUi.checkForUpdates();
      if (res?.status === "dev") {
        setUpdateStatus({ status: "dev", message: res.message });
      } else if (!res?.success && res?.error) {
        setUpdateStatus({ status: "error", message: res.error });
      }
    } catch (err: unknown) {
      setUpdateStatus({
        status: "error",
        message: err instanceof Error ? err.message : "Update check failed"
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className="app-layout">
      {/* Chrome Navigation Header */}
      <header className="app-header">
        <div className="header-left">
          <Logo size={30} showWordmark={true} />

          {/* Tab Navigation */}
          <nav className="nav-tabs" role="tablist" aria-label="Main application tabs">
            <button
              role="tab"
              aria-selected={activeTab === "downloader"}
              className={`nav-tab ${activeTab === "downloader" ? "active" : ""}`}
              onClick={() => setActiveTab("downloader")}
            >
              <Download size={14} aria-hidden="true" />
              <span>Downloader</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "studio"}
              className={`nav-tab ${activeTab === "studio" ? "active" : ""}`}
              onClick={() => setActiveTab("studio")}
            >
              <Sparkles size={14} aria-hidden="true" />
              <span>Stem Studio</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "settings"}
              className={`nav-tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <SettingsIcon size={14} aria-hidden="true" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        <div className="header-right">
          {updateStatus.status === "downloading" && (
            <div className="badge-update-downloading" aria-live="polite">
              <span className="pulse-dot" aria-hidden="true" />
              <span>
                Updating v{updateStatus.version || ""}&nbsp;({updateStatus.percent || 0}%)
              </span>
            </div>
          )}
          {updateStatus.status === "downloaded" && (
            <button
              className="btn-update-restart"
              onClick={() => window.ytDlpUi.installUpdate()}
              title="Restart NovaDL to install downloaded update"
            >
              <ArrowUpCircle size={14} aria-hidden="true" />
              <span>Restart to install v{updateStatus.version}</span>
            </button>
          )}
          {activeCount > 0 && (
            <div className="badge-active-tasks" aria-live="polite">
              <span className="pulse-dot" aria-hidden="true" />
              <span>{activeCount}&nbsp;active</span>
            </div>
          )}
          <button
            className="secondary-btn icon-btn"
            title="Open Downloads Folder"
            aria-label="Open Downloads Folder"
            onClick={() => window.ytDlpUi.openFolder()}
          >
            <FolderOpen size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-content">
        {activeTab === "downloader" && (
          <div className="downloader-view">
            {/* Monolithic Ingestion Deck */}
            <section className="downloader-deck" aria-label="Media Downloader Deck">
              <div className="url-input-wrapper">
                {url.trim() && (
                  <span
                    className="detected-platform-badge"
                    style={{
                      backgroundColor: `${detectedPlatform.color}15`,
                      color: detectedPlatform.color,
                      borderColor: `${detectedPlatform.color}40`
                    }}
                  >
                    {detectedPlatform.badge}
                  </span>
                )}
                <input
                  type="text"
                  className="url-input"
                  placeholder="Paste media link from YouTube, TikTok, X, Instagram, Reddit, SoundCloud, or direct .mp4/.m3u8 stream…"
                  value={url}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStartDownload()}
                />
                {!url && (
                  <button
                    className="secondary-btn icon-btn"
                    title="Paste from clipboard"
                    aria-label="Paste from clipboard"
                    onClick={handlePaste}
                  >
                    <ClipboardPaste size={14} aria-hidden="true" />
                  </button>
                )}
                <button
                  className="primary-btn"
                  onClick={handleStartDownload}
                  disabled={!url.trim() || isStarting}
                  aria-label={settings.mode === "stems" ? "Extract Stems" : "Start Download"}
                >
                  <Download size={14} aria-hidden="true" />
                  <span>{settings.mode === "stems" ? "Extract Stems" : "Download"}</span>
                </button>
              </div>

              {/* Supported Platforms Telemetry Bar */}
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
                <div className="mode-segmented-group" role="group" aria-label="Download format mode">
                  <button
                    className={`mode-pill ${settings.mode === "video" ? "active" : ""}`}
                    onClick={() => updateSetting("mode", "video")}
                  >
                    <Video size={13} aria-hidden="true" />
                    <span>Video (Editing MP4)</span>
                  </button>
                  <button
                    className={`mode-pill ${settings.mode === "audio" ? "active" : ""}`}
                    onClick={() => updateSetting("mode", "audio")}
                  >
                    <Music2 size={13} aria-hidden="true" />
                    <span>Audio (MP3)</span>
                  </button>
                  <button
                    className={`mode-pill ${settings.mode === "stems" ? "stems-active" : ""}`}
                    onClick={() => updateSetting("mode", "stems")}
                  >
                    <Sparkles size={13} color="var(--stem-vocals)" aria-hidden="true" />
                    <span>AI Stems (StemKit)</span>
                  </button>
                </div>

                {settings.mode === "video" && (
                  <div className="quality-pills" role="group" aria-label="Video quality preset">
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
            </section>

            {/* Active Downloads Queue */}
            <section className="queue-section" aria-label="Activity Queue">
              <div className="queue-header">
                <h2 className="queue-title">Activity Queue ({downloads.length})</h2>
              </div>

              {downloads.length === 0 ? (
                <div className="stem-studio-empty" style={{ padding: "48px 24px" }}>
                  <p>Queue is empty. Paste a media URL above to begin downloading or separating stems.</p>
                </div>
              ) : (
                <div className="queue-list" role="feed" aria-label="Download queue items">
                  {downloads.map((item) => (
                    <article key={item.id} className="queue-card" role="article" aria-label={`Download for ${item.url}`}>
                      <div className="queue-card-top">
                        <div className="queue-card-meta">
                          {(() => {
                            const platform = detectMediaPlatform(item.url);
                            return (
                              <span
                                className="queue-platform-badge"
                                style={{
                                  backgroundColor: `${platform.color}15`,
                                  color: platform.color,
                                  borderColor: `${platform.color}35`
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
                              style={{ padding: "5px 10px", fontSize: "11.5px" }}
                              onClick={() => openInStemStudio(item.stemProject!)}
                            >
                              <Sparkles size={12} aria-hidden="true" />
                              <span>Open in Stem Studio</span>
                            </button>
                          )}
                          {(item.status === "running" || item.status === "queued") && (
                            <button
                              className="secondary-btn icon-btn"
                              title="Cancel download"
                              aria-label="Cancel download"
                              onClick={() => window.ytDlpUi.cancelDownload(item.id)}
                            >
                              <XCircle size={14} aria-hidden="true" />
                            </button>
                          )}
                          {(item.status === "complete" || item.status === "error" || item.status === "cancelled") && (
                            <button
                              className="secondary-btn icon-btn danger-hover"
                              title="Remove item"
                              aria-label="Remove item"
                              onClick={() => {
                                void window.ytDlpUi.removeDownload(item.id);
                                setDownloads((prev) => prev.filter((d) => d.id !== item.id));
                              }}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar & Tabular Telemetry */}
                      <div className="progress-container">
                        <div className="progress-track">
                          <div
                            className={`progress-fill ${item.mode === "stems" ? "stems-fill" : ""}`}
                            style={{ transform: `scaleX(${Math.max(0, Math.min(100, item.progress)) / 100})` }}
                          />
                        </div>
                        <div className="progress-stats">
                          <span className="progress-status-msg">{item.message}</span>
                          <div className="progress-telemetry">
                            {item.speed && <span>{item.speed}</span>}
                            {item.size && <span>{item.size}</span>}
                            {item.eta && <span>ETA {item.eta}</span>}
                            <span>{Math.round(item.progress)}%</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Stem Studio View */}
        {activeTab === "studio" && (
          <div className="studio-view">
            <ErrorBoundary fallbackTitle="Stem Studio Encountered an Error" onReset={() => setActiveTab("downloader")}>
              <StemMixer
                project={activeStemProject}
                onOpenFolder={(folder) => window.ytDlpUi.openStemFolder(folder)}
                onExport={handleExportStems}
                onDelete={handleDeleteStemProject}
                onSelectProject={(proj) => setActiveStemProject(proj)}
                allProjects={stemProjects}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* Settings View */}
        {activeTab === "settings" && (
          <div className="settings-view">
            <div className="settings-card">
              <h2 className="settings-heading">Application Settings</h2>

              {/* Download Directory */}
              <div className="settings-group">
                <label className="settings-label" htmlFor="downloadPath">
                  Download & Stem Output Directory
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    id="downloadPath"
                    type="text"
                    readOnly
                    value={settings.downloadPath}
                    className="settings-input"
                    style={{ flex: 1 }}
                  />
                  <button className="secondary-btn" onClick={chooseDownloadPath}>
                    Change
                  </button>
                  <button
                    className="secondary-btn icon-btn"
                    title="Open Folder in File Explorer"
                    aria-label="Open Folder in File Explorer"
                    onClick={() => window.ytDlpUi.openFolder()}
                  >
                    <FolderOpen size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Browser Cookies for Multi-Platform Media */}
              <div className="settings-group">
                <label className="settings-label" htmlFor="browserCookies">
                  Browser Session Cookies (for Age-Gated / Private / Member-Only Media)
                </label>
                <select
                  id="browserCookies"
                  value={settings.browser || "none"}
                  onChange={(e) => updateSetting("browser", e.target.value)}
                  className="settings-select"
                >
                  {browsers.map((b) => (
                    <option key={b} value={b}>
                      {b === "none" ? "None (Public media only)" : `${b.charAt(0).toUpperCase() + b.slice(1)}`}
                    </option>
                  ))}
                </select>
                <p className="settings-hint">
                  Borrow authentication session cookies from your installed browser to download private videos, member streams, or age-gated media across YouTube, TikTok, X, Instagram, Reddit, and 1,800+ sites.
                </p>
              </div>

              {/* StemKit AI Engine Telemetry */}
              <div className="settings-group" style={{ padding: "14px", borderRadius: "8px", background: "var(--surface-2)", border: "1px solid var(--hairline)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "13px", color: "var(--stem-vocals)" }}>
                  <Sparkles size={15} aria-hidden="true" />
                  <span>StemKit Audio Isolation Engine</span>
                </div>
                <p className="settings-hint" style={{ marginTop: "4px" }}>
                  NovaDL includes offline 4-track stem separation (Vocals, Drums, Bass, Instruments) with automated waveform generation, mini-DAW mixer playback, pan controls, and lossless export.
                </p>
              </div>

              {/* In-App Auto Updates & Version */}
              <div className="settings-group settings-update-box">
                <div className="settings-update-header">
                  <div>
                    <label className="settings-label">Application Updates & Version</label>
                    <div className="settings-update-version">NovaDL v{appVersion}</div>
                  </div>
                  <div className="settings-update-actions">
                    {updateStatus.status === "downloaded" ? (
                      <button
                        className="btn-update-restart"
                        onClick={() => window.ytDlpUi.installUpdate()}
                      >
                        <ArrowUpCircle size={14} aria-hidden="true" />
                        <span>Restart & Install v{updateStatus.version}</span>
                      </button>
                    ) : (
                      <button
                        className="secondary-btn"
                        disabled={isCheckingUpdate || updateStatus.status === "downloading"}
                        onClick={handleCheckForUpdates}
                      >
                        <RefreshCw size={13} className={isCheckingUpdate ? "spin" : ""} aria-hidden="true" />
                        <span>{isCheckingUpdate ? "Checking…" : "Check for Updates"}</span>
                      </button>
                    )}
                  </div>
                </div>

                {updateStatus.status === "downloading" && (
                  <div className="settings-update-progress-container">
                    <div className="settings-update-progress-label">
                      <span>Downloading v{updateStatus.version}…</span>
                      <span>{updateStatus.percent || 0}%</span>
                    </div>
                    <div className="settings-update-progress-track">
                      <div
                        className="settings-update-progress-fill"
                        style={{ transform: `scaleX(${Math.min(100, Math.max(0, updateStatus.percent || 0)) / 100})` }}
                      />
                    </div>
                  </div>
                )}

                {updateStatus.status === "available" && (
                  <p className="settings-hint" style={{ color: "var(--accent-primary)" }}>
                    Update v{updateStatus.version} found on GitHub Releases. Downloading in background…
                  </p>
                )}

                {updateStatus.status === "downloaded" && (
                  <p className="settings-hint" style={{ color: "var(--semantic-success)" }}>
                    Update v{updateStatus.version} is ready to install. Restart now to complete the update.
                  </p>
                )}

                {updateStatus.status === "up-to-date" && (
                  <p className="settings-hint" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <CheckCircle2 size={13} color="var(--semantic-success)" aria-hidden="true" />
                    <span>NovaDL is up to date (running v{appVersion}).</span>
                  </p>
                )}

                {updateStatus.status === "dev" && (
                  <p className="settings-hint">
                    {updateStatus.message || "Auto-update is enabled for installed application builds via GitHub Releases."}
                  </p>
                )}

                {updateStatus.status === "error" && (
                  <p className="settings-hint" style={{ color: "var(--semantic-danger)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <AlertCircle size={13} aria-hidden="true" />
                    <span>{updateStatus.message || "Failed to check for updates."}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
