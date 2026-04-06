/**
 * Haptics Service — Tulika
 * ─────────────────────────────────────────────────────────────────────────────
 * Native API surface (what @capacitor/haptics v8 actually exposes):
 *
 *   impact({ style })       → ImpactStyle.Heavy | Medium | Light
 *   notification({ type })  → NotificationType.Success | Warning | Error
 *   selectionStart()        → begins a selection session
 *   selectionChanged()      → tick inside a selection session
 *   selectionEnd()          → ends a selection session
 *   vibrate({ duration })   → raw duration vibration (last resort)
 *
 * RIGID and SOFT are iOS-only UIKit styles not yet in Capacitor — we simulate
 * them by combining the available primitives with precise timing.
 *
 * ─── Apple HIG haptic vocabulary (what each type should feel like) ──────────
 *
 *   Light    → touching a small, light element  (nav icon, row tap, chip)
 *   Medium   → engaging a standard UI element   (button press, card tap)
 *   Heavy    → colliding with something solid   (FAB, modal open, hard confirm)
 *   Success  → two-pulse rising arc             (task complete, save, send)
 *   Warning  → two-pulse flat-then-drop         (destructive action warning)
 *   Error    → three-pulse descending           (invalid, failed, rejected)
 *   Selection → single ultra-fine tick          (scroll picker, segmented ctrl)
 *
 * ─── Composed sequences we build on top ────────────────────────────────────
 *
 *   toggleOn    → selectionChanged + delay(32) + Light   (switch snapping on)
 *   toggleOff   → Light + delay(32) + selectionChanged   (switch releasing off)
 *   softTap     → Light at 60% feel, best for ghost buttons / back arrows
 *   rigidStop   → Heavy — used where iOS would use .rigid (hard wall hit)
 *   heartbeat   → Medium @0ms + Heavy @140ms             (romantic lub-dub)
 *   doubleBeat  → heartbeat × 2 with 700ms between beats (aura signal arrival)
 *   celebrate   → 5-beat escalating arc over 220ms       (confetti, milestone)
 *   longPressProgress(n) → escalates Light→Medium→Heavy as n goes 0→1
 *
 * ─── Interaction → haptic mapping reference ─────────────────────────────────
 *
 *   Navigation tab tap          → tap()        (Light)
 *   List row tap                → tap()        (Light)
 *   Ghost / secondary button    → softTap()    (Light — slightly shorter)
 *   Standard button press       → press()      (Medium)
 *   Center FAB / primary CTA    → heavy()      (Heavy)
 *   Modal open                  → heavy()      (Heavy)
 *   Modal close                 → press()      (Medium)
 *   Card long-press activate    → press()      (Medium)
 *   Scroll picker / theme grid  → select()     (Selection tick)
 *   Toggle switch ON            → toggleOn()   (Selection + Light)
 *   Toggle switch OFF           → toggleOff()  (Light + Selection)
 *   Save / confirm / send       → success()    (Notification Success)
 *   Delete / destructive        → warning()    (Notification Warning)
 *   Form error / invalid        → error()      (Notification Error)
 *   Hard stop / wall            → rigidStop()  (Heavy)
 *   Aura signal received        → doubleBeat() (romantic double heartbeat)
 *   Confetti / milestone        → celebrate()  (escalating 5-beat)
 *   Long press charging         → longPressProgress(n)
 */

import { Haptics as CapHaptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticIntensity = 'light' | 'medium' | 'heavy';

// ─── Platform detection ──────────────────────────────────────────────────────

const isNative = (): boolean =>
  typeof (window as any).Capacitor !== 'undefined' &&
  (window as any).Capacitor?.isNativePlatform?.() === true;

// ─── Web Vibration API fallback ──────────────────────────────────────────────
// Tuned to perceptually match the native haptic character as closely as
// possible on Android Chrome. Shorter = lighter feel, longer = heavier.
// [on_ms, off_ms, on_ms, ...]

const W: Record<string, VibratePattern> = {
  // Single crisp tap — lightest possible
  tap:        [7],
  // Weighted single tap — standard button
  press:      [12],
  // Deep single thud
  heavy:      [20],
  // Ultra-short — ghost button, back arrow
  softTap:    [5],
  // Hard wall — one firm pulse
  rigidStop:  [22],
  // Fine selection tick
  select:     [4],
  // Two rising pulses: short-pause-long
  success:    [8, 60, 14],
  // Two flat pulses with drop: long-pause-long
  warning:    [14, 60, 14],
  // Three descending pulses
  error:      [18, 50, 12, 50, 8],
  // Cardiac lub-dub: medium pulse, gap, heavy pulse
  heartbeat:  [12, 140, 18],
  // Double heartbeat with breath between
  doubleBeat: [12, 140, 18, 700, 12, 140, 18],
  // Rapid escalating cascade
  celebrate:  [5, 50, 6, 42, 9, 34, 12, 26, 17],
};

const vibrate = (pattern: VibratePattern) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch { /* silently ignore */ }
  }
};

