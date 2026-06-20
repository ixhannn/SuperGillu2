// Quiet Mode — Generative Soundscape Engine
// ─────────────────────────────────────────────────────────────────────────────
// A self-contained Web Audio engine that synthesizes endless, never-looping
// ambient beds entirely in code (no audio assets to ship or buffer). Every scene
// is built from oscillators + shaped noise, run through a shared convolution
// reverb so the space feels wide and warm rather than dry and synthetic.
//
// Design goals:
//   • Gapless + endless — no sample loops audible, gentle randomness everywhere.
//   • Crossfade between scenes (no hard cut) so switching feels like the room
//     slowly changing, not a track skipping.
//   • One master limiter so nothing ever clips, regardless of scene stacking.
//   • Obeys the browser autoplay policy — start() resumes the context and the
//     caller can re-resume on the first user gesture.
//
// Everything runs outside React's render cycle for performance and stability.

export type Soundscape = 'off' | 'love' | 'rain' | 'ocean' | 'embrace' | 'wind';

export interface SceneMeta {
  id: Soundscape;
  label: string;
  /** lucide icon name resolved by the view; kept here so scene order lives in one place. */
  icon: 'heart' | 'cloud-rain' | 'waves' | 'activity' | 'wind' | 'volume-x';
  blurb: string;
}

/** Curated, ordered scene list — the single source of truth for the picker UI. */
export const SCENES: SceneMeta[] = [
  { id: 'love',    label: 'Love',    icon: 'heart',     blurb: 'A warm major chord that breathes' },
  { id: 'embrace', label: 'Embrace', icon: 'activity',  blurb: 'A slow heartbeat over a low pad' },
  { id: 'rain',    label: 'Rain',    icon: 'cloud-rain', blurb: 'Soft rain on a quiet window' },
  { id: 'ocean',   label: 'Ocean',   icon: 'waves',     blurb: 'Waves drawing slowly in and out' },
  { id: 'wind',    label: 'Wind',    icon: 'wind',      blurb: 'Muffled wind, cozy and far away' },
  { id: 'off',     label: 'Silence', icon: 'volume-x',  blurb: 'Just the quiet' },
];

// ─── Tuning constants ────────────────────────────────────────────────────────
const MASTER_VOLUME    = 0.6;   // 0..1 baseline before user volume
const FADE_IN_SEC      = 3.0;   // new scene swelling in
const FADE_OUT_SEC     = 2.2;   // old scene receding
const REVERB_SECONDS   = 3.2;   // impulse length — a large, soft room
const REVERB_RETURN    = 0.32;  // wet level into master

// A warm, open Cmaj9 voicing — the "warm hug" chord (C3 G3 B3 D4 E4).
const LOVE_CHORD = [130.81, 196.0, 246.94, 293.66, 329.63];
// High pentatonic twinkles that sparkle over the pad (C5 D5 E5 G5 A5).
const TWINKLE_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0];

type Cleanup = () => void;

interface ActiveScene {
  gain: GainNode;
  cleanup: Cleanup;
}

