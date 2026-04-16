import { StorageService } from './storage';

// Volume levels
const VOL_SOLO    = 0.3;   // playing alone / partner offline
const VOL_SESSION = 0.6;   // both partners online, synced

export class AmbientServiceClass {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array = new Uint8Array(0);
  private musicTrack: HTMLAudioElement | null = null;
  private trackSource: MediaElementAudioSourceNode | null = null;
  private isFading = false;
  public isPlaying = false;

  // ── Web Audio graph ───────────────────────────────────────────

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  getFrequencyData(): Uint8Array {
    if (this.analyser && this.isPlaying) {
      this.analyser.getByteFrequencyData(this.dataArray as any);
    }
    return this.dataArray;
  }

  // ── Private helpers ───────────────────────────────────────────

  private fade(target: number, duration: number) {
    if (!this.musicTrack) return;
    // Cancel any in-progress fade
    this.isFading = false;
    this.isFading = true;

    const startVol = this.musicTrack.volume;
    const steps = 24;
    const stepTime = duration / steps;
    const volStep = (target - startVol) / steps;
    let step = 0;

    const interval = setInterval(() => {
      if (!this.musicTrack) { clearInterval(interval); return; }
      this.musicTrack.volume = Math.max(0, Math.min(1, this.musicTrack.volume + volStep));
      if (++step >= steps) { clearInterval(interval); this.isFading = false; }
    }, stepTime);
  }

  private connectTrackToGraph() {
    if (!this.ctx || !this.masterGain || !this.musicTrack || this.trackSource) return;
    try {
      this.trackSource = this.ctx.createMediaElementSource(this.musicTrack);
      this.trackSource.connect(this.masterGain);
    } catch {
      // Silently ignore — analyser won't work but playback will
    }
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Start ambient solo playback (no partner required).
   * Call this after the user's first interaction so autoplay is allowed.
   */
  async startSolo() {
    if (this.isPlaying) return;

    const musicSrc = await StorageService.getTogetherMusic();
    if (!musicSrc) return;

    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});

    this.isPlaying = true;
    this.musicTrack = new Audio(musicSrc);
    this.musicTrack.crossOrigin = 'anonymous';
    this.musicTrack.loop = true;
    this.musicTrack.volume = 0;

    this.musicTrack.addEventListener('canplay', () => {
      this.connectTrackToGraph();
      this.musicTrack?.play()
        .then(() => this.fade(VOL_SOLO, 2500))
        .catch(() => { this.isPlaying = false; });
    }, { once: true });

    this.musicTrack.addEventListener('error', () => {
      this.isPlaying = false;
      this.musicTrack = null;
    }, { once: true });
  }

  /**
   * Sync playback to a shared session (called when both partners are online).
   * If already playing solo, seek to the correct position and boost volume.
   */
  async syncToSession(startTime: number) {
    if (this.isPlaying && this.musicTrack) {
      // Already playing — just resync position and boost volume
      if (this.musicTrack.readyState >= HTMLMediaElement.HAVE_METADATA && this.musicTrack.duration) {
        const elapsed = Math.max(0, (Date.now() - startTime) / 1000);
        this.musicTrack.currentTime = elapsed % this.musicTrack.duration;
      }
      this.fade(VOL_SESSION, 1200);
      return;
    }

    // Cold start
    const musicSrc = await StorageService.getTogetherMusic();
    if (!musicSrc) return;

    this.init();
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});

    this.isPlaying = true;
    this.musicTrack = new Audio(musicSrc);
    this.musicTrack.crossOrigin = 'anonymous';
    this.musicTrack.loop = true;
    this.musicTrack.volume = 0;

    this.musicTrack.onloadedmetadata = () => {
      if (!this.musicTrack) return;
      const elapsed = Math.max(0, (Date.now() - startTime) / 1000);
      this.musicTrack.currentTime = elapsed % this.musicTrack.duration;
      this.connectTrackToGraph();
      this.musicTrack.play()
        .then(() => this.fade(VOL_SESSION, 2000))
        .catch(() => { this.isPlaying = false; });
    };
  }

  /**
   * Partner went offline — don't stop, just fade back to solo volume.
   */
  downgradeToSolo() {
    if (!this.isPlaying || !this.musicTrack) return;
    this.fade(VOL_SOLO, 1800);
  }

  /**
   * Fully stop playback (e.g. user removes their song or navigates away).
   */
  stop() {
    if (!this.isPlaying) return;
    this.fade(0, 900);
    setTimeout(() => {
      this.musicTrack?.pause();
      this.musicTrack = null;
      if (this.trackSource) {
        this.trackSource.disconnect();
        this.trackSource = null;
      }
      this.isPlaying = false;
    }, 1000);
  }
}

export const AmbientService = new AmbientServiceClass();
