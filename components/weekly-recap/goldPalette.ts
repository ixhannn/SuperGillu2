import type { RecapMoodBucket, RecapPalette } from '../../types';

/**
 * Weekly Story · duotone derivation.
 *
 * The recap palettes were designed for light paper backgrounds. The gold
 * redesign keeps every week's personality but restages it on the dark
 * stage: each palette's accent hue is lifted toward warm white so it reads
 * against near-black, and a family of translucent tints (glow / soft /
 * border) is derived from that lifted accent.
 */

export interface RecapDuotone {
    /** Lifted accent — readable on the dark gold stage. */
    accent: string;
    /** Strong radial-glow tint for full-bleed backdrops. */
    glow: string;
    /** Faint fill for tinted surfaces. */
    soft: string;
    /** Hairline border tint. */
    border: string;
}

/** Warm white the stage already leans on (rgba(255,246,230,…) family). */
const WARM_WHITE = { r: 255, g: 248, b: 238 } as const;

const GOLD_FALLBACK_HEX = '#f3cd86';

interface Rgb {
    r: number;
    g: number;
    b: number;
}

function hexToRgb(hex: string): Rgb | null {
    const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!match) return null;
    const n = parseInt(match[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }: Rgb): string {
    const channel = (c: number) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
    return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Lift a light-palette accent toward warm white so it stays legible on the
 * dark stage. Returns the gold fallback for anything unparseable.
 */
export function liftAccent(hex: string, amount = 0.42): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return GOLD_FALLBACK_HEX;
    return rgbToHex({
        r: rgb.r + (WARM_WHITE.r - rgb.r) * amount,
        g: rgb.g + (WARM_WHITE.g - rgb.g) * amount,
        b: rgb.b + (WARM_WHITE.b - rgb.b) * amount,
    });
}

/** Hand-tuned lifts for the six known mood buckets (formula as fallback). */
const LIFTED_BY_BUCKET: Record<RecapMoodBucket, string> = {
    warm: '#f0a37b',
    quiet: '#a8c0da',
    playful: '#f48cb8',
    contemplative: '#ab9ce0',
    intense: '#f4836f',
    tender: '#e596a9',
};

function buildDuotone(accentHex: string): RecapDuotone {
    const rgb = hexToRgb(accentHex) ?? hexToRgb(GOLD_FALLBACK_HEX) as Rgb;
    const tint = (alpha: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    return {
        accent: accentHex,
        glow: tint(0.2),
        soft: tint(0.09),
        border: tint(0.3),
    };
}

/** Default duotone — pure Lior Gold (used while a recap is loading). */
export const GOLD_DUOTONE: RecapDuotone = buildDuotone(GOLD_FALLBACK_HEX);

/**
 * Derive the dark-stage duotone for a week's palette. Every week keeps its
 * own hue; the dark base stays constant so the wing feels like one place.
 */
export function deriveDuotone(palette?: RecapPalette | null): RecapDuotone {
    if (!palette) return GOLD_DUOTONE;
    const lifted = LIFTED_BY_BUCKET[palette.id] ?? liftAccent(palette.accent);
    return buildDuotone(lifted);
}