export class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private userVolume = 1; // 0..1, user-controlled multiplier

  private active: ActiveScene[] = [];
  private current: Soundscape = 'off';
  private timers = new Set<ReturnType<typeof setTimeout>>();

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  private ensureContext(): boolean {
    if (this.ctx) return true;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    try {
      this.ctx = new Ctor();
    } catch {
      return false;
    }

    const master = this.ctx.createGain();
    master.gain.value = MASTER_VOLUME * this.userVolume;

    // Master limiter so stacked voices never clip.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;

    master.connect(limiter);
    limiter.connect(this.ctx.destination);

    // Shared convolution reverb.
    const convolver = this.ctx.createConvolver();
    convolver.buffer = this.buildImpulse(REVERB_SECONDS);
    const reverbReturn = this.ctx.createGain();
    reverbReturn.gain.value = REVERB_RETURN;
    const reverbSend = this.ctx.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(convolver);
    convolver.connect(reverbReturn);
    reverbReturn.connect(master);

    this.master = master;
    this.reverbSend = reverbSend;
    return true;
  }

  /** Resume the audio context (must be called from a user gesture on first run). */
  async resume(): Promise<void> {
    if (!this.ensureContext() || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
  }

  isSuspended(): boolean {
    return !this.ctx || this.ctx.state === 'suspended';
  }

  /** Silence the engine without tearing it down (e.g. when the tab is hidden). */
  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      try { await this.ctx.suspend(); } catch { /* ignore */ }
    }
  }

  get scene(): Soundscape {
    return this.current;
  }

  /** Crossfade to a scene. Calling with the current scene is a no-op. */
  setScene(scene: Soundscape): void {
    if (!this.ensureContext() || !this.ctx) return;
    if (scene === this.current && this.active.length > 0) return;
    this.current = scene;

    // Fade out everything currently playing, then clean it up.
    const now = this.ctx.currentTime;
    const leaving = this.active;
    this.active = [];
    leaving.forEach(({ gain, cleanup }) => {
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0.0001, now + FADE_OUT_SEC);
      } catch { /* ignore */ }
      const t = setTimeout(() => {
        cleanup();
        this.timers.delete(t);
      }, FADE_OUT_SEC * 1000 + 60);
      this.timers.add(t);
    });

    if (scene === 'off') return;

    // Build the new scene at zero gain and swell it in.
    const sceneGain = this.ctx.createGain();
    sceneGain.gain.value = 0.0001;
    sceneGain.connect(this.master!);
    sceneGain.connect(this.reverbSend!);

    const cleanup = this.buildScene(scene, sceneGain);
    sceneGain.gain.cancelScheduledValues(now);
    sceneGain.gain.setValueAtTime(0.0001, now);
    sceneGain.gain.linearRampToValueAtTime(1, now + FADE_IN_SEC);

    this.active.push({
      gain: sceneGain,
      cleanup: () => {
        cleanup();
        try { sceneGain.disconnect(); } catch { /* ignore */ }
      },
    });
  }

  /** 0..1 user volume on top of the engine baseline. */
  setVolume(v: number): void {
    this.userVolume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(MASTER_VOLUME * this.userVolume, this.ctx.currentTime, 0.3);
    }
  }

  dispose(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.active.forEach(({ cleanup }) => cleanup());
    this.active = [];
    this.current = 'off';
    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      this.master = null;
      this.reverbSend = null;
      try { ctx.close(); } catch { /* ignore */ }
    }
  }

  // ── Scene routing ────────────────────────────────────────────────────────────

  private buildScene(scene: Soundscape, out: GainNode): Cleanup {
    switch (scene) {
      case 'love':    return this.buildLove(out);
      case 'rain':    return this.buildRain(out);
      case 'ocean':   return this.buildOcean(out);
      case 'embrace': return this.buildEmbrace(out);
      case 'wind':    return this.buildWind(out);
      default:        return () => {};
    }
  }

  // ── Shared building blocks ────────────────────────────────────────────────────

  private buildImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buffer = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        // Exponentially-decaying noise → a soft, diffuse tail.
        const decay = Math.pow(1 - i / len, 2.4);
        data[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    return buffer;
  }

  private noiseBuffer(seconds: number, brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (brown) {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    } else {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /** Connect an LFO (osc→gain) to an AudioParam; returns the two nodes for cleanup. */
  private lfo(param: AudioParam, freq: number, depth: number, type: OscillatorType = 'sine'): AudioNode[] {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    osc.connect(g);
    g.connect(param);
    osc.start();
    return [osc, g];
  }

  /** Schedule a recurring event with randomized spacing; auto-tracks for cleanup. */
  private schedule(minMs: number, maxMs: number, fn: () => void, stoppedRef: { stopped: boolean }): void {
    const next = () => {
      if (stoppedRef.stopped) return;
      const t = setTimeout(() => {
        this.timers.delete(t);
        if (stoppedRef.stopped) return;
        fn();
        next();
      }, minMs + Math.random() * (maxMs - minMs));
      this.timers.add(t);
    };
    next();
  }

  // ── Scenes ────────────────────────────────────────────────────────────────────

  private buildLove(out: GainNode): Cleanup {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const stoppedRef = { stopped: false };

    LOVE_CHORD.forEach((f) => {
      for (let j = 0; j < 2; j++) {
        const osc = ctx.createOscillator();
        osc.type = j === 0 ? 'sine' : 'triangle';
        osc.frequency.value = f;
        osc.detune.value = Math.random() * 8 - 4;

        const pan = ctx.createStereoPanner();
        pan.pan.value = Math.random() * 1.4 - 0.7;

        const g = ctx.createGain();
        g.gain.value = 0.035 + Math.random() * 0.02;

        osc.connect(pan); pan.connect(g); g.connect(out);
        osc.start();

        // Gentle "breathing" swell on each voice.
        nodes.push(...this.lfo(g.gain, 0.05 + Math.random() * 0.05, 0.012));
        nodes.push(osc, pan, g);
      }
    });

    // Sparse high twinkles, panned and reverberant.
    this.schedule(2600, 6200, () => {
      const f = TWINKLE_NOTES[(Math.random() * TWINKLE_NOTES.length) | 0];
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * (Math.random() < 0.3 ? 2 : 1);
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      const g = ctx.createGain();
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
      osc.connect(pan); pan.connect(g); g.connect(out);
      osc.start(t0); osc.stop(t0 + 2.8);
    }, stoppedRef);

    return () => {
      stoppedRef.stopped = true;
      nodes.forEach((n) => { try { (n as OscillatorNode).stop?.(); } catch { /* ignore */ } try { n.disconnect(); } catch { /* ignore */ } });
    };
  }

  private buildRain(out: GainNode): Cleanup {
    const ctx = this.ctx!;
    const stoppedRef = { stopped: false };

    // Rain hiss — white noise through a gentle bandpass.
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noiseBuffer(3, false);
    hiss.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.5;
    const hissGain = ctx.createGain(); hissGain.gain.value = 0.09;
    hiss.connect(bp); bp.connect(hissGain); hissGain.connect(out);
    hiss.start();

    // Low rumble bed — brown noise.
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noiseBuffer(3, true);
    rumble.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 220;
    const rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0.05;
    rumble.connect(lp); lp.connect(rumbleGain); rumbleGain.connect(out);
    rumble.start();

    const lfoNodes = this.lfo(bp.frequency, 0.08, 320); // slow shimmer in the rain

    // Occasional droplets.
    this.schedule(900, 3200, () => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const t0 = ctx.currentTime;
      osc.frequency.setValueAtTime(900 + Math.random() * 700, t0);
      osc.frequency.exponentialRampToValueAtTime(380, t0 + 0.12);
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      osc.connect(pan); pan.connect(g); g.connect(out);
      osc.start(t0); osc.stop(t0 + 0.45);
    }, stoppedRef);

    return () => {
      stoppedRef.stopped = true;
      [hiss, rumble, ...lfoNodes].forEach((n) => { try { (n as OscillatorNode).stop?.(); } catch { /* ignore */ } try { n.disconnect(); } catch { /* ignore */ } });
      [bp, lp, hissGain, rumbleGain].forEach((n) => { try { n.disconnect(); } catch { /* ignore */ } });
    };
  }

  private buildOcean(out: GainNode): Cleanup {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 450;
    const swell = ctx.createGain(); swell.gain.value = 0.12;
    src.connect(lp); lp.connect(swell); swell.connect(out);
    src.start();

    // Waves: a very slow swell on volume, plus the filter opening as each wave crests.
    const swellLfo = this.lfo(swell.gain, 0.09, 0.08);   // ~11s wave period
    const filterLfo = this.lfo(lp.frequency, 0.09, 260);

    return () => {
      [src, ...swellLfo, ...filterLfo].forEach((n) => { try { (n as OscillatorNode).stop?.(); } catch { /* ignore */ } try { n.disconnect(); } catch { /* ignore */ } });
      try { lp.disconnect(); } catch { /* ignore */ } try { swell.disconnect(); } catch { /* ignore */ }
    };
  }

  private buildEmbrace(out: GainNode): Cleanup {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const stoppedRef = { stopped: false };

    // Low warm pad (G2 + D3).
    [98.0, 146.83].forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.06;
      osc.connect(g); g.connect(out); osc.start();
      nodes.push(...this.lfo(g.gain, 0.06, 0.02));
      nodes.push(osc, g);
    });

    // Heartbeat — a "lub-dub" every ~1.05s (≈57bpm, a calm resting rate).
    const thump = (delay: number, vol: number) => {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(70, t0);
      osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 160;
      osc.connect(lp); lp.connect(g); g.connect(out);
      osc.start(t0); osc.stop(t0 + 0.32);
    };
    this.schedule(1050, 1050, () => { thump(0, 0.16); thump(0.22, 0.1); }, stoppedRef);

    return () => {
      stoppedRef.stopped = true;
      nodes.forEach((n) => { try { (n as OscillatorNode).stop?.(); } catch { /* ignore */ } try { n.disconnect(); } catch { /* ignore */ } });
    };
  }

  private buildWind(out: GainNode): Cleanup {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3, true);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    const gust = ctx.createGain(); gust.gain.value = 0.1;
    src.connect(lp); lp.connect(gust); gust.connect(out);
    src.start();

    // Gusts: filter and volume drift slowly and irregularly.
    const filterLfo = this.lfo(lp.frequency, 0.07, 180);
    const gustLfo = this.lfo(gust.gain, 0.05, 0.05);

    return () => {
      [src, ...filterLfo, ...gustLfo].forEach((n) => { try { (n as OscillatorNode).stop?.(); } catch { /* ignore */ } try { n.disconnect(); } catch { /* ignore */ } });
      try { lp.disconnect(); } catch { /* ignore */ } try { gust.disconnect(); } catch { /* ignore */ }
    };
  }
}
