import type { HeirloomMilestone } from '../../../services/heirlooms';

/**
 * Heirloom artists — deterministic generative artwork rendered to canvas.
 * Same couple + same milestone + same data = the same piece, forever.
 * Five styles, each composed like a print: artwork field, caption block,
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
    ctx.moveTo(cx - 70, HEIRLOOM_H - 268);
    ctx.lineTo(cx + 70, HEIRLOOM_H - 268);
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = `700 60px ${SERIF}`;
    ctx.fillText(m.title, cx, HEIRLOOM_H - 196);

    ctx.fillStyle = withAlpha(ink, 0.62);
    ctx.font = `500 32px ${SANS}`;
    ctx.fillText(`${data.myName} & ${data.partnerName}`, cx, HEIRLOOM_H - 150);

    // The engraving — one quiet italic line, chosen for this strike
    if (m.engraving) {
        let size = 27;
        ctx.font = `italic 500 ${size}px ${SERIF}`;
        while (size > 19 && ctx.measureText(m.engraving).width > HEIRLOOM_W - 220) {
            size -= 1;
            ctx.font = `italic 500 ${size}px ${SERIF}`;
        }
        ctx.fillStyle = withAlpha(ink, 0.55);
        ctx.fillText(m.engraving, cx, HEIRLOOM_H - 112);
    }

    ctx.fillStyle = withAlpha(ink, 0.4);
    ctx.font = `500 26px ${SANS}`;
    ctx.fillText(m.dateLabel, cx, HEIRLOOM_H - 76);

    // Strike mark — the collectible's serial
    ctx.fillStyle = withAlpha(accent, 0.8);
    ctx.font = `700 24px ${SANS}`;
    ctx.fillText(`L I O R   ·   No. ${String(m.strikeNo).padStart(3, '0')}`, cx, HEIRLOOM_H - 46);
};

/** Soft radial darkening toward the edges — gives every piece depth. */
const drawVignette = (ctx: CanvasRenderingContext2D, strength = 0.42, tint = '2,1,5') => {
    const g = ctx.createRadialGradient(
        HEIRLOOM_W / 2, HEIRLOOM_H * 0.42, HEIRLOOM_H * 0.22,
        HEIRLOOM_W / 2, HEIRLOOM_H * 0.48, HEIRLOOM_H * 0.8,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(${tint},${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, HEIRLOOM_W, HEIRLOOM_H);
};

/** Four-point diffraction spike — the photographic star glint. */
const drawSpike = (ctx: CanvasRenderingContext2D, x: number, y: number, len: number, color: string) => {
    const arm = (dx: number, dy: number, l: number) => {
        const g = ctx.createLinearGradient(x, y, x + dx * l, y + dy * l);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx * l, y + dy * l);
        ctx.stroke();
    };
    ctx.save();
    ctx.lineWidth = 1.8;
    arm(1, 0, len); arm(-1, 0, len); arm(0, 1, len); arm(0, -1, len);
    ctx.lineWidth = 1.1;
    const d = len * 0.45;
    arm(0.707, 0.707, d); arm(-0.707, 0.707, d); arm(0.707, -0.707, d); arm(-0.707, -0.707, d);
    ctx.restore();
};

// Grain is the LAST rng consumer in every style, so skipping it at small
// scales never shifts the random state that shaped the artwork itself —
// the piece stays deterministic. Below ~0.3 the speckle is sub-pixel
// (and usually veiled), so the 2,600 fillRects are pure waste there.
let grainScale = 1;

const drawGrain = (ctx: CanvasRenderingContext2D, rng: () => number, strength: number) => {
    if (grainScale < 0.3) return;
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

    // Milky way — a soft band of light crossing the sky diagonally
    ctx.save();
    ctx.translate(HEIRLOOM_W / 2, 520);
    ctx.rotate(-0.52 + rng() * 0.14);
    ctx.scale(1, 0.22);
    const band = ctx.createRadialGradient(0, 0, 0, 0, 0, 760);
    band.addColorStop(0, 'rgba(236,228,255,0.085)');
    band.addColorStop(0.55, 'rgba(220,206,245,0.045)');
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band;
    ctx.fillRect(-800, -800, 1600, 1600);
    const core = ctx.createRadialGradient(120, 0, 0, 120, 0, 320);
    core.addColorStop(0, 'rgba(255,244,229,0.07)');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.fillRect(-800, -800, 1600, 1600);
    ctx.restore();

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

    // Distant stars — a few of the brightest get photographic glints
    for (let i = 0; i < 340; i++) {
        const x = 70 + rng() * (HEIRLOOM_W - 140);
        const y = 70 + rng() * (HEIRLOOM_H - 360);
        const r = rng() * 1.5 + 0.3;
        const a = 0.12 + rng() * 0.3;
        ctx.fillStyle = `rgba(255,250,242,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (i % 47 === 0 && r > 1.1) {
            drawSpike(ctx, x, y, 10 + r * 6, `rgba(255,250,242,${a * 0.8})`);
        }
    }

    // One shooting star, caught mid-fall
    {
        const sx = 180 + rng() * 500;
        const sy = 160 + rng() * 220;
        const len = 150 + rng() * 110;
        const streak = ctx.createLinearGradient(sx, sy, sx + len, sy + len * 0.42);
        streak.addColorStop(0, 'rgba(0,0,0,0)');
        streak.addColorStop(0.8, 'rgba(255,250,240,0.5)');
        streak.addColorStop(1, 'rgba(255,255,252,0.9)');
        ctx.save();
        ctx.strokeStyle = streak;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + len, sy + len * 0.42);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,252,0.95)';
        ctx.beginPath();
        ctx.arc(sx + len, sy + len * 0.42, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Dark hills along the horizon — the sky belongs to somewhere real
    const hill = (base: number, amp: number, phase: number, fill: string, rim: string) => {
        ctx.beginPath();
        ctx.moveTo(0, HEIRLOOM_H);
        for (let x = 0; x <= HEIRLOOM_W; x += 12) {
            const y = base
                + Math.sin((x / HEIRLOOM_W) * Math.PI * 1.7 + phase) * amp
                + Math.sin((x / HEIRLOOM_W) * Math.PI * 4.3 + phase * 2) * amp * 0.3;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(HEIRLOOM_W, HEIRLOOM_H);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = rim;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let x = 0; x <= HEIRLOOM_W; x += 12) {
            const y = base
                + Math.sin((x / HEIRLOOM_W) * Math.PI * 1.7 + phase) * amp
                + Math.sin((x / HEIRLOOM_W) * Math.PI * 4.3 + phase * 2) * amp * 0.3;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    };
    const hillPhase = rng() * Math.PI * 2;
    hill(1006, 26, hillPhase, '#0b0a13', 'rgba(196,181,253,0.10)');
    hill(1046, 20, hillPhase + 1.6, '#080710', 'rgba(232,201,125,0.08)');

    // Their stars — one per memory (clamped), strung on a winding path
    const starCount = Math.max(7, Math.min(18, data.memoryCount || 9));
    const stars: Array<{ x: number; y: number; r: number }> = [];
    let px = 170 + rng() * 120;
    let py = 920 - rng() * 80;
    for (let i = 0; i < starCount; i++) {
        const t = i / (starCount - 1);
        px = 150 + t * (HEIRLOOM_W - 300) + (rng() - 0.5) * 130;
        py = 880 - t * 600 + Math.sin(t * Math.PI * (2 + rng())) * 120 + (rng() - 0.5) * 70;
        px = Math.max(120, Math.min(HEIRLOOM_W - 120, px));
        py = Math.max(150, Math.min(950, py));
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
        const isFirst = i === 0;
        const isLast = i === stars.length - 1;
        const tint = isFirst ? '#ffffff' : isLast ? '#e8c97d' : palette[i % palette.length];
        const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
        halo.addColorStop(0, withAlpha(tint, 0.55));
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isFirst ? '#fffdf7' : withAlpha(tint, 0.95);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        // Where it began and where they are now both get the glint
        if (isFirst) drawSpike(ctx, s.x, s.y, s.r * 5.4, 'rgba(255,253,247,0.85)');
        if (isLast) drawSpike(ctx, s.x, s.y, s.r * 4.6, 'rgba(243,220,164,0.8)');
    });

    drawVignette(ctx, 0.4);
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

    // Warm core the strata grow out of
    {
        const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 220);
        coreGlow.addColorStop(0, withAlpha(palette[0], 0.22));
        coreGlow.addColorStop(0.55, withAlpha(palette[1], 0.08));
        coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = coreGlow;
        ctx.fillRect(0, 0, HEIRLOOM_W, HEIRLOOM_H);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < months; i++) {
        const t = (i + 1) / months;
        const baseR = 56 + t * (maxR - 56);
        const tint = palette[i % palette.length];
        const wobbleSeed = rng() * Math.PI * 2;
        const wobbleAmp = 3 + rng() * 9;
        const lobes = 3 + Math.floor(rng() * 4);
        const isYearRing = (i + 1) % 12 === 0;

        const trace = () => {
            ctx.beginPath();
            for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.04) {
                const r = baseR + Math.sin(a * lobes + wobbleSeed) * wobbleAmp + Math.sin(a * 11 + wobbleSeed * 2) * 2;
                const x = cx + Math.cos(a) * r;
                const y = cy + Math.sin(a) * r * 0.96;
                if (a === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        };

        // Pass 1 — broad glow
        ctx.strokeStyle = withAlpha(tint, 0.2 - t * 0.06);
        ctx.shadowColor = withAlpha(tint, 0.55);
        ctx.shadowBlur = 22;
        ctx.lineWidth = 3.4 + (1 - t) * 2;
        trace();
        ctx.stroke();

        // Pass 2 — crisp filament riding the glow; year rings strike gold
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isYearRing
            ? 'rgba(243,220,164,0.6)'
            : withAlpha(tint, 0.34 - t * 0.08);
        ctx.lineWidth = isYearRing ? 1.8 : 1.1;
        trace();
        ctx.stroke();
    }

    // Dust between the strata — the years have texture
    for (let i = 0; i < 150; i++) {
        const a = rng() * Math.PI * 2;
        const rr = 60 + rng() * (maxR - 40);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.96;
        const tint = palette[Math.floor(rng() * palette.length)];
        ctx.fillStyle = withAlpha(tint, 0.05 + rng() * 0.2);
        ctx.beginPath();
        ctx.arc(x, y, 0.5 + rng() * 1.4, 0, Math.PI * 2);
        ctx.fill();
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

    drawVignette(ctx, 0.44);
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

    // Corner flourishes — pressed double angles, the printer's signature
    const flourish = (x: number, y: number, sx: number, sy: number) => {
        ctx.save();
        ctx.strokeStyle = withAlpha(ink, 0.55);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(x + 54 * sx, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + 54 * sy);
        ctx.stroke();
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + 40 * sx, y + 12 * sy);
        ctx.lineTo(x + 12 * sx, y + 12 * sy);
        ctx.lineTo(x + 12 * sx, y + 40 * sy);
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(x + 12 * sx, y + 12 * sy, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };
    flourish(96, 96, 1, 1);
    flourish(HEIRLOOM_W - 96, 96, -1, 1);
    flourish(96, HEIRLOOM_H - 96, 1, -1);
    flourish(HEIRLOOM_W - 96, HEIRLOOM_H - 96, -1, -1);

    // Top ornament
    ctx.fillStyle = withAlpha(ink, 0.75);
    ctx.font = `600 30px ${SANS}`;
    ctx.fillText('— ✦ —', cx, 220);
    ctx.font = `700 32px ${SANS}`;
    ctx.fillText('T O G E T H E R', cx, 290);

    // Double rules framing the numeral block, in pressed red
    const rule = (y: number) => {
        ctx.save();
        ctx.strokeStyle = withAlpha(accent, 0.55);
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(cx - 190, y);
        ctx.lineTo(cx + 190, y);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 190, y + 7);
        ctx.lineTo(cx + 190, y + 7);
        ctx.stroke();
        ctx.restore();
    };
    rule(352);
    rule(800);

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

    // Quiet ornament row before the caption block
    ctx.fillStyle = withAlpha(ink, 0.45);
    ctx.font = `600 24px ${SANS}`;
    ctx.fillText('✦   ✦   ✦', cx, 1010);

    drawVignette(ctx, 0.14, '64,46,20');
    drawGrain(ctx, rng, 0.04);
    drawFrame(ctx, ink);
    drawCaption(ctx, data, ink, accent);
};

/* ── Style IV: Orbit — two bodies, one gravity ──────────────────────── */

const renderOrbit = (ctx: CanvasRenderingContext2D, data: HeirloomRenderData, rng: () => number) => {
    const ROSE = '#ff5c7c';
    const VIOLET = '#8b5cf6';

    // Deep space, a shade bluer than the constellation night
    const bg = ctx.createLinearGradient(0, 0, 0, HEIRLOOM_H);
    bg.addColorStop(0, '#090a16');
    bg.addColorStop(0.5, '#0a0814');
    bg.addColorStop(1, '#0c0913');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, HEIRLOOM_W, HEIRLOOM_H);

    // Sparse starfield — much quieter than the constellation sky
    for (let i = 0; i < 150; i++) {
        const x = 70 + rng() * (HEIRLOOM_W - 140);
        const y = 70 + rng() * 1020;
        const r = 0.3 + rng() * 1.2;
        ctx.fillStyle = `rgba(255,250,242,${0.08 + rng() * 0.22})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Two far galaxies — other stories, very far away
    for (let i = 0; i < 2; i++) {
        const gx = 160 + rng() * (HEIRLOOM_W - 320);
        const gy = 140 + rng() * 420;
        const rot = rng() * Math.PI;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(rot);
        ctx.scale(1, 0.36);
        const gal = ctx.createRadialGradient(0, 0, 0, 0, 0, 54);
        gal.addColorStop(0, 'rgba(243,228,255,0.16)');
        gal.addColorStop(0.45, 'rgba(206,196,240,0.07)');
        gal.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gal;
        ctx.fillRect(-60, -60, 120, 120);
        ctx.restore();
    }

    // Two elliptical paths around a shared center, tilted against each other
    const cx = HEIRLOOM_W / 2;
    const cy = 590 + (rng() - 0.5) * 36;
    const a = 330 + rng() * 56;
    const b = 178 + rng() * 46;
    const tilt = 0.42 + rng() * 0.2;

    const pointOn = (sign: 1 | -1, u: number) => {
        const x0 = Math.cos(u) * a;
        const y0 = Math.sin(u) * b;
        const rot = tilt * sign;
        return {
            x: cx + x0 * Math.cos(rot) - y0 * Math.sin(rot),
            y: cy + x0 * Math.sin(rot) + y0 * Math.cos(rot),
        };
    };

    // Faint full paths, so the geometry reads as drawn, not accidental
    ctx.save();
    ([1, -1] as const).forEach((sign) => {
        ctx.strokeStyle = withAlpha(sign === 1 ? ROSE : VIOLET, 0.1);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let u = 0; u <= Math.PI * 2 + 0.06; u += 0.05) {
            const p = pointOn(sign, u);
            if (u === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    });
    ctx.restore();

    // Where the two paths cross on the long axis — the meeting point
    const uStar = Math.atan(-(a / b) * Math.tan(tilt));
    const meet = pointOn(1, uStar);

    // Trails: each body sweeps in along its own path, fading behind it.
    // `dir` is the direction of travel, so the pair mirror one another and
    // converge on the meeting point from above and below.
    const span = Math.PI * (0.9 + rng() * 0.22);
    const gap = 0.17;
    const drawTrail = (sign: 1 | -1, head: number, dir: 1 | -1, tint: string) => {
        const segs = 64;
        ctx.save();
        ctx.lineCap = 'round';
        for (let k = 0; k < segs; k++) {
            const t0 = k / segs;
            const t1 = (k + 1) / segs;
            const p0 = pointOn(sign, head - dir * span * (1 - t0));
            const p1 = pointOn(sign, head - dir * span * (1 - t1));
            ctx.strokeStyle = withAlpha(tint, Math.pow(t1, 1.7) * 0.6 + 0.02);
            ctx.lineWidth = 1.1 + t1 * 2.8;
            if (t1 > 0.72) {
                ctx.shadowColor = withAlpha(tint, 0.55);
                ctx.shadowBlur = 12;
            } else {
                ctx.shadowBlur = 0;
            }
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
        }
        ctx.restore();
    };
    drawTrail(1, uStar - gap, 1, ROSE);
    drawTrail(-1, -uStar + gap, -1, VIOLET);

    // Dust shed along each trail — travel leaves traces
    const shedDust = (sign: 1 | -1, head: number, dir: 1 | -1, tint: string) => {
        for (let i = 0; i < 16; i++) {
            const t = rng();
            const p = pointOn(sign, head - dir * span * (1 - t));
            const jx = (rng() - 0.5) * 26;
            const jy = (rng() - 0.5) * 26;
            ctx.fillStyle = withAlpha(tint, Math.pow(t, 1.4) * 0.4 + 0.03);
            ctx.beginPath();
            ctx.arc(p.x + jx, p.y + jy, 0.7 + rng() * 1.6, 0, Math.PI * 2);
            ctx.fill();
        }
    };
    shedDust(1, uStar - gap, 1, ROSE);
    shedDust(-1, -uStar + gap, -1, VIOLET);

    // The two of them, holding just short of the meeting point
    const drawBody = (p: { x: number; y: number }, tint: string, r: number) => {
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6);
        halo.addColorStop(0, withAlpha(tint, 0.5));
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 6, 0, Math.PI * 2);
        ctx.fill();
        const core = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, 0, p.x, p.y, r);
        core.addColorStop(0, '#fffdf7');
        core.addColorStop(1, tint);
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    };
    drawBody(pointOn(1, uStar - gap), ROSE, 9);
    drawBody(pointOn(-1, -uStar + gap), VIOLET, 8);

    // The bright meeting point, one breath ahead of both
    ctx.save();
    const flare = ctx.createRadialGradient(meet.x, meet.y, 0, meet.x, meet.y, 64);
    flare.addColorStop(0, 'rgba(255,253,247,0.95)');
    flare.addColorStop(0.25, 'rgba(255,217,225,0.4)');
    flare.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = flare;
    ctx.beginPath();
    ctx.arc(meet.x, meet.y, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,253,247,0.8)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(meet.x - 30, meet.y);
    ctx.lineTo(meet.x + 30, meet.y);
    ctx.moveTo(meet.x, meet.y - 30);
    ctx.lineTo(meet.x, meet.y + 30);
    ctx.stroke();
    ctx.fillStyle = '#fffdf7';
    ctx.beginPath();
    ctx.arc(meet.x, meet.y, 5, 0, Math.PI * 2);
    ctx.fill();
    // Ripples spreading from the meeting point
    ctx.strokeStyle = 'rgba(255,253,247,0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(meet.x, meet.y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,253,247,0.12)';
    ctx.beginPath();
    ctx.arc(meet.x, meet.y, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Day numeral, small, at the shared center of gravity
    const label = data.milestone.kind === 'year'
        ? `Y E A R  ${data.milestone.value}`
        : `D A Y  ${data.dayCount.toLocaleString()}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,250,240,0.55)';
    ctx.font = `700 26px ${SANS}`;
    ctx.fillText(label, cx, cy + 9);

    drawVignette(ctx, 0.42);
    drawGrain(ctx, rng, 0.05);
    drawFrame(ctx, '#fffaf0');
    drawCaption(ctx, data, '#fffaf0', '#ff8fa6');
};

/* ── Style V: Tapestry — their weeks, woven into cloth ──────────────── */

const renderTapestry = (ctx: CanvasRenderingContext2D, data: HeirloomRenderData, rng: () => number) => {
    const palette = paletteFrom(data.moods, rng);

    const bg = ctx.createLinearGradient(0, 0, 0, HEIRLOOM_H);
    bg.addColorStop(0, '#130f15');
    bg.addColorStop(1, '#0b0a10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, HEIRLOOM_W, HEIRLOOM_H);

    // One warp thread per week of the relationship
    const weeks = Math.max(16, Math.min(64, Math.ceil(Math.max(1, data.dayCount) / 7)));
    const left = 130;
    const right = HEIRLOOM_W - 130;
    const top = 170;
    const bottom = 1064;
    const fieldW = right - left;
    const fieldH = bottom - top;
    const pitch = fieldW / weeks;
    const threadW = Math.max(5, pitch * 0.74);
    const rows = 34;
    const rowH = fieldH / rows;

    // Warm under-cloth so the gaps between threads read as fibre, not void
    ctx.fillStyle = 'rgba(201,179,154,0.05)';
    ctx.fillRect(left - 10, top - 6, fieldW + 20, fieldH + 12);
    for (let r = 0; r < rows; r += 2) {
        ctx.fillStyle = 'rgba(201,179,154,0.045)';
        ctx.fillRect(left - 10, top + r * rowH, fieldW + 20, rowH);
    }

    // Selvedge bands above and below the weave
    ctx.fillStyle = withAlpha(palette[0], 0.4);
    ctx.fillRect(left - 12, top - 26, fieldW + 24, 5);
    ctx.fillStyle = withAlpha(palette[1], 0.28);
    ctx.fillRect(left - 12, top - 16, fieldW + 24, 3);
    ctx.fillStyle = withAlpha(palette[1], 0.28);
    ctx.fillRect(left - 12, bottom + 13, fieldW + 24, 3);
    ctx.fillStyle = withAlpha(palette[0], 0.4);
    ctx.fillRect(left - 12, bottom + 21, fieldW + 24, 5);

    // Warp threads, colors drifting through their real mood palette in runs
    const threadTints: string[] = [];
    let ci = Math.floor(rng() * palette.length);
    const edge = Math.min(2, threadW * 0.2);
    for (let t = 0; t < weeks; t++) {
        if (rng() < 0.24) ci = (ci + 1 + Math.floor(rng() * (palette.length - 1))) % palette.length;
        const tint = palette[ci];
        threadTints.push(tint);
        const x = left + t * pitch + (pitch - threadW) / 2;
        ctx.fillStyle = withAlpha(tint, 0.5 + rng() * 0.18);
        ctx.fillRect(x, top, threadW, fieldH);
        // Cylindrical shading: lit left edge, shaded right edge
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.fillRect(x, top, edge, fieldH);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x + threadW - edge, top, edge, fieldH);
        // Over / under weave cells — the checker that makes it cloth
        for (let r = 0; r < rows; r++) {
            const y = top + r * rowH;
            if ((t + r) % 2 === 1) {
                ctx.fillStyle = 'rgba(8,6,9,0.34)';
                ctx.fillRect(x - 0.5, y, threadW + 1, rowH);
            } else {
                ctx.fillStyle = 'rgba(255,251,244,0.07)';
                ctx.fillRect(x, y + 1, threadW, 2);
            }
        }
    }

    // Weft grooves — the horizontal rhythm of the loom
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let r = 0; r <= rows; r++) {
        ctx.fillRect(left - 10, top + r * rowH - 0.5, fieldW + 20, 1);
    }

    // Fringe — every thread ends in a loose tail below the bottom selvedge
    ctx.save();
    ctx.lineCap = 'round';
    for (let t = 0; t < weeks; t++) {
        const x = left + t * pitch + pitch / 2;
        const lean = (rng() - 0.5) * 7;
        const len = 16 + rng() * 14;
        ctx.strokeStyle = withAlpha(threadTints[t], 0.42);
        ctx.lineWidth = Math.min(2.4, threadW * 0.4);
        ctx.beginPath();
        ctx.moveTo(x, bottom + 28);
        ctx.quadraticCurveTo(x + lean * 0.4, bottom + 28 + len * 0.6, x + lean, bottom + 28 + len);
        ctx.stroke();
    }
    ctx.restore();

    // Luminous knots — one per memory (clamped), resting on "over" cells
    const knots = Math.max(5, Math.min(18, data.memoryCount || 7));
    for (let i = 0; i < knots; i++) {
        const t = Math.floor(rng() * weeks);
        let r = 1 + Math.floor(rng() * (rows - 2));
        if ((t + r) % 2 === 1) r -= 1;
        const kx = left + t * pitch + pitch / 2;
        const ky = top + r * rowH + rowH / 2;
        const tint = threadTints[t];
        const glow = ctx.createRadialGradient(kx, ky, 0, kx, ky, 16);
        glow.addColorStop(0, withAlpha(tint, 0.8));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(kx, ky, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff7ea';
        ctx.beginPath();
        ctx.arc(kx, ky, 3.2, 0, Math.PI * 2);
        ctx.fill();
    }

    drawVignette(ctx, 0.34);
    drawGrain(ctx, rng, 0.045);
    drawFrame(ctx, '#fffaf0');
    drawCaption(ctx, data, '#fffaf0', palette[0]);
};

/* ── Entry ──────────────────────────────────────────────────────────── */

export function renderHeirloom(canvas: HTMLCanvasElement, data: HeirloomRenderData, pixelScale = 1): void {
    canvas.width = Math.round(HEIRLOOM_W * pixelScale);
    canvas.height = Math.round(HEIRLOOM_H * pixelScale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    grainScale = pixelScale;

    const rng = mulberry32(data.milestone.seed);
    if (data.milestone.style === 'rings') renderRings(ctx, data, rng);
    else if (data.milestone.style === 'letterpress') renderLetterpress(ctx, data, rng);
    else if (data.milestone.style === 'orbit') renderOrbit(ctx, data, rng);
    else if (data.milestone.style === 'tapestry') renderTapestry(ctx, data, rng);
    else renderConstellation(ctx, data, rng);
}
