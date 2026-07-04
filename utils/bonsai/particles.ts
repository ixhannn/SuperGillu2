/**
 * Lightweight canvas particle system for the bonsai scene.
 * Everything is capped hard (max ~60 live particles) and runs on a single
 * overlay canvas so the voxel layers never repaint for ambience.
 */

export type ParticleKind =
  | 'petal' | 'firefly' | 'droplet' | 'sparkle' | 'gold'
  | 'koi' | 'lantern' | 'snow' | 'butterfly';

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
}

const MAX_PARTICLES = 60;

const PETAL_COLORS = ['#f6c9d7', '#f2aec4', '#ec92ae', '#fbe3ec'];
const GOLD_COLOR = '#e9c46a';
const FIREFLY_COLOR = '#ffe9a8';
const DROPLET_COLOR = '#9fd1e8';

export class BonsaiParticles {
  private particles: Particle[] = [];
  private width = 0;
  private height = 0;
  private petalTimer = 0;
  private fireflyTimer = 0;
  private snowTimer = 0;
  private butterflyTimer = 6;
  private petalColors: readonly string[] = PETAL_COLORS;

  /** Petals fall in the current tree's blossom colours. */
  setPetalPalette(colors: readonly string[]): void {
    this.petalColors = colors.length > 0 ? colors : PETAL_COLORS;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  get count(): number {
    return this.particles.length;
  }

  private add(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push(p);
  }

  /** Ambient petals drifting from the canopy region. */
  spawnPetal(canopyX: number, canopyY: number, spreadX: number, golden: boolean): void {
    this.add({
      kind: golden ? 'gold' : 'petal',
      x: canopyX + (Math.random() - 0.5) * spreadX,
      y: canopyY + (Math.random() - 0.5) * spreadX * 0.4,
      vx: (Math.random() - 0.5) * 14 - 6,
      vy: 14 + Math.random() * 12,
      life: 0,
      maxLife: 5.5 + Math.random() * 2.5,
      size: 2.4 + Math.random() * 2.2,
      spin: (Math.random() - 0.5) * 3,
      angle: Math.random() * Math.PI * 2,
      color: golden ? GOLD_COLOR : this.petalColors[Math.floor(Math.random() * this.petalColors.length)],
    });
  }

  spawnFirefly(): void {
    this.add({
      kind: 'firefly',
      x: Math.random() * this.width,
      y: this.height * (0.35 + Math.random() * 0.45),
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 6,
      life: 0,
      maxLife: 6 + Math.random() * 4,
      size: 1.6 + Math.random() * 1.2,
      spin: Math.random() * Math.PI * 2,
      angle: 0,
      color: FIREFLY_COLOR,
    });
  }

  /** Droplets while the water button is held; aimed at the pot. */
  spawnDroplets(fromX: number, fromY: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.add({
        kind: 'droplet',
        x: fromX + (Math.random() - 0.5) * 26,
        y: fromY,
        vx: (Math.random() - 0.5) * 20,
        vy: 60 + Math.random() * 60,
        life: 0,
        maxLife: 0.9 + Math.random() * 0.4,
        size: 1.6 + Math.random() * 1.4,
        spin: 0,
        angle: 0,
        color: DROPLET_COLOR,
      });
    }
  }

  /** Sparkle pop where a new voxel just appeared. */
  spawnSparkle(x: number, y: number, gold = false): void {
    this.add({
      kind: 'sparkle',
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 26,
      vy: -14 - Math.random() * 22,
      life: 0,
      maxLife: 0.7 + Math.random() * 0.5,
      size: 1.4 + Math.random() * 1.6,
      spin: (Math.random() - 0.5) * 6,
      angle: Math.random() * Math.PI * 2,
      color: gold ? GOLD_COLOR : '#fbe3ec',
    });
  }

  /** A butterfly crosses the scene, bobbing, and flutters off (butterfly days). */
  spawnButterfly(): void {
    const fromLeft = Math.random() < 0.5;
    const vx = (22 + Math.random() * 10) * (fromLeft ? 1 : -1);
    this.add({
      kind: 'butterfly',
      x: fromLeft ? -10 : this.width + 10,
      y: this.height * (0.28 + Math.random() * 0.3),
      vx,
      vy: 0,
      life: 0,
      maxLife: (this.width + 40) / Math.abs(vx),
      size: 2.6 + Math.random() * 1,
      spin: Math.random() * Math.PI * 2,
      angle: 0,
      color: Math.random() < 0.5 ? '#f4e4ee' : '#f6dfa8',
    });
  }

