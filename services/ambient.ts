import { StorageService } from './storage';

export class AmbientServiceClass {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array = new Uint8Array(0);
  private musicTrack: HTMLAudioElement | null = null;
  private trackSource: MediaElementAudioSourceNode | null = null;
  private isFading = false;
  public isPlaying = false;

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64; // Low res for perf, we just want general bass/pulse
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
  }

  getFrequencyData(): Uint8Array {
    if (this.analyser && this.isPlaying) {
      this.analyser.getByteFrequencyData(this.dataArray as any);
    }
    return this.dataArray;
  }

  async syncToSession(startTime: number) {
    if (this.isPlaying) return;
    this.init();

    let musicSrc = await StorageService.getTogetherMusic();
    if (!musicSrc) return;

    this.isPlaying = true;
    this.musicTrack = new Audio(musicSrc);
    this.musicTrack.crossOrigin = "anonymous";
    this.musicTrack.loop = true;
    this.musicTrack.volume = 0; // Start muted for fade-in

    // Calculate the exact seek position
    this.musicTrack.onloadedmetadata = () => {
      if (!this.musicTrack) return;
      const now = Date.now();
      const elapsedMs = now - startTime;
      const elapsedSec = (elapsedMs / 1000) % this.musicTrack.duration;

      this.musicTrack.currentTime = elapsedSec;

      // Connect to Web Audio API for analysis IF not already connected
      if (this.ctx && this.masterGain && !this.trackSource) {
        try {
          this.trackSource = this.ctx.createMediaElementSource(this.musicTrack);
          this.trackSource.connect(this.masterGain);
        } catch (e) {
          console.warn("Could not connect audio to AnalyserNode", e);
        }
      }

      this.musicTrack.play().then(() => {
        this.fade(0.6, 2000); // Smooth fade in
      }).catch(e => console.error("Playback blocked", e));
    };
  }

  private fade(target: number, duration: number) {
    if (!this.musicTrack || this.isFading) return;
    this.isFading = true;

    const startVol = this.musicTrack.volume;
    const steps = 20;
    const stepTime = duration / steps;
    const volStep = (target - startVol) / steps;

    let currentStep = 0;
    const interval = setInterval(() => {
      if (!this.musicTrack) {
        clearInterval(interval);
        return;
      }
      this.musicTrack.volume = Math.max(0, Math.min(1, this.musicTrack.volume + volStep));
      currentStep++;
      if (currentStep >= steps) {
        clearInterval(interval);
        this.isFading = false;
      }
    }, stepTime);
  }

  stop() {
    if (!this.isPlaying) return;
    this.fade(0, 1000);
    setTimeout(() => {
      if (this.musicTrack) {
        this.musicTrack.pause();
        this.musicTrack = null;
      }
      if (this.trackSource) {
        this.trackSource.disconnect();
        this.trackSource = null;
      }
      this.isPlaying = false;
    }, 1100);
  }
}

export const AmbientService = new AmbientServiceClass();