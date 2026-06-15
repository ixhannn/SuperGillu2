/**
 * Haptics Service — Lior
 * ─────────────────────────────────────────────────────────────────────────────
 * A single tactile LANGUAGE built on a 6-level hierarchy. Every interaction in
 * the app is assigned ONE intentional level — never a random vibration.
 *
 *   L0  Silent      — scroll, hover, in-transit, passive. Silence is a choice.
 *   L1  Whisper     — selection tick (pickers, chips, detents).            select()
 *   L2  Tap         — Light impact. The workhorse ack (~70% of taps).      tap()/softTap()
 *   L3  Press       — Medium impact. Deliberate, committed actions.        press()/dragPickup()
 *   L4  Signal      — Heavy impact / Notification / heartbeat lub-dub.     heavy()/success()/heartbeat()…
 *   L5  Celebrate   — short, subtle Light→Medium cascade. Milestones.       celebrate()/milestone()
 *
 * Native API surface (what @capacitor/haptics v8 actually exposes):
 *   impact({ style })       → ImpactStyle.Heavy | Medium | Light
 *   notification({ type })  → NotificationType.Success | Warning | Error
 *   selectionStart/Changed/End()
 *   vibrate({ duration })   → raw duration vibration (last resort)
 * RIGID and SOFT (iOS) and Android VibrationEffect.Composition are NOT reachable
 * through the plugin — rigidStop simulates .rigid with Heavy, softTap aliases Light.
 *
 * ─── The physical ladder — tuned TIGHT & SUBTLE ─────────────────────────────
 * The character is featherlight and crisp (think iOS keyboard / Apple Pay), not
 * weighty. Light carries ~90% of interactions; Medium is the heaviest thing felt
 * in normal use; Heavy is reserved for the rare "physical" events only.
 *   tap / softTap        → Light    (touch a small light object — the workhorse)
 *   press / dragPickup   → Medium   (engage a deliberate/primary control)
 *   heavy / rigidStop /
 *   destructive          → Heavy    (rare: hard wall, irreversible commit)
 *   success/warning/error→ Notification patterns (genuine outcomes only)
 *   heartbeat            → Light→Medium @150ms gentle lub-dub (never a slam)
 *   celebrate            → Light→Light→Medium over 90ms (tight, no climax-slam)
 *
 * ─── One event = one haptic ─────────────────────────────────────────────────
 * A single keyed gate (Map<key, lastFiredAt>) prevents double-fires from
 * synthetic click + pointerdown, multi-finger taps, and scroll-over-button.
 * Per-control keys (e.g. 'pinpad') let legitimately-rapid distinct taps through
 * that the global 140ms debounce would otherwise starve. Inbound/background
 * haptics are suppressed while document.hidden. Audio pairing is the caller's
 * decision — this service emits tactile only.
 */

import { Haptics as CapHaptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticIntensity = 'light' | 'medium' | 'heavy';

/** Per-call gate options. Backward-compatible: all optional, default key='global'. */
export interface FireOpts {
  /** Independent debounce bucket for a control that fires legitimately-rapid distinct taps. */
  key?: string;
  /** Allow firing even while a finger drag/scroll is in progress (long-press escalation). */
  allowDuringScroll?: boolean;
  /** Skip the debounce entirely (terminal beat of an escalation that must never be swallowed). */
  bypassDebounce?: boolean;
}

// ─── Platform detection ──────────────────────────────────────────────────────

const isNative = (): boolean =>
  typeof (window as any).Capacitor !== 'undefined' &&
  (window as any).Capacitor?.isNativePlatform?.() === true;

const isAndroid = (): boolean =>
  isNative() && (window as any).Capacitor?.getPlatform?.() === 'android';

// ─── Web Vibration API fallback ──────────────────────────────────────────────
// Android Chrome quantizes navigator.vibrate to the motor's minimum on-time;
// sub-~10ms pulses are widely dropped, so every on-duration is floored to 10ms
// centrally in vibrate(). Durations climb monotonically so the tiers stay
// perceptibly separated. iOS Safari ignores navigator.vibrate entirely — this
// fallback is Android-web only. [on_ms, off_ms, on_ms, ...]

const W: Record<string, VibratePattern> = {
  // Crisp, short single pulses — floored to 10ms (Android Chrome minimum) and
  // kept tight so nothing reads as a lingering "buzz".
  select:     [10],
  softTap:    [10],
  tap:        [12],
  press:      [16],
  heavy:      [22],
  rigidStop:  [26],
  // Two soft rising pulses
  success:    [10, 40, 10],
  // Two flat pulses with a drop
  warning:    [12, 45, 12],
  // Three light descending pulses
  error:      [12, 40, 10, 40, 10],
  // Gentle cardiac lub-dub: light pulse, breath, slightly firmer pulse
  heartbeat:  [12, 150, 18],
  // Double heartbeat with a breath between
  doubleBeat: [12, 150, 18, 520, 12, 150, 18],
  // Short subtle cascade — three crisp pulses, no heavy tail
  celebrate:  [10, 45, 12, 45, 16],
};

const vibrate = (pattern: VibratePattern) => {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    // Floor only ON-durations (even indices); leave OFF-gaps (odd indices) intact.
    const floored: VibratePattern = Array.isArray(pattern)
      ? pattern.map((d, i) => (i % 2 === 0 ? Math.max(10, d) : d))
      : Math.max(10, pattern as number);
    navigator.vibrate(floored);
  } catch { /* silently ignore */ }
};

