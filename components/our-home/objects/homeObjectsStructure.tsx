/**
 * OUR HOME — the bones, now furnishable.
 *
 * The room starts as a completely bare box; even its windows, front door and
 * hearth are pieces the couple places themselves. A window hung on the left
 * wall holds THIS device's sky; hung on the right, the partner's — the scene
 * passes the sky through vState as "top|horizon|o|c" (o = curtains open).
 * The door carries the couple's nameplate (vState) and a pencil tick per year
 * (detail). The hearth is a freestanding chimney whose coals are the couple's
 * lifetime of answered questions (detail 0–3, vState 'lit' tonight).
 */
import React from 'react';
import {
  BRASS, BRASS_BRIGHT, CANDLE_GOLD, CREAM_WALL, EMBER, EMBER_DEEP, INK,
  INK_SOFT, LINEN, LINEN_SHADE, SW, SW_FINE, SW_HAIR, WALNUT, WALNUT_DEEP,
  seedFrom, wobblyLine,
} from '../homeArt';
import { TILE_H, TILE_W, WALL_SKEW_L, WALL_SKEW_R, isoBoxFaces, shade } from '../homeIso';
import type { ObjectArtProps } from '../homeTypes';

/** 1px near-white rim just inside a top face's north→east edge — the edge
 *  that greets the upper-right room light (same language as the soft goods). */
const litEdge = (w: number, d: number, h: number): string => {
  const nx = ((d - w) * TILE_W) / 4;
  const ny = (-(w + d) * TILE_H) / 4 - h;
  const ex = ((w + d) * TILE_W) / 4;
  const ey = ((w - d) * TILE_H) / 4 - h;
  const ax = nx + (ex - nx) * 0.07;
  const ay = ny + (ey - ny) * 0.07 + 1;
  const bx = nx + (ex - nx) * 0.93;
  const by = ny + (ey - ny) * 0.93 + 1;
  return `M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)}`;
};

/* ── the window (tw 3 → 60 flat px wide) ─────────────────────── */

