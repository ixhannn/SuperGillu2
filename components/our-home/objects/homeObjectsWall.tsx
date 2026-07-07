/**
 * OUR HOME — wall pieces (isometric).
 *
 * Frames that hold a memory, a taped-up postcard, and the little drum clock
 * that keeps both partners' hours on one face. Hand-inked storybook style:
 * INK outlines, flat fills plus one darker sibling-shade, deliberate wobble.
 *
 * Local coords: each piece is drawn FLAT around (0,0) = its hang point
 * (x spans the width, negative y is up), then the whole drawing is laid onto
 * the wall plane — facing 0 hangs on the LEFT wall (WALL_SKEW_L), facing 1
 * on the RIGHT wall (WALL_SKEW_R).
 */
import React from 'react';
import {
  INK,
  INK_SOFT,
  INK_GOLD,
  CREAM_WALL,
  PAPER,
  PAPER_SHADE,
  BRASS,
  BRASS_BRIGHT,
  WALNUT,
  WALNUT_DEEP,
  LINEN_SHADE,
  ROSE,
  ROSE_PALE,
  WINE,
  SW,
  SW_FINE,
  SW_HAIR,
  wobblyLine,
  seedFrom,
} from '../homeArt';
import { WALL_SKEW_L, WALL_SKEW_R, shade } from '../homeIso';
import type { ObjectArtProps } from '../homeTypes';

/** facing 0 = the left wall, facing 1 = the right wall. */
const wallSkew = (facing: number): string => (facing === 1 ? WALL_SKEW_R : WALL_SKEW_L);

/* ── Shared: the photo window every frame opens onto ─────────── */

/** A faint hand-drawn heart, waiting where a photo will one day live. */
const heartPath = (cx: number, cy: number, s: number): string => {
  const f = (n: number): string => n.toFixed(1);
  return [
    `M ${f(cx)} ${f(cy + s * 1.15)}`,
    `C ${f(cx - s * 1.9)} ${f(cy - s * 0.5)} ${f(cx - s * 0.85)} ${f(cy - s * 1.55)} ${f(cx)} ${f(cy - s * 0.55)}`,
    `C ${f(cx + s * 0.85)} ${f(cy - s * 1.55)} ${f(cx + s * 1.9)} ${f(cy - s * 0.5)} ${f(cx)} ${f(cy + s * 1.15)}`,
    'Z',
  ].join(' ');
};

interface FrameWindowProps {
  x: number;
  y: number;
  w: number;
  h: number;
  clipId: string;
  photoHref?: string;
}

/**
 * The opening inside a frame: the couple's duotone photo under a warm
 * ROSE_PALE cast, or — while it waits — paper with a faint heart outline.
 */
