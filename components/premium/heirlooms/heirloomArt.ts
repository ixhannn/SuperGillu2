import type { HeirloomMilestone } from '../../../services/heirlooms';

/**
 * Heirloom artists — deterministic generative artwork rendered to canvas.
 * Same couple + same milestone + same data = the same piece, forever.
 * Three styles, each composed like a print: artwork field, caption block,
 * frame, grain. Output is 1080×1440 (3:4) — share- and print-friendly.
 */

export interface HeirloomRenderData {
    milestone: HeirloomMilestone;
    myName: string;
    partnerName: string;
    /** Days together at the moment of the strike. */
    dayCount: number;
    /** Recent mood strings — tints the piece toward their real palette. */
    moods: string[];
    memoryCount: number;
}

export const HEIRLOOM_W = 1080;
export const HEIRLOOM_H = 1440;

/* ── Deterministic PRNG ─────────────────────────────────────────────── */

const mulberry32 = (seed: number) => {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/* ── Brand palette, tinted by their real moods ──────────────────────── */

const MOOD_TINTS: Record<string, string> = {
    happy: '#f6c768',
    love: '#ff5c7c',
    excited: '#ff8fa6',
    calm: '#7c9cff',
    tired: '#8b5cf6',
    sad: '#5c7cff',
    angry: '#e23d60',
    anxious: '#9d7cff',
    grateful: '#e8c97d',
    playful: '#5eead4',
};

const FALLBACK_TINTS = ['#ff5c7c', '#8b5cf6', '#7c9cff', '#e8c97d', '#5eead4'];

const paletteFrom = (moods: string[], rng: () => number): string[] => {
    const seen = new Set<string>();
    const palette: string[] = [];
    for (const mood of moods) {
        const tint = MOOD_TINTS[mood?.toLowerCase?.() ?? ''];
        if (tint && !seen.has(tint)) {
            seen.add(tint);
            palette.push(tint);
        }
        if (palette.length >= 4) break;
    }
    while (palette.length < 4) {
        const pick = FALLBACK_TINTS[Math.floor(rng() * FALLBACK_TINTS.length)];
        if (!seen.has(pick)) {
            seen.add(pick);
            palette.push(pick);
        }
    }
    return palette;
};

const withAlpha = (hex: string, alpha: number): string => {
    const v = hex.replace('#', '');
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
};

/* ── Shared furniture: frame, caption, grain ────────────────────────── */

const SERIF = '"Bricolage Grotesque", "Afacad Flux", sans-serif';
const SANS = '"Afacad Flux", "Bricolage Grotesque", sans-serif';

const drawFrame = (ctx: CanvasRenderingContext2D, ink: string) => {
    ctx.strokeStyle = withAlpha(ink, 0.5);
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, HEIRLOOM_W - 84, HEIRLOOM_H - 84);
    ctx.strokeStyle = withAlpha(ink, 0.16);
    ctx.lineWidth = 1;
    ctx.strokeRect(58, 58, HEIRLOOM_W - 116, HEIRLOOM_H - 116);
};

const drawCaption = (
    ctx: CanvasRenderingContext2D,
    data: HeirloomRenderData,
    ink: string,
    accent: string,
) => {
    const cx = HEIRLOOM_W / 2;
    const m = data.milestone;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // Hairline above the caption block
    ctx.strokeStyle = withAlpha(accent, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 70, HEIRLOOM_H - 250);
    ctx.lineTo(cx + 70, HEIRLOOM_H - 250);
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = `700 64px ${SERIF}`;
    ctx.fillText(m.title, cx, HEIRLOOM_H - 178);

    ctx.fillStyle = withAlpha(ink, 0.62);
    ctx.font = `500 34px ${SANS}`;
    ctx.fillText(`${data.myName} & ${data.partnerName}`, cx, HEIRLOOM_H - 128);

    ctx.fillStyle = withAlpha(ink, 0.4);
    ctx.font = `500 27px ${SANS}`;
    ctx.fillText(m.dateLabel, cx, HEIRLOOM_H - 88);

    // Strike mark — the collectible's serial
    ctx.fillStyle = withAlpha(accent, 0.8);
    ctx.font = `700 24px ${SANS}`;
    ctx.fillText(`L I O R   ·   No. ${String(m.strikeNo).padStart(3, '0')}`, cx, HEIRLOOM_H - 50 + 4);
};