const parseWindowState = (vState?: string): { top: string; horizon: string; open: boolean } => {
  const parts = (vState ?? '').split('|');
  const hex = (s: string | undefined, fb: string) => (s && /^#[0-9a-fA-F]{6}$/.test(s) ? s : fb);
  return {
    top: hex(parts[0], '#aac4d4'),
    horizon: hex(parts[1], '#e9e2cf'),
    open: parts[2] !== 'c',
  };
};

export const WindowArt = ({ facing, vState }: ObjectArtProps): React.JSX.Element => {
  const { top, horizon, open } = parseWindowState(vState);
  const gid = `oh-win-${top.slice(1)}-${horizon.slice(1)}`;
  const W = 58;
  const H = 76;
  return (
    <g transform={facing === 1 ? WALL_SKEW_R : WALL_SKEW_L} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={horizon} />
        </linearGradient>
        {/* soft fabric sheen so drawn drapes read as folded linen, not a flat panel */}
        <linearGradient id={`${gid}-fab`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={shade(LINEN, -0.14)} />
          <stop offset="0.32" stopColor={shade(LINEN, 0.06)} />
          <stop offset="0.62" stopColor={shade(LINEN, -0.05)} />
          <stop offset="1" stopColor={shade(LINEN, -0.16)} />
        </linearGradient>
        {/* painted frame catches the room light above, settles darker below */}
        <linearGradient id="gwn-frame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(LINEN, 0.05)} />
          <stop offset="1" stopColor={shade(LINEN, -0.09)} />
        </linearGradient>
      </defs>
      {/* frame + glass */}
      <rect x={-W / 2} y={-H} width={W} height={H} fill="url(#gwn-frame)" stroke={INK} strokeWidth={SW_FINE} />
      <line x1={-W / 2 + 1.5} y1={-H + 1.2} x2={W / 2 - 1.5} y2={-H + 1.2} stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
      <rect x={-W / 2 + 4} y={-H + 4} width={W - 8} height={H - 10} fill={`url(#${gid})`} stroke={INK} strokeWidth={SW_FINE} />
      {/* a far rooftop line so the sky reads as a world */}
      <path
        d={`M ${-W / 2 + 4} ${-26} L ${-W / 2 + 16} ${-26} L ${-W / 2 + 19} ${-32} L ${-W / 2 + 30} ${-32} L ${-W / 2 + 33} ${-27} L ${W / 2 - 4} ${-27}`}
        fill="none" stroke={top} strokeWidth={2.2} opacity={0.55}
      />
      {/* two diagonal glints so the pane reads as glass, not paint */}
      <path d={`M ${-W / 2 + 4} -26 L 7 ${-H + 4} L 15 ${-H + 4} L ${-W / 2 + 4} -14 Z`} fill={CREAM_WALL} opacity={0.18} />
      <path d={`M -2 -6 L ${W / 2 - 4} -44 L ${W / 2 - 4} -36 L 4 -6 Z`} fill={CREAM_WALL} opacity={0.12} />
      {/* the frame's own shadow settles into the pane's top-left */}
      <path d={`M ${-W / 2 + 5} -7 L ${-W / 2 + 5} ${-H + 5} L ${W / 2 - 5} ${-H + 5}`} fill="none" stroke="#3a2518" strokeWidth={2.2} opacity={0.12} />
      {/* muntins */}
      <line x1={0} y1={-H + 5} x2={0} y2={-7} stroke={INK} strokeWidth={SW_HAIR} opacity={0.8} />
      <line x1={-W / 2 + 4} y1={-H / 2 - 3} x2={W / 2 - 4} y2={-H / 2 - 3} stroke={INK} strokeWidth={SW_HAIR} opacity={0.8} />
      {/* sill ledge */}
      <rect x={-W / 2 - 4} y={-7} width={W + 8} height={7} rx={2} fill={shade(LINEN, -0.08)} stroke={INK} strokeWidth={SW_HAIR} />
      <line x1={-W / 2 - 3} y1={-6.3} x2={W / 2 + 3} y2={-6.3} stroke="#fff6e6" strokeWidth={0.9} opacity={0.4} />
      <rect x={-W / 2 - 4} y={-2} width={W + 8} height={2} fill={LINEN_SHADE} stroke="none" />
      {/* the sill's soft shadow on the wall beneath it */}
      <rect x={-W / 2 - 3.5} y={0.5} width={W + 7} height={2.4} fill="#3a2518" opacity={0.1} />
      {/* curtains — gathered when open, drawn as folded linen when closed */}
      <g className={`oh-curtain ${open ? 'is-open' : ''}`}>
        <g className="oh-curtain-l" style={{ transformOrigin: `${-W / 2 - 5}px ${-H - 6}px` }}>
          <rect x={-W / 2 - 5} y={-H - 4} width={W / 2 + 6} height={H} rx={2} fill={`url(#${gid}-fab)`} stroke={INK} strokeWidth={SW_HAIR} opacity={0.99} />
          {[-9, -3, 3, 9].map((dx, i) => (
            <line key={i} x1={-W / 4 + dx} y1={-H + 2} x2={-W / 4 + dx} y2={-9}
              stroke={i % 2 ? shade(LINEN, 0.1) : LINEN_SHADE} strokeWidth={SW_HAIR} opacity={0.85} />
          ))}
          {/* a plumper catch of light on the gathered belly */}
          <path d={`M ${-W / 2 + 2} ${-H + 6} q -1.8 30 0 60`} fill="none" stroke={shade(LINEN, 0.16)} strokeWidth={2.4} opacity={0.35} />
          {/* folds pool a little shade just above the hem */}
          <path d={`M ${-W / 2 - 5} ${-9} q 4 3 8 0 q 4 3 8 0 q 4 3 8 0 q 4 3 7 0`} fill="none" stroke="#3a2518" strokeWidth={1.4} opacity={0.1} />
          {/* a soft scalloped hem */}
          <path d={`M ${-W / 2 - 5} ${-6} q 4 4 8 0 q 4 4 8 0 q 4 4 8 0 q 4 4 7 0`} fill="none" stroke={LINEN_SHADE} strokeWidth={SW_HAIR} opacity={0.7} />
        </g>
        <g className="oh-curtain-r" style={{ transformOrigin: `${W / 2 + 5}px ${-H - 6}px` }}>
          <rect x={-1} y={-H - 4} width={W / 2 + 6} height={H} rx={2} fill={`url(#${gid}-fab)`} stroke={INK} strokeWidth={SW_HAIR} opacity={0.99} />
          {[-9, -3, 3, 9].map((dx, i) => (
            <line key={i} x1={W / 4 + dx} y1={-H + 2} x2={W / 4 + dx} y2={-9}
              stroke={i % 2 ? shade(LINEN, 0.1) : LINEN_SHADE} strokeWidth={SW_HAIR} opacity={0.85} />
          ))}
          <path d={`M ${W / 2 - 1} ${-H + 6} q 1.8 30 0 60`} fill="none" stroke={shade(LINEN, 0.16)} strokeWidth={2.4} opacity={0.35} />
          <path d={`M -1 ${-9} q 4 3 8 0 q 4 3 8 0 q 4 3 8 0 q 4 3 7 0`} fill="none" stroke="#3a2518" strokeWidth={1.4} opacity={0.1} />
          <path d={`M ${-1} ${-6} q 4 4 8 0 q 4 4 8 0 q 4 4 8 0 q 4 4 7 0`} fill="none" stroke={LINEN_SHADE} strokeWidth={SW_HAIR} opacity={0.7} />
        </g>
        {/* brass rod + finials */}
        <line x1={-W / 2 - 8} y1={-H - 6} x2={W / 2 + 8} y2={-H - 6} stroke={BRASS} strokeWidth={2.4} strokeLinecap="round" />
        <circle cx={-W / 2 - 8} cy={-H - 6} r={2.6} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
        <circle cx={W / 2 + 8} cy={-H - 6} r={2.6} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
        {/* one crisp glint along the rod's lit shoulder, a settled underside */}
        <line x1={-W / 2 - 6} y1={-H - 5} x2={W / 2 + 6} y2={-H - 5} stroke={shade(BRASS, -0.28)} strokeWidth={0.7} opacity={0.5} />
        <line x1={8} y1={-H - 6.7} x2={24} y2={-H - 6.7} stroke="#fff3dc" strokeWidth={0.9} opacity={0.6} />
        <circle cx={-W / 2 - 8.7} cy={-H - 6.7} r={0.8} fill="#fff3dc" opacity={0.6} />
        <circle cx={W / 2 + 7.3} cy={-H - 6.7} r={0.8} fill="#fff3dc" opacity={0.6} />
      </g>
    </g>
  );
};

/* ── the front door (tw 2 → 40 flat px wide) ─────────────────── */

export const FrontDoorArt = ({ facing, vState, detail }: ObjectArtProps): React.JSX.Element => {
  const W = 42;
  const H = 118;
  const nameplate = (vState ?? '').slice(0, 22);
  const ticks = Math.min(Math.max(Math.floor(detail ?? 0), 0), 12);
  return (
    <g transform={facing === 1 ? WALL_SKEW_R : WALL_SKEW_L} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="oh-frontdoor-g1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(WALNUT, 0.09)} />
          <stop offset="0.55" stopColor={WALNUT} />
          <stop offset="1" stopColor={shade(WALNUT, -0.08)} />
        </linearGradient>
        <linearGradient id="gfd-frame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(LINEN, 0.02)} />
          <stop offset="1" stopColor={shade(LINEN, -0.13)} />
        </linearGradient>
      </defs>
      {/* frame */}
      <rect x={-W / 2 - 4} y={-H - 4} width={W + 8} height={H + 4} fill="url(#gfd-frame)" stroke={INK} strokeWidth={SW_FINE} />
      <line x1={-W / 2 - 2.5} y1={-H - 3} x2={W / 2 + 2.5} y2={-H - 3} stroke="#fff6e6" strokeWidth={1} opacity={0.4} />
      {/* leaf */}
      <rect x={-W / 2} y={-H} width={W} height={H} fill="url(#oh-frontdoor-g1)" stroke={INK} strokeWidth={SW} />
      {/* recessed panels — a breath darker, bevelled by the light */}
      <rect x={-W / 2 + 5} y={-H + 10} width={W - 10} height={40} rx={2} fill={shade(WALNUT, -0.06)} stroke={WALNUT_DEEP} strokeWidth={SW_FINE} />
      <path d={`M ${-W / 2 + 6.5} ${-H + 48.5} L ${-W / 2 + 6.5} ${-H + 11.5} L ${W / 2 - 6.5} ${-H + 11.5}`} fill="none" stroke="#3a2518" strokeWidth={1.4} opacity={0.13} />
      <line x1={-W / 2 + 6.5} y1={-H + 49} x2={W / 2 - 6.5} y2={-H + 49} stroke={shade(WALNUT, 0.14)} strokeWidth={0.9} opacity={0.6} />
      <rect x={-W / 2 + 5} y={-H + 58} width={W - 10} height={48} rx={2} fill={shade(WALNUT, -0.06)} stroke={WALNUT_DEEP} strokeWidth={SW_FINE} />
      <path d={`M ${-W / 2 + 6.5} ${-H + 104.5} L ${-W / 2 + 6.5} ${-H + 59.5} L ${W / 2 - 6.5} ${-H + 59.5}`} fill="none" stroke="#3a2518" strokeWidth={1.4} opacity={0.13} />
      <line x1={-W / 2 + 6.5} y1={-H + 105} x2={W / 2 - 6.5} y2={-H + 105} stroke={shade(WALNUT, 0.14)} strokeWidth={0.9} opacity={0.6} />
      {/* grain riding the stiles and panel fields */}
      <path d="M -18.4 -112 q 1.3 20 -0.3 38 q -1.1 18 0.4 34 q 0.8 18 -0.4 33" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.28} />
      <path d="M 18.4 -112 q -1.2 22 0.4 40 q 1 18 -0.5 34 q -0.7 15 0.3 31" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.28} />
      <path d="M -6 -104 q 1.2 10 -0.3 20 q -0.8 8 0.4 12" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.24} />
      <path d="M 5 -56 q -1 12 0.4 20 q 0.9 10 -0.3 18" fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.24} />
      {/* the leaf settles into a sliver of shade at the threshold */}
      <rect x={-W / 2} y={-2.6} width={W} height={2.6} fill="#3a2518" opacity={0.1} stroke="none" />
      {/* knob */}
      <ellipse cx={-W / 2 + 7.6} cy={-48.4} rx={2.8} ry={1.1} fill="#3a2518" opacity={0.14} />
      <circle className="oh-doorknob" cx={-W / 2 + 7} cy={-52} r={3} fill={BRASS} stroke={INK} strokeWidth={SW_HAIR} />
      <path d={`M ${-W / 2 + 4.8} -50.9 A 2.6 2.6 0 0 0 ${-W / 2 + 9.2} -50.9`} fill="none" stroke={shade(BRASS, -0.28)} strokeWidth={0.8} opacity={0.55} />
      <circle cx={-W / 2 + 6.2} cy={-52.8} r={0.9} fill={BRASS_BRIGHT} stroke="none" />
      <circle cx={-W / 2 + 5.9} cy={-53.3} r={0.6} fill="#fff3dc" opacity={0.7} />
      {/* brass nameplate — names only, never numbers */}
      <rect x={-W / 2 + 6} y={-H + 44} width={W - 12} height={11} rx={2} fill={BRASS_BRIGHT} stroke={INK} strokeWidth={SW_HAIR} />
      <line x1={-W / 2 + 8} y1={-H + 46} x2={W / 2 - 9} y2={-H + 46} stroke="#fff3dc" strokeWidth={0.9} opacity={0.55} />
      <line x1={-W / 2 + 7} y1={-H + 54} x2={W / 2 - 7} y2={-H + 54} stroke={shade(BRASS_BRIGHT, -0.22)} strokeWidth={0.8} opacity={0.5} />
      {nameplate && (
        <text x={0} y={-H + 52} textAnchor="middle" fontSize={6.6} fill={INK} style={{ fontStyle: 'italic' }}>
          {nameplate}
        </text>
      )}
      {/* the frame collects a pencil tick for every year */}
      {Array.from({ length: ticks }, (_, i) => (
        <line
          key={i}
          x1={W / 2 + 1} y1={-16 - i * 8}
          x2={W / 2 + 6} y2={-17 - i * 8}
          stroke={INK_SOFT} strokeWidth={SW_FINE}
        />
      ))}
    </g>
  );
};