const FrameWindow = ({ x, y, w, h, clipId, photoHref }: FrameWindowProps): React.JSX.Element => (
  <g>
    <clipPath id={clipId}>
      <rect x={x} y={y} width={w} height={h} />
    </clipPath>
    {photoHref ? (
      <g>
        <image
          href={photoHref}
          x={x}
          y={y}
          width={w}
          height={h}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${clipId})`}
        />
        <rect x={x} y={y} width={w} height={h} fill={ROSE_PALE} opacity={0.25} />
      </g>
    ) : (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={PAPER} />
        <path
          d={heartPath(x + w / 2, y + h / 2, Math.min(w, h) * 0.18)}
          fill="none"
          stroke={INK_SOFT}
          strokeWidth={SW_FINE}
          opacity={0.6}
        />
      </g>
    )}
    {/* the glass over the memory: two slanted glints catching the room light */}
    <g clipPath={`url(#${clipId})`}>
      <path
        d={`M ${(x + w * 0.52).toFixed(1)} ${y} L ${(x + w * 0.72).toFixed(1)} ${y} L ${(x + w * 0.2).toFixed(1)} ${y + h} L ${(x + w * 0.06).toFixed(1)} ${y + h} Z`}
        fill="#fff6e6"
        opacity={0.1}
      />
      <path
        d={`M ${(x + w * 0.82).toFixed(1)} ${y} L ${(x + w * 0.9).toFixed(1)} ${y} L ${(x + w * 0.4).toFixed(1)} ${y + h} L ${(x + w * 0.34).toFixed(1)} ${y + h} Z`}
        fill="#fff6e6"
        opacity={0.07}
      />
    </g>
    <rect x={x} y={y} width={w} height={h} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
  </g>
);

/* ── Brass frame — 30 × 38, slim profile, window 22 × 28 ──────── */

const BRASS_SEED = seedFrom('oh-brassframe');

export const BrassFrameArt = ({ facing, photoHref }: ObjectArtProps): React.JSX.Element => (
  <g transform={wallSkew(facing)} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-brassframe-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(BRASS, 0.2)} />
        <stop offset="1" stopColor={shade(BRASS, -0.06)} />
      </linearGradient>
      <linearGradient id="oh-brassframe-g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={shade(PAPER, 0.05)} />
        <stop offset="1" stopColor={shade(PAPER, -0.04)} />
      </linearGradient>
    </defs>
    {/* slim brass profile, softly lit from the upper right */}
    <rect x={-15} y={-38} width={30} height={38} rx={1.2} fill="url(#oh-brassframe-g0)" stroke={INK} strokeWidth={SW} />
    {/* the bottom rail turns from the light and cools */}
    <path d="M -13.6 -1.2 L 13.6 -1.2" fill="none" stroke={shade(BRASS, -0.3)} strokeWidth={1.1} opacity={0.5} />
    {/* paper mat with a bright inner lip */}
    <rect x={-13} y={-36} width={26} height={34} fill="url(#oh-brassframe-g1)" stroke={BRASS_BRIGHT} strokeWidth={SW_HAIR} />
    {/* the mat's soft shadow gathering down its far-from-light side */}
    <path d="M -12.4 -35 L -12.4 -3" fill="none" stroke={INK} strokeWidth={1} opacity={0.07} />
    {/* a hand-wobbled sheen along the top rail */}
    <path
      d={wobblyLine(-13.5, -37, 13.5, -37, BRASS_SEED * 10, 0.25)}
      fill="none"
      stroke={BRASS_BRIGHT}
      strokeWidth={SW_HAIR}
      opacity={0.8}
    />
    {/* rim light along the edge that faces the lamp */}
    <path d="M -13.8 -37.7 L 13.8 -37.7" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.4} />
    {/* one crisp specular down the lit right rail, and a bright dot on its shoulder */}
    <path d="M 14 -35 L 14 -12" fill="none" stroke={BRASS_BRIGHT} strokeWidth={0.8} opacity={0.85} />
    <circle cx={13} cy={-36.4} r={1.1} fill="#fff3dc" opacity={0.55} />
    <FrameWindow x={-11} y={-33} w={22} h={28} clipId="oh-brassframe-iso-clip" photoHref={photoHref} />
    {/* the frame's own shadow tucked under its top lip */}
    <rect x={-11} y={-33} width={22} height={2.2} fill={INK} opacity={0.11} />
  </g>
);

/* ── Walnut frame — 40 × 32 landscape, window 30 × 20 ─────────── */

const WALNUT_SEED = seedFrom('oh-walnutframe');

