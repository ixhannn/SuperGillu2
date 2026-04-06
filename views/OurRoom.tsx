import React, { useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ShoppingBag, X, Trash2, Check } from 'lucide-react';
import { ViewState, RoomFurniture, RoomState } from '../types';
import { StorageService } from '../services/storage';

// ── Isometric constants ──────────────────────────────────────────────────────
const GRID = 6;
const HW = 26;   // half tile width in SVG pixels
const HH = 13;   // half tile height
const OX = 180;  // origin X — top corner of floor diamond
const OY = 108;  // origin Y
const WH = 98;   // wall height
const SVG_W = 360;
const SVG_H = 290;

const iso = (gx: number, gy: number) => ({
    x: OX + (gx - gy) * HW,
    y: OY + (gx + gy) * HH,
});

const screenToGrid = (sx: number, sy: number) => {
    const dx = (sx - OX) / HW;
    const dy = (sy - OY) / HH;
    return {
        gx: Math.floor((dy + dx) / 2),
        gy: Math.floor((dy - dx) / 2),
    };
};

const inBounds = (gx: number, gy: number, w = 1, h = 1) =>
    gx >= 0 && gy >= 0 && gx + w <= GRID && gy + h <= GRID;

// ── Catalog ──────────────────────────────────────────────────────────────────
interface CatalogItem {
    id: string;
    emoji: string;
    name: string;
    w: number;
    h: number;
    cost: number;
    tier: 'free' | 'special' | 'premium';
    fontSize?: number;
}

const CATALOG: CatalogItem[] = [
    { id: 'frame',   emoji: '🖼️', name: 'Love Frame',     w: 1, h: 1, cost: 0,   tier: 'special' },
    { id: 'candle',  emoji: '🕯️',  name: 'Streak Candle', w: 1, h: 1, cost: 0,   tier: 'special' },
    { id: 'sofa',    emoji: '🛋️',  name: 'Sofa',           w: 2, h: 1, cost: 0,   tier: 'free', fontSize: 32 },
    { id: 'lamp',    emoji: '🪔',  name: 'Lamp',           w: 1, h: 1, cost: 40,  tier: 'free' },
    { id: 'plant',   emoji: '🪴',  name: 'Plant',          w: 1, h: 1, cost: 50,  tier: 'free' },
    { id: 'table',   emoji: '🫖',  name: 'Tea Table',      w: 1, h: 1, cost: 60,  tier: 'free' },
    { id: 'tv',      emoji: '📺',  name: 'TV Stand',       w: 2, h: 1, cost: 100, tier: 'free', fontSize: 30 },
    { id: 'books',   emoji: '📚',  name: 'Bookshelf',      w: 1, h: 1, cost: 80,  tier: 'free' },
    { id: 'rug',     emoji: '🟥',  name: 'Cozy Rug',       w: 2, h: 2, cost: 120, tier: 'free', fontSize: 38 },
    { id: 'bed',     emoji: '🛏️',  name: 'Cozy Bed',       w: 2, h: 2, cost: 200, tier: 'premium', fontSize: 36 },
    { id: 'piano',   emoji: '🎹',  name: 'Piano',          w: 2, h: 1, cost: 300, tier: 'premium', fontSize: 30 },
    { id: 'blossom', emoji: '🌸',  name: 'Cherry Blossom', w: 1, h: 2, cost: 150, tier: 'premium', fontSize: 28 },
    { id: 'crystal', emoji: '🔮',  name: 'Crystal Ball',   w: 1, h: 1, cost: 400, tier: 'premium' },
    { id: 'cat',     emoji: '🐱',  name: 'Room Cat',       w: 1, h: 1, cost: 250, tier: 'premium' },
];

const CATALOG_MAP = Object.fromEntries(CATALOG.map(c => [c.id, c]));

const TIER_BADGE: Record<string, string> = {
    special: '✨',
    premium: '👑',
    free: '',
};

// ── Tile color checkerboard ───────────────────────────────────────────────────
const tileColor = (gx: number, gy: number) =>
    (gx + gy) % 2 === 0 ? '#fff0f8' : '#fce8f4';

// ── Overlap check ─────────────────────────────────────────────────────────────
const overlaps = (
    ax: number, ay: number, aw: number, ah: number,
    bx: number, by: number, bw: number, bh: number,
) => !(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay);

