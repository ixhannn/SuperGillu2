import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Droplets, Sparkles, Heart } from 'lucide-react';
import { feedback } from '../utils/feedback';
import { isSameDay, formatDistanceToNow, differenceInDays } from 'date-fns';

/* ── Types ─────────────────────────────────────────────────────── */

export interface BonsaiState {
    level: number;
    xp: number;
    myLastWatered: string;
    partnerLastWatered: string;
}

interface BonsaiBloomProps {
    setView: (view: ViewState) => void;
}

/* ── Constants ──────────────────────────────────────────────────── */

const HOLD_DURATION_MS = 2000;
const HOLD_TICK_MS = 25;
const SYNERGY_XP = 40;
const SOLO_XP = 20;

const STAGES = [
    { name: 'Seed',          threshold: 0,    tagline: 'A tiny promise in quiet earth' },
    { name: 'Sprout',        threshold: 0.12, tagline: 'First light finds your stem' },
    { name: 'Sapling',       threshold: 0.28, tagline: 'Roots deepen, leaves unfurl' },
    { name: 'Young Tree',    threshold: 0.45, tagline: 'Growing stronger every day' },
    { name: 'Flourishing',   threshold: 0.62, tagline: 'Your care made this possible' },
    { name: 'In Bloom',      threshold: 0.80, tagline: 'Every petal, a shared memory' },
    { name: 'Eternal Bloom', threshold: 0.94, tagline: 'Love made visible' },
];

function getCurrentStage(growth: number) {
    for (let i = STAGES.length - 1; i >= 0; i--) {
        if (growth >= STAGES[i].threshold) return { ...STAGES[i], index: i };
    }
    return { ...STAGES[0], index: 0 };
}

/* ── Gentle Floating Particles ─────────────────────────────────── */

const FloatingParticles: React.FC<{ count: number; isSynergy: boolean }> = React.memo(({ count, isSynergy }) => {
    const particles = useMemo(() =>
        Array.from({ length: count }, (_, i) => ({
            id: i,
            x: 8 + ((i * 29 + 7) % 84),
            y: 15 + ((i * 17 + 11) % 65),
            size: 3 + (i % 3) * 2,
            duration: 6 + (i % 4) * 2,
            delay: (i % 6) * 1.2,
            driftX: -12 + ((i * 11) % 24),
            driftY: -8 + ((i * 7) % 16),
        })), [count]);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 1 }}>
            {particles.map(p => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                        background: isSynergy
                            ? `radial-gradient(circle, rgba(244,114,182,${0.2 + (p.id % 3) * 0.1}), transparent 70%)`
                            : `radial-gradient(circle, rgba(167,139,250,${0.15 + (p.id % 3) * 0.08}), transparent 70%)`,
                    }}
                    animate={{
                        x: [0, p.driftX, 0],
                        y: [0, p.driftY, 0],
                        opacity: [0, 0.6, 0],
                        scale: [0.5, 1.2, 0.5],
                    }}
                    transition={{
                        duration: p.duration,
                        delay: p.delay,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />
            ))}
        </div>
    );
});

/* ── Falling Petals (synergy only) ─────────────────────────────── */

const FallingPetals: React.FC = React.memo(() => {
    const petals = useMemo(() =>
        Array.from({ length: 8 }, (_, i) => ({
            id: i,
            left: 10 + ((i * 23) % 80),
            size: 5 + (i % 3) * 3,
            duration: 5 + (i % 3) * 2,
            delay: (i % 4) * 1.5,
            drift: -15 + ((i * 7) % 30),
            hue: 340 + (i % 5) * 8,
        })), []);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 2 }}>
            {petals.map(petal => (
                <motion.div
                    key={petal.id}
                    className="absolute"
                    style={{
                        left: `${petal.left}%`,
                        top: '-4%',
                        width: petal.size,
                        height: petal.size * 0.65,
                        borderRadius: '50% 0 50% 0',
                        background: `hsla(${petal.hue}, 65%, 78%, 0.5)`,
                    }}
                    animate={{
                        y: ['0vh', '105vh'],
                        x: [0, petal.drift],
                        rotate: [0, 180 + (petal.id % 2) * 60],
                        opacity: [0, 0.55, 0.55, 0],
                    }}
                    transition={{
                        duration: petal.duration,
                        delay: petal.delay,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                />
            ))}
        </div>
    );
});

/* ── Water Drops (during watering only) ────────────────────────── */

const WaterDrops: React.FC<{ growth: number; isSynergy: boolean }> = React.memo(({ growth, isSynergy }) => {
    const stage = getCurrentStage(growth);
    const streamCount = stage.index >= 5 ? 5 : stage.index >= 3 ? 4 : 3;
    const streams = useMemo(() =>
        Array.from({ length: streamCount }, (_, i) => ({
            id: i,
            offset: -28 + (i / Math.max(1, streamCount - 1)) * 56 + (i % 2 === 0 ? -5 : 5),
            top: 8 + (i % 2) * 6,
            height: 120 + growth * 48 + (i % 3) * 10,
            width: 4 + (i % 2) * 1.2,
            delay: i * 0.08,
            drift: i % 2 === 0 ? -6 : 6,
        })),
        [growth, streamCount],
    );
    const splashes = useMemo(() =>
        Array.from({ length: 10 }, (_, i) => ({
            id: i,
            offset: -34 + ((i * 11) % 68),
            size: 3 + (i % 3),
            lift: 10 + (i % 4) * 7,
            delay: (i % 5) * 0.08,
            drift: i % 2 === 0 ? -10 : 10,
        })), []);

    return (
        <div className="absolute inset-x-0 top-0 bottom-4 overflow-hidden pointer-events-none" style={{ zIndex: 12 }}>
            {streams.map(stream => (
                <motion.div
                    key={`stream-${stream.id}`}
                    className="absolute"
                    style={{
                        left: '50%',
                        top: stream.top,
                        width: stream.width,
                        height: stream.height,
                        marginLeft: stream.offset,
                        borderRadius: 999,
                        background: isSynergy
                            ? 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(219,234,254,0.92) 18%, rgba(167,139,250,0.42) 58%, rgba(147,197,253,0.04))'
                            : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(191,219,254,0.9) 20%, rgba(125,211,252,0.48) 62%, rgba(147,197,253,0.04))',
                        boxShadow: '0 0 8px rgba(147,197,253,0.22)',
                    }}
                    animate={{
                        y: [-18, 8, -8],
                        x: [0, stream.drift, 0],
                        scaleY: [0.72, 1.08, 0.9],
                        opacity: [0, 0.95, 0.78],
                    }}
                    transition={{
                        duration: 0.72,
                        delay: stream.delay,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                />
            ))}

            {splashes.map(splash => (
                <motion.div
                    key={`splash-${splash.id}`}
                    className="absolute rounded-full"
                    style={{
                        left: '50%',
                        bottom: 34,
                        width: splash.size,
                        height: splash.size * 1.3,
                        marginLeft: splash.offset,
                        background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), rgba(147,197,253,0.45))',
                    }}
                    animate={{
                        y: [0, -splash.lift, 0],
                        x: [0, splash.drift, 0],
                        scale: [0.5, 1, 0.2],
                        opacity: [0, 0.88, 0],
                    }}
                    transition={{
                        duration: 0.78,
                        delay: splash.delay,
                        repeat: Infinity,
                        ease: 'easeOut',
                    }}
                />
            ))}

            <motion.div
                className="absolute left-1/2 -translate-x-1/2 rounded-full"
                animate={{ scaleX: [0.75, 1.18, 0.9], scaleY: [0.6, 1, 0.72], opacity: [0.14, 0.38, 0.12] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'easeOut' }}
                style={{
                    bottom: 22,
                    width: 126,
                    height: 26,
                    border: '1px solid rgba(191,219,254,0.55)',
                    boxShadow: '0 0 18px rgba(125,211,252,0.18)',
                }}
            />

            <motion.div
                className="absolute left-1/2 -translate-x-1/2 rounded-full"
                animate={{ scale: [0.82, 1.14, 0.9], opacity: [0.08, 0.2, 0.08] }}
                transition={{ duration: 0.74, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                    bottom: 26,
                    width: 96,
                    height: 28,
                    background: isSynergy
                        ? 'radial-gradient(ellipse, rgba(196,181,253,0.2), rgba(147,197,253,0.08) 55%, transparent 72%)'
                        : 'radial-gradient(ellipse, rgba(186,230,253,0.2), rgba(147,197,253,0.08) 55%, transparent 72%)',
                    filter: 'blur(5px)',
                }}
            />
        </div>
    );
});