export const WalnutFrameArt = ({ facing, photoHref }: ObjectArtProps): React.JSX.Element => (
  <g transform={wallSkew(facing)} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-walnutframe-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(WALNUT, 0.14)} />
        <stop offset="1" stopColor={shade(WALNUT, -0.05)} />
      </linearGradient>
    </defs>
    {/* wide flat walnut profile with a soft sheen */}
    <rect x={-20} y={-32} width={40} height={32} rx={1.4} fill="url(#oh-walnutframe-g0)" stroke={INK} strokeWidth={SW} />
    {/* the bottom rail settles into its own shadow */}
    <path d="M -18.5 -1.1 L 18.5 -1.1" fill="none" stroke="#3a2518" strokeWidth={1.2} opacity={0.12} />
    {/* varnish highlight crescent on the top rail */}
    <path d="M 4 -30.4 Q 11 -30.9 17 -30.2" fill="none" stroke={shade(WALNUT, 0.32)} strokeWidth={1} opacity={0.85} />
    {/* rim light where the top edge faces the lamp */}
    <path d="M -18.6 -31.5 L 18.6 -31.5" fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.38} />
    {/* woodgrain along the top and bottom rails */}
    <path
      d={wobblyLine(-17, -29.6, 17, -29.6, WALNUT_SEED * 7, 0.35)}
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
      opacity={0.55}
    />
    <path
      d={wobblyLine(-17, -2.4, 17, -2.4, WALNUT_SEED * 13, 0.35)}
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
      opacity={0.55}
    />
    {/* end-grain running down the stiles — darker on the shaded left */}
    <path d="M -18.2 -28.6 Q -18.7 -16 -18.1 -3.6" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.4} />
    <path d="M 18.1 -28.6 Q 18.6 -16 18 -3.6" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.28} />
    {/* deep inner bevel */}
    <rect x={-16} y={-27} width={32} height={22} fill={WALNUT_DEEP} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    {/* the bevel's lower lip catches a sliver of light */}
    <path d="M -14.6 -5.6 L 14.6 -5.6" fill="none" stroke={shade(WALNUT_DEEP, 0.28)} strokeWidth={0.7} opacity={0.6} />
    <FrameWindow x={-15} y={-26} w={30} h={20} clipId="oh-walnutframe-iso-clip" photoHref={photoHref} />
    {/* the bevel's shadow tucked under the top rail */}
    <rect x={-15} y={-26} width={30} height={2} fill={INK} opacity={0.11} />
  </g>
);

/* ── Postcard — 16 × 22, dog-eared, taped to the wall ─────────── */

const POSTCARD_SEED = seedFrom('oh-postcard');

