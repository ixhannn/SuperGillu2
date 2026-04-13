/**
 * Audio Service — Tulika
 *
 * Procedural Web Audio API sound engine — zero asset files.
 *
 * What makes a sound feel "premium":
 *   1. A sharp impulse transient at onset  — the physical "contact" sensation
 *   2. A clean resonant tail               — the material ringing
 *   3. Very short total duration           — premium apps whisper
 *   4. Sample-accurate scheduling          — no setTimeout drift
 *   5. Consistent gain family             — nothing jumps out as too loud
 *
 * All multi-note sequences now use Web Audio startTime offsets (never setTimeout),
 * giving sub-millisecond scheduling accuracy regardless of JS main-thread load.
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
  private ctx:        AudioContext     | null = null;
  private masterGain: GainNode         | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private shelf:      BiquadFilterNode | null = null;
  private enabled  = true;
  private volume   = 0.40;
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
    const ctx = this.getCtx();
    if (this.masterGain && ctx) {
      this.masterGain.gain.setTargetAtTime(value ? this.volume : 0, ctx.currentTime, 0.05);
    }
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    localStorage.setItem('lior_audio_volume', String(this.volume));
    const ctx = this.getCtx();
    if (this.masterGain && ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.05);
    }
  }

  isEnabled() { return this.enabled; }
  getVolume()  { return this.volume; }

  unlock() {
    if (this.unlocked) return;
    const ctx = this.getCtx();
    if (!ctx) return;
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

        // Compressor: punchy, tamed peaks, analogue warmth
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -22;
        this.compressor.knee.value      =   7;
        this.compressor.ratio.value     =   3.5;
        this.compressor.attack.value    =   0.002;
        this.compressor.release.value   =   0.10;

        // High-shelf +1.5 dB @ 8 kHz — adds "air" to every sound
        this.shelf = this.ctx.createBiquadFilter();
        this.shelf.type            = 'highshelf';
        this.shelf.frequency.value = 8000;
        this.shelf.gain.value      = 1.5;

        this.masterGain.connect(this.shelf);
        this.shelf.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getMaster(): GainNode | null {
    this.getCtx();
    return this.masterGain;
  }

  // ─── Primitives ──────────────────────────────────────────────────────────────

  /**
   * Pure sine tone with natural attack + exponential decay.
   * `when`: seconds offset from ctx.currentTime (use for sample-accurate scheduling).
   */
  private tone(
    pitch:    number,
    pitchEnd: number,
    duration: number,
    gain:     number,
    attackMs  = 1.0,
    when      = 0,
  ) {
    const ctx    = this.getCtx();
    const master = this.getMaster();
    if (!ctx || !master) return;

    const start  = ctx.currentTime + when;
    const attack = attackMs / 1000;

    const osc = ctx.createOscillator();
    const g   = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, start);
    if (pitchEnd !== pitch) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(pitchEnd, 1), start + duration,
      );
    }

    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.015);
  }

  /**
   * Bell partial stack — inharmonic series for glass/metal timbre.
   * Classic Chowning ratios: f, 2.756f, 5.404f.
   */
  private bell(
    freq:     number,
    duration: number,
    gain:     number,
    partials: number[] = [1, 2.756],
    when      = 0,
  ) {
    partials.forEach((ratio, i) => {
      const decay = duration * Math.pow(0.60, i);
      this.tone(
        freq * ratio,
        freq * ratio,
        decay,
        gain / Math.pow(i + 1, 1.2),
        0.8,
        when,
      );
    });
  }

  /**
   * Impulse transient — bandpass-filtered noise burst.
   * This is what creates the tactile "click" sensation at the onset of a tap.
   * Think of it as the "hammer hits string" moment before the tone rings.
   *
   * freq: center frequency of the bandpass filter (Hz)
   * q:    filter Q — higher = more focused, nasal click
   */
  private impulse(
    freq:     number,
    q:        number,
    duration: number,
    gain:     number,
    when      = 0,
  ) {
    const ctx    = this.getCtx();
    const master = this.getMaster();
    if (!ctx || !master) return;

    const start  = ctx.currentTime + when;
    const bufLen = Math.ceil(ctx.sampleRate * duration);
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const noise  = ctx.createBufferSource();
    noise.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type            = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value         = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.0004);  // 0.4 ms snap attack
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    noise.connect(filter);
    filter.connect(g);
    g.connect(master);
    noise.start(start);
  }

  /**
   * Sub-bass body hit — felt more than heard on phone speakers.
   */
  private sub(freq: number, duration: number, gain: number, when = 0) {
    const ctx    = this.getCtx();
    const master = this.getMaster();
    if (!ctx || !master) return;

    const start = ctx.currentTime + when;
    const osc   = ctx.createOscillator();
    const g     = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(freq * 0.18, 8), start + duration,
    );
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.01);
  }

  /**
   * Filtered noise whoosh — for swipe/modal only, never for taps.
   */
  private whoosh(
    freqStart: number,
    freqEnd:   number,
    duration:  number,
    gain:      number,
    q          = 2.5,
    when        = 0,
  ) {
    const ctx    = this.getCtx();
    const master = this.getMaster();
    if (!ctx || !master) return;

    const start  = ctx.currentTime + when;
    const bufLen = Math.ceil(ctx.sampleRate * duration);
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const noise  = ctx.createBufferSource();
    noise.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freqStart, start);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(freqEnd, 1), start + duration,
    );
    filter.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + duration * 0.10);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    noise.connect(filter);
    filter.connect(g);
    g.connect(master);
    noise.start(start);
  }

  // ─── Named Sounds ─────────────────────────────────────────────────────────

  play(sound: SoundName) {
    if (!this.enabled) return;
    switch (sound) {

      // ── Crystal tap — lightest possible acknowledgement
      // Impulse transient + very short high tone.
      case 'tap':
        this.impulse(2800, 7,  0.010, 0.055);
        this.tone(1800, 1800, 0.015, 0.062, 0.6);
        break;

      // ── iOS-style tab switch — barely there, clean
      // Transient-first design: impulse click + pure ping, no pitch movement.
      case 'navSwitch':
        this.impulse(2400, 8,  0.008, 0.048);
        this.tone(1150, 1150, 0.020, 0.060, 0.5);
        break;

      // ── Selection pop — choosing a chip or option
      case 'select':
        this.impulse(2000, 6,  0.008, 0.050);
        this.tone(1450, 1450, 0.018, 0.058, 0.6);
        break;

      // ── Weighted button press — the Add FAB
      // Heavier impact + clean mid tone + subtle sub for physical body.
      case 'press':
        this.impulse(1100, 4,  0.012, 0.070);
        this.tone(480, 480, 0.042, 0.110, 1.0);
        this.sub(62, 0.055, 0.170);
        break;

      // ── Toggle ON — ascending two-note snap (perfect 4th = 4:3)
      // Sample-accurate: second note scheduled 38ms out via `when` offset.
      case 'toggleOn':
        this.impulse(2200, 6, 0.007, 0.045);
        this.tone(900,  900,  0.028, 0.090, 0.8);
        this.tone(1200, 1200, 0.024, 0.075, 0.8, 0.038);
        break;

      // ── Toggle OFF — descending two-note snap
      case 'toggleOff':
        this.impulse(2200, 6, 0.007, 0.040);
        this.tone(1200, 1200, 0.024, 0.075, 0.8);
        this.tone(900,  900,  0.028, 0.065, 0.8, 0.038);
        break;

      // ── Success chime — three ascending bells: E5 → B5 → E6
      // Perfect 4th + octave. Sample-accurate scheduling.
      case 'confirm':
        this.bell(659,  0.44, 0.165, [1, 2.756], 0.000);  // E5
        this.bell(988,  0.38, 0.145, [1, 2.756], 0.058);  // B5 (5th up)
        this.bell(1319, 0.30, 0.120, [1, 2.756], 0.116);  // E6 (octave)
        break;

      // ── Notification — warm two-tone bell (major 6th = A5 + F#6)
      case 'notification':
        this.bell(880,  0.52, 0.145, [1, 2.756], 0.000);
        this.bell(1480, 0.40, 0.120, [1, 2.756], 0.062);  // F#6 (major 6th up)
        break;

      // ── Celebrate — pentatonic arpeggio: C5 E5 G5 B5 E6
      case 'celebrate': {
        const notes = [523, 659, 784, 988, 1319];
        const gains = [0.130, 0.120, 0.110, 0.100, 0.090];
        notes.forEach((freq, i) => {
          this.bell(freq, 0.36, gains[i], [1, 2.756], i * 0.058);
        });
        break;
      }

      // ── Heartbeat — organic lub-dub, sample-accurate
      case 'heartbeat':
        // lub
        this.sub(65, 0.078, 0.480);
        this.tone(135, 135, 0.060, 0.095, 1.0);
        // dub (125ms later — heavier)
        this.sub(52, 0.095, 0.580, 0.125);
        this.tone(105, 105, 0.075, 0.120, 1.0, 0.125);
        break;

      // ── Swipe — soft directional air
      case 'swipe':
        this.whoosh(460, 130, 0.085, 0.062, 2.2);
        break;

      // ── Error — low weight thud, not a screech
      case 'error':
        this.sub(42, 0.095, 0.280);
        this.tone(195, 195, 0.065, 0.080, 2.0);
        break;

      // ── Modal open — airy upward sweep + soft ping
      case 'modalOpen':
        this.whoosh(200, 580, 0.080, 0.052, 2.8);
        this.tone(1350, 1350, 0.165, 0.075, 2.5, 0.038);
        break;

      // ── Modal close — downward exhale
      case 'modalClose':
        this.whoosh(580, 200, 0.072, 0.045, 2.8);
        break;

      // ── Delete — low body thud
      case 'delete':
        this.sub(44, 0.110, 0.320);
        this.tone(185, 185, 0.060, 0.070, 2.5);
        break;
    }
  }
}

export const Audio = new AudioService();
Audio.loadPrefs();

// Unlock AudioContext on first user interaction (required by iOS & Android)
const _unlock = () => {
  Audio.unlock();
  window.removeEventListener('touchstart', _unlock, { capture: true });
  window.removeEventListener('mousedown',  _unlock, { capture: true });
};
window.addEventListener('touchstart', _unlock, { capture: true, passive: true });
window.addEventListener('mousedown',  _unlock, { capture: true });
