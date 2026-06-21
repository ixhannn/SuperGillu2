// Quiet Mode — ambient colour helpers
// ─────────────────────────────────────────────────────────────────────────────
// Pure colour utilities shared by the view and the ambient backdrop. No DOM, no
// React — safe to unit test. The accent colour drives the whole "the room takes
// on the mood of this memory" feel: sampled from a photo when one exists, or
// derived from the memory's mood when it doesn't (so text-only memories still
// get a warm, intentional glow instead of looking empty).

export interface RGB { r: number; g: number; b: number; }

/** Default rose — the brand's warm accent, used before anything is sampled. */
export const ROSE: RGB = { r: 251, g: 113, b: 133 };

// A small, warm-leaning palette mapped from the app's mood vocabulary. Vivid on
// purpose — the backdrop softens them heavily (screen blend + big blur).
const MOOD_RGB: Record<string, RGB> = {
  love: { r: 244, g: 63, b: 94 }, loved: { r: 244, g: 63, b: 94 }, romantic: { r: 251, g: 113, b: 133 },
  cute: { r: 244, g: 114, b: 182 }, tender: { r: 236, g: 72, b: 153 },
  happy: { r: 245, g: 158, b: 11 }, joyful: { r: 250, g: 204, b: 21 }, content: { r: 245, g: 158, b: 11 },
  grateful: { r: 245, g: 158, b: 11 }, funny: { r: 250, g: 204, b: 21 },
  excited: { r: 249, g: 115, b: 22 }, party: { r: 249, g: 115, b: 22 },
  peace: { r: 45, g: 212, b: 191 }, peaceful: { r: 45, g: 212, b: 191 }, calm: { r: 56, g: 189, b: 248 },
  thoughtful: { r: 167, g: 139, b: 250 }, reflective: { r: 167, g: 139, b: 250 }, quiet: { r: 167, g: 139, b: 250 },
};

/** Mood → a warm accent colour. Falls back to rose. */
export function moodColor(mood?: string): RGB {
  if (!mood) return ROSE;
  return MOOD_RGB[mood.toLowerCase()] ?? ROSE;
}

export const rgbStr = (c: RGB, alpha = 1): string => `rgba(${c.r},${c.g},${c.b},${alpha})`;

/** Mix two colours; t=0 → a, t=1 → b. */
export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

const NEAR_BLACK: RGB = { r: 8, g: 5, b: 11 };

/**
 * The deep, near-black base gradient with the faintest wash of the accent at the
 * top — the same "contained pool of light" language as the Aura screen.
 */
export function baseGradient(accent: RGB): string {
  const top = mixRGB(NEAR_BLACK, accent, 0.16);
  return `radial-gradient(130% 120% at 50% 22%, ${rgbStr(top)} 0%, #0a0710 50%, #050308 100%)`;
}