  /** A koi arcs out of the pond and splashes back (golden days only). */
  spawnKoiJump(pondX: number, pondY: number): void {
    this.add({
      kind: 'koi',
      x: pondX,
      y: pondY,
      vx: 14 + Math.random() * 10,
      vy: -78 - Math.random() * 18,
      life: 0,
      maxLife: 1.15,
      size: 3.4,
      spin: 0,
      angle: 0,
      color: '#f28c5f',
    });
    this.spawnDroplets(pondX, pondY - 4, 3);
  }

  /** A warm paper lantern drifts up — anniversary evenings. */
  spawnLantern(): void {
    if (this.particles.filter((p) => p.kind === 'lantern').length >= 3) return;
    this.add({
      kind: 'lantern',
      x: this.width * (0.2 + Math.random() * 0.6),
      y: this.height + 10,
      vx: (Math.random() - 0.5) * 6,
      vy: -14 - Math.random() * 8,
      life: 0,
      maxLife: 11 + Math.random() * 4,
      size: 4.5 + Math.random() * 2,
      spin: Math.random() * Math.PI * 2,
      angle: 0,
      color: '#ffce7a',
    });
  }

  /** Gentle drifting snowflakes (winter ambience). */
  spawnSnow(): void {
    this.add({
      kind: 'snow',
      x: Math.random() * this.width,
      y: -8,
      vx: (Math.random() - 0.5) * 10,
      vy: 16 + Math.random() * 10,
      life: 0,
      maxLife: 9 + Math.random() * 4,
      size: 1.2 + Math.random() * 1.2,
      spin: (Math.random() - 0.5) * 2,
      angle: Math.random() * Math.PI * 2,
      color: '#ffffff',
    });
  }