/* ── the hearth (floor 2×1, freestanding chimney) ────────────── */

export const HearthArt = ({ facing, vState, detail }: ObjectArtProps): React.JSX.Element => {
  const stage = Math.min(Math.max(Math.floor(detail ?? 0), 0), 3);
  const lit = vState === 'lit';
  const body = isoBoxFaces(2, 1, 62);
  const stack = isoBoxFaces(1.1, 0.55, 88);
  const mantel = isoBoxFaces(2.2, 1.15, 6);
  const base = shade(CREAM_WALL, -0.04);
  const gseed = seedFrom('oh-hearth') * 40;
  // the firebox lives on the right (south-east) face
  const fb = { x1: 4, y1: 12, x2: 34, y2: 27 }; // parallelogram anchors on that face
  const mid = { x: (fb.x1 + fb.x2) / 2, y: (fb.y1 + fb.y2) / 2 - 22 };
  return (
    <g transform={facing === 1 ? 'scale(-1,1)' : undefined} strokeLinecap="round" strokeLinejoin="round">
      <defs>
        {/* modelled plaster + walnut — every stop a shade() of the flat base */}
        <linearGradient id="ghr-top" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={shade(base, 0.04)} />
          <stop offset="1" stopColor={shade(base, 0.17)} />
        </linearGradient>
        <linearGradient id="ghr-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(base, -0.07)} />
          <stop offset="1" stopColor={shade(base, -0.19)} />
        </linearGradient>
        <linearGradient id="ghr-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(base, -0.23)} />
          <stop offset="1" stopColor={shade(base, -0.35)} />
        </linearGradient>
        <linearGradient id="ghr-stack-top" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={shade(base, 0.02)} />
          <stop offset="1" stopColor={shade(base, 0.14)} />
        </linearGradient>
        <linearGradient id="ghr-stack-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(base, -0.1)} />
          <stop offset="1" stopColor={shade(base, -0.22)} />
        </linearGradient>
        <linearGradient id="ghr-stack-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(base, -0.24)} />
          <stop offset="1" stopColor={shade(base, -0.36)} />
        </linearGradient>
        <linearGradient id="ghr-mantel" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={shade(WALNUT, -0.05)} />
          <stop offset="1" stopColor={shade(WALNUT, 0.09)} />
        </linearGradient>
      </defs>
      {/* the whole chimney grounds into one soft pool of shade */}
      <ellipse cx={0} cy={1.5} rx={27.6} ry={8.8} fill="#3a2518" opacity={0.13} />
      {/* chimney stack behind */}
      <g transform="translate(0, -58)">
        <path d={stack.top} fill="url(#ghr-stack-top)" />
        <path d={stack.right} fill="url(#ghr-stack-right)" />
        <path d={stack.left} fill="url(#ghr-stack-left)" />
        <path d={stack.outline} fill="none" stroke={INK} strokeWidth={SW_FINE} />
        <path d={litEdge(1.1, 0.55, 88)} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.4} />
      </g>
      {/* body */}
      <path d={body.top} fill="url(#ghr-top)" />
      <path d={body.right} fill="url(#ghr-right)" />
      <path d={body.left} fill="url(#ghr-left)" />
      {/* a soft plaster sheen down the lit face, faint render joints on the shaded one */}
      <line x1={22} y1={-51} x2={22} y2={7} stroke={CREAM_WALL} strokeWidth={3} opacity={0.2} />
      <path d={wobblyLine(-24, -30, -4, -20, gseed + 1, 0.5)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.18} />
      <path d={wobblyLine(-26, -14, -8, -5, gseed + 2, 0.5)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.18} />
      {/* the mantel's overhang drops a whisper of shade onto the shoulders */}
      <line x1={28} y1={-53.9} x2={11.5} y2={-49.9} stroke="#3a2518" strokeWidth={2.6} opacity={0.13} />
      <line x1={-28} y1={-63.8} x2={8} y2={-50.7} stroke="#3a2518" strokeWidth={2.6} opacity={0.13} />
      <path d={body.outline} fill="none" stroke={INK} strokeWidth={SW} />
      {/* firebox opening on the right face */}
      <path
        d={`M ${fb.x1} ${fb.y1} L ${fb.x2} ${fb.y2 - 14} L ${fb.x2} ${fb.y2 - 40} Q ${mid.x + 4} ${mid.y - 20} ${fb.x1} ${fb.y1 - 30} Z`}
        fill="#33241f" stroke={INK} strokeWidth={SW_FINE}
      />
      {/* the years, burned in */}
      {stage >= 1 && (
        <g>
          <line x1={mid.x - 8} y1={mid.y + 13} x2={mid.x + 8} y2={mid.y + 16} stroke={WALNUT} strokeWidth={3.2} strokeLinecap="round" />
          <line x1={mid.x - 5} y1={mid.y + 17} x2={mid.x + 10} y2={mid.y + 12} stroke={WALNUT_DEEP} strokeWidth={3.2} strokeLinecap="round" />
        </g>
      )}
      {stage >= 2 && <ellipse cx={mid.x + 1} cy={mid.y + 16} rx={9} ry={2.8} fill={EMBER_DEEP} opacity={0.85} />}
      {stage >= 3 && <ellipse cx={mid.x + 1} cy={mid.y + 15} rx={12} ry={3.6} fill={EMBER} opacity={0.5} />}
      {lit && (
        <g>
          {/* firelight spilling past the fender onto the boards */}
          <ellipse cx={26} cy={13} rx={13} ry={5.5} fill={CANDLE_GOLD} opacity={0.12} />
          <g className="oh-flame">
            <path
              d={`M ${mid.x - 5} ${mid.y + 13} Q ${mid.x - 7} ${mid.y + 2} ${mid.x + 1} ${mid.y - 5} Q ${mid.x + 9} ${mid.y + 3} ${mid.x + 7} ${mid.y + 13} Q ${mid.x + 1} ${mid.y + 17} ${mid.x - 5} ${mid.y + 13} Z`}
              fill={EMBER} opacity={0.9}
            />
            <path
              d={`M ${mid.x - 2} ${mid.y + 13} Q ${mid.x - 3} ${mid.y + 7} ${mid.x + 1} ${mid.y + 3} Q ${mid.x + 5} ${mid.y + 8} ${mid.x + 4} ${mid.y + 13} Z`}
              fill={CANDLE_GOLD} opacity={0.95}
            />
          </g>
        </g>
      )}
      {/* brass fender along the firebox foot, with one crisp glint */}
      <line x1={fb.x1 - 2} y1={fb.y1 + 3} x2={fb.x2 + 2} y2={fb.y2 - 11} stroke={BRASS} strokeWidth={2.2} strokeLinecap="round" />
      <line x1={24} y1={15.6} x2={33} y2={15.9} stroke="#fff3dc" strokeWidth={1.1} opacity={0.6} />
      {/* mantel lip (its top face is a real surface — the catalog seats live there) */}
      <g transform="translate(0, -62)">
        <path d={mantel.top} fill="url(#ghr-mantel)" stroke={INK} strokeWidth={SW_FINE} />
        <path d={mantel.right} fill={WALNUT_DEEP} stroke={INK} strokeWidth={SW_HAIR} />
        <path d={mantel.left} fill={shade(WALNUT_DEEP, -0.18)} stroke={INK} strokeWidth={SW_HAIR} />
        <path d={wobblyLine(-16, -12, 16, 4, gseed + 3, 0.6)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3} />
        <path d={wobblyLine(-12, -2, 12, 9, gseed + 4, 0.6)} fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} opacity={0.3} />
        <path d={litEdge(2.2, 1.15, 6)} fill="none" stroke="#fff6e6" strokeWidth={1} opacity={0.45} />
      </g>
    </g>
  );
};