// ─── Timing helper ───────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ─── Haptics Service ─────────────────────────────────────────────────────────

class HapticsService {
  private enabled = true;
  /** Keyed gate — one lastFiredAt per logical control. Default bucket = 'global'. */
  private _lastFiredAt = new Map<string, number>();
  private readonly _debounceMs = 140;
  private readonly _scrollSuppressMs = 220;
  private readonly _rapidKeys = new Set(['pinpad', 'keypad']);
  private readonly _rapidGateMs = 40;
  private readonly _dragThresholdPx = 8;
  private _lastScrollLikeAt = 0;
  private _guardsBound = false;
  private _pointerStart: { id: number; x: number; y: number } | null = null;
  private _pointerDown = false;
  private _pointerMoved = false;
  private _inSelectionSession = false;
  private _lastScrollTickAt = 0;

  constructor() {
    this._bindInteractionGuards();
  }

  private _bindInteractionGuards() {
    if (this._guardsBound || typeof window === 'undefined') return;
    this._guardsBound = true;

    const markScrollLike = () => {
      this._lastScrollLikeAt = nowMs();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      this._pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
      this._pointerDown = true;
      this._pointerMoved = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      const start = this._pointerStart;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) >= this._dragThresholdPx) {
        this._pointerMoved = true;
        markScrollLike();
      }
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (this._pointerStart?.id === event.pointerId) {
        this._pointerStart = null;
        this._pointerDown = false;
        this._pointerMoved = false;
      }
    };

    // Touch scroll is the only finger-driven scroll on the native shell. We do
    // NOT listen to 'wheel'/'scroll' here: momentum 'scroll' events keep firing
    // for hundreds of ms after the finger lifts, which used to poison the
    // suppression window and starve the deliberate tap that ends a fling.
    window.addEventListener('touchmove', markScrollLike, { capture: true, passive: true });
    window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onPointerEnd, { capture: true, passive: true });
    window.addEventListener('pointercancel', onPointerEnd, { capture: true, passive: true });
  }

  loadPrefs() {
    if (typeof localStorage === 'undefined') return;
    const v = localStorage.getItem('lior_haptics');
    if (v !== null) this.enabled = v === '1';
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('lior_haptics', value ? '1' : '0');
    }
  }

  isEnabled() { return this.enabled; }
  markScrollActivity() { this._lastScrollLikeAt = nowMs(); }

  /** Blanket gate: disabled by pref, or app is backgrounded (never buzz off-screen). */
  private _blocked(): boolean {
    if (!this.enabled) return true;
    if (typeof document !== 'undefined' && document.hidden) return true;
    return false;
  }

  /**
   * Pointer-aware scroll suppression. Suppress when a finger is genuinely
   * mid-drag over the control, OR within a short backstop window after the last
   * touch-scroll. A fresh, not-yet-moved tap (the common case — including the
   * tap that lands to stop a fling) is NOT suppressed.
   */
  private _scrollSuppressed(allowDuringScroll?: boolean): boolean {
    if (allowDuringScroll) return false;
    if (this._pointerDown && this._pointerMoved) return true;
    if (nowMs() - this._lastScrollLikeAt < this._scrollSuppressMs) return true;
    return false;
  }

  /**
   * Global interaction gate. Returns false if a haptic fired too recently for
   * this control's key, or the gesture has become a scroll/drag. The keyed
   * buckets let rapid distinct taps (e.g. PIN entry at key='pinpad') through
   * while still collapsing accidental double-fires on the same control.
   * Sequences bypass this internally — only the entry-point call is gated.
   */
  private _canFire(opts: FireOpts = {}): boolean {
    if (this._blocked()) return false;
    if (this._scrollSuppressed(opts.allowDuringScroll)) return false;
    if (opts.bypassDebounce) return true;
    const key = opts.key ?? 'global';
    const gate = this._rapidKeys.has(key) ? this._rapidGateMs : this._debounceMs;
    const now = nowMs();
    if (now - (this._lastFiredAt.get(key) ?? 0) < gate) return false;
    this._lastFiredAt.set(key, now);
    return true;
  }

  private _canRunSequence(opts: { allowDuringScroll?: boolean; cooldownMs?: number; key?: string } = {}): boolean {
    if (this._blocked()) return false;
    // Inline (not via helper) so the literal _scrollSuppressMs stays visible here.
    if (!opts.allowDuringScroll) {
      if (this._pointerDown && this._pointerMoved) return false;
      if (nowMs() - this._lastScrollLikeAt < this._scrollSuppressMs) return false;
    }
    const key = opts.key ?? 'global';
    const cooldownMs = opts.cooldownMs ?? this._debounceMs;
    const now = nowMs();
    if (now - (this._lastFiredAt.get(key) ?? 0) < cooldownMs) return false;
    this._lastFiredAt.set(key, now);
    return true;
  }

  /**
   * iOS warm-up. The Taptic Engine idles between uses; the first impact after
   * idle lands 100–400ms late — the single biggest "cheap" tell on iOS.
   * selectionStart/End is the only Capacitor-reachable proxy for prepare()
   * and emits NO tick on its own. No-op on Android (bridge has no idle penalty).
   */
  warmUp(): void {
    if (!this.enabled || !isNative() || isAndroid()) return;
    void CapHaptics.selectionStart().then(() => CapHaptics.selectionEnd()).catch(() => { /* ignore */ });
  }

  /** Alias — call from a gesture's onDown a few ms before the real impact fires. */
  prepareOnDown = () => this.warmUp();

  /** DRY single selection tick (iOS session). selectionChanged only ticks between start/end. */
  private async _selectionTick(): Promise<void> {
    await CapHaptics.selectionStart();
    await CapHaptics.selectionChanged();
    await CapHaptics.selectionEnd();
  }

  // ─── L2 · Tap (Light impact) ──────────────────────────────────────────────

  /**
   * Light impact. L2.
   * Use for: nav tabs, list rows, card open, chips, dismisses — the workhorse ack.
   * iOS feel: touching a small light object.
   */
  async tap(opts: FireOpts = {}) {
    if (!this._canFire(opts)) return;
    if (isNative()) CapHaptics.impact({ style: ImpactStyle.Light });
    else vibrate(W.tap);
  }

  /**
   * Soft tap. L2. Alias of tap on device — Capacitor cannot render "60% Light",
   * so this is the same physical call (kept for call-site intent). Web path is
   * a hair shorter.
   * Use for: ghost / tertiary buttons, back arrows, dismiss icons.
   */
  async softTap(opts: FireOpts = {}) {
    if (!this._canFire(opts)) return;
    if (isNative()) CapHaptics.impact({ style: ImpactStyle.Light });
    else vibrate(W.softTap);
  }

  /**
   * Drag drop. L2. The "landed" half of a lift/land pair (see dragPickup).
   */
  async dragDrop(opts: FireOpts = {}) {
    if (!this._canFire(opts)) return;
    if (isNative()) CapHaptics.impact({ style: ImpactStyle.Light });
    else vibrate(W.tap);
  }

  // ─── L3 · Press (Medium impact) ───────────────────────────────────────────

  /**
   * Medium impact. L3.
   * Use for: primary CTAs, modal open, recording start, long-press activate.
   * iOS feel: engaging a standard control — you feel it bottom out.
   */
  async press(opts: FireOpts = {}) {
    if (!this._canFire(opts)) return;
    if (isNative()) CapHaptics.impact({ style: ImpactStyle.Medium });
    else vibrate(W.press);
  }

  /**
   * Drag pickup. L3. Medium "I lifted this off the surface" — pairs with the
   * lighter dragDrop "it landed."
   */
  async dragPickup(opts: FireOpts = {}) {
    if (!this._canFire(opts)) return;
    if (isNative()) CapHaptics.impact({ style: ImpactStyle.Medium });
    else vibrate(W.press);
  }

  // ─── L4 · Signal (Heavy impact / Notification) ────────────────────────────

  /**
   * Heavy impact. L4.
   * Use for: hard confirm, the heaviest engages, long-press completion.
   * iOS feel: two heavy objects colliding.
   */
  async heavy(opts: FireOpts = {}) {
    if (!this._canFire(opts)) return;
    if (isNative()) CapHaptics.impact({ style: ImpactStyle.Heavy });
    else vibrate(W.heavy);
  }

  /**
   * Rigid stop — hard wall. L4. Simulates UIImpactFeedbackStyle.rigid with Heavy.
   * Use for: overscroll bounce, drag boundary hit.
   */
  async rigidStop(opts: FireOpts = {}) {
    if (!this._canFire(opts)) return;
    if (isNative()) CapHaptics.impact({ style: ImpactStyle.Heavy });
    else vibrate(W.rigidStop);
  }

  /**
   * Destructive action — single Heavy impact. L4. Communicates irreversibility.
   * Use for: the actual delete/remove/clear commit (not the "are you sure?" prompt).
   */
  async destructive(opts: FireOpts = {}) {
    if (!this._canFire(opts)) return;
    if (isNative()) CapHaptics.impact({ style: ImpactStyle.Heavy });
    else vibrate(W.heavy);
  }

  // ─── L1 · Whisper (Selection) ─────────────────────────────────────────────

  /**
   * Selection tick. L1 — the lightest distinct thing the hardware renders.
   * Use for: pickers, segmented controls, theme/chip select, intensity detents.
   */
  async select(opts: FireOpts = {}) {
    if (!this._canFire(opts)) return;
    if (isNative()) {
      if (isAndroid()) {
        // Android selection feedback has high bridge latency (~30ms round-trip).
        // A Light impact is instant and perceptually identical.
        CapHaptics.impact({ style: ImpactStyle.Light });
      } else {
        await this._selectionTick();
      }
    } else {
      vibrate(W.select);
    }
  }

  /** Begin a continuous selection scrub session (iOS). */
  async selectionScrollStart() {
    if (!this.enabled) return;
    if (isNative() && !isAndroid()) {
      await CapHaptics.selectionStart();
      this._inSelectionSession = true;
    }
  }

  /**
   * One detent tick inside a scrub. Throttled by a DEDICATED ~16ms gate (NOT
   * _canFire, which suppresses during scroll — the whole point here is to tick
   * while the user scrubs).
   */
  async selectionScrollTick() {
    if (!this.enabled) return;
    const now = nowMs();
    if (now - this._lastScrollTickAt < 16) return;
    this._lastScrollTickAt = now;
    if (isNative() && !isAndroid()) await CapHaptics.selectionChanged();
    else if (isNative()) CapHaptics.impact({ style: ImpactStyle.Light });
    else vibrate(W.select);
  }

  /** End the scrub session — leak-safe (only closes a session it actually opened). */
  async selectionScrollEnd() {
    if (!this.enabled) return;
    if (isNative() && !isAndroid() && this._inSelectionSession) {
      try { await CapHaptics.selectionEnd(); }
      finally { this._inSelectionSession = false; }
    }
  }

  // ─── L4 · Notification types ──────────────────────────────────────────────

  /**
   * Success — genuine completion (save, send, seal, complete). Rising two-pulse arc.
   * Reserve for real outcomes — NOT routine taps.
   */
  async success() {
    if (!this._canRunSequence({ cooldownMs: 180 })) return;
    if (isNative()) CapHaptics.notification({ type: NotificationType.Success });
    else vibrate(W.success);
  }

  /**
   * Warning — pre-action caution ("are you sure?"). Two flat pulses.
   */
  async warning() {
    if (!this._canRunSequence({ cooldownMs: 180 })) return;
    if (isNative()) CapHaptics.notification({ type: NotificationType.Warning });
    else vibrate(W.warning);
  }

  /**
   * Error — a genuine failure or invalid input. Three descending pulses.
   * Never use for a deliberate destructive confirm (that's warning + destructive).
   */
  async error() {
    if (!this._canRunSequence({ cooldownMs: 220 })) return;
    if (isNative()) CapHaptics.notification({ type: NotificationType.Error });
    else vibrate(W.error);
  }

  // ─── Composed semantic sequences ────────────────────────────────────────

  /**
   * Toggle ON — a two-part detent: selection tick → 32ms → Light landing.
   */
  async toggleOn() {
    if (!this._canRunSequence({ cooldownMs: 160 })) return;
    if (isNative()) {
      if (isAndroid()) { CapHaptics.impact({ style: ImpactStyle.Light }); return; }
      await this._selectionTick();
      await wait(32);
      CapHaptics.impact({ style: ImpactStyle.Light });
    } else {
      vibrate([10, 32, 14]);
    }
  }

  /**
   * Toggle OFF — mirror of ON: Light release → 32ms → selection settle.
   */
  async toggleOff() {
    if (!this._canRunSequence({ cooldownMs: 160 })) return;
    if (isNative()) {
      if (isAndroid()) { CapHaptics.impact({ style: ImpactStyle.Light }); return; }
      CapHaptics.impact({ style: ImpactStyle.Light });
      await wait(32);
      await this._selectionTick();
    } else {
      vibrate([14, 32, 10]);
    }
  }

  /** Confirm — alias for success(). Cleanest name for save/confirm. */
  confirm = () => this.success();

  /** Destroy — alias for destructive(). The irreversible-commit beat (Heavy). */
  destroy = () => this.destructive();

  /**
   * Heartbeat — gentle single lub-dub. L4.
   * Pattern: Light @0ms → Medium @150ms (asymmetric, intimate — never a slam).
   * Impacts are fire-and-forget so Android bridge latency does not stretch the
   * gap; only the gap itself is awaited.
   * Use for: sending a heart, viewing a romantic memory.
   */
  async heartbeat() {
    if (!this._canRunSequence({ cooldownMs: 360 })) return;
    if (isNative()) {
      CapHaptics.impact({ style: ImpactStyle.Light });   // lub — soft
      await wait(150);
      CapHaptics.impact({ style: ImpactStyle.Medium });  // dub — gentle, felt
    } else {
      vibrate(W.heartbeat);
    }
  }

  /**
   * Double heartbeat — two gentle cardiac cycles. L4.
   * lub-dub → 520ms breath → lub-dub. Light→Medium, never a slam.
   * Use for: aura signal received, partner-online presence.
   */
  async doubleBeat() {
    if (!this._canRunSequence({ cooldownMs: 900 })) return;
    if (isNative()) {
      CapHaptics.impact({ style: ImpactStyle.Light });
      await wait(150);
      CapHaptics.impact({ style: ImpactStyle.Medium });
      await wait(520);
      CapHaptics.impact({ style: ImpactStyle.Light });
      await wait(150);
      CapHaptics.impact({ style: ImpactStyle.Medium });
    } else {
      vibrate(W.doubleBeat);
    }
  }

  /**
   * Celebrate — short, subtle 3-beat cascade. L5.
   * Light@0 → Light@45 → Medium@90 (tight, ~90ms, tops at Medium — no slam).
   * Scheduled at absolute offsets from one clock (not chained) so the arc holds
   * its shape even under the heavy canvas load a confetti burst causes.
   * Use for: milestone reached, streak, sealed-capsule reveal — rationed hard.
   */
  async celebrate() {
    if (!this._canRunSequence({ cooldownMs: 520 })) return;
    if (isNative()) {
      const beats: Array<[number, ImpactStyle]> = [
        [0,  ImpactStyle.Light],
        [45, ImpactStyle.Light],
        [90, ImpactStyle.Medium],
      ];
      for (const [ms, style] of beats) {
        setTimeout(() => CapHaptics.impact({ style }), ms);
      }
    } else {
      vibrate(W.celebrate);
    }
  }

  /**
   * Milestone — two soft taps. L5 (the quietest celebratory cue).
   * Pattern: Light → 55ms → Light.
   * Use for: streak/memory-count milestone where even celebrate is too much.
   */
  async milestone() {
    if (!this._canRunSequence({ cooldownMs: 360 })) return;
    if (isNative()) {
      CapHaptics.impact({ style: ImpactStyle.Light });
      await wait(55);
      CapHaptics.impact({ style: ImpactStyle.Light });
    } else {
      vibrate([12, 55, 12]);
    }
  }

  /**
   * Long-press progress — a subtle build as the hold fills (0 → 1).
   * Crossing thresholds are latched by the caller (attachLongPress); this method
   * just maps a progress value to the right intensity. Caps at Medium so the
   * charge stays gentle; the gentle Success notification is the climax:
   *   <0.5 → Light · 0.5–0.99 → Medium · 1.0 → Success
   * Has a web fallback so the charge is felt on Android-Chrome too.
   */
  async longPressProgress(progress: number) {
    if (!this._canRunSequence({ allowDuringScroll: true, cooldownMs: 120, key: 'longpress' })) return;
    if (isNative()) {
      if (progress >= 1.0)      CapHaptics.notification({ type: NotificationType.Success });
      else if (progress >= 0.5) CapHaptics.impact({ style: ImpactStyle.Medium });
      else                      CapHaptics.impact({ style: ImpactStyle.Light });
    } else {
      if (progress >= 1.0)      vibrate(W.success);
      else if (progress >= 0.5) vibrate(W.press);
      else                      vibrate(W.tap);
    }
  }

  /** Cancel any active web vibration. */
  cancel() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(0); } catch { /* ignore */ }
    }
  }
}

export const Haptics = new HapticsService();
Haptics.loadPrefs();
