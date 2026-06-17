package com.lior.app;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * LiorHaptics — Apple-grade Android haptics.
 *
 * Capacitor's stock Haptics.impact() sends a hand-rolled createWaveform
 * (LIGHT = 50ms @ 43% amplitude — LONGER than MEDIUM @ 43ms), which reads as a
 * mushy buzz rather than a crisp tap. This plugin instead reaches for the
 * crispest primitive the device + OS can render, in descending order of quality:
 *
 *   1. VibrationEffect.Composition      (API 30/31+) — OEM-tuned PRIMITIVE_*
 *                                        ticks/clicks, amplitude-scaled. The
 *                                        closest Android gets to Apple's Taptic feel.
 *   2. VibrationEffect.createPredefined (API 29+)    — OEM-tuned EFFECT_TICK /
 *                                        EFFECT_CLICK / EFFECT_HEAVY_CLICK.
 *   3. VibrationEffect.createOneShot    (API 26+)    — short pulse with amplitude
 *                                        control when the actuator supports it.
 *   4. Vibrator.vibrate(ms)             (< API 26)   — legacy fallback.
 *
 * Levels: "tick" (whisper / selection) < "light" < "medium" < "heavy".
 * The JS layer (services/haptics.ts) calls impact({ level }) and silently falls
 * back to the stock @capacitor/haptics path when this plugin is unavailable.
 */
@CapacitorPlugin(name = "LiorHaptics")
public class LiorHapticsPlugin extends Plugin {

    private Vibrator vibrator;
    private boolean amplitudeControl = false;

    @Override
    public void load() {
        Context ctx = getContext();
        if (ctx == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (manager != null) vibrator = manager.getDefaultVibrator();
        } else {
            vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        }

        if (vibrator != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            amplitudeControl = vibrator.hasAmplitudeControl();
        }
    }

    @PluginMethod
    public void impact(PluginCall call) {
        String level = call.getString("level", "light");
        try {
            fire(level);
        } catch (Exception ignored) {
            // A haptic must never crash the bridge — degrade silently.
        }
        call.resolve();
    }

    private void fire(String level) {
        if (vibrator == null || !vibrator.hasVibrator()) return;

        // 1. Composition primitives — richest, OEM-tuned, amplitude-scaled.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            int primitive = primitiveFor(level);
            if (vibrator.areAllPrimitivesSupported(primitive)) {
                VibrationEffect effect = VibrationEffect.startComposition()
                    .addPrimitive(primitive, scaleFor(level))
                    .compose();
                vibrator.vibrate(effect);
                return;
            }
        }

        // 2. Predefined OEM effects.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            vibrator.vibrate(VibrationEffect.createPredefined(predefinedFor(level)));
            return;
        }

        // 3. Short one-shot, amplitude-controlled where supported.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            int amplitude = amplitudeControl ? amplitudeFor(level) : VibrationEffect.DEFAULT_AMPLITUDE;
            vibrator.vibrate(VibrationEffect.createOneShot(durationFor(level), amplitude));
            return;
        }

        // 4. Legacy devices (< Android 8).
        legacyVibrate(durationFor(level));
    }

    @SuppressWarnings("deprecation")
    private void legacyVibrate(long ms) {
        vibrator.vibrate(ms);
    }

    // ── Per-tier mappings ─────────────────────────────────────────────────

    private int primitiveFor(String level) {
        switch (level) {
            case "tick":
                // PRIMITIVE_LOW_TICK (API 31) is the subtlest; fall back to TICK.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    return VibrationEffect.Composition.PRIMITIVE_LOW_TICK;
                }
                return VibrationEffect.Composition.PRIMITIVE_TICK;
            case "medium":
            case "heavy":
                return VibrationEffect.Composition.PRIMITIVE_CLICK;
            case "light":
            default:
                return VibrationEffect.Composition.PRIMITIVE_TICK;
        }
    }

    /** Amplitude scale (0..1) applied to the composition primitive. */
    private float scaleFor(String level) {
        switch (level) {
            case "tick":   return 0.4f;
            case "medium": return 0.8f;
            case "heavy":  return 1.0f;
            case "light":
            default:       return 0.6f;
        }
    }

    private int predefinedFor(String level) {
        switch (level) {
            case "medium": return VibrationEffect.EFFECT_CLICK;
            case "heavy":  return VibrationEffect.EFFECT_HEAVY_CLICK;
            case "tick":
            case "light":
            default:       return VibrationEffect.EFFECT_TICK;
        }
    }

    /** Amplitude (1..255) for the createOneShot fallback when the actuator allows it. */
    private int amplitudeFor(String level) {
        switch (level) {
            case "tick":   return 60;
            case "medium": return 170;
            case "heavy":  return 240;
            case "light":
            default:       return 110;
        }
    }

    /** Duration (ms) for the createOneShot / legacy fallbacks — kept short and crisp. */
    private long durationFor(String level) {
        switch (level) {
            case "tick":   return 8L;
            case "medium": return 16L;
            case "heavy":  return 24L;
            case "light":
            default:       return 12L;
        }
    }
}