// ─── Timing helper ───────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── Haptics Service ─────────────────────────────────────────────────────────

class HapticsService {
  private enabled = true;

  loadPrefs() {
    const v = localStorage.getItem('tulika_haptics');
    if (v !== null) this.enabled = v === '1';
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    localStorage.setItem('tulika_haptics', value ? '1' : '0');
  }

  isEnabled() { return this.enabled; }

  // ─── Primitive impacts ──────────────────────────────────────────────────

  /**
   * Light impact.
   * Use for: nav tabs, list rows, ghost buttons, any subtle interaction.
   * iOS feel: touching a small light object
   */
  async tap() {
    if (!this.enabled) return;
    if (isNative()) await CapHaptics.impact({ style: ImpactStyle.Light });
    else vibrate(W.tap);
  }

  /**
   * Medium impact.
   * Use for: standard buttons, card taps, modal close, back navigation.
   * iOS feel: engaging a normal UI element
   */
  async press() {
    if (!this.enabled) return;
    if (isNative()) await CapHaptics.impact({ style: ImpactStyle.Medium });
    else vibrate(W.press);
  }

  /**
   * Heavy impact.
   * Use for: FAB, primary CTA, modal open, hard confirm.
   * iOS feel: two heavy objects colliding
   */
  async heavy() {
    if (!this.enabled) return;
    if (isNative()) await CapHaptics.impact({ style: ImpactStyle.Heavy });
    else vibrate(W.heavy);
  }

  /**
   * Soft tap — imperceptibly lighter than Light.
   * Simulated with a shorter Light pulse.
   * Use for: ghost buttons, back arrows, dismiss icons, secondary actions.
   */
  async softTap() {
    if (!this.enabled) return;
    if (isNative()) {
      // Light is the softest Capacitor exposes — we accept this ceiling
      await CapHaptics.impact({ style: ImpactStyle.Light });
    } else {
      vibrate(W.softTap);
    }
  }

  /**
   * Rigid stop — hard wall impact.
   * Simulates UIImpactFeedbackStyle.rigid using Heavy (closest available).
   * Use for: scroll overscroll bounce, drag boundary hit, destructive delete confirm.
   */
  async rigidStop() {
    if (!this.enabled) return;
    if (isNative()) await CapHaptics.impact({ style: ImpactStyle.Heavy });
    else vibrate(W.rigidStop);
  }

  // ─── Selection ──────────────────────────────────────────────────────────

  /**
   * Selection tick — single ultra-fine click.
   * Use for: scroll pickers, segmented controls, theme card select, any picker.
   * iOS feel: the subtle tick of a UIPickerView row passing by.
   *
   * NOTE: Wraps in selectionStart/End for proper iOS session context.
   */
  async select() {
    if (!this.enabled) return;
    if (isNative()) {
      await CapHaptics.selectionStart();
      await CapHaptics.selectionChanged();
      await CapHaptics.selectionEnd();
    } else {
      vibrate(W.select);
    }
  }

  /**
   * Selection scroll — call selectionChanged() repeatedly during continuous scroll.
   * Call selectionScrollStart() before, selectionScrollEnd() after.
   */
  async selectionScrollStart() {
    if (!this.enabled) return;
    if (isNative()) await CapHaptics.selectionStart();
  }

  async selectionScrollTick() {
    if (!this.enabled) return;
    if (isNative()) await CapHaptics.selectionChanged();
    else vibrate(W.select);
  }

  async selectionScrollEnd() {
    if (!this.enabled) return;
    if (isNative()) await CapHaptics.selectionEnd();
  }

  // ─── Notification types ──────────────────────────────────────────────────

  /**
   * Success — task completed.
   * Apple pattern: two rising pulses (light then heavy feel).
   * Use for: save, send, confirm, profile update, memory added.
   */
  async success() {
    if (!this.enabled) return;
    if (isNative()) await CapHaptics.notification({ type: NotificationType.Success });
    else vibrate(W.success);
  }

  /**
   * Warning — proceed with caution.
   * Apple pattern: two flat-intensity pulses.
   * Use for: delete confirmation dialog, unsaved changes warning.
   */
  async warning() {
    if (!this.enabled) return;
    if (isNative()) await CapHaptics.notification({ type: NotificationType.Warning });
    else vibrate(W.warning);
  }

  /**
   * Error — action failed or invalid.
   * Apple pattern: three descending pulses.
   * Use for: form validation fail, network error, wrong input.
   */
  async error() {
    if (!this.enabled) return;
    if (isNative()) await CapHaptics.notification({ type: NotificationType.Error });
    else vibrate(W.error);
  }