const canPlace = (
    gx: number, gy: number,
    item: CatalogItem,
    furniture: RoomFurniture[],
    ignoreUid?: string,
): boolean => {
    if (!inBounds(gx, gy, item.w, item.h)) return false;
    for (const f of furniture) {
        if (f.uid === ignoreUid) continue;
        const fi = CATALOG_MAP[f.itemId];
        if (!fi) continue;
        if (overlaps(gx, gy, item.w, item.h, f.gx, f.gy, fi.w, fi.h)) return false;
    }
    return true;
};

// ── Item anchor (center of footprint, elevated) ───────────────────────────────
const itemAnchor = (gx: number, gy: number, item: CatalogItem) => {
    const cx = gx + item.w / 2;
    const cy = gy + item.h / 2;
    const { x, y } = iso(cx, cy);
    return { x, y: y - 12 };
};

// ── SVG tile polygon string ───────────────────────────────────────────────────
const tilePoints = (gx: number, gy: number): string => {
    const t = iso(gx, gy);
    const r = iso(gx + 1, gy);
    const b = iso(gx + 1, gy + 1);
    const l = iso(gx, gy + 1);
    return `${t.x},${t.y} ${r.x},${r.y} ${b.x},${b.y} ${l.x},${l.y}`;
};

// ── Main component ────────────────────────────────────────────────────────────
interface OurRoomProps { setView: (v: ViewState) => void; }