  /** Petals spiralling around a point — the "together right now" moment. */
  swirl(cx: number, cy: number): void {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 30 + Math.random() * 40;
      this.add({
        kind: 'petal',
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r * 0.6,
        vx: -Math.sin(a) * 34,
        vy: Math.cos(a) * 20 - 12,
        life: 0,
        maxLife: 2 + Math.random(),
        size: 2 + Math.random() * 2,
        spin: (Math.random() - 0.5) * 4,
        angle: Math.random() * Math.PI * 2,
        color: this.petalColors[Math.floor(Math.random() * this.petalColors.length)],
      });
    }
  }

  /** Celebration burst when today becomes a both-watered bloom day. */
  burst(x: number, y: number, golden: boolean): void {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const speed = 34 + Math.random() * 50;
      this.add({
        kind: golden && i % 5 === 0 ? 'gold' : 'petal',
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.7 - 24,
        life: 0,
        maxLife: 1.6 + Math.random() * 1.4,
        size: 2.2 + Math.random() * 2.4,
        spin: (Math.random() - 0.5) * 5,
        angle: Math.random() * Math.PI * 2,
        color: this.petalColors[Math.floor(Math.random() * this.petalColors.length)],
      });
    }
  }

  /**
   * Advance and draw. Ambient spawning is driven here so callers only need
   * one call per frame. `night` enables fireflies; petalRate scales with
   * bloom (0 disables).
   */
  tick(
    ctx: CanvasRenderingContext2D,
    dt: number,
    opts: {
      petalRate: number;
      night: boolean;
      golden: boolean;
      snow: boolean;
      butterfly: boolean;
      canopy: { x: number; y: number; spread: number };
    },
  ): void {
    const clampedDt = Math.min(dt, 0.1);
    this.petalTimer -= clampedDt;
    if (opts.petalRate > 0 && this.petalTimer <= 0) {
      this.spawnPetal(opts.canopy.x, opts.canopy.y, opts.canopy.spread, opts.golden && Math.random() < 0.3);
      this.petalTimer = 1 / opts.petalRate + Math.random() * 0.8;
    }
    this.fireflyTimer -= clampedDt;
    if (opts.night && this.fireflyTimer <= 0 && this.particles.filter((p) => p.kind === 'firefly').length < 7) {
      this.spawnFirefly();
      this.fireflyTimer = 0.9;
    }
    this.snowTimer -= clampedDt;
    if (opts.snow && this.snowTimer <= 0 && this.particles.filter((p) => p.kind === 'snow').length < 12) {
      this.spawnSnow();
      this.snowTimer = 0.7;
    }
    this.butterflyTimer -= clampedDt;
    if (opts.butterfly && this.butterflyTimer <= 0 && !this.particles.some((p) => p.kind === 'butterfly')) {
      this.spawnButterfly();
      this.butterflyTimer = 24 + Math.random() * 18;
    }

    ctx.clearRect(0, 0, this.width, this.height);
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life += clampedDt;
      if (p.life >= p.maxLife) continue;
      const t = p.life / p.maxLife;
      if (p.kind === 'petal' || p.kind === 'gold') {
        p.vx += Math.sin(p.life * 2.2 + p.angle) * 18 * clampedDt;
        p.vy += 8 * clampedDt;
      } else if (p.kind === 'firefly') {
        p.vx += (Math.random() - 0.5) * 24 * clampedDt;
        p.vy += (Math.random() - 0.5) * 18 * clampedDt;
        p.vx = Math.max(-16, Math.min(16, p.vx));
        p.vy = Math.max(-12, Math.min(12, p.vy));
      } else if (p.kind === 'droplet') {
        p.vy += 160 * clampedDt;
      } else if (p.kind === 'koi') {
        p.vy += 210 * clampedDt;
        p.angle = Math.atan2(p.vy, p.vx);
      } else if (p.kind === 'lantern') {
        p.vx += Math.sin(p.life * 0.9 + p.spin) * 4 * clampedDt;
      } else if (p.kind === 'snow') {
        p.vx += Math.sin(p.life * 1.4 + p.spin) * 8 * clampedDt;
      } else if (p.kind === 'butterfly') {
        p.vy = Math.sin(p.life * 3.1 + p.spin) * 16;
      } else {
        p.vy += 40 * clampedDt;
      }
      p.x += p.vx * clampedDt;
      p.y += p.vy * clampedDt;
      if (p.kind !== 'koi') p.angle += p.spin * clampedDt;
      if (p.y > this.height + 12 || p.x < -12 || p.x > this.width + 12) continue;
      if (p.kind === 'lantern' && p.y < -16) continue;

      this.draw(ctx, p, t);
      next.push(p);
    }
    this.particles = next;
  }

  private draw(ctx: CanvasRenderingContext2D, p: Particle, t: number): void {
    const fade = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
    if (p.kind === 'firefly') {
      const pulse = 0.45 + 0.55 * Math.abs(Math.sin(p.life * 2.4 + p.spin));
      ctx.globalAlpha = fade * pulse;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + pulse * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    if (p.kind === 'lantern') {
      const flicker = 0.75 + 0.25 * Math.sin(p.life * 5 + p.spin);
      ctx.globalAlpha = fade * 0.5 * flicker;
      ctx.fillStyle = '#ffe4b0';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade * 0.95;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * 0.7, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    if (p.kind === 'snow') {
      ctx.globalAlpha = fade * 0.8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    if (p.kind === 'butterfly') {
      const flap = Math.abs(Math.sin(p.life * 11 + p.spin));
      ctx.globalAlpha = fade * 0.95;
      ctx.fillStyle = p.color;
      const wing = p.size * (0.45 + flap * 0.55);
      ctx.beginPath();
      ctx.ellipse(p.x - wing * 0.6, p.y, wing, p.size * 0.62, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x + wing * 0.6, p.y, wing, p.size * 0.62, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b4f5b';
      ctx.fillRect(p.x - 0.7, p.y - p.size * 0.5, 1.4, p.size);
      ctx.globalAlpha = 1;
      return;
    }
    if (p.kind === 'koi') {
      ctx.globalAlpha = fade;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath();
      ctx.ellipse(-p.size * 0.5, 0, p.size * 0.35, p.size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = fade * 0.92;
    ctx.fillStyle = p.color;
    if (p.kind === 'droplet') {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * 0.6, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.particles = [];
  }
}