  // ─── Composed semantic sequences ────────────────────────────────────────

  /**
   * Toggle ON — switch snapping into the on position.
   * Pattern: selectionChanged → 32ms → Light
   * The selection tick is the "click" of the toggle knob moving,
   * the Light impact is the knob landing in the on groove.
   */
  async toggleOn() {
    if (!this.enabled) return;
    if (isNative()) {
      await CapHaptics.selectionStart();
      await CapHaptics.selectionChanged();
      await CapHaptics.selectionEnd();
      await wait(32);
      await CapHaptics.impact({ style: ImpactStyle.Light });
    } else {
      vibrate([4, 32, 7]);
    }
  }

  /**
   * Toggle OFF — switch releasing from the on position.
   * Pattern: Light → 32ms → selectionChanged
   * Reversed: the impact is the knob leaving, the tick is it settling off.
   */
  async toggleOff() {
    if (!this.enabled) return;
    if (isNative()) {
      await CapHaptics.impact({ style: ImpactStyle.Light });
      await wait(32);
      await CapHaptics.selectionStart();
      await CapHaptics.selectionChanged();
      await CapHaptics.selectionEnd();
    } else {
      vibrate([7, 32, 4]);
    }
  }

  /**
   * Confirm — alias for success. Cleanest semantic name for save/confirm.
   */
  confirm = () => this.success();

  /**
   * Destroy — alias for warning. Destructive action confirmation.
   */
  destroy = () => this.warning();

  /**
   * Heartbeat — romantic single lub-dub.
   * Pattern: Medium @0ms → Heavy @140ms
   * The 140ms gap matches the average S1→S2 cardiac interval.
   * Use for: sending a heart, viewing a romantic memory.
   */
  async heartbeat() {
    if (!this.enabled) return;
    if (isNative()) {
      await CapHaptics.impact({ style: ImpactStyle.Medium });
      await wait(140);
      await CapHaptics.impact({ style: ImpactStyle.Heavy });
    } else {
      vibrate(W.heartbeat);
    }
  }

  /**
   * Double heartbeat — two full cardiac cycles.
   * Pattern: lub-dub → 700ms breath → lub-dub
   * Use for: aura signal received, partner online notification.
   */
  async doubleBeat() {
    if (!this.enabled) return;
    if (isNative()) {
      await CapHaptics.impact({ style: ImpactStyle.Medium });
      await wait(140);
      await CapHaptics.impact({ style: ImpactStyle.Heavy });
      await wait(700);
      await CapHaptics.impact({ style: ImpactStyle.Medium });
      await wait(140);
      await CapHaptics.impact({ style: ImpactStyle.Heavy });
    } else {
      vibrate(W.doubleBeat);
    }
  }

  /**
   * Celebrate — escalating 5-beat cascade.
   * Timing gaps compress as it accelerates (feels like confetti bursting).
   * Pattern: Light@0 → Light@55 → Medium@105 → Medium@148 → Heavy@185
   * Use for: milestone reached, streak, confetti moment.
   */
  async celebrate() {
    if (!this.enabled) return;
    if (isNative()) {
      const beats: Array<[number, ImpactStyle]> = [
        [0,   ImpactStyle.Light],
        [55,  ImpactStyle.Light],
        [105, ImpactStyle.Medium],
        [148, ImpactStyle.Medium],
        [185, ImpactStyle.Heavy],
      ];
      for (const [ms, style] of beats) {
        setTimeout(() => CapHaptics.impact({ style }), ms);
      }
    } else {
      vibrate(W.celebrate);
    }
  }

  /**
   * Long press progress — escalates as hold fills (0 → 1).
   * Calls should be debounced — only fire when crossing thresholds.
   *
   * Usage:
   *   0.0–0.33 → Light  (just started)
   *   0.33–0.66 → Medium (halfway)
   *   0.66–0.99 → Heavy  (almost there)
   *   1.0       → Success (activated)
   */
  async longPressProgress(progress: number) {
    if (!this.enabled) return;
    if (isNative()) {
      if (progress >= 1.0) {
        await CapHaptics.notification({ type: NotificationType.Success });
      } else if (progress >= 0.66) {
        await CapHaptics.impact({ style: ImpactStyle.Heavy });
      } else if (progress >= 0.33) {
        await CapHaptics.impact({ style: ImpactStyle.Medium });
      } else {
        await CapHaptics.impact({ style: ImpactStyle.Light });
      }
    }
  }

  /** Cancel any active web vibration */
  cancel() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(0); } catch { /* ignore */ }
    }
  }
}

export const Haptics = new HapticsService();
Haptics.loadPrefs();