/* ── Completion Burst ──────────────────────────────────────────── */

const CompletionBurst: React.FC<{ active: boolean }> = React.memo(({ active }) => {
    const particles = useMemo(() =>
        Array.from({ length: 20 }, (_, i) => {
            const angle = (i / 20) * Math.PI * 2;
            const dist = 50 + (i % 3) * 25;
            return {
                id: i,
                tx: Math.cos(angle) * dist,
                ty: Math.sin(angle) * dist - 30,
                size: 3 + (i % 3) * 2,
                hue: i % 2 === 0 ? 340 : 280,
                delay: (i % 4) * 0.03,
            };
        }), []);

    if (!active) return null;

    return (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={{ zIndex: 20 }}>
            {particles.map(p => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full"
                    initial={{ x: 0, y: 60, scale: 0, opacity: 1 }}
                    animate={{ x: p.tx, y: p.ty, scale: [0, 1.2, 0], opacity: [1, 0.8, 0] }}
                    transition={{ duration: 0.8, delay: p.delay, ease: 'easeOut' }}
                    style={{
                        width: p.size,
                        height: p.size,
                        background: `hsla(${p.hue}, 65%, 72%, 0.8)`,
                    }}
                />
            ))}
        </div>
    );
});

/* ── Love Tree ─────────────────────────────────────────────────── */

