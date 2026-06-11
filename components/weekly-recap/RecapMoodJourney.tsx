import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { MoodPoint, RecapPalette } from '../../types';
import { GOLD, GoldSectionHeader, goldRise } from '../premium/GoldKit';
import { deriveDuotone } from './goldPalette';

interface RecapMoodJourneyProps {
    points: MoodPoint[];
    insight: string;
    palette: RecapPalette;
}

const WIDTH = 320;
const HEIGHT = 180;
const PADDING_X = 24;
const PADDING_Y = 28;

const ME_STROKE = '#f3cd86';
const PARTNER_STROKE = '#f173ac';
const GRID_STROKE = 'rgba(255, 246, 230, 0.07)';
const LABEL_FILL = 'rgba(255, 246, 230, 0.35)';

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

/** Y position of a mood level 1..5 on the chart. */
function gridY(level: number): number {
    const height = HEIGHT - PADDING_Y * 2;
    const norm = (level - 1) / 4;
    return PADDING_Y + (1 - norm) * height;
}

/**
 * The week, in waves — the mood chart restaged for the dark stage:
 * gold + rose lines, soft glow dots, hairline grid.
 */
export function RecapMoodJourney({ points, insight, palette }: RecapMoodJourneyProps) {
    const duo = useMemo(() => deriveDuotone(palette), [palette]);
    const mePoints = useMemo(() => toPlotPoints(points.map((p) => p.me)), [points]);
    const partnerPoints = useMemo(() => toPlotPoints(points.map((p) => p.partner)), [points]);
    const mePath = useMemo(() => buildSmoothPath(mePoints), [mePoints]);
    const partnerPath = useMemo(() => buildSmoothPath(partnerPoints), [partnerPoints]);

    const hasAny = points.some((p) => p.me !== null || p.partner !== null);

    return (
        <motion.section
            className="grc-mood"
            variants={goldRise}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
        >
            <GoldSectionHeader label="Mood journey" className="mt-10 mb-3" />
            <div
                className="relative overflow-hidden rounded-[1.6rem] p-5"
                style={{ background: GOLD.cardBg, border: GOLD.cardBorder }}
            >
                <div
                    className="absolute inset-0 pointer-events-none"
                    aria-hidden="true"
                    style={{ background: `radial-gradient(80% 60% at 50% 100%, ${duo.soft} 0%, transparent 70%)` }}
                />

                <p className="relative font-serif italic text-[15px] leading-relaxed" style={{ color: GOLD.textMid }}>
                    {insight}
                </p>

                <div className="relative mt-4">
                    <svg
                        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                        className="w-full h-auto block"
                        role="img"
                        aria-label="Mood curve for the week"
                    >
                        {/* hairline grid — one line per mood level */}
                        {[1, 2, 3, 4, 5].map((level) => (
                            <line
                                key={level}
                                x1={PADDING_X}
                                x2={WIDTH - PADDING_X}
                                y1={gridY(level)}
                                y2={gridY(level)}
                                stroke={GRID_STROKE}
                                strokeWidth={0.75}
                            />
                        ))}

                        {partnerPath && (
                            <motion.path
                                d={partnerPath}
                                fill="none"
                                stroke={PARTNER_STROKE}
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0, opacity: 0 }}
                                whileInView={{ pathLength: 1, opacity: 0.55 }}
                                viewport={{ once: true }}
                                transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                            />
                        )}
                        {mePath && (
                            <motion.path
                                d={mePath}
                                fill="none"
                                stroke={ME_STROKE}
                                strokeWidth={2.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0 }}
                                whileInView={{ pathLength: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                            />
                        )}

                        {/* soft glow dots */}
                        <motion.g
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.9 }}
                        >
                            {partnerPoints.map((pt, i) => (
                                <g key={`p-${i}`}>
                                    <circle cx={pt.x} cy={pt.y} r={6} fill={PARTNER_STROKE} opacity={0.14} />
                                    <circle cx={pt.x} cy={pt.y} r={2.2} fill={PARTNER_STROKE} opacity={0.75} />
                                </g>
                            ))}
                            {mePoints.map((pt, i) => (
                                <g key={`m-${i}`}>
                                    <circle cx={pt.x} cy={pt.y} r={7} fill={ME_STROKE} opacity={0.16} />
                                    <circle cx={pt.x} cy={pt.y} r={2.6} fill={ME_STROKE} />
                                </g>
                            ))}
                        </motion.g>

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
                                    fill={LABEL_FILL}
                                >
                                    {p.dayLabel}
                                </text>
                            );
                        })}
                    </svg>

                    {!hasAny && (
                        <p className="text-center text-[12px] py-2" style={{ color: GOLD.textMid }}>
                            No moods logged this week.
                        </p>
                    )}
                </div>

                <div className="relative mt-3 flex items-center justify-center gap-5">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD.textLow }}>
                        <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: ME_STROKE, boxShadow: '0 0 7px rgba(246,199,104,0.6)' }}
                        />
                        You
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD.textLow }}>
                        <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: PARTNER_STROKE, boxShadow: '0 0 7px rgba(241,115,172,0.5)' }}
                        />
                        Partner
                    </span>
                </div>
            </div>
        </motion.section>
    );
}
