import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Volume2, Download, FolderOpen, Music, Mic, Disc3, Radio, Sparkles, Trash2, Sliders } from "lucide-react";
import { MultiTrackStemEngine, StemId, StemTrackState, PresetType } from "../lib/audioEngine";

interface StemMixerProps {
  project: StemProject | null;
  onOpenFolder?: (folder: string) => void;
  onExport?: (project: StemProject) => void;
  onDelete?: (project: StemProject) => void;
  onSelectProject?: (project: StemProject) => void;
  allProjects?: StemProject[];
}

const STEM_CONFIGS: Record<StemId, { label: string; color: string; icon: React.ReactNode }> = {
  vocals: { label: "Vocals", color: "#a78bfa", icon: <Mic size={15} /> },
  drums: { label: "Drums", color: "#f87171", icon: <Disc3 size={15} /> },
  bass: { label: "Bass", color: "#38bdf8", icon: <Radio size={15} /> },
  other: { label: "Other", color: "#34d399", icon: <Music size={15} /> }
};

export const StemMixer: React.FC<StemMixerProps> = ({
  project,
  onOpenFolder,
  onExport,
  onDelete,
  onSelectProject,
  allProjects = []
}) => {
  const [engine] = useState(() => new MultiTrackStemEngine());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [activePreset, setActivePreset] = useState<PresetType>("all");
  const [masterVolume, setMasterVolume] = useState(0.9);

  const [tracks, setTracks] = useState<Record<StemId, StemTrackState>>({
    vocals: { id: "vocals", label: "Vocals", color: "#a78bfa", volume: 0.85, pan: 0, muted: false, solo: false, waveform: [] },
    drums: { id: "drums", label: "Drums", color: "#f87171", volume: 0.85, pan: 0, muted: false, solo: false, waveform: [] },
    bass: { id: "bass", label: "Bass", color: "#38bdf8", volume: 0.85, pan: 0, muted: false, solo: false, waveform: [] },
    other: { id: "other", label: "Other", color: "#34d399", volume: 0.85, pan: 0, muted: false, solo: false, waveform: [] }
  });

  const waveformContainerRef = useRef<HTMLDivElement>(null);

  // Load project audio into Web Audio Engine
  useEffect(() => {
    if (!project) return;

    let isMounted = true;
    setIsLoading(true);
    setLoadingProgress(10);
    setCurrentTime(0);
    engine.pause();

    // Populate waveform peaks from project metadata or fallback
    setTracks((prev) => {
      const next = { ...prev };
      for (const id of ["vocals", "drums", "bass", "other"] as StemId[]) {
        next[id] = {
          ...next[id],
          waveform: project.waveforms?.[id] || Array.from({ length: 64 }, (_, i) => 0.15 + 0.5 * Math.sin((i / 64) * Math.PI))
        };
      }
      return next;
    });

    const loadAllStems = async () => {
      const stemIds: StemId[] = ["vocals", "drums", "bass", "other"];
      let completed = 0;

      for (const stemId of stemIds) {
        if (!isMounted) return;
        const stemFile = project.stems[stemId];
        if (!stemFile) continue;

        try {
          const filePath = `${project.folder}/${stemFile}`;
          const base64Audio = await window.ytDlpUi.readStemAudio(filePath);
          if (base64Audio && isMounted) {
            await engine.loadStemBuffer(stemId, base64Audio);
          }
        } catch (err) {
          console.error(`Error loading stem ${stemId}:`, err);
        }

        completed++;
        if (isMounted) {
          setLoadingProgress(Math.round((completed / stemIds.length) * 100));
        }
      }

      if (isMounted) {
        const engineDuration = engine.getDuration() || project.duration || 0;
        setDuration(engineDuration);
        setIsLoading(false);
      }
    };

    void loadAllStems();

    return () => {
      isMounted = false;
      engine.pause();
    };
  }, [project, engine]);

  // Sync callbacks with engine
  useEffect(() => {
    engine.setOnTimeUpdate((t) => setCurrentTime(t));
    engine.setOnStateChange((p) => setIsPlaying(p));
  }, [engine]);

  // Sync track volume / pan / solo / mute to audio engine
  useEffect(() => {
    engine.updateTrackMix(tracks);
  }, [tracks, engine]);

  // Sync master volume
  useEffect(() => {
    engine.setMasterVolume(masterVolume);
  }, [masterVolume, engine]);

  // Spacebar toggle shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target as HTMLElement).tagName !== "INPUT") {
        e.preventDefault();
        if (isPlaying) {
          engine.pause();
        } else {
          engine.play();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, engine]);

  const togglePlay = () => {
    if (isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
  };

  const handleSeek = (seconds: number) => {
    engine.seek(seconds);
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    handleSeek(percent * duration);
  };

  const toggleMute = (id: StemId) => {
    setActivePreset("all");
    setTracks((prev) => ({
      ...prev,
      [id]: { ...prev[id], muted: !prev[id].muted }
    }));
  };

  const toggleSolo = (id: StemId) => {
    setActivePreset("all");
    setTracks((prev) => ({
      ...prev,
      [id]: { ...prev[id], solo: !prev[id].solo }
    }));
  };

  const handleVolumeChange = (id: StemId, val: number) => {
    setTracks((prev) => ({
      ...prev,
      [id]: { ...prev[id], volume: val }
    }));
  };

  const handlePanChange = (id: StemId, val: number) => {
    setTracks((prev) => ({
      ...prev,
      [id]: { ...prev[id], pan: val }
    }));
  };

  const applyPreset = (preset: PresetType) => {
    setActivePreset(preset);
    setTracks((prev) => {
      const next = { ...prev };
      switch (preset) {
        case "all":
          for (const key of Object.keys(next) as StemId[]) {
            next[key] = { ...next[key], muted: false, solo: false };
          }
          break;
        case "karaoke":
          next.vocals = { ...next.vocals, muted: true, solo: false };
          next.drums = { ...next.drums, muted: false, solo: false };
          next.bass = { ...next.bass, muted: false, solo: false };
          next.other = { ...next.other, muted: false, solo: false };
          break;
        case "acapella":
          next.vocals = { ...next.vocals, muted: false, solo: true };
          next.drums = { ...next.drums, muted: false, solo: false };
          next.bass = { ...next.bass, muted: false, solo: false };
          next.other = { ...next.other, muted: false, solo: false };
          break;
        case "rhythm":
          next.vocals = { ...next.vocals, muted: true, solo: false };
          next.drums = { ...next.drums, muted: false, solo: true };
          next.bass = { ...next.bass, muted: false, solo: true };
          next.other = { ...next.other, muted: true, solo: false };
          break;
        case "instrumental":
          next.vocals = { ...next.vocals, muted: true, solo: false };
          next.drums = { ...next.drums, muted: false, solo: false };
          next.bass = { ...next.bass, muted: false, solo: false };
          next.other = { ...next.other, muted: false, solo: false };
          break;
      }
      return next;
    });
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  if (!project) {
    return (
      <div className="stem-studio-empty">
        <div className="stem-empty-icon">
          <Sparkles size={36} color="#38bdf8" />
        </div>
        <h3>Stem Studio — Mini DAW</h3>
        <p>Isolate and mix musical stems (Vocals, Drums, Bass, Instruments) locally with zero latency.</p>
        <div className="stem-empty-actions">
          <button
            className="primary-btn"
            onClick={async () => {
              const file = await window.ytDlpUi.chooseLocalFile();
              if (file) {
                void window.ytDlpUi.processLocalFile(file);
              }
            }}
          >
            <FolderOpen size={16} /> Load Local Audio / Video
          </button>
        </div>
        {allProjects.length > 0 && (
          <div className="stem-recent-projects">
            <h4>Saved Projects</h4>
            <div className="stem-recent-list">
              {allProjects.map((p) => (
                <div key={p.folder} className="stem-recent-item" onClick={() => onSelectProject?.(p)}>
                  <div className="stem-recent-title">{p.title}</div>
                  <div className="stem-recent-meta">{formatTime(p.duration || 0)} &bull; 4 Stems</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="stem-studio-container">
      {/* Studio Header */}
      <div className="stem-studio-header">
        <div className="stem-header-info">
          <div className="stem-live-indicator">
            <span className="live-dot" style={{ backgroundColor: isPlaying ? "#34d399" : "#64748b" }} />
            <span className="live-label">{isLoading ? "DECODING AUDIO..." : isPlaying ? "PLAYING" : "STUDIO READY"}</span>
          </div>
          <h2 className="stem-project-title" title={project.title}>
            {project.title}
          </h2>
        </div>

        {/* Action Buttons */}
        <div className="stem-header-actions">
          {onOpenFolder && (
            <button className="secondary-btn icon-btn" title="Open Folder in File Explorer" onClick={() => onOpenFolder(project.folder)}>
              <FolderOpen size={16} />
            </button>
          )}
          {onExport && (
            <button className="primary-btn stem-export-btn" title="Export Stems (WAV / MP3)" onClick={() => onExport(project)}>
              <Download size={15} /> Export Stems
            </button>
          )}
          {onDelete && (
            <button className="secondary-btn icon-btn danger-hover" title="Delete Stem Project" onClick={() => onDelete(project)}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="stem-loading-overlay">
          <div className="stem-spinner" />
          <div className="stem-loading-text">Decoding audio stems into Web Audio buffers ({loadingProgress}%)...</div>
        </div>
      )}

      {/* Preset Filter Bar */}
      <div className="stem-presets-bar">
        <span className="presets-label"><Sliders size={13} /> Mix Presets:</span>
        <button className={`preset-pill ${activePreset === "all" ? "active" : ""}`} onClick={() => applyPreset("all")}>
          All Stems
        </button>
        <button className={`preset-pill ${activePreset === "karaoke" ? "active" : ""}`} onClick={() => applyPreset("karaoke")}>
          Karaoke (No Vocals)
        </button>
        <button className={`preset-pill ${activePreset === "acapella" ? "active" : ""}`} onClick={() => applyPreset("acapella")}>
          Acapella (Vocals Solo)
        </button>
        <button className={`preset-pill ${activePreset === "rhythm" ? "active" : ""}`} onClick={() => applyPreset("rhythm")}>
          Rhythm Section (Drums + Bass)
        </button>
        <button className={`preset-pill ${activePreset === "instrumental" ? "active" : ""}`} onClick={() => applyPreset("instrumental")}>
          Instrumental
        </button>
      </div>

      {/* Multi-Track Lanes */}
      <div className="stem-lanes-container" ref={waveformContainerRef}>
        {(["vocals", "drums", "bass", "other"] as StemId[]).map((id) => {
          const track = tracks[id];
          const cfg = STEM_CONFIGS[id];
          const hasAnySolo = Object.values(tracks).some((t) => t.solo);
          const isDimmed = (hasAnySolo && !track.solo) || track.muted;

          return (
            <div key={id} className={`stem-lane ${isDimmed ? "dimmed" : ""}`} style={{ borderColor: `${cfg.color}33` }}>
              {/* Lane Controls (Left Strip) */}
              <div className="stem-track-controls">
                <div className="stem-track-badge" style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}>
                  {cfg.icon}
                  <span className="badge-name">{cfg.label}</span>
                </div>

                <div className="stem-track-buttons">
                  <button
                    className={`stem-btn mute-btn ${track.muted ? "active" : ""}`}
                    onClick={() => toggleMute(id)}
                    title={track.muted ? "Unmute Track (M)" : "Mute Track (M)"}
                  >
                    M
                  </button>
                  <button
                    className={`stem-btn solo-btn ${track.solo ? "active" : ""}`}
                    onClick={() => toggleSolo(id)}
                    title={track.solo ? "Unsolo Track (S)" : "Solo Track (S)"}
                  >
                    S
                  </button>
                </div>

                {/* Tactical Faders */}
                <div className="stem-fader-group">
                  <div className="fader-row">
                    <span className="fader-label">VOL</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={track.volume}
                      onChange={(e) => handleVolumeChange(id, parseFloat(e.target.value))}
                      className="stem-slider"
                      style={{ accentColor: cfg.color }}
                    />
                    <span className="fader-val">{Math.round(track.volume * 100)}%</span>
                  </div>

                  <div className="fader-row">
                    <span className="fader-label">PAN</span>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={track.pan}
                      onChange={(e) => handlePanChange(id, parseFloat(e.target.value))}
                      className="stem-slider pan-slider"
                    />
                    <span className="fader-val">
                      {track.pan === 0 ? "C" : track.pan < 0 ? `L${Math.abs(Math.round(track.pan * 100))}` : `R${Math.round(track.pan * 100)}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Lane Waveform Visualizer (Right Body) */}
              <div className="stem-waveform-lane" onClick={handleWaveformClick} title="Click to seek">
                {/* Playhead line across lane */}
                <div className="stem-playhead" style={{ left: `${playheadPercent}%` }} />

                <div className="stem-bars-row">
                  {track.waveform.map((peak, idx) => {
                    const isPassed = duration > 0 && idx / track.waveform.length <= currentTime / duration;
                    const barHeight = Math.max(12, Math.round(peak * 54));

                    return (
                      <div
                        key={idx}
                        className={`waveform-bar ${isPassed ? "passed" : ""}`}
                        style={{
                          height: `${barHeight}px`,
                          backgroundColor: isPassed ? cfg.color : `${cfg.color}44`,
                          boxShadow: isPassed && isPlaying ? `0 0 6px ${cfg.color}99` : "none"
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Master Transport Bar */}
      <div className="stem-transport-bar">
        <div className="transport-controls">
          <button className="transport-btn icon-btn" onClick={() => handleSeek(0)} title="Return to Start">
            <RotateCcw size={16} />
          </button>
          <button className="transport-btn play-btn" onClick={togglePlay} title="Play / Pause (Space)">
            {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: "2px" }} />}
          </button>
        </div>

        <div className="transport-time-display">
          <span className="time-current">{formatTime(currentTime)}</span>
          <span className="time-sep">/</span>
          <span className="time-total">{formatTime(duration)}</span>
        </div>

        {/* Master Scrub Bar */}
        <div className="transport-scrub-track" onClick={handleWaveformClick}>
          <div className="transport-scrub-fill" style={{ width: `${playheadPercent}%` }} />
          <div className="transport-scrub-thumb" style={{ left: `${playheadPercent}%` }} />
        </div>

        {/* Master Volume */}
        <div className="transport-master-vol">
          <Volume2 size={16} color="#94a3b8" />
          <input
            type="range"
            min="0"
            max="1.2"
            step="0.02"
            value={masterVolume}
            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
            className="master-volume-slider"
            title={`Master Volume: ${Math.round(masterVolume * 100)}%`}
          />
        </div>
      </div>
    </div>
  );
};
