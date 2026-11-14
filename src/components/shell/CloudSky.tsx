"use client";

import { useEffect, useRef } from "react";

/**
 * Decorative animated sky behind the app shell: volumetric-looking clouds
 * drift across, one of them shaped like a cross. Each cloud is many soft,
 * noise-textured "puffs" (lit from above, shaded below) that the pointer
 * pushes aside and that spring smoothly back into place.
 * Clouds render at half resolution and are scaled up, which keeps the
 * frame cheap and softens the edges like real vapour.
 * Purely visual: aria-hidden and it never takes pointer events.
 */

interface Puff {
  /** Rest position relative to the cloud's centre. */
  hx: number;
  hy: number;
  /** Displacement from rest, and its velocity. */
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  /** 0 = top of the cloud (sunlit), 1 = underside (shaded). */
  shade: number;
  angle: number;
  sprite: number;
  phase: number;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  halfWidth: number;
  opacity: number;
  puffs: Puff[];
  cross: boolean;
  /** Cross only: the x it sways around instead of drifting off-screen. */
  anchorX: number;
  bobPhase: number;
}

const POINTER_RADIUS = 180;
const PUSH = 2400;
const DRAG = 4.5;
const SPRING = 5;
const DAMPING = 3;
const RENDER_SCALE = 0.4;
const SPRITE_VARIANTS = 6;

/* ---------- noise-textured puff sprites ---------- */

function hash(x: number, y: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 5; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 13);
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum;
}

