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
  private ctx: AudioContext | null = null;
  private buffers: Partial<Record<StemId, AudioBuffer>> = {};
  private sourceNodes: Partial<Record<StemId, AudioBufferSourceNode>> = {};
  private gainNodes: Partial<Record<StemId, GainNode>> = {};
  private pannerNodes: Partial<Record<StemId, StereoPannerNode>> = {};
  private masterGain: GainNode | null = null;

  private isPlaying = false;
  private duration = 0;
  private playbackRate = 1.0;
  private startTime = 0;
  private pauseOffset = 0;
  private animFrameId: number | null = null;

  private onTimeUpdateCallback: ((time: number) => void) | null = null;
  private onStateChangeCallback: ((playing: boolean) => void) | null = null;

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  private initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.95;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public async loadStemBuffer(stemId: StemId, base64DataUrl: string): Promise<AudioBuffer> {
    const ctx = this.initContext();
    const base64 = base64DataUrl.split(",")[1] || base64DataUrl;
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const decoded = await ctx.decodeAudioData(bytes.buffer);
    this.buffers[stemId] = decoded;
    if (decoded.duration > this.duration) {
      this.duration = decoded.duration;
    }
    return decoded;
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
    const ctx = this.initContext();
    if (this.isPlaying) return;

    if (typeof offsetSeconds === "number") {
      this.pauseOffset = Math.max(0, Math.min(offsetSeconds, this.duration));
    }

    this.stopSources();

    const stemKeys = Object.keys(this.buffers) as StemId[];
    if (stemKeys.length === 0) return;

    this.startTime = ctx.currentTime - this.pauseOffset;

    for (const id of stemKeys) {
      const buffer = this.buffers[id];
      if (!buffer) continue;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = this.playbackRate;

      let gainNode = this.gainNodes[id];
      let panNode = this.pannerNodes[id];

      if (!gainNode || !panNode) {
        gainNode = ctx.createGain();
        panNode = ctx.createStereoPanner();
        gainNode.connect(panNode);
        panNode.connect(this.masterGain!);
        this.gainNodes[id] = gainNode;
        this.pannerNodes[id] = panNode;
      }

      source.connect(gainNode);
      source.start(0, this.pauseOffset);
      this.sourceNodes[id] = source;
    }

    this.isPlaying = true;
    this.onStateChangeCallback?.(true);
    this.startTracking();
  }

  public pause(): void {
    if (!this.isPlaying) return;
    const ctx = this.initContext();
    this.pauseOffset = Math.min(this.duration, ctx.currentTime - this.startTime);
    this.stopSources();
    this.isPlaying = false;
    this.stopTracking();
    this.onStateChangeCallback?.(false);
  }

  public seek(targetSeconds: number): void {
    const clamped = Math.max(0, Math.min(targetSeconds, this.duration));
    this.pauseOffset = clamped;
    this.onTimeUpdateCallback?.(clamped);

    if (this.isPlaying) {
      this.stopSources();
      this.isPlaying = false;
      this.play(clamped);
    }
  }

  public updateTrackMix(tracks: Record<StemId, { volume: number; pan: number; muted: boolean; solo: boolean }>): void {
    const hasAnySolo = Object.values(tracks).some((t) => t.solo);

    for (const [idStr, state] of Object.entries(tracks)) {
      const id = idStr as StemId;
      const gainNode = this.gainNodes[id];
      const panNode = this.pannerNodes[id];

      if (gainNode) {
        let targetGain = state.volume;
        if (state.muted) {
          targetGain = 0;
        } else if (hasAnySolo) {
          targetGain = state.solo ? state.volume : 0;
        }
        gainNode.gain.setTargetAtTime(targetGain, this.ctx?.currentTime || 0, 0.015);
      }

      if (panNode) {
        panNode.pan.setTargetAtTime(state.pan, this.ctx?.currentTime || 0, 0.015);
      }
    }
  }

  public setMasterVolume(val: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1.2, val)), this.ctx.currentTime, 0.015);
    }
  }

  private stopSources(): void {
    for (const id of Object.keys(this.sourceNodes) as StemId[]) {
      try {
        this.sourceNodes[id]?.stop();
        this.sourceNodes[id]?.disconnect();
      } catch {}
      delete this.sourceNodes[id];
    }
  }

  private startTracking(): void {
    this.stopTracking();
    const update = () => {
      if (!this.isPlaying || !this.ctx) return;
      const current = this.ctx.currentTime - this.startTime;
      if (current >= this.duration) {
        this.seek(0);
        this.pause();
        return;
      }
      this.onTimeUpdateCallback?.(current);
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
    this.stopSources();
    this.buffers = {};
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
