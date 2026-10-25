export type StemId = "vocals" | "drums" | "bass" | "other";

export interface StemTrackState {
  id: StemId;
  label: string;
  color: string;
  volume: number; // 0.0 to 1.0
  pan: number;    // -1.0 to 1.0
  muted: boolean;
  solo: boolean;
  waveform: number[];
}

export type PresetType = "all" | "karaoke" | "acapella" | "rhythm" | "instrumental";

export class MultiTrackStemEngine {
  private audioElements: Partial<Record<StemId, HTMLAudioElement>> = {};
  private isPlaying = false;
  private duration = 0;
  private animFrameId: number | null = null;
  private masterVolume = 0.9;
  private currentTracks: Record<StemId, { volume: number; pan: number; muted: boolean; solo: boolean }> | null = null;

  private onTimeUpdateCallback: ((time: number) => void) | null = null;
  private onStateChangeCallback: ((playing: boolean) => void) | null = null;

  public async loadStem(stemId: StemId, mediaUrl: string): Promise<void> {
    return new Promise((resolve) => {
      let audio = this.audioElements[stemId];
      if (!audio) {
        audio = new Audio();
        audio.preload = "auto";
        this.audioElements[stemId] = audio;
      }

      const onLoaded = () => {
        if (audio.duration && isFinite(audio.duration) && audio.duration > this.duration) {
          this.duration = audio.duration;
        }
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        resolve(); // Don't block whole project if single stem fails
      };

      const cleanup = () => {
        audio.removeEventListener("loadedmetadata", onLoaded);
        audio.removeEventListener("canplaythrough", onLoaded);
        audio.removeEventListener("error", onError);
      };

      audio.addEventListener("loadedmetadata", onLoaded);
      audio.addEventListener("canplaythrough", onLoaded);
      audio.addEventListener("error", onError);

      audio.src = mediaUrl;
      audio.load();

      // Quick timeout fallback so UI never hangs
      setTimeout(() => {
        cleanup();
        resolve();
      }, 2000);
    });
  }

  // Backwards compatibility fallback for small audio buffers
  public async loadStemBuffer(stemId: StemId, base64DataUrl: string): Promise<void> {
    await this.loadStem(stemId, base64DataUrl);
  }

  public getDuration(): number {
    return this.duration;
  }

  public setOnTimeUpdate(cb: (time: number) => void): void {
    this.onTimeUpdateCallback = cb;
  }

  public setOnStateChange(cb: (playing: boolean) => void): void {
    this.onStateChangeCallback = cb;
  }

  public play(offsetSeconds?: number): void {
    if (this.isPlaying) return;
    const stemKeys = Object.keys(this.audioElements) as StemId[];
    if (stemKeys.length === 0) return;

    if (typeof offsetSeconds === "number") {
      this.seek(offsetSeconds);
    }

    if (this.currentTracks) {
      this.updateTrackMix(this.currentTracks);
    }

    for (const id of stemKeys) {
      const el = this.audioElements[id];
      if (el) {
        void el.play().catch(() => {});
      }
    }

    this.isPlaying = true;
    this.onStateChangeCallback?.(true);
    this.startTracking();
  }

  public pause(): void {
    if (!this.isPlaying) return;
    for (const el of Object.values(this.audioElements)) {
      el?.pause();
    }
    this.isPlaying = false;
    this.stopTracking();
    this.onStateChangeCallback?.(false);
  }

  public seek(targetSeconds: number): void {
    const clamped = Math.max(0, Math.min(targetSeconds, this.duration || targetSeconds));
    for (const el of Object.values(this.audioElements)) {
      if (el) {
        try {
          el.currentTime = clamped;
        } catch {}
      }
    }
    this.onTimeUpdateCallback?.(clamped);
  }

  public updateTrackMix(tracks: Record<StemId, { volume: number; pan: number; muted: boolean; solo: boolean }>): void {
    this.currentTracks = tracks;
    const hasAnySolo = Object.values(tracks).some((t) => t.solo);

    for (const [idStr, state] of Object.entries(tracks)) {
      const id = idStr as StemId;
      const el = this.audioElements[id];
      if (!el) continue;

      let targetGain = state.volume;
      if (state.muted) {
        targetGain = 0;
      } else if (hasAnySolo) {
        targetGain = state.solo ? state.volume : 0;
      }
      el.volume = Math.max(0, Math.min(1, targetGain * this.masterVolume));
    }
  }

  public setMasterVolume(val: number): void {
    this.masterVolume = Math.max(0, Math.min(1.2, val));
    if (this.currentTracks) {
      this.updateTrackMix(this.currentTracks);
    }
  }

  private startTracking(): void {
    this.stopTracking();
    const update = () => {
      if (!this.isPlaying) return;
      const active = Object.values(this.audioElements).find((el) => el && !el.paused);
      if (active) {
        const current = active.currentTime;
        if (this.duration > 0 && current >= this.duration) {
          this.seek(0);
          this.pause();
          return;
        }
        // Keep all playing stems locked in sync (<60ms drift correction)
        for (const el of Object.values(this.audioElements)) {
          if (el && !el.paused && Math.abs(el.currentTime - current) > 0.06) {
            el.currentTime = current;
          }
        }
        this.onTimeUpdateCallback?.(current);
      }
      this.animFrameId = requestAnimationFrame(update);
    };
    this.animFrameId = requestAnimationFrame(update);
  }

  private stopTracking(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public dispose(): void {
    this.pause();
    this.stopTracking();
    for (const el of Object.values(this.audioElements)) {
      if (el) {
        el.pause();
        el.src = "";
        el.load();
      }
    }
    this.audioElements = {};
  }
}