/** A soft, wispy blob: radial falloff eroded by fractal noise. */
function makeSprite(rgb: [number, number, number], seed: number) {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return c;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * 2 - 1;
      const ny = (y / size) * 2 - 1;
      const d = Math.sqrt(nx * nx + ny * ny);
      const fall = Math.max(0, 1 - d);
      const falloff = fall * fall * (3 - 2 * fall);
      const n = fbm(x / 22, y / 22, seed);
      const a = Math.max(0, Math.min(1, falloff * (n * 1.6 - 0.12) * 1.2));
      const i = (y * size + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---------- cloud shapes ---------- */

function puff(
  hx: number,
  hy: number,
  r: number,
  alpha: number,
  shade: number,
): Puff {
  return {
    hx,
    hy,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    r,
    alpha,
    shade,
    angle: Math.random() * Math.PI * 2,
    sprite: Math.floor(Math.random() * SPRITE_VARIANTS),
    phase: Math.random() * Math.PI * 2,
  };
}

/** Flat-bottomed cumulus built from a few overlapping domes. */
function makeCumulus(vh: number, vw: number, depth: number): Cloud {
  const scale = 0.55 + depth * 0.65;
  const width = (220 + Math.random() * 280) * scale;
  const height = width * (0.34 + Math.random() * 0.14);
  const puffs: Puff[] = [];
  const domes = 2 + Math.floor(Math.random() * 3);
  const domeList = Array.from({ length: domes }, () => ({
    cx: (Math.random() - 0.5) * width * 0.6,
    w: width * (0.35 + Math.random() * 0.35),
    h: height * (0.55 + Math.random() * 0.45),
  }));
  const n = Math.round(width / 5.5);
  for (let i = 0; i < n; i++) {
    const dome = domeList[i % domes];
    const hx = dome.cx + (Math.random() - 0.5) * dome.w;
    const t = Math.max(0, 1 - ((2 * (hx - dome.cx)) / dome.w) ** 2);
    const top = -dome.h * Math.sqrt(t);
    const hy = top + Math.random() * (-top + height * 0.08);
    const r = height * (0.17 + Math.random() * 0.26) * (0.6 + 0.4 * t);
    const shade = Math.min(1, Math.max(0, (hy - top) / (height * 0.9)));
    puffs.push(puff(hx, hy, r, 0.5 + Math.random() * 0.4, shade));
  }
  // Thin haze along the base and stray wisps.
  for (let i = 0; i < n * 0.25; i++) {
    puffs.push(
      puff(
        (Math.random() - 0.5) * width * 1.15,
        (Math.random() - 0.3) * height * 0.25,
        height * (0.18 + Math.random() * 0.25),
        0.15 + Math.random() * 0.2,
        0.8,
      ),
    );
  }
  return {
    x: Math.random() * (vw + width) - width / 2,
    y: vh * (0.12 + Math.random() * 0.75),
    speed: 4 + depth * 16,
    halfWidth: width * 0.6 + 40,
    opacity: 0.45 + depth * 0.5,
    puffs,
    cross: false,
    anchorX: 0,
    bobPhase: Math.random() * Math.PI * 2,
  };
}

function makeCross(vw: number, vh: number): Cloud {
  // The prompt, composer, and card sit in a centered column. Fit the cross
  // into the sky to the right of that column so white vapour never covers
  // the white type. `reach` is how far the beam and its wisps extend left.
  const textRight = vw / 2 + Math.min(348, vw * 0.34);
  const edge = vw - 20;
  const reachOf = (height: number) => height * 0.64 * 0.58 + height * 0.22;
  let H = Math.min(vh * 0.48, 380);
  const room = edge - textRight - 64;
  const tuck = room < 150;
  if (tuck) H = Math.min(vh * 0.32, 220);
  else while (reachOf(H) > room && H > 160) H *= 0.86;
  const T = H * 0.18; // bar thickness
  const beamW = H * 0.64;
  const beamY = -H / 2 + H * 0.3;
  const reach = reachOf(H);
  const anchorX = tuck
    ? edge + reach * 0.15
    : Math.min(edge, textRight + 64 + reach);
  const anchorY = tuck ? vh * 0.84 : vh * 0.6;
  const puffs: Puff[] = [];
  const add = (x0: number, x1: number, y0: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const hx = x0 + Math.random() * (x1 - x0);
      const hy = y0 + Math.random() * (y1 - y0);
      // Within each bar the lower side is in shadow; the whole cross is
      // also a little darker toward its foot.
      const local = (hy - y0) / (y1 - y0);
      const shade = Math.min(1, local * 0.7 + ((hy + H / 2) / H) * 0.35);
      puffs.push(
        puff(
          hx,
          hy,
          T * (0.28 + Math.random() * 0.26),
          0.5 + Math.random() * 0.4,
          shade,
        ),
      );
    }
  };
  add(-T / 2, T / 2, -H / 2, H / 2, 170); // upright
  add(-beamW / 2, beamW / 2, beamY - T / 2, beamY + T / 2, 110); // beam
  // Wisps softening the outline so it reads as vapour, not a stencil.
  for (let i = 0; i < 60; i++) {
    const onBeam = Math.random() < 0.45;
    const hx = onBeam
      ? (Math.random() - 0.5) * beamW * 1.1
      : (Math.random() - 0.5) * T * 1.9;
    const hy = onBeam
      ? beamY + (Math.random() - 0.5) * T * 1.9
      : (Math.random() - 0.5) * H * 1.08;
    puffs.push(
      puff(
        hx,
        hy,
        T * (0.3 + Math.random() * 0.35),
        0.12 + Math.random() * 0.18,
        0.5,
      ),
    );
  }
  return {
    x: anchorX,
    y: anchorY,
    speed: 0,
    halfWidth: beamW / 2 + 80,
    opacity: 1,
    puffs,
    cross: true,
    anchorX,
    bobPhase: 0,
  };
}

/* ---------- component ---------- */

export function CloudSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const lit = Array.from({ length: SPRITE_VARIANTS }, (_, i) =>
      makeSprite([255, 255, 255], i * 7 + 1),
    );
    const dark = Array.from({ length: SPRITE_VARIANTS }, (_, i) =>
      makeSprite([150, 162, 186], i * 7 + 1),
    );

    let vw = 0;
    let vh = 0;
    let clouds: Cloud[] = [];
    let cross: Cloud | null = null;

    const build = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      canvas.width = Math.round(vw * RENDER_SCALE);
      canvas.height = Math.round(vh * RENDER_SCALE);
      ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
      const count = Math.max(4, Math.round(vw / 240));
      clouds = Array.from({ length: count }, (_, i) =>
        makeCumulus(vh, vw, (i + Math.random()) / count),
      ).sort((a, b) => a.speed - b.speed);
      cross = makeCross(vw, vh);
    };
    build();

    const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false, t: 0 };
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      const dt = Math.max(1, now - pointer.t) / 1000;
      if (pointer.active) {
        // Smoothed pointer velocity (px/s) so clouds get "dragged" along.
        pointer.vx += ((e.clientX - pointer.x) / dt - pointer.vx) * 0.3;
        pointer.vy += ((e.clientY - pointer.y) / dt - pointer.vy) * 0.3;
      }
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.t = now;
      pointer.active = true;
    };
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) pointer.active = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);

    const step = (c: Cloud, dt: number, time: number) => {
      if (c.cross) {
        // Sway slowly around its anchor so it never leaves the sky.
        c.x = c.anchorX + Math.sin(time * 0.06) * 20;
      } else c.x += c.speed * dt;
      if (!c.cross && c.x - c.halfWidth > vw) {
        c.x = -c.halfWidth;
        c.y = vh * (0.12 + Math.random() * 0.75);
      }
      const cy = c.y + Math.sin(time * 0.3 + c.bobPhase) * (c.cross ? 7 : 3);
      const damp = Math.exp(-DAMPING * dt);
      const pvx = Math.max(-3000, Math.min(3000, pointer.vx));
      const pvy = Math.max(-3000, Math.min(3000, pointer.vy));
      for (const p of c.puffs) {
        let ax = -SPRING * p.dx;
        let ay = -SPRING * p.dy;
        if (pointer.active) {
          const px = c.x + p.hx + p.dx - pointer.x;
          const py = cy + p.hy + p.dy - pointer.y;
          const d2 = px * px + py * py;
          if (d2 < POINTER_RADIUS * POINTER_RADIUS) {
            const d = Math.sqrt(d2) || 1;
            const k = 1 - d / POINTER_RADIUS;
            const f = k * k * PUSH;
            ax += (px / d) * f + pvx * k * DRAG;
            ay += (py / d) * f + pvy * k * DRAG;
          }
        }
        p.vx = (p.vx + ax * dt) * damp;
        p.vy = (p.vy + ay * dt) * damp;
        p.dx += p.vx * dt;
        p.dy += p.vy * dt;
        // Puffs pulled away from the cloud slowly turn as they tumble.
        p.angle += (p.vx - p.vy) * 0.0004 * dt;
      }
      return cy;
    };

    const drawPuff = (
      sprite: HTMLCanvasElement,
      x: number,
      y: number,
      r: number,
      angle: number,
      alpha: number,
    ) => {
      if (alpha <= 0.01) return;
      const cos = Math.cos(angle) * RENDER_SCALE;
      const sin = Math.sin(angle) * RENDER_SCALE;
      ctx.setTransform(cos, sin, -sin, cos, x * RENDER_SCALE, y * RENDER_SCALE);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, -r, -r, r * 2, r * 2);
    };

    const render = (c: Cloud, cy: number, time: number) => {
      if (c.cross) {
        // Faint warm light behind the cross.
        const glowR = c.halfWidth * 0.85;
        ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
        const g = ctx.createRadialGradient(
          c.x,
          cy - 60,
          0,
          c.x,
          cy - 60,
          glowR,
        );
        g.addColorStop(0, "rgba(255,246,225,0.32)");
        g.addColorStop(0.5, "rgba(255,240,215,0.1)");
        g.addColorStop(1, "rgba(255,240,215,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(c.x - glowR, cy - 60 - glowR, glowR * 2, glowR * 2);
      }
      // 1) body: white everywhere so the cloud is opaque and soft.
      for (const p of c.puffs) {
        const r = p.r * (1 + 0.04 * Math.sin(time * 0.5 + p.phase));
        drawPuff(
          lit[p.sprite],
          c.x + p.hx + p.dx,
          cy + p.hy + p.dy,
          r * 1.25,
          p.angle,
          p.alpha * c.opacity * 0.8,
        );
      }
      // 2) shading: grey-blue on the underside and in the core.
      for (const p of c.puffs) {
        const r = p.r * (1 + 0.04 * Math.sin(time * 0.5 + p.phase));
        drawPuff(
          dark[p.sprite],
          c.x + p.hx + p.dx,
          cy + p.hy + p.dy + r * 0.2,
          r,
          p.angle + 1.3,
          p.alpha * c.opacity * p.shade * 0.55,
        );
      }
      // 3) sunlit tops: small bright highlights on the upper puffs.
      for (const p of c.puffs) {
        if (p.shade > 0.45) continue;
        const r = p.r * 0.75;
        drawPuff(
          lit[(p.sprite + 2) % SPRITE_VARIANTS],
          c.x + p.hx + p.dx,
          cy + p.hy + p.dy - r * 0.35,
          r,
          p.angle + 2.1,
          p.alpha * c.opacity * (1 - p.shade) * 0.45,
        );
      }
      ctx.globalAlpha = 1;
    };

    let last = performance.now();
    let raf = 0;
    const draw = (dt: number) => {
      const time = performance.now() / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const far = clouds.slice(0, Math.ceil(clouds.length / 2));
      const near = clouds.slice(far.length);
      for (const c of far) render(c, step(c, dt, time), time);
      if (cross) render(cross, step(cross, dt, time), time);
      for (const c of near) render(c, step(c, dt, time), time);
      pointer.vx *= 0.9;
      pointer.vy *= 0.9;
    };

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        build();
        if (reduceMotion) draw(0);
      }, 150);
    };
    window.addEventListener("resize", onResize);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };

    if (reduceMotion) draw(0);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,#5a8ed6_0%,#6c9ada_40%,#86a3cf_75%,#9eacc6_100%)]"
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