const LoveTree: React.FC<{
    growth: number;
    isSynergy: boolean;
    isWatering: boolean;
}> = React.memo(({ growth, isSynergy, isWatering }) => {
    const stage = getCurrentStage(growth);
    const stageBaseThreshold = STAGES[stage.index].threshold;
    const stageNextThreshold = STAGES[stage.index + 1]?.threshold ?? 1;
    const stageProgress = Math.max(0, Math.min(1, (growth - stageBaseThreshold) / Math.max(0.0001, stageNextThreshold - stageBaseThreshold)));
    const matureStage = Math.max(0, stage.index - 2);
    const fullTreeGrowth = Math.max(0, Math.min(1, (growth - 0.22) / 0.78));
    const seedProgress = Math.max(0, Math.min(1, growth / 0.12));
    const sproutProgress = Math.max(0, Math.min(1, (growth - 0.08) / 0.18));
    const isSeedStage = growth < 0.12;
    const showSeedShell = growth < 0.2;
    const showSprout = growth >= 0.08 && growth < 0.34;
    const seedOpen = growth >= 0.1;
    const trunkH = fullTreeGrowth > 0 ? 18 + fullTreeGrowth * 62 + matureStage * 6 : 0;
    const trunkW = fullTreeGrowth > 0 ? 4 + fullTreeGrowth * 5.5 + matureStage * 0.55 : 0;
    const trunkLean = stage.index >= 2 ? [-8, -4, -1, 1, 0][Math.min(matureStage, 4)] : 0;
    const canopyScale = stage.index >= 2 ? 0.38 + matureStage * 0.14 + stageProgress * 0.08 : 0;
    const blossomCount = [0, 0, 0, 0, 8, 18, 28][stage.index] + (stage.index >= 4 ? Math.round(stageProgress * (stage.index >= 6 ? 8 : 5)) : 0);
    const budCount = stage.index >= 3 ? 4 + matureStage * 4 + Math.round(stageProgress * 4) : 0;
    const hangingBloomCount = stage.index >= 5 ? 4 + (stage.index - 5) * 3 : 0;
    const fireflyCount = stage.index === 6 ? 8 : stage.index === 5 ? 3 : 0;
    const leafHue = isSynergy ? 142 : 128 + fullTreeGrowth * 24;
    const bloomHue = isSynergy ? 335 : 345;

    const branches = useMemo(() => {
        if (stage.index < 2 || fullTreeGrowth < 0.08) return [];
        const count = [0, 0, 2, 4, 5, 6, 7][stage.index];
        return Array.from({ length: count }, (_, i) => {
            const side = i % 2 === 0 ? -1 : 1;
            const tier = i / Math.max(1, count - 1);
            return {
                id: i,
                side,
                yPct: 0.3 + tier * 0.48,
                length: 14 + matureStage * 7 + tier * 10 + stageProgress * 5,
                thickness: 2.2 + matureStage * 0.85 + (1 - tier) * 0.9,
                angle: side * (18 + tier * 18 + (stage.index >= 5 ? 4 : 0)),
            };
        });
    }, [fullTreeGrowth, matureStage, stage.index, stageProgress]);

    const canopyClusters = useMemo(() => {
        const canopyPresets: Array<Array<{ x: number; y: number; w: number; h: number; rotate: number; hueShift: number }>> = [
            [],
            [],
            [
                { x: -18, y: 10, w: 54, h: 46, rotate: -16, hueShift: -4 },
                { x: 16, y: -2, w: 62, h: 54, rotate: 12, hueShift: 6 },
            ],
            [
                { x: -30, y: 10, w: 62, h: 48, rotate: -18, hueShift: -6 },
                { x: -2, y: -14, w: 78, h: 62, rotate: -6, hueShift: 4 },
                { x: 32, y: 6, w: 58, h: 46, rotate: 18, hueShift: 8 },
            ],
            [
                { x: -40, y: 12, w: 66, h: 52, rotate: -20, hueShift: -8 },
                { x: -10, y: -18, w: 84, h: 66, rotate: -8, hueShift: 0 },
                { x: 26, y: -8, w: 72, h: 58, rotate: 12, hueShift: 8 },
                { x: 44, y: 14, w: 58, h: 48, rotate: 22, hueShift: 14 },
            ],
            [
                { x: -48, y: 16, w: 72, h: 56, rotate: -22, hueShift: -10 },
                { x: -16, y: -18, w: 86, h: 68, rotate: -10, hueShift: -2 },
                { x: 18, y: -24, w: 78, h: 64, rotate: 6, hueShift: 6 },
                { x: 46, y: 4, w: 68, h: 56, rotate: 18, hueShift: 12 },
                { x: 0, y: 24, w: 76, h: 48, rotate: 0, hueShift: 4 },
            ],
            [
                { x: -56, y: 18, w: 76, h: 58, rotate: -24, hueShift: -10 },
                { x: -26, y: -16, w: 84, h: 66, rotate: -14, hueShift: -4 },
                { x: 6, y: -30, w: 92, h: 72, rotate: -2, hueShift: 2 },
                { x: 38, y: -16, w: 84, h: 64, rotate: 10, hueShift: 10 },
                { x: 58, y: 16, w: 72, h: 56, rotate: 22, hueShift: 14 },
                { x: 0, y: 28, w: 82, h: 50, rotate: 0, hueShift: 6 },
            ],
        ];
        const base = canopyPresets[stage.index] || [];
        const scale = 0.92 + stageProgress * 0.1;
        return base.map((cluster, index) => ({
            ...cluster,
            w: cluster.w * scale,
            h: cluster.h * scale,
            float: index % 2 === 0 ? -2 : 2,
        }));
    }, [stage.index, stageProgress]);

    const blossoms = useMemo(() =>
        Array.from({ length: blossomCount }, (_, i) => ({
            id: i,
            angle: (i / Math.max(1, blossomCount)) * 360 + (Math.floor(i / 4)) * 16,
            distance: 28 + (i % 4) * 11 + matureStage * 3,
            size: 5 + (i % 3) * 2 + (stage.index === 6 ? 1 : 0),
            yOffset: -4 + Math.cos(i * 2) * 10,
        })), [blossomCount, matureStage, stage.index]);

    const leaves = useMemo(() => {
        const count = [0, 0, 4, 10, 18, 24, 30][stage.index];
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            angle: (i / Math.max(1, count)) * 360 + 18,
            distance: 24 + (i % 4) * 11 + matureStage * 2,
            size: 6 + (i % 3) * 2 + matureStage * 0.5,
        }));
    }, [matureStage, stage.index]);

    const buds = useMemo(() =>
        Array.from({ length: budCount }, (_, i) => ({
            id: i,
            angle: (i / Math.max(1, budCount)) * 360 + 12,
            distance: 18 + (i % 3) * 12 + matureStage * 4,
            size: 3 + (i % 2),
            yOffset: -6 + Math.sin(i * 1.4) * 8,
        })), [budCount, matureStage]);

    const hangingBlooms = useMemo(() =>
        Array.from({ length: hangingBloomCount }, (_, i) => ({
            id: i,
            x: -42 + (i / Math.max(1, hangingBloomCount - 1)) * 84 + (i % 2 === 0 ? -6 : 6),
            length: 14 + (i % 3) * 8,
            size: 6 + (i % 2) * 2,
        })), [hangingBloomCount]);

    const fireflies = useMemo(() =>
        Array.from({ length: fireflyCount }, (_, i) => ({
            id: i,
            x: -62 + ((i * 19) % 124),
            y: -24 + ((i * 17) % 68),
            size: 5 + (i % 2),
            delay: i * 0.25,
        })), [fireflyCount]);

    const groundBlades = useMemo(() =>
        Array.from({ length: Math.max(0, stage.index - 1) * 2 }, (_, i) => ({
            id: i,
            offset: -54 + ((i * 16) % 108),
            height: 12 + (i % 3) * 4,
            rotate: i % 2 === 0 ? -18 : 18,
        })), [stage.index]);

    return (
        <div className="relative flex items-end justify-center" style={{ height: '18rem', width: '100%' }}>
            {/* Soft ground shadow */}
            <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2"
                style={{
                    width: '70%',
                    height: 20,
                    borderRadius: '50%',
                    background: 'radial-gradient(ellipse, rgba(0,0,0,0.06), transparent 70%)',
                }}
            />

            {/* Stage mound */}
            <div
                className="absolute bottom-2 left-1/2 -translate-x-1/2"
                style={{
                    width: 184,
                    height: 56,
                    borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 50% 45%, rgba(196,128,86,0.3), rgba(119,72,48,0.5) 60%, rgba(77,46,34,0.65) 100%)',
                    boxShadow: 'inset 0 10px 12px rgba(255,255,255,0.05), 0 14px 26px rgba(0,0,0,0.06)',
                }}
            />
            <div
                className="absolute bottom-8 left-1/2 -translate-x-1/2"
                style={{
                    width: 126,
                    height: 18,
                    borderRadius: '50%',
                    background: 'linear-gradient(180deg, rgba(117,74,50,0.55), rgba(74,44,31,0.18))',
                    opacity: 0.8,
                }}
            />

            {groundBlades.map(blade => (
                <motion.div
                    key={`blade-${blade.id}`}
                    className="absolute left-1/2 origin-bottom rounded-full"
                    animate={{ y: isWatering ? -1 : 0, rotate: [blade.rotate, blade.rotate + (blade.rotate > 0 ? 4 : -4), blade.rotate] }}
                    transition={{
                        y: { type: 'spring', stiffness: 180, damping: 16 },
                        rotate: { duration: 2.8 + (blade.id % 3) * 0.3, repeat: Infinity, ease: 'easeInOut' },
                    }}
                    style={{
                        bottom: 28,
                        width: 4,
                        height: blade.height,
                        marginLeft: blade.offset,
                        background: 'linear-gradient(180deg, rgba(110,231,183,0.14), rgba(34,197,94,0.5))',
                    }}
                />
            ))}

            {/* Root glow for early stages */}
            {growth < 0.22 && (
                <motion.div
                    className="absolute bottom-5 left-1/2 -translate-x-1/2"
                    animate={{
                        opacity: isWatering ? [0.14, 0.32, 0.14] : [0.08, 0.16, 0.08],
                        scale: isWatering ? [0.94, 1.08, 0.94] : [1, 1.03, 1],
                    }}
                    transition={{ duration: isWatering ? 0.8 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                        width: 140,
                        height: 34,
                        borderRadius: '50%',
                        background: isSynergy
                            ? 'radial-gradient(ellipse, rgba(244,114,182,0.16), transparent 65%)'
                            : 'radial-gradient(ellipse, rgba(167,139,250,0.14), transparent 65%)',
                        filter: 'blur(7px)',
                    }}
                />
            )}

            {/* Root tendrils */}
            {growth < 0.24 &&
                [
                    { width: 30, angle: -28, offset: -18 },
                    { width: 22, angle: -10, offset: -4 },
                    { width: 18, angle: 12, offset: 8 },
                    { width: 28, angle: 30, offset: 18 },
                ].map((root, index) => (
                    <motion.div
                        key={`root-${root.angle}`}
                        className="absolute left-1/2 origin-left"
                        animate={{
                            opacity: isWatering ? [0.2, 0.36, 0.2] : 0.22 + index * 0.03,
                            scaleX: 0.74 + seedProgress * 0.5,
                        }}
                        transition={{
                            opacity: { duration: isWatering ? 0.9 : 0.2, repeat: isWatering ? Infinity : 0, ease: 'easeInOut' },
                            scaleX: { type: 'spring', stiffness: 50, damping: 16 },
                        }}
                        style={{
                            bottom: 24,
                            width: root.width,
                            height: 2,
                            marginLeft: root.offset,
                            borderRadius: 999,
                            background: 'linear-gradient(90deg, rgba(122,78,57,0.7), rgba(122,78,57,0.08))',
                            transform: `rotate(${root.angle}deg)`,
                        }}
                    />
                ))}

            {/* Seed shell */}
            {showSeedShell &&
                (seedOpen ? (
                    <>
                        <motion.div
                            className="absolute left-1/2"
                            animate={{
                                y: isWatering ? -3 : 0,
                                rotate: [-34, -38, -34],
                            }}
                            transition={{
                                y: { type: 'spring', stiffness: 180, damping: 14 },
                                rotate: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' },
                            }}
                            style={{
                                bottom: 36,
                                width: 18,
                                height: 28,
                                marginLeft: -24,
                                borderRadius: '58% 42% 66% 34% / 60% 48% 52% 40%',
                                background: 'linear-gradient(150deg, hsl(26,44%,66%), hsl(19,40%,44%) 70%, hsl(16,36%,34%))',
                                boxShadow: 'inset 2px 2px 3px rgba(255,255,255,0.24), inset -4px -4px 8px rgba(78,43,24,0.18)',
                            }}
                        />
                        <motion.div
                            className="absolute left-1/2"
                            animate={{
                                y: isWatering ? -2 : 0,
                                rotate: [32, 36, 32],
                            }}
                            transition={{
                                y: { type: 'spring', stiffness: 180, damping: 14 },
                                rotate: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
                            }}
                            style={{
                                bottom: 35,
                                width: 19,
                                height: 29,
                                marginLeft: 6,
                                borderRadius: '42% 58% 34% 66% / 48% 60% 40% 52%',
                                background: 'linear-gradient(210deg, hsl(28,42%,64%), hsl(20,38%,42%) 70%, hsl(16,34%,32%))',
                                boxShadow: 'inset 2px 2px 3px rgba(255,255,255,0.24), inset -4px -4px 8px rgba(78,43,24,0.18)',
                            }}
                        />
                    </>
                ) : (
                    <motion.div
                        className="absolute left-1/2"
                        animate={{
                            y: isWatering ? -2 : 0,
                            rotate: [-18, -14, -18],
                            scale: isSeedStage ? [1, 1.02, 1] : 1,
                        }}
                        transition={{
                            y: { type: 'spring', stiffness: 180, damping: 14 },
                            rotate: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
                            scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                        }}
                        style={{
                            bottom: 32,
                            width: 34,
                            height: 46,
                            marginLeft: -17,
                            borderRadius: '58% 42% 60% 40% / 62% 46% 54% 38%',
                            background: 'linear-gradient(150deg, hsl(28,46%,68%), hsl(19,41%,44%) 72%, hsl(15,36%,31%))',
                            boxShadow: 'inset 3px 3px 4px rgba(255,255,255,0.24), inset -6px -6px 10px rgba(78,43,24,0.2), 0 8px 16px rgba(0,0,0,0.08)',
                        }}
                    >
                        <div
                            className="absolute left-1/2 top-[14%] h-[72%] w-[2px] -translate-x-1/2 rounded-full"
                            style={{ background: 'linear-gradient(180deg, rgba(113,63,31,0.06), rgba(101,52,28,0.38), rgba(113,63,31,0.08))' }}
                        />
                    </motion.div>
                ))}

            {/* Sprout stage */}
            {showSprout && (
                <div className="absolute left-1/2" style={{ bottom: 40, marginLeft: -2 }}>
                    <motion.div
                        className="absolute left-1/2 bottom-0 -translate-x-1/2 origin-bottom"
                        initial={{ scaleY: 0 }}
                        animate={{
                            scaleY: 0.2 + sproutProgress * 0.8,
                            y: isWatering ? -3 : 0,
                        }}
                        transition={{
                            scaleY: { type: 'spring', stiffness: 60, damping: 16 },
                            y: { type: 'spring', stiffness: 180, damping: 14 },
                        }}
                        style={{
                            width: 5,
                            height: 20 + sproutProgress * 50,
                            borderRadius: 999,
                            background: 'linear-gradient(180deg, hsl(116,38%,64%), hsl(124,42%,42%) 80%, hsl(116,24%,34%))',
                            transform: 'translateX(-50%) skewX(-6deg)',
                            boxShadow: 'inset 1px 0 rgba(255,255,255,0.16)',
                        }}
                    />

                    {[
                        { side: -1, angle: -34, delay: 0.05, size: 18 + sproutProgress * 6, y: 18 + sproutProgress * 8 },
                        { side: 1, angle: 28, delay: 0.12, size: 16 + sproutProgress * 7, y: 24 + sproutProgress * 11 },
                    ].map((leaf) => (
                        <motion.div
                            key={`sprout-leaf-${leaf.side}`}
                            className="absolute left-1/2 origin-bottom"
                            initial={{ scale: 0 }}
                            animate={{
                                scale: 0.4 + sproutProgress * 0.6,
                                y: isWatering ? -2 : 0,
                            }}
                            transition={{
                                scale: { type: 'spring', stiffness: 70, damping: 14, delay: leaf.delay },
                                y: { type: 'spring', stiffness: 180, damping: 14 },
                            }}
                            style={{
                                bottom: leaf.y,
                                width: leaf.size,
                                height: leaf.size * 0.62,
                                marginLeft: leaf.side < 0 ? -leaf.size - 1 : 1,
                                borderRadius: '60% 0 60% 0',
                                background: `linear-gradient(135deg, hsl(${isSynergy ? 140 : 122}, 48%, 70%), hsl(${isSynergy ? 150 : 128}, 45%, 46%))`,
                                transform: `rotate(${leaf.angle}deg)`,
                                boxShadow: '0 3px 6px rgba(0,0,0,0.06)',
                            }}
                        />
                    ))}

                    <motion.div
                        className="absolute left-1/2 rounded-full"
                        animate={{
                            opacity: sproutProgress > 0.6 ? [0.2, 0.42, 0.2] : 0.18,
                            scale: sproutProgress > 0.6 ? [0.9, 1.12, 0.9] : 1,
                        }}
                        transition={{ duration: 2.4, repeat: sproutProgress > 0.6 ? Infinity : 0, ease: 'easeInOut' }}
                        style={{
                            bottom: 56 + sproutProgress * 18,
                            width: 16,
                            height: 16,
                            marginLeft: -8,
                            background: 'radial-gradient(circle, rgba(255,255,255,0.6), rgba(167,243,208,0.05) 72%)',
                        }}
                    />
                </div>
            )}

            {/* Trunk */}
            {fullTreeGrowth > 0 && (
                <motion.div
                    className="absolute bottom-3 left-1/2"
                    initial={{ height: 0 }}
                    animate={{
                        height: trunkH,
                        y: isWatering ? -2 : 0,
                        rotate: trunkLean,
                    }}
                    transition={{
                        height: { type: 'spring', stiffness: 40, damping: 16 },
                        y: { type: 'spring', stiffness: 200, damping: 14 },
                        rotate: { type: 'spring', stiffness: 80, damping: 14 },
                    }}
                    style={{
                        width: trunkW,
                        marginLeft: -trunkW / 2,
                        borderRadius: `${trunkW * 0.4}px ${trunkW * 0.4}px ${trunkW * 0.7}px ${trunkW * 0.7}px`,
                        background: `linear-gradient(180deg, hsl(25,30%,52%), hsl(20,35%,38%) 70%, hsl(16,28%,32%))`,
                        boxShadow: `inset -${trunkW * 0.12}px 0 ${trunkW * 0.25}px rgba(0,0,0,0.15)`,
                        transformOrigin: 'bottom center',
                    }}
                />
            )}

            {/* Branches */}
            {branches.map(b => (
                <motion.div
                    key={`b-${b.id}`}
                    className="absolute left-1/2"
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 0.85 }}
                    transition={{ type: 'spring', delay: 0.2 + b.id * 0.08, stiffness: 50, damping: 14 }}
                    style={{
                        bottom: 3 + trunkH * b.yPct,
                        width: b.length,
                        height: b.thickness,
                        borderRadius: b.thickness / 2,
                        background: `hsl(22,30%,44%)`,
                        transformOrigin: b.side < 0 ? 'right center' : 'left center',
                        transform: `rotate(${b.angle}deg)`,
                        marginLeft: b.side < 0 ? -b.length : 0,
                    }}
                />
            ))}

            {/* Canopy */}
            {fullTreeGrowth > 0 && (
                <motion.div
                    className="absolute left-1/2 -translate-x-1/2"
                    animate={{
                        scale: canopyScale,
                        y: isWatering ? -4 : 0,
                        rotate: isWatering ? [0, -1, 1, 0] : 0,
                    }}
                    transition={{
                        scale: { type: 'spring', stiffness: 40, damping: 16 },
                        y: { type: 'spring', stiffness: 200, damping: 14 },
                        rotate: { duration: 0.6, repeat: isWatering ? Infinity : 0, ease: 'easeInOut' },
                    }}
                    style={{
                        bottom: trunkH + 6 + matureStage * 2,
                        width: 228,
                        height: 210,
                    }}
                >
                    {/* Stage crown */}
                    {canopyClusters.map((cluster, index) => (
                        <motion.div
                            key={`cluster-${index}`}
                            className="absolute"
                            animate={{
                                rotate: [cluster.rotate, cluster.rotate + 3, cluster.rotate],
                                y: isWatering ? [cluster.float, cluster.float + 2, cluster.float] : [cluster.float, cluster.float - 1, cluster.float],
                            }}
                            transition={{
                                rotate: { duration: 5.2 + index * 0.4, repeat: Infinity, ease: 'easeInOut' },
                                y: { duration: 3.2 + index * 0.3, repeat: Infinity, ease: 'easeInOut' },
                            }}
                            style={{
                                left: '50%',
                                top: '50%',
                                width: cluster.w,
                                height: cluster.h,
                                marginLeft: cluster.x - cluster.w / 2,
                                marginTop: cluster.y - cluster.h / 2 - matureStage * 6,
                                borderRadius: index % 2 === 0
                                    ? '48% 52% 44% 56% / 54% 46% 54% 46%'
                                    : '52% 48% 56% 44% / 46% 54% 46% 54%',
                                background: `radial-gradient(ellipse at 36% 30%,
                                    hsla(${leafHue + cluster.hueShift}, ${52 + matureStage * 3}%, ${50 + fullTreeGrowth * 11}%, 0.94),
                                    hsla(${leafHue - 6 + cluster.hueShift * 0.4}, ${44 + matureStage * 2}%, ${34 + fullTreeGrowth * 9}%, 0.9) 78%
                                )`,
                                boxShadow: `0 ${6 + matureStage * 2}px ${16 + matureStage * 3}px rgba(0,0,0,0.08)`,
                                transform: `rotate(${cluster.rotate}deg)`,
                            }}
                        />
                    ))}

                    {stage.index >= 4 && (
                        <motion.div
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                            animate={{ scale: [0.94, 1.06, 0.94], opacity: [0.12, 0.22, 0.12] }}
                            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                width: stage.index === 6 ? 190 : 164,
                                height: stage.index === 6 ? 150 : 124,
                                marginTop: -20,
                                background: isSynergy
                                    ? 'radial-gradient(ellipse, rgba(244,114,182,0.22), rgba(196,181,253,0.08) 58%, transparent 72%)'
                                    : 'radial-gradient(ellipse, rgba(251,191,36,0.12), rgba(134,239,172,0.06) 58%, transparent 72%)',
                                filter: 'blur(12px)',
                            }}
                        />
                    )}

                    {/* Bud lights */}
                    {buds.map(bud => (
                        <motion.div
                            key={`bud-${bud.id}`}
                            className="absolute rounded-full"
                            animate={{ scale: [0.8, 1.1, 0.8], opacity: [0.4, 0.9, 0.4] }}
                            transition={{ duration: 2.2 + (bud.id % 4) * 0.25, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                left: '50%',
                                top: '50%',
                                width: bud.size,
                                height: bud.size,
                                marginLeft: Math.cos(bud.angle * Math.PI / 180) * bud.distance - bud.size / 2,
                                marginTop: Math.sin(bud.angle * Math.PI / 180) * bud.distance * 0.66 + bud.yOffset - bud.size / 2 - 20,
                                background: stage.index >= 5
                                    ? `radial-gradient(circle, hsla(${bloomHue}, 90%, 86%, 0.95), hsla(${bloomHue}, 70%, 70%, 0.45))`
                                    : 'radial-gradient(circle, rgba(253,224,71,0.85), rgba(253,224,71,0.2))',
                                boxShadow: stage.index >= 5 ? '0 0 10px rgba(244,114,182,0.2)' : '0 0 8px rgba(253,224,71,0.18)',
                            }}
                        />
                    ))}

                    {/* Leaves */}
                    {leaves.map(leaf => (
                        <motion.div
                            key={`l-${leaf.id}`}
                            className="absolute"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1, opacity: 0.85 }}
                            transition={{ delay: leaf.id * 0.1, type: 'spring', stiffness: 100, damping: 12 }}
                            style={{
                                left: '50%', top: '50%',
                                width: leaf.size,
                                height: leaf.size * 1.4,
                                marginLeft: Math.cos(leaf.angle * Math.PI / 180) * leaf.distance - leaf.size / 2,
                                marginTop: Math.sin(leaf.angle * Math.PI / 180) * leaf.distance * 0.65 - leaf.size * 0.7 - 18,
                                borderRadius: '50% 0 50% 0',
                                background: `hsla(${leafHue + (leaf.id % 3) * 10}, 50%, ${46 + fullTreeGrowth * 12}%, 0.8)`,
                                transform: `rotate(${leaf.angle + 45}deg)`,
                            }}
                        />
                    ))}

                    {/* Blossoms */}
                    {blossoms.map(b => (
                        <motion.div
                            key={`bl-${b.id}`}
                            className="absolute"
                            initial={{ scale: 0 }}
                            animate={{ scale: [0, 1.15, 1], opacity: [0, 1, 0.9] }}
                            transition={{ delay: b.id * 0.08 + 0.3, duration: 0.5, type: 'spring', stiffness: 200, damping: 14 }}
                            style={{
                                left: '50%', top: '50%',
                                width: b.size, height: b.size,
                                marginLeft: Math.cos(b.angle * Math.PI / 180) * b.distance - b.size / 2,
                                marginTop: Math.sin(b.angle * Math.PI / 180) * b.distance * 0.6 + b.yOffset - b.size / 2 - 18,
                                borderRadius: '50%',
                                background: `radial-gradient(circle at 35% 35%, hsla(${bloomHue}, 75%, 82%, 0.9), hsla(${bloomHue}, 60%, 70%, 0.7))`,
                                boxShadow: isSynergy ? `0 0 ${b.size}px rgba(244,114,182,0.3)` : undefined,
                            }}
                        />
                    ))}

                    {/* Hanging blossom tassels */}
                    {hangingBlooms.map(bloom => (
                        <motion.div
                            key={`hang-${bloom.id}`}
                            className="absolute left-1/2 top-1/2"
                            animate={{ y: [0, 4, 0] }}
                            transition={{ duration: 2.4 + (bloom.id % 3) * 0.3, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                marginLeft: bloom.x,
                                marginTop: 18,
                            }}
                        >
                            <div
                                style={{
                                    width: 1.5,
                                    height: bloom.length,
                                    margin: '0 auto',
                                    background: 'linear-gradient(180deg, rgba(255,255,255,0.45), rgba(244,114,182,0.22))',
                                }}
                            />
                            <div
                                className="rounded-full"
                                style={{
                                    width: bloom.size,
                                    height: bloom.size,
                                    marginLeft: -(bloom.size - 1.5) / 2,
                                    background: `radial-gradient(circle at 35% 35%, hsla(${bloomHue}, 85%, 88%, 0.95), hsla(${bloomHue}, 65%, 74%, 0.68))`,
                                    boxShadow: '0 0 10px rgba(244,114,182,0.22)',
                                }}
                            />
                        </motion.div>
                    ))}

                    {/* Late-stage floating glow */}
                    {fireflies.map(firefly => (
                        <motion.div
                            key={`firefly-${firefly.id}`}
                            className="absolute rounded-full"
                            animate={{ y: [0, -10, 0], x: [0, firefly.id % 2 === 0 ? 5 : -5, 0], opacity: [0.2, 0.8, 0.2] }}
                            transition={{ duration: 2.6 + (firefly.id % 3) * 0.3, repeat: Infinity, ease: 'easeInOut', delay: firefly.delay }}
                            style={{
                                left: '50%',
                                top: '50%',
                                width: firefly.size,
                                height: firefly.size,
                                marginLeft: firefly.x,
                                marginTop: firefly.y,
                                background: 'radial-gradient(circle, rgba(255,251,191,0.95), rgba(253,224,71,0.28))',
                                boxShadow: '0 0 12px rgba(253,224,71,0.32)',
                            }}
                        />
                    ))}

                    {/* Synergy glow */}
                    {isSynergy && (
                        <motion.div
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                            animate={{ scale: [0.85, 1.1, 0.85], opacity: [0.15, 0.35, 0.15] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                                width: 176, height: 150,
                                borderRadius: '50%',
                                background: 'radial-gradient(ellipse, rgba(244,114,182,0.25), transparent 55%)',
                                filter: 'blur(12px)',
                                marginTop: -22,
                            }}
                        />
                    )}
                </motion.div>
            )}

            {/* Watering stream and shimmer */}
            {isWatering && (
                <>
                    <WaterDrops growth={growth} isSynergy={isSynergy} />
                    <motion.div
                        className="absolute bottom-0 left-1/2 -translate-x-1/2"
                        animate={{ opacity: [0.14, 0.42, 0.16], scale: [0.72, 1.16, 0.92] }}
                        transition={{ duration: 0.82, repeat: Infinity, ease: 'easeOut' }}
                        style={{
                            width: 148,
                            height: 34,
                            borderRadius: '50%',
                            background: isSynergy
                                ? 'radial-gradient(ellipse, rgba(196,181,253,0.22), rgba(147,197,253,0.16) 52%, transparent 70%)'
                                : 'radial-gradient(ellipse, rgba(147,197,253,0.24), rgba(186,230,253,0.16) 52%, transparent 70%)',
                            filter: 'blur(9px)',
                        }}
                    />
                </>
            )}
        </div>
    );
});