export const PostcardArt = ({ facing }: ObjectArtProps): React.JSX.Element => (
  <g transform={wallSkew(facing)} strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <linearGradient id="oh-postcard-g0" x1="0.8" y1="0" x2="0.2" y2="1">
        <stop offset="0" stopColor={shade(PAPER, 0.12)} />
        <stop offset="1" stopColor={shade(PAPER, -0.03)} />
      </linearGradient>
    </defs>
    {/* card, dog-eared at the bottom-right corner */}
    <path d="M -8 -22 L 8 -22 L 8 -4.5 L 3.5 0 L -8 0 Z" fill="url(#oh-postcard-g0)" stroke={INK} strokeWidth={SW} />
    {/* the lifted fold throws a soft shadow back onto the card */}
    <path d="M 3.5 -4.4 L 3.5 -0.3 L 1.1 -0.8 Z" fill="#3a2518" opacity={0.11} />
    <path d="M 8 -4.5 L 3.5 0 L 3.5 -4.5 Z" fill={PAPER_SHADE} stroke={INK} strokeWidth={SW_FINE} />
    {/* warm edge tick where the paper turns from the light */}
    <path d="M -7.4 -0.7 L 2.9 -0.7" fill="none" stroke={shade(PAPER_SHADE, -0.08)} strokeWidth={0.8} opacity={0.9} />
    {/* hairlines of paper thickness along the card's edges */}
    <path d="M 7.4 -21.3 L 7.4 -5" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.35} />
    <path d="M -7.4 -21.3 L -7.4 -0.9" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.25} />
    {/* a tiny rose stamp, its lower edge turned from the light */}
    <rect x={2.4} y={-19.5} width={4.2} height={4.8} fill={ROSE} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
    <rect x={3.3} y={-18.6} width={2.4} height={3} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.6} />
    <path d="M 2.6 -14.9 L 6.4 -14.9" fill="none" stroke={shade(ROSE, -0.22)} strokeWidth={0.7} opacity={0.8} />
    {/* the faded postmark that carried it home */}
    <circle cx={1.4} cy={-16.8} r={3.1} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.35} />
    {/* scribbled lines of a message we never read */}
    <path
      d={wobblyLine(-6, -13, 4.5, -13, POSTCARD_SEED * 11, 0.5)}
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
    />
    <path
      d={wobblyLine(-6, -10.2, 6, -10.2, POSTCARD_SEED * 17, 0.5)}
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
    />
    <path
      d={wobblyLine(-6, -7.4, 1, -7.4, POSTCARD_SEED * 23, 0.5)}
      fill="none"
      stroke={INK_SOFT}
      strokeWidth={SW_HAIR}
    />
    {/* each tape corner presses a soft shadow into the card first */}
    <g transform="translate(-7.4 -20.1) rotate(-45)">
      <rect x={-3.5} y={-1.4} width={7} height={2.8} fill="#3a2518" opacity={0.1} />
    </g>
    <g transform="translate(6.6 -20.1) rotate(45)">
      <rect x={-3.5} y={-1.4} width={7} height={2.8} fill="#3a2518" opacity={0.1} />
    </g>
    {/* two tape corners holding it to the wall, each with a waxy sheen */}
    <g transform="translate(-7 -20.5) rotate(-45)">
      <rect x={-3.5} y={-1.4} width={7} height={2.8} fill={LINEN_SHADE} opacity={0.9} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <path d="M -3.1 -0.6 L 3.1 -0.6" fill="none" stroke="#fff6e6" strokeWidth={0.6} opacity={0.45} />
    </g>
    <g transform="translate(7 -20.5) rotate(45)">
      <rect x={-3.5} y={-1.4} width={7} height={2.8} fill={LINEN_SHADE} opacity={0.9} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <path d="M -3.1 -0.6 L 3.1 -0.6" fill="none" stroke="#fff6e6" strokeWidth={0.6} opacity={0.45} />
    </g>
  </g>
);

/* ── Two-times clock — 26 × 30, both hours on one paper face ──── */

interface ClockPair {
  h: number;
  m: number;
}

const CLOCK_DEFAULT: readonly [ClockPair, ClockPair] = [
  { h: 7, m: 10 },
  { h: 22, m: 40 },
];

/** Parse "HH:MM|HH:MM" (two 24h times); any malformed input falls back whole. */
const parseClockTimes = (vState?: string): readonly [ClockPair, ClockPair] => {
  if (!vState) return CLOCK_DEFAULT;
  const parts = vState.split('|');
  if (parts.length !== 2) return CLOCK_DEFAULT;
  const pairs: ClockPair[] = [];
  for (const part of parts) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(part.trim());
    if (!match) return CLOCK_DEFAULT;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return CLOCK_DEFAULT;
    pairs.push({ h, m });
  }
  const a = pairs[0];
  const b = pairs[1];
  if (!a || !b) return CLOCK_DEFAULT;
  return [a, b];
};

const hourAngle = (p: ClockPair): number => ((p.h % 12) / 12) * 360 + (p.m / 60) * 30;
const minuteAngle = (p: ClockPair): number => (p.m / 60) * 360;

/** Twelve tick marks, majors at 12 / 3 / 6 / 9 — computed once. */
const CLOCK_TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  const major = i % 3 === 0;
  const inner = major ? 7.7 : 8.5;
  return {
    x1: Number((Math.sin(a) * inner).toFixed(2)),
    y1: Number((-Math.cos(a) * inner).toFixed(2)),
    x2: Number((Math.sin(a) * 9.4).toFixed(2)),
    y2: Number((-Math.cos(a) * 9.4).toFixed(2)),
    major,
  };
});

