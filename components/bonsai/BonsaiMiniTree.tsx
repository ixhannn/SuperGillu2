import React, { useEffect, useRef } from 'react';
import { VoxelSceneRenderer } from '../../utils/bonsai/isoRenderer';
import { generateBonsaiModel, type BonsaiSpeciesId } from '../../utils/bonsai/voxelModel';
import type { BonsaiSeason } from '../../utils/bonsai/growth';

interface BonsaiMiniTreeProps {
  seed: number;
  species: BonsaiSpeciesId;
  growth: number;
  bloomCount: number;
  season: BonsaiSeason;
  size?: number;
}

/**
 * A tiny live portrait of the couple's actual tree — same seed, same
 * species, same growth — rendered ONCE per state change (no animation
 * loop, no engine subscription). Sits on the Home card so the tree greets
 * you before you even open it.
 *
 * The first paint is deferred a beat: Home mounts on the app's hot boot
 * path and model generation is not free.
 */
export function BonsaiMiniTree({
  seed,
  species,
  growth,
  bloomCount,
  season,
  size = 74,
}: BonsaiMiniTreeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<{ key: string; renderer: VoxelSceneRenderer } | null>(null);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      if (!live) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Model generation is the expensive part — reuse it while the tree's
      // DNA is unchanged (daily growth only repaints).
      const key = `${seed}:${species}`;
      if (rendererRef.current?.key !== key) {
        rendererRef.current = { key, renderer: new VoxelSceneRenderer(generateBonsaiModel(seed, species)) };
      }
      const renderer = rendererRef.current.renderer;
      renderer.layout(size, size, dpr);
      renderer.render({
        growth,
        bloomCount,
        decorations: new Set(),
        resting: false,
        golden: false,
        season,
      });
      renderer.composite(ctx, 0, 0, 0);
    }, 220);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [seed, species, growth, bloomCount, season, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: 'block' }}
      aria-hidden="true"
    />
  );
}
