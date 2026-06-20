// Quiet Mode — demo memories for the no-auth E2E preview.
// ─────────────────────────────────────────────────────────────────────────────
// Used ONLY when the app is in E2E URL mode (`?e2e=1`) and the account has no
// real memories, so the redesign can be previewed without logging in. The
// "photos" are generated gradient SVGs encoded as data-URIs — no assets, no
// network, no IndexedDB. This module is dead code in production builds because
// its only caller is gated behind the compile-time VITE_E2E flag.

import type { Memory } from '../../types';

interface GradientSpec {
  stops: Array<[string, number]>; // [color, offset 0..100]
  glow: string;                   // soft radial highlight colour
  angle: number;                  // linear gradient angle
}

function svgPhoto(spec: GradientSpec): string {
  const stops = spec.stops.map(([c, o]) => `<stop offset='${o}%' stop-color='${c}'/>`).join('');
  const rad = (spec.angle * Math.PI) / 180;
  const x2 = (50 + Math.cos(rad) * 50).toFixed(1);
  const y2 = (50 + Math.sin(rad) * 50).toFixed(1);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='1000' height='1250' viewBox='0 0 1000 1250'>` +
      `<defs>` +
        `<linearGradient id='g' x1='0%' y1='0%' x2='${x2}%' y2='${y2}%'>${stops}</linearGradient>` +
        `<radialGradient id='h' cx='50%' cy='32%' r='60%'>` +
          `<stop offset='0%' stop-color='${spec.glow}' stop-opacity='0.55'/>` +
          `<stop offset='100%' stop-color='${spec.glow}' stop-opacity='0'/>` +
        `</radialGradient>` +
      `</defs>` +
      `<rect width='1000' height='1250' fill='url(#g)'/>` +
      `<rect width='1000' height='1250' fill='url(#h)'/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A few warm, varied demo moments — distinct moods, dates spanning years. */
export function buildDemoMemories(): Memory[] {
  const now = new Date();
  const yearsAgo = (y: number, m = now.getMonth(), d = now.getDate()) =>
    new Date(now.getFullYear() - y, m, d).toISOString();
  const monthsAgo = (n: number) => {
    const dt = new Date(now);
    dt.setMonth(dt.getMonth() - n);
    return dt.toISOString();
  };

  const specs: Array<{ image?: string; text: string; mood: string; date: string }> = [
    {
      image: svgPhoto({ angle: 115, glow: '#ffd9a0', stops: [['#ff8b6b', 0], ['#d65b86', 48], ['#6a3a8c', 100]] }),
      text: 'The evening the sky caught fire and we forgot to say a single word.',
      mood: 'love',
      date: yearsAgo(3), // lands on "X years ago today"
    },
    {
      image: svgPhoto({ angle: 135, glow: '#eafff0', stops: [['#7fd1ae', 0], ['#348f7a', 55], ['#1b3b4a', 100]] }),
      text: 'A slow morning where the coffee went cold and neither of us minded.',
      mood: 'peace',
      date: yearsAgo(2, now.getMonth() - 4 < 0 ? now.getMonth() + 8 : now.getMonth() - 4, 12),
    },
    {
      image: svgPhoto({ angle: 120, glow: '#ffe39e', stops: [['#f7b955', 0], ['#b14e7a', 50], ['#241a4d', 100]] }),
      text: 'Dancing through streets that felt, for one night, entirely ours.',
      mood: 'excited',
      date: yearsAgo(1, (now.getMonth() + 6) % 12, 3),
    },
    {
      image: svgPhoto({ angle: 100, glow: '#ffcf9c', stops: [['#ffae7a', 0], ['#c76a8e', 52], ['#4a2a52', 100]] }),
      text: 'You fell asleep mid-sentence, and I memorised your face.',
      mood: 'loved',
      date: monthsAgo(8),
    },
    {
      image: svgPhoto({ angle: 140, glow: '#d6fbff', stops: [['#6fd6e6', 0], ['#348fb0', 55], ['#142b52', 100]] }),
      text: 'The waves kept time while we made our quiet promises.',
      mood: 'calm',
      date: monthsAgo(14),
    },
    {
      // No image — shows the constellation + caption state of the redesign.
      text: 'Some days the memory is only a feeling. This one was: safe.',
      mood: 'tender',
      date: monthsAgo(5),
    },
  ];

  return specs.map((s, i) => ({
    id: `demo-quiet-${i}`,
    image: s.image,
    text: s.text,
    mood: s.mood,
    date: s.date,
  }));
}
