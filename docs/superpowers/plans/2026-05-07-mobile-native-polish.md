# Mobile Native Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lior feel more like a deliberate Capacitor mobile app by tightening the native shell, plugin surface, safe-area/keyboard behavior, haptics, and first native media picking path.

**Architecture:** Keep the web app as the product shell, but move platform-specific behavior behind small services. `NativeShellService` owns app lifecycle, status bar, keyboard, network, and back button state. A new native media helper owns Capacitor Camera/Gallery access and falls back to browser file inputs.

**Tech Stack:** React, Vite, Capacitor 8, Android WebView, TypeScript assertion tests.

---

### Task 1: Capacitor Plugin Integrity

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `capacitor.config.ts`
- Test: `tests/nativeShellIntegrity.assert.mjs`

- [ ] Install `@capacitor/network`, `@capacitor/local-notifications`, and `@capacitor/camera` at Capacitor-compatible versions.
- [ ] Keep dynamic imports in services so the browser preview remains safe.
- [ ] Add assertions that declared native plugins match services that import them.

### Task 2: Native Shell Lifecycle

**Files:**
- Modify: `services/nativeShell.ts`
- Modify: `App.tsx`
- Test: `tests/nativeShellIntegrity.assert.mjs`

- [ ] Add a first-stable-paint splash helper so `SplashScreen.hide()` happens after two animation frames.
- [ ] Add theme-aware status bar sync using the current `data-theme`.
- [ ] Keep keyboard height exported as `--lior-keyboard-height`.
- [ ] Keep hardware back routed through app navigation before minimizing.

### Task 3: Native Touch Feel

**Files:**
- Modify: `components/BottomNav.tsx`
- Test: `tests/nativeShellIntegrity.assert.mjs`

- [ ] Add light haptic feedback to bottom navigation taps.
- [ ] Keep the keyboard-open nav hide behavior.
- [ ] Avoid heavier motion or extra animations.

### Task 4: Native Media Picker Helper

**Files:**
- Create: `services/nativeMedia.ts`
- Modify: `views/AddMemory.tsx`
- Test: `tests/nativeMediaIntegrity.assert.mjs`

- [ ] Add `pickNativePhoto()` that uses Capacitor Camera/Gallery on native and returns `null` on web.
- [ ] Wire Add Memory photo picking through the native helper before falling back to the hidden file input.
- [ ] Keep existing file-input upload handling unchanged for browser and video.

### Task 5: Verification

**Files:**
- Test: assertion suite and TypeScript/lint/build scripts

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck:app`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
