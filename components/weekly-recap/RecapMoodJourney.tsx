import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { MoodPoint, RecapPalette } from '../../types';

interface RecapMoodJourneyProps {
  points: MoodPoint[];
  insight: string;
  palette: RecapPalette;
}

const WIDTH = 320;
const HEIGHT = 180;
const PADDING_X = 24;
const PADDING_Y = 28;

type PlotPoint = { x: number; y: number };

/**
 * Catmull-Rom spline -> cubic Bezier. Classic smoothing for a 7-point curve
 * that does NOT overshoot.  tension = 0.5 gives a natural feel.
 */
function buildSmoothPath(plotPoints: PlotPoint[]): string {
  if (plotPoints.length < 2) {
    if (plotPoints.length === 1) return `M ${plotPoints[0].x} ${plotPoints[0].y}`;
    return '';
  }

  const segments: string[] = [`M ${plotPoints[0].x.toFixed(2)} ${plotPoints[0].y.toFixed(2)}`];

  for (let i = 0; i < plotPoints.length - 1; i += 1) {
    const p0 = plotPoints[Math.max(i - 1, 0)];
    const p1 = plotPoints[i];
    const p2 = plotPoints[i + 1];
    const p3 = plotPoints[Math.min(i + 2, plotPoints.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    segments.push(
      `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    );
  }

  return segments.join(' ');
}

function toPlotPoints(values: (number | null)[]): PlotPoint[] {
  const plotted: PlotPoint[] = [];
  const usable = WIDTH - PADDING_X * 2;
  const height = HEIGHT - PADDING_Y * 2;
  values.forEach((v, i) => {
    if (v === null) return;
    const x = PADDING_X + (i / Math.max(1, values.length - 1)) * usable;
    // mood 1..5 -> top-to-bottom (5 = top)
    const norm = (v - 1) / 4;
    const y = PADDING_Y + (1 - norm) * height;
    plotted.push({ x, y });
  });
  return plotted;
}

export function RecapMoodJourney({ points, insight, palette }: RecapMoodJourneyProps) {
  const mePath = useMemo(() => buildSmoothPath(toPlotPoints(points.map((p) => p.me))), [points]);
  const partnerPath = useMemo(
    () => buildSmoothPath(toPlotPoints(points.map((p) => p.partner))),
    [points],
  );

  const hasAny = points.some((p) => p.me !== null || p.partner !== null);

  return (
    <section className="recap-mood">
      <h2 className="recap-mood__title">Mood Journey</h2>
      <p className="recap-mood__insight" style={{ color: palette.muted }}>{insight}</p>

      <div className="recap-mood__chart">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="recap-mood__svg"
          role="img"
          aria-label="Mood curve for the week"
        >
          {/* subtle guide line */}
          <line
            x1={PADDING_X}
            x2={WIDTH - PADDING_X}
            y1={HEIGHT / 2}
            y2={HEIGHT / 2}
            stroke={palette.muted}
            strokeWidth={0.6}
            strokeDasharray="2 4"
            opacity={0.35}
          />

          {partnerPath && (
            <motion.path
              d={partnerPath}
              fill="none"
              stroke={palette.muted}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 0.6 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            />
          )}
          {mePath && (
            <motion.path
              d={mePath}
              fill="none"
              stroke={palette.accent}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            />
          )}

          {/* x-axis labels */}
          {points.map((p, i) => {
            const x = PADDING_X + (i / Math.max(1, points.length - 1)) * (WIDTH - PADDING_X * 2);
            return (
              <text
                key={p.day}
                x={x}
                y={HEIGHT - 6}
                fontSize="9"
                textAnchor="middle"
                fill={palette.muted}
              >
                {p.dayLabel}
              </text>
            );
          })}
        </svg>

        {!hasAny && (
          <p className="recap-mood__empty" style={{ color: palette.muted }}>
            No moods logged this week.
          </p>
        )}
      </div>

      <div className="recap-mood__legend">
        <span className="recap-mood__legend-item">
          <span className="recap-mood__dot" style={{ background: palette.accent }} /> You
        </span>
        <span className="recap-mood__legend-item">
          <span className="recap-mood__dot" style={{ background: palette.muted }} /> Partner
        </span>
      </div>
    </section>
  );
}
