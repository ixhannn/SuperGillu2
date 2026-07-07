/**
 * OUR HOME — the furnishing drawer.
 *
 * A warm bottom sheet holding everything the home understands, grouped by
 * category with live-rendered miniatures of the real art. Drag a card straight
 * into the room (one continuous gesture — the drawer slips away as you lift),
 * or tap it to set the piece down mid-room. Kept things — pieces with a story,
 * resting in the cupboard — always come first.
 */
import React, { useMemo, useRef, useState } from 'react';
import { HomeCategory, HomeObject, HomeSku } from './homeTypes';
import { CATEGORY_ORDER, drawerSkus, skuOf } from './homeCatalog';

const DRAG_SLOP = 12;

/** Preview states so thumbnails read at their most alive. */
const THUMB_VSTATE: Record<string, string> = {
  'lamp-a': 'lit',
  'lamp-b': 'lit',
  'arc-lamp': 'lit',
  'tripod-lamp': 'lit',
  'table-lamp': 'lit',
  lantern: 'lit',
  'string-lights': 'lit',
  candle: 'lit',
  vase: 'fresh',
  book: 'ribbon',
  'record-player': 'still',
  window: '#aac4d4|#e9e2cf|o',
  'front-door': 'you & them',
  hearth: 'lit',
};
const THUMB_DETAIL: Record<string, number> = {
  bookcase: 8,
  'bookshelf-tall': 16,
  'sill-pot': 4,
  'cookie-plate': 5,
  'front-door': 3,
  hearth: 2,
};

const SkuThumb = ({ sku }: { sku: HomeSku }) => (
  <span className="oh-thumb-well">
    <svg
      className="oh-thumb"
      viewBox={`${-(sku.w / 2) - 6} ${-sku.h - 8} ${sku.w + 12} ${sku.h + 16}`}
      aria-hidden="true"
    >
      <sku.art facing={0} vState={THUMB_VSTATE[sku.sku]} detail={THUMB_DETAIL[sku.sku]} />
    </svg>
  </span>
);

interface CardPointerHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
}

/** Tap = place mid-room; a real drag hands the piece to the scene. */
const useCardGesture = (
  onDrag: (e: React.PointerEvent) => void,
  onTap: () => void,
): CardPointerHandlers => {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  return {
    onPointerDown: (e) => {
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    },
    onPointerMove: (e) => {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > DRAG_SLOP) {
        start.current = null;
        onDrag(e);
      }
    },
    onPointerUp: (e) => {
      const s = start.current;
      start.current = null;
      if (s && e.pointerId === s.id) onTap();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
};

const DrawerCard = ({ sku, onDrag, onTap }: {
  sku: HomeSku;
  onDrag: (e: React.PointerEvent, skuId: string) => void;
  onTap: (skuId: string) => void;
}) => {
  const gesture = useCardGesture((e) => onDrag(e, sku.sku), () => onTap(sku.sku));
  return (
    <button type="button" className="oh-card" {...gesture}>
      <SkuThumb sku={sku} />
      <span className="oh-card-name">{sku.name}</span>
      {sku.provenanceLabel && <span className="oh-card-blurb">{sku.provenanceLabel}</span>}
    </button>
  );
};

const KeptCard = ({ o, onDrag, onTap }: {
  o: HomeObject;
  onDrag: (e: React.PointerEvent, uid: string) => void;
  onTap: (uid: string) => void;
}) => {
  const sku = skuOf(o.sku);
  const gesture = useCardGesture((e) => onDrag(e, o.uid), () => onTap(o.uid));
  if (!sku) return null;
  return (
    <button type="button" className="oh-card oh-card-kept" {...gesture}>
      <span className="oh-kept-tag">kept</span>
      <SkuThumb sku={sku} />
      <span className="oh-card-name">{o.nickname ?? sku.name}</span>
      {o.provenance?.label && <span className="oh-card-blurb">{o.provenance.label}</span>}
    </button>
  );
};

export interface HomeFurnishDrawerProps {
  open: boolean;
  keptItems: readonly HomeObject[];
  onClose: () => void;
  onDragNew: (e: React.PointerEvent, sku: string) => void;
  onTapNew: (sku: string) => void;
  onDragKept: (e: React.PointerEvent, uid: string) => void;
  onTapKept: (uid: string) => void;
}

export const HomeFurnishDrawer = ({
  open, keptItems, onClose, onDragNew, onTapNew, onDragKept, onTapKept,
}: HomeFurnishDrawerProps): React.JSX.Element | null => {
  const [cat, setCat] = useState<HomeCategory | 'all'>('all');
  const skus = useMemo(() => drawerSkus(), []);
  const shown = useMemo(
    () => (cat === 'all' ? skus : skus.filter((s) => s.category === cat)),
    [skus, cat],
  );
  const cats = useMemo(() => {
    const present = new Set(skus.map((s) => s.category));
    return CATEGORY_ORDER.filter((c) => present.has(c.key));
  }, [skus]);

  if (!open) return null;
  return (
    <>
      <div className="oh-drawer-scrim" onPointerDown={onClose} />
      <section className="oh-drawer" aria-label="furnish the room">
        <button type="button" className="oh-drawer-handle" onClick={onClose} aria-label="close">
          <span />
        </button>
        <header className="oh-drawer-head">
          <p className="oh-drawer-title">Furnish our home</p>
          <p className="oh-drawer-sub">drag a piece into the room, or tap to set it down</p>
        </header>
        <div className="oh-chips" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={cat === 'all'}
            className={`oh-chip ${cat === 'all' ? 'is-on' : ''}`}
            onClick={() => setCat('all')}
          >
            Everything
          </button>
          {cats.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={cat === c.key}
              className={`oh-chip ${cat === c.key ? 'is-on' : ''}`}
              onClick={() => setCat(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="oh-drawer-scroll">
          {keptItems.length > 0 && (cat === 'all' || cat === 'kept') && (
            <>
              <p className="oh-drawer-eyebrow">kept — story intact</p>
              <div className="oh-grid">
                {keptItems.map((o) => (
                  <KeptCard key={o.uid} o={o} onDrag={onDragKept} onTap={onTapKept} />
                ))}
              </div>
            </>
          )}
          <div className="oh-grid">
            {shown.map((s) => (
              <DrawerCard key={s.sku} sku={s} onDrag={onDragNew} onTap={onTapNew} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
};