const drawGrain = (ctx: CanvasRenderingContext2D, rng: () => number, strength: number) => {
    ctx.save();
    ctx.globalAlpha = strength;
    for (let i = 0; i < 2600; i++) {
        const x = rng() * HEIRLOOM_W;
        const y = rng() * HEIRLOOM_H;
        const l = Math.floor(rng() * 255);
        ctx.fillStyle = `rgb(${l},${l},${l})`;
        ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.restore();
};

/* ── Style I: Constellation — memories as a sky ─────────────────────── */

const renderConstellation = (ctx: CanvasRenderingContext2D, data: HeirloomRenderData, rng: () => number) => {
    const palette = paletteFrom(data.moods, rng);

    // Night field
    const bg = ctx.createLinearGradient(0, 0, 0, HEIRLOOM_H);
    bg.addColorStop(0, '#0b0c16');
    bg.addColorStop(0.55, '#0a0810');
    bg.addColorStop(1, '#0e0a14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, HEIRLOOM_W, HEIRLOOM_H);

    // Nebula breaths
    for (let i = 0; i < 3; i++) {
        const gx = 200 + rng() * (HEIRLOOM_W - 400);
        const gy = 200 + rng() * (HEIRLOOM_H - 700);
        const r = 260 + rng() * 240;
        const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        glow.addColorStop(0, withAlpha(palette[i % palette.length], 0.1));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, HEIRLOOM_W, HEIRLOOM_H);
    }

    // Distant stars
    for (let i = 0; i < 340; i++) {
        const x = 70 + rng() * (HEIRLOOM_W - 140);
        const y = 70 + rng() * (HEIRLOOM_H - 360);
        const r = rng() * 1.5 + 0.3;
        ctx.fillStyle = `rgba(255,250,242,${0.12 + rng() * 0.3})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Their stars — one per memory (clamped), strung on a winding path
    const starCount = Math.max(7, Math.min(18, data.memoryCount || 9));
    const stars: Array<{ x: number; y: number; r: number }> = [];
    let px = 170 + rng() * 120;
    let py = 980 - rng() * 80;
    for (let i = 0; i < starCount; i++) {
        const t = i / (starCount - 1);
        px = 150 + t * (HEIRLOOM_W - 300) + (rng() - 0.5) * 130;
        py = 950 - t * 660 + Math.sin(t * Math.PI * (2 + rng())) * 130 + (rng() - 0.5) * 70;
        px = Math.max(120, Math.min(HEIRLOOM_W - 120, px));
        py = Math.max(150, Math.min(1030, py));
        stars.push({ x: px, y: py, r: 4 + rng() * 6 });
    }

    // The thread between them
    ctx.save();
    ctx.strokeStyle = withAlpha('#e8c97d', 0.5);
    ctx.shadowColor = withAlpha('#e8c97d', 0.7);
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(stars[0].x, stars[0].y);
    for (let i = 1; i < stars.length; i++) {
        const prev = stars[i - 1];
        const cur = stars[i];
        const mx = (prev.x + cur.x) / 2;
        const my = (prev.y + cur.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    ctx.lineTo(stars[stars.length - 1].x, stars[stars.length - 1].y);
    ctx.stroke();
    ctx.restore();

    // The stars themselves
    stars.forEach((s, i) => {
        const tint = i === 0 ? '#ffffff' : palette[i % palette.length];
        const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
        halo.addColorStop(0, withAlpha(tint, 0.55));
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = i === 0 ? '#fffdf7' : withAlpha(tint, 0.95);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        // First star gets the cross sparkle — where it all began
        if (i === 0) {
            ctx.strokeStyle = 'rgba(255,253,247,0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(s.x - s.r * 4.6, s.y);
            ctx.lineTo(s.x + s.r * 4.6, s.y);
            ctx.moveTo(s.x, s.y - s.r * 4.6);
            ctx.lineTo(s.x, s.y + s.r * 4.6);
            ctx.stroke();
        }
    });

    drawGrain(ctx, rng, 0.05);
    drawFrame(ctx, '#fffaf0');
    drawCaption(ctx, data, '#fffaf0', '#e8c97d');
};

/* ── Style II: Rings — time as strata ───────────────────────────────── */

const renderRings = (ctx: CanvasRenderingContext2D, data: HeirloomRenderData, rng: () => number) => {
    const palette = paletteFrom(data.moods, rng);

    const bg = ctx.createLinearGradient(0, 0, 0, HEIRLOOM_H);
    bg.addColorStop(0, '#0d0a12');
    bg.addColorStop(1, '#090810');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, HEIRLOOM_W, HEIRLOOM_H);

    const cx = HEIRLOOM_W / 2;
    const cy = 600;
    const months = Math.max(6, Math.min(26, Math.ceil(data.dayCount / 30)));
    const maxR = 420;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < months; i++) {
        const t = (i + 1) / months;
        const baseR = 56 + t * (maxR - 56);
        const tint = palette[i % palette.length];
        const wobbleSeed = rng() * Math.PI * 2;
        const wobbleAmp = 3 + rng() * 9;
        const lobes = 3 + Math.floor(rng() * 4);

        ctx.strokeStyle = withAlpha(tint, 0.34 - t * 0.1);
        ctx.shadowColor = withAlpha(tint, 0.5);
        ctx.shadowBlur = 16;
        ctx.lineWidth = 2.6 + (1 - t) * 2;
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.04) {
            const r = baseR + Math.sin(a * lobes + wobbleSeed) * wobbleAmp + Math.sin(a * 11 + wobbleSeed * 2) * 2;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r * 0.96;
            if (a === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    ctx.restore();

    // Center: the count, struck like a coin face
    ctx.textAlign = 'center';
    const label = data.milestone.kind === 'year' ? `${data.milestone.value}` : data.dayCount.toLocaleString();
    ctx.fillStyle = '#fffaf0';
    ctx.font = `800 ${label.length > 4 ? 120 : 150}px ${SERIF}`;
    ctx.shadowColor = withAlpha(palette[0], 0.65);
    ctx.shadowBlur = 36;
    ctx.fillText(label, cx, cy + 48);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,250,240,0.55)';
    ctx.font = `600 30px ${SANS}`;
    ctx.fillText(data.milestone.kind === 'year' ? (data.milestone.value === 1 ? 'YEAR' : 'YEARS') : 'DAYS', cx, cy + 104);

    drawGrain(ctx, rng, 0.05);
    drawFrame(ctx, '#fffaf0');
    drawCaption(ctx, data, '#fffaf0', palette[0]);
};

/* ── Style III: Letterpress — ink on cream, the certificate ─────────── */

const renderLetterpress = (ctx: CanvasRenderingContext2D, data: HeirloomRenderData, rng: () => number) => {
    const ink = '#221b14';
    const accent = '#b3563f';

    const bg = ctx.createLinearGradient(0, 0, 0, HEIRLOOM_H);
    bg.addColorStop(0, '#f6ecdb');
    bg.addColorStop(1, '#efe2cc');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, HEIRLOOM_W, HEIRLOOM_H);

    // Paper mottle
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 70; i++) {
        const x = rng() * HEIRLOOM_W;
        const y = rng() * HEIRLOOM_H;
        const r = 30 + rng() * 110;
        const spot = ctx.createRadialGradient(x, y, 0, x, y, r);
        spot.addColorStop(0, '#b09a78');
        spot.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = spot;
        ctx.fillRect(0, 0, HEIRLOOM_W, HEIRLOOM_H);
    }
    ctx.restore();

    const cx = HEIRLOOM_W / 2;
    ctx.textAlign = 'center';

    // Top ornament
    ctx.fillStyle = withAlpha(ink, 0.75);
    ctx.font = `600 30px ${SANS}`;
    ctx.fillText('— ✦ —', cx, 220);
    ctx.font = `700 32px ${SANS}`;
    ctx.fillText('T O G E T H E R', cx, 290);

    // The numeral, pressed deep
    const numeral = data.milestone.kind === 'year' ? String(data.milestone.value) : data.dayCount.toLocaleString();
    const numeralSize = numeral.length > 4 ? 250 : numeral.length > 3 ? 290 : 360;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,250,0.75)';
    ctx.font = `800 ${numeralSize}px ${SERIF}`;
    ctx.fillText(numeral, cx + 3, 660 + 3);
    ctx.fillStyle = ink;
    ctx.fillText(numeral, cx, 660);
    ctx.restore();

    ctx.fillStyle = withAlpha(ink, 0.8);
    ctx.font = `700 44px ${SERIF}`;
    ctx.fillText(data.milestone.kind === 'year' ? (data.milestone.value === 1 ? 'WHOLE YEAR' : 'WHOLE YEARS') : 'DAYS, EVERY ONE KEPT', cx, 760);

    // Red wax accent dot
    ctx.save();
    ctx.fillStyle = accent;
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, 880, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f6ecdb';
    ctx.font = `700 26px ${SERIF}`;
    ctx.fillText('L', cx, 890);

    drawGrain(ctx, rng, 0.04);
    drawFrame(ctx, ink);
    drawCaption(ctx, data, ink, accent);
};

/* ── Entry ──────────────────────────────────────────────────────────── */

export function renderHeirloom(canvas: HTMLCanvasElement, data: HeirloomRenderData, pixelScale = 1): void {
    canvas.width = Math.round(HEIRLOOM_W * pixelScale);
    canvas.height = Math.round(HEIRLOOM_H * pixelScale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);

    const rng = mulberry32(data.milestone.seed);
    if (data.milestone.style === 'rings') renderRings(ctx, data, rng);
    else if (data.milestone.style === 'letterpress') renderLetterpress(ctx, data, rng);
    else renderConstellation(ctx, data, rng);
}