export const TwoTimesClockArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => {
  const [first, second] = parseClockTimes(vState);
  return (
    <g transform={wallSkew(facing)} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="oh-clock-g0" x1="0.8" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor={shade(BRASS, 0.22)} />
          <stop offset="1" stopColor={shade(BRASS, -0.08)} />
        </linearGradient>
        <linearGradient id="oh-clock-g1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(PAPER, 0.06)} />
          <stop offset="1" stopColor={shade(PAPER, -0.05)} />
        </linearGradient>
      </defs>
      {/* hanging loop, dimmed underneath and kissed by the light above */}
      <circle cx={0} cy={-27.6} r={2} fill={BRASS} stroke={INK} strokeWidth={SW_FINE} />
      <path d="M -1.4 -26.2 A 2 2 0 0 0 1.4 -26.2" fill="none" stroke={shade(BRASS, -0.3)} strokeWidth={0.8} opacity={0.6} />
      <circle cx={0} cy={-27.6} r={0.8} fill={CREAM_WALL} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <circle cx={0.7} cy={-28.4} r={0.55} fill="#fff3dc" opacity={0.6} />
      {/* small brass drum, paper face */}
      <circle cx={0} cy={-13} r={13} fill="url(#oh-clock-g0)" stroke={INK} strokeWidth={SW} />
      {/* the drum's underside falls away from the light */}
      <path d="M -8.6 -4.4 A 12.2 12.2 0 0 0 8.6 -4.4" fill="none" stroke={shade(BRASS, -0.32)} strokeWidth={1.1} opacity={0.5} />
      <circle cx={0} cy={-13} r={11.4} fill="none" stroke={BRASS_BRIGHT} strokeWidth={SW_HAIR} />
      {/* one crisp specular on the bezel's lit shoulder */}
      <path d="M 3.5 -24.7 A 12.2 12.2 0 0 1 10.2 -19.7" fill="none" stroke={BRASS_BRIGHT} strokeWidth={1} opacity={0.9} />
      <circle cx={0} cy={-13} r={10.2} fill="url(#oh-clock-g1)" stroke={INK} strokeWidth={SW_FINE} />
      {/* the bezel's soft shadow pooled on the paper */}
      <path d="M -7 -20.4 A 10.2 10.2 0 0 1 7 -20.4" fill="none" stroke={INK} strokeWidth={2} opacity={0.09} />
      <g transform="translate(0 -13)">
        {CLOCK_TICKS.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={INK}
            strokeWidth={t.major ? SW_FINE : SW_HAIR}
          />
        ))}
        {/* the first partner's hands, in wine */}
        <line x1={0} y1={1.5} x2={0} y2={-5.4} stroke={WINE} strokeWidth={SW} transform={`rotate(${hourAngle(first)})`} />
        <line
          x1={0}
          y1={1.9}
          x2={0}
          y2={-7.9}
          stroke={WINE}
          strokeWidth={SW_FINE}
          transform={`rotate(${minuteAngle(first)})`}
        />
        {/* the second partner's hands, in dusty gold */}
        <line
          x1={0}
          y1={1.5}
          x2={0}
          y2={-5}
          stroke={INK_GOLD}
          strokeWidth={SW}
          transform={`rotate(${hourAngle(second)})`}
        />
        <line
          x1={0}
          y1={1.9}
          x2={0}
          y2={-7.4}
          stroke={INK_GOLD}
          strokeWidth={SW_FINE}
          transform={`rotate(${minuteAngle(second)})`}
        />
        {/* the hands' shadow pooled under the cap, then a glint on its crown */}
        <circle cx={0.4} cy={0.5} r={1.6} fill="#3a2518" opacity={0.12} />
        <circle cx={0} cy={0} r={1.1} fill={INK} />
        <circle cx={-0.35} cy={-0.35} r={0.45} fill="#fff3dc" opacity={0.55} />
      </g>
    </g>
  );
};
