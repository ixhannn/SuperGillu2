// Multi-sensory feedback facade — Lior
// ─────────────────────────────────────────────────────────────────────────────
// Thin shim over the two real authorities: services/haptics (tactile) and
// services/audio (procedural sound). It used to carry its OWN AudioContext +
// oscillators, which meant its sound IGNORED the user's audio-off preference
// (the Profile toggle only ever touched the Audio service). Routing every sound
// through Audio.play() fixes that — sound now obeys lior_audio everywhere — and
// retires a duplicate ~90-line Web Audio engine.
//
// Signatures are preserved so existing call sites compile unchanged. New:
//   tapSilent() — haptic-only routine tap (no paired sound). Prefer this for
//                 chips/rows/icons/dismiss; reserve tap() (haptic+sound) for
//                 primary controls.
//   milestone() — the real escalating celebrate (Heavy climax). Reserve for
//                 genuine milestones; routine saves should use confirm().
//   confirm()   — success haptic + soft chime, for routine save/create/complete.
import { Haptics } from '../services/haptics';
import { Audio } from '../services/audio';

class FeedbackEngine {
  private isEnabled = true;
  // Retained as a light local cooldown so a single logical event cannot stack
  // two paired sounds; Audio.play also self-gates on its own enabled flag.
  private lastAudioAt = 0;
  private readonly audioDebounceMs = 70;

  private canPlayAudio(): boolean {
    if (!this.isEnabled) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastAudioAt < this.audioDebounceMs) return false;
    this.lastAudioAt = now;
    return true;
  }

  // --- HAPTICS (haptic-only) ---

  public light() {
    Haptics.tap();
  }

  public medium() {
    Haptics.press();
  }

  public success() {
    Haptics.success();
  }

  public error() {
    Haptics.error();
  }

  // --- SOUND (routed through the canonical Audio engine) ---

  public playTick() {
    if (!this.canPlayAudio()) return;
    Audio.play('tap');
  }

  public playPop() {
    if (!this.canPlayAudio()) return;
    Audio.play('press');
  }

  public playSuccess() {
    if (!this.canPlayAudio()) return;
    Audio.play('confirm');
  }

  // --- COMPOSITE PRESETS ---

  /** Haptic-only routine tap — the restraint-first default for secondary controls. */
  public tapSilent() {
    this.light();
  }

  /** Light tap + tick — reserve for primary controls where a paired sound earns its place. */
  public tap() {
    this.light();
    this.playTick();
  }

  /** Medium press + pop — deliberate, weighted interaction. */
  public interact() {
    this.medium();
    this.playPop();
  }

  /** Routine completion: success haptic + soft chime. Use for save/create/complete. */
  public confirm() {
    Haptics.success();
    this.playSuccess();
  }

  /** Genuine milestone: escalating Heavy-climax cascade + celebratory chime. Ration hard. */
  public milestone() {
    Haptics.celebrate();
    if (this.canPlayAudio()) Audio.play('celebrate');
  }

  /**
   * Back-compat: historically a notification-level "save" cue (success haptic +
   * chime). Kept at that intensity — NOT the heavy crescendo — so the many
   * routine save sites that call it are not over-celebrated. For true
   * milestones use milestone(); for routine saves prefer confirm().
   */
  public celebrate() {
    this.confirm();
  }

  /** Gates this facade's SOUND. Haptics obey their own lior_haptics pref via the Haptics service. */
  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    Audio.setEnabled(enabled);
  }
}

export const feedback = new FeedbackEngine();