export const OurRoom: React.FC<OurRoomProps> = ({ setView }) => {
    const profile = StorageService.getCoupleProfile();
    const svgRef = useRef<SVGSVGElement>(null);

    const [roomState, setRoomState] = useState<RoomState>(() => StorageService.getRoomState());
    const { furniture, coins } = roomState;

    const [showShop, setShowShop] = useState(false);
    const [placingItem, setPlacingItem] = useState<CatalogItem | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [hoverCell, setHoverCell] = useState<{ gx: number; gy: number } | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const save = useCallback((next: RoomState) => {
        setRoomState(next);
        StorageService.saveRoomState(next);
    }, []);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2000);
    }, []);

    // ── Placement ─────────────────────────────────────────────────────────────
    const placeItem = useCallback((gx: number, gy: number) => {
        if (!placingItem) return;
        if (!canPlace(gx, gy, placingItem, furniture)) {
            showToast('No room there!');
            return;
        }
        if (placingItem.cost > coins) {
            showToast('Not enough coins!');
            return;
        }
        const uid = crypto.randomUUID();
        const next: RoomState = {
            furniture: [...furniture, { uid, itemId: placingItem.id, gx, gy, placedBy: profile.myName }],
            coins: coins - placingItem.cost,
        };
        save(next);
        setPlacingItem(null);
        setHoverCell(null);
        showToast(`${placingItem.emoji} placed!`);
    }, [placingItem, furniture, coins, profile.myName, save, showToast]);

    const removeItem = useCallback((uid: string) => {
        const item = furniture.find(f => f.uid === uid);
        const catalogItem = item ? CATALOG_MAP[item.itemId] : null;
        const refund = catalogItem ? Math.floor(catalogItem.cost * 0.5) : 0;
        save({
            furniture: furniture.filter(f => f.uid !== uid),
            coins: coins + refund,
        });
        if (refund > 0) showToast(`+${refund} coins refunded`);
    }, [furniture, coins, save, showToast]);

    // ── SVG coordinate helper ─────────────────────────────────────────────────
    const toSvgCoords = (clientX: number, clientY: number) => {
        const rect = svgRef.current!.getBoundingClientRect();
        return {
            sx: (clientX - rect.left) * (SVG_W / rect.width),
            sy: (clientY - rect.top) * (SVG_H / rect.height),
        };
    };

    const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editMode || !placingItem) return;
        const { sx, sy } = toSvgCoords(e.clientX, e.clientY);
        const { gx, gy } = screenToGrid(sx, sy);
        placeItem(gx, gy);
    };

    const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
        if (!placingItem) return;
        e.preventDefault();
        const t = e.touches[0];
        const { sx, sy } = toSvgCoords(t.clientX, t.clientY);
        const grid = screenToGrid(sx, sy);
        if (inBounds(grid.gx, grid.gy, placingItem.w, placingItem.h)) {
            setHoverCell(grid);
        }
    };

    const handleTouchEnd = (e: React.TouchEvent<SVGSVGElement>) => {
        if (!placingItem) return;
        const t = e.changedTouches[0];
        const { sx, sy } = toSvgCoords(t.clientX, t.clientY);
        const { gx, gy } = screenToGrid(sx, sy);
        placeItem(gx, gy);
        setHoverCell(null);
    };

    // ── Sorted furniture for painter's algorithm ──────────────────────────────
    const sortedFurniture = useMemo(() =>
        [...furniture].sort((a, b) => {
            const ai = CATALOG_MAP[a.itemId];
            const bi = CATALOG_MAP[b.itemId];
            return (a.gx + a.gy + (ai?.w ?? 1) + (ai?.h ?? 1))
                - (b.gx + b.gy + (bi?.w ?? 1) + (bi?.h ?? 1));
        }),
        [furniture],
    );

    // ── Hover highlight tiles ─────────────────────────────────────────────────
    const highlightTiles = useMemo(() => {
        if (!placingItem || !hoverCell) return [];
        const { gx, gy } = hoverCell;
        const ok = canPlace(gx, gy, placingItem, furniture);
        const tiles: { gx: number; gy: number; ok: boolean }[] = [];
        for (let dx = 0; dx < placingItem.w; dx++) {
            for (let dy = 0; dy < placingItem.h; dy++) {
                tiles.push({ gx: gx + dx, gy: gy + dy, ok });
            }
        }
        return tiles;
    }, [placingItem, hoverCell, furniture]);

    // Floor & wall geometry
    const floorTop = iso(0, 0);
    const floorRight = iso(GRID, 0);
    const floorBottom = iso(GRID, GRID);
    const floorLeft = iso(0, GRID);
    const wallTop = { x: OX, y: OY - WH };
    const wallRight = { x: floorRight.x, y: floorRight.y - WH };
    const wallLeft = { x: floorLeft.x, y: floorLeft.y - WH };

    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--theme-bg-main)' }}>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-3">
                <button
                    onClick={() => setView('us')}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.07)' }}
                >
                    <ArrowLeft size={18} className="text-gray-600" />
                </button>

                <div className="text-center">
                    <h1 className="font-serif font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
                        Our Room
                    </h1>
                    <p className="text-[0.65rem] font-medium text-gray-400">
                        {profile.myName} & {profile.partnerName}
                    </p>
                </div>

                {/* Coins */}
                <div
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(255,220,50,0.18)', border: '1px solid rgba(200,160,0,0.2)' }}
                >
                    <span className="text-sm">🪙</span>
                    <span className="text-[0.78rem] font-bold" style={{ color: '#9a6a00' }}>{coins}</span>
                </div>
            </div>

            {/* ── Isometric Room ─────────────────────────────────────────────── */}
            <div className="relative flex-1 flex flex-col">
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                    width="100%"
                    style={{ display: 'block', cursor: placingItem ? 'crosshair' : 'default', touchAction: placingItem ? 'none' : 'auto' }}
                    onClick={handleSvgClick}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <defs>
                        {/* Left wall gradient */}
                        <linearGradient id="lgLeft" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#fce7f3" />
                            <stop offset="100%" stopColor="#f9d0e8" />
                        </linearGradient>
                        {/* Right wall gradient */}
                        <linearGradient id="lgRight" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#f9d0e8" />
                            <stop offset="100%" stopColor="#f0bdd9" />
                        </linearGradient>
                        {/* Ceiling gradient */}
                        <linearGradient id="lgCeil" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f0bdd9" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="#fce7f3" stopOpacity="0" />
                        </linearGradient>
                        {/* Floor vignette */}
                        <radialGradient id="floorVig" cx="50%" cy="50%" r="70%">
                            <stop offset="0%" stopColor="rgba(252,232,244,0)" />
                            <stop offset="100%" stopColor="rgba(240,180,220,0.15)" />
                        </radialGradient>
                    </defs>

                    {/* ── Left wall ──────────────────────────────────────────── */}
                    <polygon
                        points={`${floorTop.x},${floorTop.y} ${floorLeft.x},${floorLeft.y} ${wallLeft.x},${wallLeft.y} ${wallTop.x},${wallTop.y}`}
                        fill="url(#lgLeft)"
                        stroke="#f0c6e0"
                        strokeWidth="0.8"
                    />

                    {/* ── Right wall ─────────────────────────────────────────── */}
                    <polygon
                        points={`${floorTop.x},${floorTop.y} ${floorRight.x},${floorRight.y} ${wallRight.x},${wallRight.y} ${wallTop.x},${wallTop.y}`}
                        fill="url(#lgRight)"
                        stroke="#e8b0d4"
                        strokeWidth="0.8"
                    />

                    {/* Wall top edge highlight */}
                    <line
                        x1={wallLeft.x} y1={wallLeft.y}
                        x2={wallTop.x} y2={wallTop.y}
                        stroke="rgba(255,255,255,0.7)" strokeWidth="1.2"
                    />
                    <line
                        x1={wallTop.x} y1={wallTop.y}
                        x2={wallRight.x} y2={wallRight.y}
                        stroke="rgba(255,255,255,0.5)" strokeWidth="1.2"
                    />

                    {/* Left wall window */}
                    {(() => {
                        const wx = wallLeft.x + (wallTop.x - wallLeft.x) * 0.4;
                        const wy = wallLeft.y + (wallTop.y - wallLeft.y) * 0.35;
                        return (
                            <g>
                                <rect x={wx - 16} y={wy - 12} width={32} height={24} rx={3}
                                    fill="rgba(200,240,255,0.5)" stroke="#d4b8cc" strokeWidth="1" />
                                <line x1={wx} y1={wy - 12} x2={wx} y2={wy + 12} stroke="#d4b8cc" strokeWidth="0.8" />
                                <line x1={wx - 16} y1={wy} x2={wx + 16} y2={wy} stroke="#d4b8cc" strokeWidth="0.8" />
                                {/* Window glow */}
                                <rect x={wx - 16} y={wy - 12} width={32} height={24} rx={3}
                                    fill="rgba(255,240,200,0.25)" />
                            </g>
                        );
                    })()}

                    {/* Right wall shelf */}
                    {(() => {
                        const sx1 = floorTop.x + (floorRight.x - floorTop.x) * 0.25;
                        const sy1 = floorTop.y + (floorRight.y - floorTop.y) * 0.25 - WH * 0.45;
                        const sx2 = floorTop.x + (floorRight.x - floorTop.x) * 0.65;
                        const sy2 = floorTop.y + (floorRight.y - floorTop.y) * 0.65 - WH * 0.45;
                        return (
                            <g>
                                <line x1={sx1} y1={sy1} x2={sx2} y2={sy2} stroke="#e0aed0" strokeWidth="3" strokeLinecap="round" />
                                <text x={(sx1 + sx2) / 2 - 10} y={sy1 - 4} fontSize="12" textAnchor="middle">🌺</text>
                            </g>
                        );
                    })()}

                    {/* ── Floor tiles ────────────────────────────────────────── */}
                    {Array.from({ length: GRID }, (_, gy) =>
                        Array.from({ length: GRID }, (_, gx) => (
                            <polygon
                                key={`tile-${gx}-${gy}`}
                                points={tilePoints(gx, gy)}
                                fill={tileColor(gx, gy)}
                                stroke="#f0c6e0"
                                strokeWidth="0.5"
                            />
                        ))
                    )}

                    {/* Floor vignette overlay */}
                    <polygon
                        points={`${floorTop.x},${floorTop.y} ${floorRight.x},${floorRight.y} ${floorBottom.x},${floorBottom.y} ${floorLeft.x},${floorLeft.y}`}
                        fill="url(#floorVig)"
                        pointerEvents="none"
                    />

                    {/* ── Highlight tiles (placement preview) ────────────────── */}
                    {highlightTiles.map(({ gx, gy, ok }) => (
                        <polygon
                            key={`hl-${gx}-${gy}`}
                            points={tilePoints(gx, gy)}
                            fill={ok ? 'rgba(74,222,128,0.35)' : 'rgba(239,68,68,0.35)'}
                            stroke={ok ? 'rgba(22,163,74,0.7)' : 'rgba(220,38,38,0.7)'}
                            strokeWidth="1.5"
                            pointerEvents="none"
                        />
                    ))}

                    {/* ── Placed furniture ───────────────────────────────────── */}
                    {sortedFurniture.map(f => {
                        const item = CATALOG_MAP[f.itemId];
                        if (!item) return null;
                        const anchor = itemAnchor(f.gx, f.gy, item);
                        const fs = item.fontSize ?? 24;
                        return (
                            <g
                                key={f.uid}
                                style={{ cursor: editMode ? 'pointer' : 'default' }}
                                onClick={editMode ? (e) => { e.stopPropagation(); removeItem(f.uid); } : undefined}
                            >
                                {/* Drop shadow */}
                                <ellipse
                                    cx={anchor.x}
                                    cy={anchor.y + fs * 0.55}
                                    rx={fs * 0.55}
                                    ry={fs * 0.18}
                                    fill="rgba(180,100,160,0.18)"
                                />
                                <text
                                    x={anchor.x}
                                    y={anchor.y}
                                    fontSize={fs}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    style={{ userSelect: 'none', filter: editMode ? 'brightness(0.75) saturate(0.5)' : undefined }}
                                >
                                    {item.emoji}
                                </text>
                                {editMode && (
                                    <g>
                                        <circle cx={anchor.x + fs * 0.5} cy={anchor.y - fs * 0.5} r={8}
                                            fill="rgba(239,68,68,0.9)" />
                                        <text x={anchor.x + fs * 0.5} y={anchor.y - fs * 0.5}
                                            fontSize={10} textAnchor="middle" dominantBaseline="middle"
                                            fill="white" fontWeight="bold">✕</text>
                                    </g>
                                )}
                                {/* Streak Candle glow if streak > 0 */}
                                {f.itemId === 'candle' && (
                                    <ellipse cx={anchor.x} cy={anchor.y - fs * 0.6}
                                        rx={10} ry={10}
                                        fill="rgba(251,191,36,0.2)" />
                                )}
                            </g>
                        );
                    })}

                    {/* Ghost item preview when dragging */}
                    {placingItem && hoverCell && inBounds(hoverCell.gx, hoverCell.gy, placingItem.w, placingItem.h) && (() => {
                        const anchor = itemAnchor(hoverCell.gx, hoverCell.gy, placingItem);
                        const fs = placingItem.fontSize ?? 24;
                        const ok = canPlace(hoverCell.gx, hoverCell.gy, placingItem, furniture);
                        return (
                            <text
                                x={anchor.x} y={anchor.y}
                                fontSize={fs} textAnchor="middle" dominantBaseline="middle"
                                opacity={ok ? 0.7 : 0.4}
                                style={{ userSelect: 'none' }}
                            >
                                {placingItem.emoji}
                            </text>
                        );
                    })()}
                </svg>

                {/* ── Bottom controls ─────────────────────────────────────────── */}
                <div className="px-4 pb-6 pt-2 flex flex-col items-center gap-3">
                    <AnimatePresence mode="wait">
                        {placingItem ? (
                            <motion.div key="placing"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                                className="flex items-center gap-3"
                            >
                                <div
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
                                    style={{ background: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(236,72,153,0.2)', backdropFilter: 'blur(12px)' }}
                                >
                                    <span className="text-xl">{placingItem.emoji}</span>
                                    <span className="text-sm font-semibold text-gray-700">Tap a tile to place</span>
                                </div>
                                <button
                                    onClick={() => { setPlacingItem(null); setHoverCell(null); }}
                                    className="w-10 h-10 rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}
                                >
                                    <X size={16} className="text-red-500" />
                                </button>
                            </motion.div>
                        ) : editMode ? (
                            <motion.div key="edit"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                                className="flex items-center gap-3"
                            >
                                <div
                                    className="px-4 py-2.5 rounded-2xl"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.2)' }}
                                >
                                    <span className="text-sm font-semibold text-red-600">Tap an item to remove it</span>
                                </div>
                                <button
                                    onClick={() => setEditMode(false)}
                                    className="w-10 h-10 rounded-full flex items-center justify-center"
                                    style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(22,163,74,0.25)' }}
                                >
                                    <Check size={16} className="text-green-600" />
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div key="normal"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                                className="flex items-center gap-2.5"
                            >
                                <button
                                    onClick={() => setShowShop(true)}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-semibold text-sm text-white"
                                    style={{ background: 'linear-gradient(135deg,#ec4899,#db2777)', boxShadow: '0 4px 16px rgba(219,39,119,0.35)' }}
                                >
                                    <ShoppingBag size={16} />
                                    Furnish Room
                                </button>
                                {furniture.length > 0 && (
                                    <button
                                        onClick={() => setEditMode(true)}
                                        className="w-10 h-10 rounded-2xl flex items-center justify-center"
                                        style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.08)' }}
                                    >
                                        <Trash2 size={15} className="text-gray-500" />
                                    </button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {furniture.length === 0 && !placingItem && !editMode && (
                        <p className="text-[0.72rem] text-gray-400 font-medium text-center">
                            Tap "Furnish Room" to start decorating your space together ✨
                        </p>
                    )}
                </div>
            </div>

            {/* ── Toast ──────────────────────────────────────────────────────── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full text-sm font-semibold shadow-lg"
                        style={{ background: 'rgba(30,30,30,0.88)', color: 'white', backdropFilter: 'blur(12px)' }}
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Shop Drawer ─────────────────────────────────────────────────── */}
            <AnimatePresence>
                {showShop && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowShop(false)}
                            className="fixed inset-0 z-40"
                            style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)' }}
                        />

                        {/* Sheet */}
                        <motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden"
                            style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(24px)', maxHeight: '72vh' }}
                        >
                            {/* Handle */}
                            <div className="flex justify-center pt-3 pb-1">
                                <div className="w-10 h-1 rounded-full bg-gray-200" />
                            </div>

                            {/* Header */}
                            <div className="flex items-center justify-between px-5 pb-3 pt-1">
                                <div>
                                    <h2 className="font-serif font-bold text-lg text-gray-800">Furnish Your Room</h2>
                                    <p className="text-xs text-gray-400 font-medium mt-0.5">
                                        🪙 {coins} coins available
                                    </p>
                                </div>
                                <button onClick={() => setShowShop(false)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100">
                                    <X size={14} className="text-gray-600" />
                                </button>
                            </div>

                            {/* Item grid */}
                            <div className="overflow-y-auto px-4 pb-8" style={{ maxHeight: 'calc(72vh - 100px)' }}>
                                {/* Section: Special */}
                                <ShopSection
                                    label="✨ Special Items"
                                    items={CATALOG.filter(c => c.tier === 'special')}
                                    coins={coins}
                                    furniture={furniture}
                                    onSelect={(item) => { setShowShop(false); setPlacingItem(item); }}
                                />
                                <ShopSection
                                    label="Free Items"
                                    items={CATALOG.filter(c => c.tier === 'free')}
                                    coins={coins}
                                    furniture={furniture}
                                    onSelect={(item) => { setShowShop(false); setPlacingItem(item); }}
                                />
                                <ShopSection
                                    label="👑 Premium"
                                    items={CATALOG.filter(c => c.tier === 'premium')}
                                    coins={coins}
                                    furniture={furniture}
                                    onSelect={(item) => { setShowShop(false); setPlacingItem(item); }}
                                />
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

// ── Shop section ──────────────────────────────────────────────────────────────
const ShopSection: React.FC<{
    label: string;
    items: CatalogItem[];
    coins: number;
    furniture: RoomFurniture[];
    onSelect: (item: CatalogItem) => void;
}> = ({ label, items, coins, furniture, onSelect }) => (
    <div className="mb-5">
        <p className="text-[0.72rem] font-bold uppercase tracking-wider text-gray-400 mb-2.5">{label}</p>
        <div className="grid grid-cols-4 gap-2">
            {items.map(item => {
                const affordable = item.cost === 0 || coins >= item.cost;
                const owned = furniture.some(f => f.itemId === item.id);
                return (
                    <motion.button
                        key={item.id}
                        whileTap={{ scale: 0.93 }}
                        onClick={() => onSelect(item)}
                        className="flex flex-col items-center gap-1 rounded-2xl p-2.5 relative"
                        style={{
                            background: item.tier === 'special'
                                ? 'linear-gradient(135deg, rgba(253,242,248,0.9), rgba(237,233,254,0.9))'
                                : item.tier === 'premium'
                                ? 'linear-gradient(135deg, rgba(255,251,235,0.9), rgba(254,243,199,0.9))'
                                : 'rgba(0,0,0,0.04)',
                            border: item.tier === 'special'
                                ? '1px solid rgba(219,39,119,0.15)'
                                : item.tier === 'premium'
                                ? '1px solid rgba(180,120,0,0.2)'
                                : '1px solid rgba(0,0,0,0.07)',
                            opacity: affordable ? 1 : 0.5,
                        }}
                    >
                        <span className="text-2xl leading-none">{item.emoji}</span>
                        <span className="text-[0.6rem] font-semibold text-center leading-tight text-gray-600 line-clamp-1">
                            {item.name}
                        </span>
                        <span
                            className="text-[0.62rem] font-bold"
                            style={{ color: item.cost === 0 ? '#16a34a' : affordable ? '#9a6a00' : '#ef4444' }}
                        >
                            {item.cost === 0 ? 'Free' : `🪙 ${item.cost}`}
                        </span>
                        {owned && (
                            <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-green-400 flex items-center justify-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            </div>
                        )}
                        {!affordable && (
                            <div className="absolute inset-0 rounded-2xl flex items-center justify-center"
                                style={{ background: 'rgba(255,255,255,0.4)' }}>
                                <span className="text-lg">🔒</span>
                            </div>
                        )}
                    </motion.button>
                );
            })}
        </div>
    </div>
);