/* ── Main Component ────────────────────────────────────────────── */

export const BonsaiBloom: React.FC<BonsaiBloomProps> = ({ setView }) => {
    const [state, setState] = useState<BonsaiState>({ level: 1, xp: 0, myLastWatered: '', partnerLastWatered: '' });
    const [holdProgress, setHoldProgress] = useState(0);
    const [showBurst, setShowBurst] = useState(false);

    const holdTimerRef = useRef<number | null>(null);
    const resetTimerRef = useRef<number | null>(null);
    const stateRef = useRef(state);
    const completionRef = useRef(false);

    const profile = StorageService.getCoupleProfile();
    const myName = profile.myName?.trim() || 'You';
    const partnerName = profile.partnerName?.trim() || 'Partner';

    const daysTogether = useMemo(() => {
        if (!profile.anniversaryDate) return 0;
        return Math.max(0, differenceInDays(new Date(), new Date(profile.anniversaryDate)));
    }, [profile.anniversaryDate]);

    const storage = StorageService as typeof StorageService & {
        getBonsaiState?: () => BonsaiState;
        saveBonsaiState?: (value: BonsaiState) => void;
    };

    useEffect(() => { stateRef.current = state; }, [state]);

    useEffect(() => {
        if (storage.getBonsaiState) setState(storage.getBonsaiState());
        const handler = () => { if (storage.getBonsaiState) setState(storage.getBonsaiState()); };
        storageEventTarget.addEventListener('bonsaiUpdated', handler);
        storageEventTarget.addEventListener('storage-update', handler);
        return () => {
            storageEventTarget.removeEventListener('bonsaiUpdated', handler);
            storageEventTarget.removeEventListener('storage-update', handler);
        };
    }, []);

    const clearTimers = useCallback(() => {
        if (holdTimerRef.current !== null) { window.clearInterval(holdTimerRef.current); holdTimerRef.current = null; }
        if (resetTimerRef.current !== null) { window.clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
    }, []);

    useEffect(() => () => clearTimers(), [clearTimers]);

    /* ── Derived state ──────────────────────────────────────── */

    const isMyWatered = isSameDay(new Date(), state.myLastWatered ? new Date(state.myLastWatered) : new Date(0));
    const isPartnerWatered = isSameDay(new Date(), state.partnerLastWatered ? new Date(state.partnerLastWatered) : new Date(0));
    const isSynergy = isMyWatered && isPartnerWatered;
    const normalizedGrowth = Math.min(1, (state.level * 100 + state.xp) / 2000);
    const isWatering = holdProgress > 0 && holdProgress < 100;
    const stage = getCurrentStage(normalizedGrowth);
    const xpToNext = Math.max(0, 100 - state.xp);

    /* ── Hold-to-water ritual ───────────────────────────────── */

    const completeNurture = useCallback(() => {
        if (completionRef.current) return;
        completionRef.current = true;
        clearTimers();
        feedback.celebrate();
        setShowBurst(true);
        setTimeout(() => setShowBurst(false), 1000);

        const current = stateRef.current;
        const partnerWateredToday = isSameDay(new Date(), current.partnerLastWatered ? new Date(current.partnerLastWatered) : new Date(0));
        let newXp = current.xp + (partnerWateredToday ? SYNERGY_XP : SOLO_XP);
        let newLvl = current.level;
        if (newXp >= 100) { newXp -= 100; newLvl += 1; }

        const nextState: BonsaiState = {
            ...current, level: newLvl, xp: newXp, myLastWatered: new Date().toISOString(),
        };

        if (storage.saveBonsaiState) storage.saveBonsaiState(nextState);
        stateRef.current = nextState;
        setState(nextState);
        setHoldProgress(100);

        resetTimerRef.current = window.setTimeout(() => {
            setHoldProgress(0);
            completionRef.current = false;
        }, 1500);
    }, [clearTimers, storage]);

    const tickRef = useRef(0);
    const startNurture = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        if (isMyWatered || holdTimerRef.current !== null) return;
        event.preventDefault();
        feedback.tap();
        clearTimers();
        tickRef.current = 0;
        completionRef.current = false;

        holdTimerRef.current = window.setInterval(() => {
            tickRef.current += 1;
            const progress = Math.min(100, (tickRef.current * HOLD_TICK_MS / HOLD_DURATION_MS) * 100);
            setHoldProgress(progress);

            if ([25, 50, 75].some(m => Math.abs(progress - m) < 1.5 && progress >= m)) feedback.light();
            if (progress >= 100 && !completionRef.current) window.setTimeout(() => completeNurture(), 0);
        }, HOLD_TICK_MS);
    }, [isMyWatered, clearTimers, completeNurture]);

    const stopNurture = useCallback(() => {
        if (completionRef.current) return;
        clearTimers();
        resetTimerRef.current = window.setTimeout(() => setHoldProgress(0), 250);
    }, [clearTimers]);

    /* ── Render ──────────────────────────────────────────────── */

    const RITUAL_RING = 2 * Math.PI * 50;

    return (
        <div className="relative w-full min-h-screen select-none" style={{
            background: isSynergy
                ? 'linear-gradient(180deg, #fdf2f8 0%, #fce7f3 25%, #fff1f2 50%, #fff7ed 80%, #fef3f2 100%)'
                : 'linear-gradient(180deg, #faf5ff 0%, #f5f3ff 25%, #fdf2f8 50%, #fff7ed 80%, #fefce8 100%)',
        }}>
            {/* Floating particles */}
            <FloatingParticles count={isSynergy ? 10 : 6} isSynergy={isSynergy} />

            {/* Synergy petals */}
            {isSynergy && <FallingPetals />}

            {/* Completion celebration */}
            <CompletionBurst active={showBurst} />

            {/* ── Content ────────────────────────────────────── */}
            <div
                className="relative z-10 overflow-y-auto"
                style={{
                    height: '100dvh',
                    paddingTop: 'env(safe-area-inset-top, 0px)',
                    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
                }}
            >
                <div className="mx-auto w-full max-w-[26rem] px-5">

                    {/* ── Header ─────────────────────────────── */}
                    <div className="flex items-center justify-between pt-4 pb-3">
                        <button
                            type="button"
                            onClick={() => setView('home')}
                            className="flex h-10 w-10 items-center justify-center rounded-2xl active:scale-90 transition-transform"
                            style={{
                                background: 'rgba(255,255,255,0.7)',
                                border: '1px solid rgba(0,0,0,0.06)',
                                backdropFilter: 'blur(12px)',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                            }}
                            aria-label="Back to home"
                        >
                            <ArrowLeft size={18} className="text-gray-500" />
                        </button>

                        <div className="text-center">
                            <span className="text-[9px] uppercase tracking-[0.35em] text-gray-400 font-medium">
                                Love Garden
                            </span>
                        </div>

                        {/* Level badge */}
                        <div
                            className="flex h-10 items-center rounded-2xl px-3 gap-1.5"
                            style={{
                                background: isSynergy
                                    ? 'linear-gradient(135deg, rgba(244,114,182,0.12), rgba(168,85,247,0.08))'
                                    : 'rgba(255,255,255,0.7)',
                                border: isSynergy
                                    ? '1px solid rgba(244,114,182,0.2)'
                                    : '1px solid rgba(0,0,0,0.06)',
                                backdropFilter: 'blur(12px)',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                            }}
                        >
                            {isSynergy && <Sparkles size={12} className="text-pink-400" />}
                            <span className="text-[11px] font-bold text-gray-600">
                                {isSynergy ? 'Bloom' : `Lv ${state.level}`}
                            </span>
                        </div>
                    </div>

                    {/* ── Stage title ─────────────────────────── */}
                    <div className="text-center mt-2 mb-1">
                        <h1 className="font-serif text-[1.75rem] font-bold text-gray-800 tracking-tight">
                            {stage.name}
                        </h1>
                        <p className="text-[12.5px] text-gray-400 mt-1 italic">
                            {stage.tagline}
                        </p>
                    </div>

                    {/* ── Stage dots ──────────────────────────── */}
                    <div className="flex items-center gap-1 justify-center mt-3 mb-5">
                        {STAGES.map((s, i) => (
                            <div
                                key={s.name}
                                style={{
                                    width: i === stage.index ? 16 : 5,
                                    height: 5,
                                    borderRadius: 3,
                                    background: i <= stage.index
                                        ? i === stage.index
                                            ? 'linear-gradient(90deg, #f472b6, #a78bfa)'
                                            : 'rgba(244,114,182,0.35)'
                                        : 'rgba(0,0,0,0.06)',
                                    transition: 'all 0.5s ease',
                                }}
                            />
                        ))}
                    </div>

                    {/* ── Tree Scene Card ─────────────────────── */}
                    <div
                        className="relative rounded-[2rem] overflow-hidden"
                        style={{
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.25))',
                            border: '1px solid rgba(255,255,255,0.8)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
                            backdropFilter: 'blur(20px)',
                        }}
                    >
                        <LoveTree growth={normalizedGrowth} isSynergy={isSynergy} isWatering={isWatering} />

                        {/* Growth bar at bottom */}
                        <div className="px-5 pb-4 pt-2">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium">
                                    Growth
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                    {Math.round(normalizedGrowth * 100)}%
                                </span>
                            </div>
                            <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.05)' }}>
                                <motion.div
                                    className="h-full rounded-full"
                                    animate={{ width: `${Math.max(normalizedGrowth * 100, 2)}%` }}
                                    transition={{ type: 'spring', stiffness: 60, damping: 16 }}
                                    style={{
                                        background: isSynergy
                                            ? 'linear-gradient(90deg, #f9a8d4, #c084fc)'
                                            : 'linear-gradient(90deg, #86efac, #6ee7b7)',
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Watering Action ─────────────────────── */}
                    <div className="mt-6">
                        <AnimatePresence mode="wait">
                            {!isMyWatered ? (
                                <motion.div
                                    key="water"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex flex-col items-center"
                                >
                                    {/* Hold button */}
                                    <motion.button
                                        type="button"
                                        aria-label="Hold to water"
                                        onPointerDown={startNurture}
                                        onPointerUp={stopNurture}
                                        onPointerLeave={stopNurture}
                                        onPointerCancel={stopNurture}
                                        className="relative flex h-[6.5rem] w-[6.5rem] items-center justify-center rounded-full"
                                        style={{ touchAction: 'none' }}
                                        animate={{ scale: holdProgress > 0 ? 0.94 : 1 }}
                                        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
                                    >
                                        {/* Soft outer aura */}
                                        <motion.div
                                            className="absolute inset-[-8px] rounded-full"
                                            animate={{
                                                opacity: holdProgress > 0 ? [0.3, 0.5, 0.3] : [0.06, 0.12, 0.06],
                                                scale: holdProgress > 0 ? [1, 1.06, 1] : [1, 1.03, 1],
                                            }}
                                            transition={{ duration: holdProgress > 0 ? 0.6 : 3.5, repeat: Infinity, ease: 'easeInOut' }}
                                            style={{
                                                background: holdProgress > 0
                                                    ? 'radial-gradient(circle, rgba(147,197,253,0.3), transparent 60%)'
                                                    : 'radial-gradient(circle, rgba(196,181,253,0.15), transparent 65%)',
                                            }}
                                        />

                                        {/* SVG progress ring */}
                                        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 112 112">
                                            <circle cx="56" cy="56" r="50" stroke="rgba(0,0,0,0.05)" strokeWidth="2.5" fill="none" />
                                            <motion.circle
                                                cx="56" cy="56" r="50"
                                                stroke="url(#ring-grad)"
                                                strokeWidth="3"
                                                fill="none"
                                                strokeLinecap="round"
                                                animate={{ strokeDashoffset: RITUAL_RING - (RITUAL_RING * holdProgress) / 100 }}
                                                transition={{ duration: 0.05 }}
                                                strokeDasharray={RITUAL_RING}
                                            />
                                            <defs>
                                                <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                                    <stop offset="0%" stopColor="#93c5fd" />
                                                    <stop offset="50%" stopColor="#c4b5fd" />
                                                    <stop offset="100%" stopColor="#f9a8d4" />
                                                </linearGradient>
                                            </defs>
                                        </svg>

                                        {/* Inner button face */}
                                        <div
                                            className="relative flex h-[5rem] w-[5rem] flex-col items-center justify-center rounded-full"
                                            style={{
                                                background: 'linear-gradient(180deg, #fff 0%, #f8f6ff 100%)',
                                                border: '1px solid rgba(0,0,0,0.06)',
                                                boxShadow: '0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 #fff',
                                            }}
                                        >
                                            <motion.div
                                                animate={{
                                                    rotate: holdProgress > 0 ? [0, 8, -8, 0] : 0,
                                                    scale: holdProgress > 0 ? [1, 1.1, 1] : 1,
                                                }}
                                                transition={{ duration: 0.35, repeat: holdProgress > 0 ? Infinity : 0, ease: 'easeInOut' }}
                                            >
                                                <Droplets
                                                    size={22}
                                                    className={holdProgress > 0 ? 'text-blue-400' : 'text-gray-400'}
                                                />
                                            </motion.div>
                                            <span className="mt-0.5 text-[7px] uppercase tracking-[0.2em] text-gray-300 font-medium">
                                                Hold
                                            </span>
                                        </div>
                                    </motion.button>

                                    {/* Label */}
                                    <div className="text-center mt-4">
                                        <p className="text-[13px] font-medium text-gray-500">
                                            {holdProgress > 0
                                                ? `Nurturing... ${Math.round(holdProgress)}%`
                                                : 'Press and hold to nurture'}
                                        </p>
                                        <p className="mt-1 text-[11px] text-gray-400">
                                            {isPartnerWatered
                                                ? `${partnerName} already cared today \u2014 +${SYNERGY_XP} XP!`
                                                : `+${SOLO_XP} XP per ritual`}
                                        </p>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="done"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="rounded-[1.5rem] p-5"
                                    style={{
                                        background: isSynergy
                                            ? 'linear-gradient(135deg, rgba(244,114,182,0.08), rgba(168,85,247,0.05))'
                                            : 'rgba(255,255,255,0.6)',
                                        border: isSynergy
                                            ? '1px solid rgba(244,114,182,0.15)'
                                            : '1px solid rgba(0,0,0,0.05)',
                                        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                                        backdropFilter: 'blur(16px)',
                                    }}
                                >
                                    <div className="flex items-center gap-3.5">
                                        <div
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.875rem]"
                                            style={{
                                                background: isSynergy ? 'rgba(244,114,182,0.1)' : 'rgba(134,239,172,0.1)',
                                                border: isSynergy ? '1px solid rgba(244,114,182,0.15)' : '1px solid rgba(134,239,172,0.15)',
                                            }}
                                        >
                                            {isSynergy
                                                ? <Sparkles size={18} className="text-pink-400" />
                                                : <Heart size={17} className="text-emerald-400" fill="currentColor" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-medium text-gray-700 leading-snug">
                                                {isSynergy ? 'The garden is in full bloom' : 'Care given for today'}
                                            </p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">
                                                {isSynergy
                                                    ? 'Both of you showed up. The petals opened wider.'
                                                    : `Waiting for ${partnerName} to visit.`}
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Care Status ─────────────────────────── */}
                    <div className="mt-5 grid grid-cols-2 gap-2.5">
                        {[
                            { name: myName, done: isMyWatered, time: state.myLastWatered, accent: '#f472b6' },
                            { name: partnerName, done: isPartnerWatered, time: state.partnerLastWatered, accent: '#818cf8' },
                        ].map(person => (
                            <div
                                key={person.name}
                                className="rounded-[1.25rem] p-3.5"
                                style={{
                                    background: person.done ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)',
                                    border: `1px solid ${person.done ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.04)'}`,
                                    boxShadow: person.done ? '0 2px 10px rgba(0,0,0,0.04)' : 'none',
                                    backdropFilter: 'blur(12px)',
                                }}
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{
                                            background: person.done ? person.accent : 'rgba(0,0,0,0.1)',
                                            boxShadow: person.done ? `0 0 5px ${person.accent}44` : 'none',
                                        }}
                                    />
                                    <span className="text-[12px] font-medium text-gray-600">{person.name}</span>
                                </div>
                                <p className="text-[11px] text-gray-400">
                                    {person.done && person.time
                                        ? formatDistanceToNow(new Date(person.time), { addSuffix: true })
                                        : 'Not yet today'}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* ── XP + Info ───────────────────────────── */}
                    <div
                        className="mt-3 rounded-[1.25rem] p-4"
                        style={{
                            background: 'rgba(255,255,255,0.45)',
                            border: '1px solid rgba(0,0,0,0.05)',
                            backdropFilter: 'blur(12px)',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                        }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Sparkles size={12} className="text-purple-300" />
                                <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium">
                                    Level {state.level}
                                </span>
                            </div>
                            <span className="text-[10px] text-gray-400">{xpToNext} XP to next</span>
                        </div>
                        <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                            <motion.div
                                className="h-full rounded-full"
                                animate={{ width: `${state.xp === 0 ? 0 : Math.max(state.xp, 3)}%` }}
                                transition={{ type: 'spring', stiffness: 80, damping: 14 }}
                                style={{ background: 'linear-gradient(90deg, #c4b5fd, #f9a8d4)' }}
                            />
                        </div>

                        {/* Days together & level in compact row */}
                        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                            {daysTogether > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <Heart size={11} className="text-pink-300" fill="currentColor" />
                                    <span className="text-[11px] text-gray-400">
                                        <span className="font-semibold text-gray-600">{daysTogether}</span> days together
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-gray-400">
                                    Stage <span className="font-semibold text-gray-600">{stage.index + 1}</span>/{STAGES.length}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Breathing room */}
                    <div className="h-8" />
                </div>
            </div>
        </div>
    );
};
