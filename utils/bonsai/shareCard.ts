/**
 * Renders the couple's bonsai into a shareable portrait card (PNG data URL).
 * Pure canvas — no server round-trip, nothing leaves the device until the
 * user confirms the OS share sheet.
 */

import type { BonsaiSeason } from './growth';
import { VoxelSceneRenderer } from './isoRenderer';
import { generateBonsaiModel, type BonsaiSpeciesId } from './voxelModel';
import type { BonsaiDecorationId } from './types';

export interface ShareCardInput {
  seed: number;
  species: BonsaiSpeciesId;
  growth: number;
  bloomCount: number;
  decorations: ReadonlySet<BonsaiDecorationId>;
  golden: boolean;
  season: BonsaiSeason;
  stageName: string;
  stageLine: string;
  streak: number;
  dayCount: number;
  night: boolean;
}

const W = 1080;
const H = 1350;
const TREE_H = 860;

const SKIES: Record<'day' | 'night', [string, string, string]> = {
  day: ['#fdf6ee', '#fbe9df', '#f6d9cf'],
  night: ['#3d3550', '#584960', '#7a5f6b'],
};

export const createBonsaiShareCard = (input: ShareCardInput): string => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('bonsai share: 2d context unavailable');

  const ink = input.night ? '#fdf3f0' : '#2d1f25';
  const sub = input.night ? '#d9c3c9' : '#7c626a';

  // Sky
  const sky = SKIES[input.night ? 'night' : 'day'];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sky[0]);
  g.addColorStop(0.5, sky[1]);
  g.addColorStop(1, sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (input.golden) {
    const glow = ctx.createRadialGradient(W / 2, H * 0.32, 60, W / 2, H * 0.32, W * 0.7);
    glow.addColorStop(0, 'rgba(233,196,106,0.22)');
    glow.addColorStop(1, 'rgba(233,196,106,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  // Tree
  const tree = document.createElement('canvas');
  tree.width = W;
  tree.height = TREE_H;
  const treeCtx = tree.getContext('2d');
  if (treeCtx) {
    const renderer = new VoxelSceneRenderer(generateBonsaiModel(input.seed, input.species));
    renderer.layout(W, TREE_H, 1);
    renderer.render({
      growth: input.growth,
      bloomCount: input.bloomCount,
      decorations: input.decorations,
      resting: false,
      golden: input.golden,
      season: input.season,
    });
    renderer.composite(treeCtx, 0, 0, 0);
    ctx.drawImage(tree, 0, 120);
  }

  // Header
  ctx.textAlign = 'center';
  ctx.fillStyle = sub;
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText('OUR BONSAI', W / 2, 96);

  // Stats block
  const baseY = H - 260;
  ctx.fillStyle = ink;
  ctx.font = '700 64px Georgia, serif';
  ctx.fillText(input.stageName, W / 2, baseY);
  ctx.fillStyle = sub;
  ctx.font = 'italic 34px Georgia, serif';
  ctx.fillText(input.stageLine, W / 2, baseY + 56);

  ctx.fillStyle = ink;
  ctx.font = '600 38px system-ui, sans-serif';
  const stats = [
    `Day ${input.dayCount}`,
    `${input.bloomCount} blossom${input.bloomCount === 1 ? '' : 's'}`,
    input.streak > 0 ? `${input.streak}-day streak` : null,
  ].filter(Boolean).join('   ·   ');
  ctx.fillText(stats, W / 2, baseY + 136);

  ctx.fillStyle = sub;
  ctx.font = '500 30px system-ui, sans-serif';
  ctx.fillText('grown together on Lior', W / 2, H - 56);

  return canvas.toDataURL('image/png');
};
