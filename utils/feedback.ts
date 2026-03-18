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
      navigator.vibrate(10); // Very short, light tick
    }
  }

  public medium() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }
  }

  public success() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([20, 50, 40]); // Da-DUM pattern
    }
  }

  public error() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([40, 40, 40, 40, 40]); // Buzz buzz buzz
    }
  }

  // --- AUDIO ---

  public playTick() {
    this.playTone(800, 'sine', 0.05, 0.05); // High, short, soft sine wave
  }

  public playPop() {
    this.playTone(300, 'sine', 0.1, 0.08); // Lower, slightly longer pop
  }

  public playSuccess() {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;
    
    // Play a quick two-tone chime
    this.playTone(600, 'sine', 0.1, 0.05);
    setTimeout(() => {
      this.playTone(800, 'sine', 0.15, 0.05);
    }, 100);
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
