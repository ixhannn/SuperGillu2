import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimationEngine } from '../../utils/AnimationEngine';
import { VoxelSceneRenderer } from '../../utils/bonsai/isoRenderer';
import { BonsaiParticles } from '../../utils/bonsai/particles';
import { generateBonsaiModel, growthToBloom, growthToG } from '../../utils/bonsai/voxelModel';
import { hashString } from '../../utils/bonsai/rng';
import type { BlossomNote, BonsaiTreeState } from '../../utils/bonsai/types';

export interface BonsaiSceneHandle {
  startPour: () => void;
  stopPour: () => void;
  /** Bloom-day celebration burst at the newest blossom. */
  celebrate: (golden: boolean) => void;
}

interface NoteOverlay {
  note: BlossomNote;
  x: number;
  y: number;
}

interface BonsaiSceneProps {
  tree: BonsaiTreeState;
  seed: number;
  night: boolean;
  reducedMotion: boolean;
  onNoteTap: (note: BlossomNote) => void;
}

const ENGINE_ID = 'bonsai-scene';

export const BonsaiScene = forwardRef<BonsaiSceneHandle, BonsaiSceneProps>(
  ({ tree, seed, night, reducedMotion, onNoteTap }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mainRef = useRef<HTMLCanvasElement | null>(null);
    const fxRef = useRef<HTMLCanvasElement | null>(null);
    const model = useMemo(() => generateBonsaiModel(seed), [seed]);
    const rendererRef = useRef<VoxelSceneRenderer | null>(null);
    const particlesRef = useRef<BonsaiParticles | null>(null);
    const pouringRef = useRef(false);
    const prevGrowthRef = useRef<number | null>(null);
    const treeRef = useRef(tree);
    treeRef.current = tree;
    const nightRef = useRef(night);
    nightRef.current = night;
    const reducedRef = useRef(reducedMotion);
    reducedRef.current = reducedMotion;
    const [overlays, setOverlays] = useState<NoteOverlay[]>([]);
    const [size, setSize] = useState({ w: 0, h: 0 });

    const modelRef = useRef<typeof model | null>(null);
    if (modelRef.current !== model) {
      // The seed (and thus the model) is stable for a mounted scene; this
      // lazy-init just guards the first render and future remounts.
      modelRef.current = model;
      rendererRef.current = new VoxelSceneRenderer(model);
    }
    if (!particlesRef.current) particlesRef.current = new BonsaiParticles();

    const decorations = useMemo(
      () => new Set(tree.decorations.map((d) => d.id)),
      [tree.decorations],
    );

    // ── Layout: fit renderer + canvases to the container ──────────────
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      let lastW = 0;
      let lastH = 0;
      const apply = () => {
        const rect = el.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (w < 10 || h < 10) return;
        if (w === lastW && h === lastH) return;
        lastW = w;
        lastH = h;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (const canvas of [mainRef.current, fxRef.current]) {
          if (!canvas) continue;
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          const ctx = canvas.getContext('2d');
          ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        rendererRef.current?.layout(w, h, dpr);
        particlesRef.current?.resize(w, h);
        setSize({ w, h });
      };
      apply();
      // The container can measure 0 during the open transition (and
      // ResizeObserver is unreliable in headless preview) — retry briefly
      // until the first real measurement lands.
      const retries = [80, 240, 600, 1400].map((ms) => window.setTimeout(apply, ms));
      const ro = new ResizeObserver(apply);
      ro.observe(el);
      window.addEventListener('resize', apply);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', apply);
        retries.forEach((t) => window.clearTimeout(t));
      };
    }, []);

    // ── Repaint voxel layers when derived state changes ────────────────
    useEffect(() => {
      const renderer = rendererRef.current;
      if (!renderer || size.w === 0) return;
      const opts = {
        growth: tree.growth,
        bloomCount: tree.bloomDays.length,
        decorations,
        resting: tree.resting,
        golden: tree.mood.golden,
      };
      if (!renderer.needsRender(opts)) return;

      // Sparkle where brand-new voxels appear (yesterday → today growth).
      const prev = prevGrowthRef.current;
      renderer.render(opts);
      if (prev != null && tree.growth > prev && !reducedRef.current) {
        const pts = renderer.revealedBetween(prev, tree.growth);
        const fx = particlesRef.current;
        pts.forEach((p, i) => {
          if (i % 2 === 0) fx?.spawnSparkle(p.x, p.y, tree.mood.golden);
        });
      }
      prevGrowthRef.current = tree.growth;
    }, [tree, decorations, size]);

    // ── Note blossom overlays (DOM buttons over the canvas) ────────────
    useEffect(() => {
      const renderer = rendererRef.current;
      if (!renderer || size.w === 0) return;
      const G = growthToG(tree.growth);
      const anchorsLen = Math.max(1, model.anchors.length);
      const recent = tree.notes.slice(0, 6);
      const placed: NoteOverlay[] = [];
      for (const note of recent) {
        if (!note.forMe && note.opened) continue; // my read notes stay quiet
        const idx = hashString(`note:${note.day}`) % anchorsLen;
        const p = G >= 0.4 ? renderer.anchorScreen(idx) : null;
        const fallback = renderer.project(0, 7, 0);
        const at = p ?? fallback;
        placed.push({ note, x: at.x, y: at.y });
      }
      setOverlays(placed);
    }, [tree.notes, tree.growth, size, model]);

    // ── The single 30fps ambient subscriber ────────────────────────────
    useEffect(() => {
      const main = mainRef.current;
      const fx = fxRef.current;
      if (!main || !fx) return;
      const mainCtx = main.getContext('2d');
      const fxCtx = fx.getContext('2d');
      if (!mainCtx || !fxCtx) return;

      AnimationEngine.register({
        id: ENGINE_ID,
        budgetMs: 4,
        minTier: 'low',
        priority: 6,
        fps: 30,
        tick: (delta, ts) => {
          const t = treeRef.current;
          const renderer = rendererRef.current;
          const particles = particlesRef.current;
          if (!renderer || !particles) return;
          const reduced = reducedRef.current;
          const sway = reduced ? 0 : t.resting ? 0.9 : 1.6;
          renderer.composite(mainCtx, reduced ? 0 : ts, sway, t.resting ? 2.5 : 0);

          if (pouringRef.current) {
            const top = renderer.project(0, 16, 0);
            particles.spawnDroplets(top.x, Math.max(12, top.y - 40), 2);
          }
          const canopy = renderer.project(0, 13, 0);
          const bloom = growthToBloom(t.growth);
          particles.tick(fxCtx, delta / 1000, {
            petalRate: reduced ? 0 : bloom * 0.55,
            night: nightRef.current && !reduced,
            golden: t.mood.golden,
            canopy: { x: canopy.x, y: canopy.y, spread: 150 * bloom + 40 },
          });
        },
      });
      return () => AnimationEngine.unregister(ENGINE_ID);
    }, []);

    useImperativeHandle(ref, (): BonsaiSceneHandle => ({
      startPour: () => {
        pouringRef.current = true;
      },
      stopPour: () => {
        pouringRef.current = false;
      },
      celebrate: (golden: boolean) => {
        const renderer = rendererRef.current;
        const particles = particlesRef.current;
        if (!renderer || !particles || reducedRef.current) return;
        const idx = Math.max(0, treeRef.current.bloomDays.length - 1);
        const p = renderer.anchorScreen(idx) ?? renderer.project(0, 12, 0);
        particles.burst(p.x, p.y, golden);
      },
    }), []);

    return (
      <div ref={containerRef} className="bonsai-scene" aria-label="Your bonsai tree">
        <canvas ref={mainRef} className="bonsai-scene__layer" />
        <canvas ref={fxRef} className="bonsai-scene__layer" />
        {overlays.map(({ note, x, y }) => {
          const state = !note.forMe
            ? 'mine'
            : !note.unlocked
              ? 'sealed'
              : note.opened
                ? 'opened'
                : 'unread';
          return (
            <button
              key={note.eventId}
              type="button"
              className={`bonsai-note bonsai-note--${state}`}
              style={{ left: `${x}px`, top: `${y}px` }}
              onClick={() => onNoteTap(note)}
              aria-label={
                note.forMe
                  ? note.unlocked
                    ? 'A blossom holds a note for you'
                    : 'A sealed blossom — water the tree to open it'
                  : 'Your tucked-away note'
              }
            >
              <span className="bonsai-note__bud" />
            </button>
          );
        })}
      </div>
    );
  },
);

BonsaiScene.displayName = 'BonsaiScene';
