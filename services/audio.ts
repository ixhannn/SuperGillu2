/**
 * Audio Service — Lior
 *
 * Procedural Web Audio API sound engine — zero asset files.
 * All sounds synthesized in real-time from oscillators, filters, and envelopes.
 *
 * Design philosophy:
 *   - Every sound has a physical analogue (glass, wood, air, water)
 *   - Pairs with haptics so touch + sound reinforce each other
 *   - Sub-40ms latency via pre-warmed AudioContext
 *   - Respectful of system mute / silent mode via volume scaling
 */

type SoundName =
  | 'tap'
  | 'press'
  | 'confirm'
  | 'select'
  | 'toggleOn'
  | 'toggleOff'
  | 'swipe'
  | 'error'
  | 'heartbeat'
  | 'celebrate'
  | 'notification'
  | 'navSwitch'
  | 'modalOpen'
  | 'modalClose'
  | 'delete';

class AudioService {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.45; // Not too loud — feels ambient, not jarring
  private masterGain: GainNode | null = null;
  private unlocked = false;

  loadPrefs() {
    const saved = localStorage.getItem('lior_audio');
    if (saved !== null) this.enabled = saved === '1';
    const vol = localStorage.getItem('lior_audio_volume');
    if (vol !== null) this.volume = Math.min(1, Math.max(0, parseFloat(vol)));
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    localStorage.setItem('lior_audio', value ? '1' : '0');
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(value ? this.volume : 0, this.getCtx()!.currentTime, 0.05);
    }
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    localStorage.setItem('lior_audio_volume', String(this.volume));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.getCtx()!.currentTime, 0.05);
    }
  }

  isEnabled() { return this.enabled; }
  getVolume() { return this.volume; }

  /** Must be called from a user gesture to unlock AudioContext on iOS/Android */
  unlock() {
    if (this.unlocked) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    // Play silent buffer to unlock
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    this.unlocked = true;
  }

  private getCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    // Resume if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getMaster(): GainNode | null {
    this.getCtx();
    return this.masterGain;
  }

  // ─── Sound Primitives ────────────────────────────────────────────────────────

  /**
   * Quick percussive click — like pressing a high-quality physical key.
   * Uses filtered noise burst + sine transient layered together.
   */
  private clickTone(
    freq = 1200,
    duration = 0.04,
    gainPeak = 0.5,
    filterFreq = 3000,
    filterQ = 1.5,
  ) {
    const ctx = this.getCtx();
    const master = this.getMaster();
    if (!ctx || !master) return;

    const now = ctx.currentTime;

    // Sine transient
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + duration);
    osc.type = 'sine';
    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(gainPeak, now + 0.002);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(oscGain);
    oscGain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.01);

    // Noise burst for texture
    const bufLen = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = filterFreq;
    noiseFilter.Q.value = filterQ;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(gainPeak * 0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.6);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(now);
  }

  /**
   * Soft whoosh — air movement, used for swipes and transitions.
   */
  private whoosh(
    startFreq = 800,
    endFreq = 200,
    duration = 0.12,
    gainPeak = 0.18,
  ) {
    const ctx = this.getCtx();
    const master = this.getMaster();
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    const bufLen = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + duration * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start(now);
  }

  /**
   * Bell-like chime — glass resonance, used for confirm / success.
   */
  private chime(
    freq = 880,
    duration = 0.55,
    gainPeak = 0.35,
    harmonics = [1, 2.76, 5.4],
  ) {
    const ctx = this.getCtx();
    const master = this.getMaster();
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    harmonics.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = freq * ratio;
      osc.type = 'sine';
      const pk = gainPeak / (i + 1);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(pk, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration * (1 - i * 0.15));
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    });
  }

  /**
   * Thud — deep low impulse for important presses.
   */
  private thud(freq = 80, duration = 0.08, gainPeak = 0.6) {
    const ctx = this.getCtx();
    const master = this.getMaster();
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + duration);
    osc.type = 'sine';
    g.gain.setValueAtTime(gainPeak, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  // ─── Named Sounds ─────────────────────────────────────────────────────────

  play(sound: SoundName) {
    if (!this.enabled) return;
    switch (sound) {
      case 'tap':
        // Crisp glass tap — light and immediate
        this.clickTone(1800, 0.035, 0.38, 4000, 2);
        break;

      case 'press':
        // Solid button press — slightly deeper, has weight
        this.clickTone(900, 0.055, 0.42, 2200, 1.8);
        this.thud(120, 0.05, 0.25);
        break;

      case 'confirm':
        // Satisfying double-chime — action completed
        this.chime(1046, 0.45, 0.28, [1, 1.498]);
        break;

      case 'select':
        // Light selection pop — choosing something
        this.clickTone(1400, 0.028, 0.32, 3500, 2.5);
        this.chime(1320, 0.2, 0.12, [1]);
        break;

      case 'toggleOn': {
        // Switch snapping ON — ascending tick
        const ctx = this.getCtx();
        const master = this.getMaster();
        if (!ctx || !master) break;
        const now = ctx.currentTime;
        [0, 0.04].forEach((delay, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 900 + i * 400;
          o.type = 'sine';
          g.gain.setValueAtTime(0, now + delay);
          g.gain.linearRampToValueAtTime(0.3 - i * 0.05, now + delay + 0.003);
          g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.04);
          o.connect(g); g.connect(master);
          o.start(now + delay); o.stop(now + delay + 0.06);
        });
        break;
      }

      case 'toggleOff': {
        // Switch snapping OFF — descending tick
        const ctx = this.getCtx();
        const master = this.getMaster();
        if (!ctx || !master) break;
        const now = ctx.currentTime;
        [0, 0.04].forEach((delay, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 1300 - i * 400;
          o.type = 'sine';
          g.gain.setValueAtTime(0, now + delay);
          g.gain.linearRampToValueAtTime(0.28 - i * 0.04, now + delay + 0.003);
          g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.038);
          o.connect(g); g.connect(master);
          o.start(now + delay); o.stop(now + delay + 0.06);
        });
        break;
      }

      case 'swipe':
        // Soft air whoosh
        this.whoosh(600, 150, 0.10, 0.14);
        break;

      case 'navSwitch':
        // Slightly more substantial than tap — page is moving
        this.whoosh(900, 300, 0.08, 0.11);
        this.clickTone(1100, 0.03, 0.25, 2800, 2);
        break;

      case 'error':
        // Dissonant low thud — something went wrong
        this.thud(60, 0.12, 0.55);
        this.clickTone(280, 0.08, 0.22, 500, 0.8);
        break;

      case 'heartbeat': {
        // Two-beat cardiac rhythm — lub-dub
        const ctx = this.getCtx();
        const master = this.getMaster();
        if (!ctx || !master) break;
        const now = ctx.currentTime;
        const beats = [
          { t: 0,    freq: 70, dur: 0.09, g: 0.7 },
          { t: 0.13, freq: 55, dur: 0.12, g: 0.9 },
        ];
        beats.forEach(({ t, freq, dur, g }) => {
          const o = ctx.createOscillator();
          const gn = ctx.createGain();
          o.frequency.setValueAtTime(freq, now + t);
          o.frequency.exponentialRampToValueAtTime(18, now + t + dur);
          o.type = 'sine';
          gn.gain.setValueAtTime(g, now + t);
          gn.gain.exponentialRampToValueAtTime(0.0001, now + t + dur);
          o.connect(gn); gn.connect(master);
          o.start(now + t); o.stop(now + t + dur + 0.01);
        });
        break;
      }

      case 'celebrate': {
        // Ascending sparkle arpeggio
        const ctx = this.getCtx();
        const master = this.getMaster();
        if (!ctx || !master) break;
        const now = ctx.currentTime;
        const notes = [523, 659, 784, 1047, 1319];
        notes.forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = freq;
          o.type = 'sine';
          const t = now + i * 0.07;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.22, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t + 0.3);
        });
        break;
      }

      case 'notification':
        // Gentle two-tone chime
        this.chime(880, 0.5, 0.22, [1, 1.333]);
        break;

      case 'modalOpen':
        // Light airy whoosh upward
        this.whoosh(200, 700, 0.09, 0.12);
        this.chime(1200, 0.22, 0.15, [1]);
        break;

      case 'modalClose':
        // Downward settle
        this.whoosh(700, 200, 0.08, 0.10);
        break;

      case 'delete':
        // Low thud with slight dissonance — destructive action
        this.thud(50, 0.14, 0.5);
        this.clickTone(220, 0.07, 0.18, 400, 0.7);
        break;
    }
  }
}

export const Audio = new AudioService();
Audio.loadPrefs();

// Unlock on first user interaction
const unlockOnGesture = () => {
  Audio.unlock();
  window.removeEventListener('touchstart', unlockOnGesture, { capture: true });
  window.removeEventListener('mousedown', unlockOnGesture, { capture: true });
};
window.addEventListener('touchstart', unlockOnGesture, { capture: true, passive: true });
window.addEventListener('mousedown', unlockOnGesture, { capture: true });
