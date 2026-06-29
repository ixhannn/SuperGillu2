import React from 'react';

/* Premium Worlds — line glyphs + feature data, ported from the Lior Design
 * System handoff (premium/worlds-shared.jsx). Presentational only. */

interface GlyphProps {
  /** Square size in px. */
  s?: number;
}

export const GlobeGlyph: React.FC<GlyphProps> = ({ s = 24 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 3.6c-2.6 2.4-2.6 14.4 0 16.8M12 3.6c2.6 2.4 2.6 14.4 0 16.8" />
    <path d="M3.7 9.5h16.6M3.7 14.5h16.6" />
  </svg>
);

export const ThreadGlyph: React.FC<GlyphProps> = ({ s = 24 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.4" y="5.6" width="17.2" height="12.8" rx="3.2" />
    <path d="M4.7 7.9l5.8 3.9a2.9 2.9 0 0 0 3 0l5.8-3.9" />
  </svg>
);

export const FilmGlyph: React.FC<GlyphProps> = ({ s = 24 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.4" y="5" width="17.2" height="14" rx="3.4" />
    <path d="M3.6 9.4h16.8" />
    <path d="M10.5 11.9v4.2l3.6-2.1z" fill="currentColor" stroke="none" />
  </svg>
);

export const LockGlyph: React.FC<GlyphProps> = ({ s = 11 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4.5" y="11" width="15" height="10" rx="2.6" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const ChevronGlyph: React.FC<GlyphProps> = ({ s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const GemGlyph: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
    <path d="M5 9l3-4.5h8L19 9l-7 10z" />
    <path d="M5 9h14M9.5 4.5 8 9l4 10 4-10-1.5-4.5" opacity=".6" />
  </svg>
);

export type FeatureId = 'world' | 'thread' | 'doc';

export interface PremiumFeature {
  id: FeatureId;
  title: string;
  glyph: React.FC<GlyphProps>;
  /** Bottom-glow accent colour for the tile / sheet. */
  aura: string;
  short: string;
  long: string;
  kicker: string;
}

export const PW_FEATURES: readonly PremiumFeature[] = [
  {
    id: 'world',
    title: 'The World',
    glyph: GlobeGlyph,
    aura: '#7c83f4',
    short: 'A living place that grows as you do.',
    long: 'Everything the two of you make — memories, milestones, the small days — gathers into one place that quietly grows alongside you.',
    kicker: 'A place that grows',
  },
  {
    id: 'thread',
    title: 'The Thread',
    glyph: ThreadGlyph,
    aura: '#c074e6',
    short: 'A sealed letter, every single day.',
    long: 'Leave each other a sealed note every day. The whole thread stays closed until your anniversary — then it opens, all at once.',
    kicker: 'Sealed until the day',
  },
  {
    id: 'doc',
    title: 'Your Documentary',
    glyph: FilmGlyph,
    aura: '#ef9f63',
    short: 'Your year, told back as a film.',
    long: 'Once a year, everything you lived is gathered up and edited into a short film — narrated, scored, and made just for the two of you.',
    kicker: 'Your year, as a film',
  },
] as const;
