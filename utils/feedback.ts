// Haptics and Audio Utility for Premium Multi-sensory feedback

class FeedbackEngine {
  private audioCtx: AudioContext | null = null;
  private isEnabled: boolean = true;

  constructor() {
    // We only initialize AudioContext on first user interaction to comply with browser autoplay policies
  }

  private getAudioContext() {
    if (!this.audioCtx) {
      if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    }
    // Resume if suspended (browsers suspend it if created before interaction)
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // Generate a soft, rounded 'pop' or 'tick' sound computationally
  private playTone(frequency: number, type: OscillatorType, duration: number, volumeLevel: number = 0.1) {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      // Envelope: quick attack, exponential decay for a percussive 'tick/pop'
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volumeLevel, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio playback failed", e);
    }
  }

  // --- HAPTICS ---

  public light() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      // Extremely short, sharp tap
      navigator.vibrate(5); 
    }
  }

  public medium() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      // Slightly more body, still sharp
      navigator.vibrate(12); 
    }
  }

  public success() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      // Da-DUM (tightened cinematic timing)
      navigator.vibrate([10, 60, 20]); 
    }
  }

  public error() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      // Sharp, distinct staccato buzzes
      navigator.vibrate([15, 40, 15, 40, 20]); 
    }
  }

  // --- PREMIUM AUDIO ---

  public playTick() {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      // Very short, high-frequency "snap" simulating a physical UI switch (taptic feel)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle'; 
      // Very fast frequency drop to simulate a mechanical "click" instead of a tone
      osc.frequency.setValueAtTime(1500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.015);

      // Extremely tight envelope to prevent any ringing
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.001); // Fast attack
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.015); // Fast decay

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.015);
    } catch (e) {
      console.warn("Audio playback failed", e);
    }
  }

  public playPop() {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      // Soft, warm "thock" sound (like closing a wooden box or a heavy mechanical key)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Lower register, subtle drop
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.03);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.005); // Softer attack
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03); // Tighter decay than before

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.03);
    } catch (e) {
      console.warn("Audio playback failed", e);
    }
  }

  public playSuccess() {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;
    
    // Play a quick, clean two-tone chime (F5 to C6 - perfect fifth), much softer than before
    this.playTone(698.46, 'sine', 0.1, 0.03); 
    setTimeout(() => {
      this.playTone(1046.50, 'sine', 0.2, 0.04); 
    }, 80);
  }

  // --- COMPOSITE PRESETS ---

  public tap() {
    this.light();
    this.playTick();
  }

  public interact() {
    this.medium();
    this.playPop();
  }

  public celebrate() {
    this.success();
    this.playSuccess();
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }
}

export const feedback = new FeedbackEngine();
