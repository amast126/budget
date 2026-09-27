// Weather for the Home header, drawn on one canvas behind the text.
//
// Rain is three depth layers of motion-blurred streaks (far = fine and faint, near = long, bright, fast), angled by
// the real wind speed with smooth gusts. Near drops splash where they land: on the bottom edge (droplets arcing up
// plus a puddle ripple) and on the tops of the countdown chips and weather pill. The header is also a pane of glass:
// mist beads collect, bigger drops grow by swallowing them, then slide down in stick-slip jerks, leaving a trail of
// beads and wiping a clear path. Drizzle is fine and misty; heavy rain is dense; thunderstorms add branching lightning.
// Your pointer (or finger) is an umbrella: rain splashes off it and the area below stays dry.
//
// Snow falls in four depths: fine far flakes, soft mid flakes, six-armed crystals up close that turn and tumble, and
// a few big out-of-focus flakes drifting across the lens. It blows with the wind and gusts, swirls away from your
// pointer, settles into little drifts on the chips, the weather pill and the bottom edge, and the odd crystal lands on
// the glass and melts into a bead. Frost creeps in from the corners.
//
// Costs little: sprites are drawn once and stamped, the loop pauses when the header scrolls away or the tab is hidden,
// density drops on slow devices, and with "reduce motion" on it paints a single still frame.
import React, { useEffect, useRef } from 'react';
import { reducedMotion } from './fx.jsx';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth01 = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;
const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// A vertical streak: transparent tail at the top, bright head at the bottom. Drawn rotated to the wind.
function streakSprite() {
  const c = mk(6, 128);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(205,220,242,0)');
  grd.addColorStop(0.5, 'rgba(210,224,245,0.32)');
  grd.addColorStop(0.9, 'rgba(232,240,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(2.4, 0);
  g.lineTo(3.6, 0);
  g.lineTo(4, 126);
  g.arc(3, 126, 1, 0, Math.PI);
  g.closePath();
  g.fill();
  return c;
}

// A water drop on glass seen from inside: it works like a tiny lens, so the bright sky shows at its bottom and the
// darker world at its top, with a sharp highlight up-left and a soft rim.
function dropSprite() {
  const S = 64;
  const c = mk(S, S);
  const g = c.getContext('2d');
  const cx = 32;
  const cy = 32;
  const R = 29;
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.clip();
  const lg = g.createLinearGradient(0, cy - R, 0, cy + R);
  lg.addColorStop(0, 'rgba(6,14,32,0.5)');
  lg.addColorStop(0.45, 'rgba(120,145,185,0.16)');
  lg.addColorStop(1, 'rgba(236,243,255,0.62)');
  g.fillStyle = lg;
  g.fillRect(0, 0, S, S);
  const rg = g.createRadialGradient(cx, cy + 2, R * 0.55, cx, cy, R);
  rg.addColorStop(0, 'rgba(0,0,0,0)');
  rg.addColorStop(1, 'rgba(2,8,22,0.55)');
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  g.restore();
  const hx = cx - R * 0.34;
  const hy = cy - R * 0.4;
  const hg = g.createRadialGradient(hx, hy, 0, hx, hy, R * 0.34);
  hg.addColorStop(0, 'rgba(255,255,255,0.98)');
  hg.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hg;
  g.beginPath();
  g.ellipse(hx, hy, R * 0.34, R * 0.24, -0.6, 0, TAU);
  g.fill();
  const bg = g.createRadialGradient(cx + R * 0.08, cy + R * 0.64, 0, cx + R * 0.08, cy + R * 0.64, R * 0.42);
  bg.addColorStop(0, 'rgba(255,255,255,0.5)');
  bg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = bg;
  g.beginPath();
  g.ellipse(cx + R * 0.08, cy + R * 0.64, R * 0.42, R * 0.14, 0, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(cx, cy, R - 0.6, 0, TAU);
  g.stroke();
  return c;
}

// A soft snowflake: a blurred disc.
function flakeSprite() {
  const c = mk(32, 32);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return c;
}

// A six-armed snow crystal in one of three habits (fern-like dendrite, stellar plate, simple star), drawn once.
function crystalSprite(kind) {
  const S = 64;
  const c = mk(S, S);
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#ffffff';
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.lineCap = 'round';
  g.shadowColor = 'rgba(210,228,255,0.9)';
  g.shadowBlur = 2.5;
  const line = (x0, y0, x1, y1, w) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  const hexAt = (y, r, fill) => {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + Math.PI / 6;
      g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath();
    if (fill) g.fill();
    g.lineWidth = 1;
    g.stroke();
  };
  const branch = (y, len, w) => {
    line(0, y, Math.sin(Math.PI / 3) * len, y - Math.cos(Math.PI / 3) * len, w);
    line(0, y, -Math.sin(Math.PI / 3) * len, y - Math.cos(Math.PI / 3) * len, w);
  };
  for (let k = 0; k < 6; k++) {
    g.save();
    g.rotate((k * Math.PI) / 3);
    if (kind === 0) {
      line(0, 0, 0, -27, 2);
      for (const [y, len] of [[-8, 7], [-13, 9], [-18, 7.5], [-22.5, 5], [-25.5, 3]]) branch(y, len, 1.25);
    } else if (kind === 1) {
      line(0, 0, 0, -21, 2.2);
      branch(-11, 6, 1.4);
      hexAt(-23, 4.2, true);
    } else {
      line(0, 0, 0, -24, 2.4);
      branch(-16, 6.5, 1.5);
    }
    g.restore();
  }
  hexAt(0, kind === 1 ? 6 : 4.5, true);
  return c;
}

// A snowflake right in front of the lens: a big soft disc with a slightly brighter rim (bokeh).
function bokehSprite() {
  const c = mk(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,0.4)');
  grd.addColorStop(0.72, 'rgba(255,255,255,0.46)');
  grd.addColorStop(0.9, 'rgba(255,255,255,0.62)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}

// Frost on the glass: a pale haze in the corners with feathery crystals branching in from the edges. Heaviest at the
// bottom corners, lightest top left, where the greeting is.
function frostSprite(W, H, S, dpr) {
  const c = mk(Math.round(W * dpr), Math.round(H * dpr));
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const corners = [
    [0, H, 1, -1, 0.75],
    [W, H, -1, -1, 1],
    [W, 0, -1, 1, 0.7],
    [0, 0, 1, 1, 0.3],
  ];
  const reach = Math.min(H * 0.5, 110 * S);
  for (const [cx, cy, sx, sy, k] of corners) {
    const R = reach * (0.7 + 0.5 * k);
    const hz = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    hz.addColorStop(0, `rgba(236,244,255,${0.42 * k})`);
    hz.addColorStop(0.45, `rgba(236,244,255,${0.14 * k})`);
    hz.addColorStop(1, 'rgba(236,244,255,0)');
    g.fillStyle = hz;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.lineCap = 'round';
    g.strokeStyle = '#f4f8ff';
    // ice ferns: a gently curving stem with feathery side branches at about 60°, shorter toward the tip
    const fern = (x, y, a, len, w, depth) => {
      let px = x;
      let py = y;
      const step = 2 * S;
      const curl = rand(-0.03, 0.03);
      let side = 1;
      for (let d = 0; d < len; d += step) {
        a += curl + rand(-0.06, 0.06);
        const nx = px + Math.cos(a) * step;
        const ny = py + Math.sin(a) * step;
        const fade = 1 - d / len;
        g.globalAlpha = (0.14 + 0.36 * fade) * k * (depth ? 0.8 : 1);
        g.lineWidth = Math.max(0.35, w * (0.4 + 0.6 * fade));
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(nx, ny);
        g.stroke();
        px = nx;
        py = ny;
        if (depth < 2 && d > step * 2 && Math.random() < 0.8) {
          side = -side;
          fern(px, py, a + side * rand(0.9, 1.15), (len - d) * (depth ? 0.3 : 0.24) * rand(0.6, 1.1) + 1.5 * S, w * 0.6, depth + 1);
        }
      }
    };
    const grow = (x, y, a, len, w) => fern(x, y, a, len, w, 0);
    const n = Math.round(7 + 10 * k);
    for (let i = 0; i < n; i++) {
      // seeds along both edges near the corner, growing inward
      const along = Math.pow(Math.random(), 1.6) * R * 0.9;
      const onX = Math.random() < 0.5;
      const x = onX ? cx + sx * along : cx;
      const y = onX ? cy : cy + sy * along;
      const inward = Math.atan2(onX ? sy : sy * 0.3, onX ? sx * 0.3 : sx);
      grow(x, y, inward + rand(-0.5, 0.5), (R - along) * rand(0.3, 0.65), rand(0.8, 1.3) * S);
    }
  }
  g.globalAlpha = 1;
  return c;
}

// A lightning bolt: a jagged channel that wanders downward in short angular steps, with forks that peel off and
// thin out. It strikes somewhere over the right side, away from the greeting.
function makeBolt(W, H) {
  const paths = [];
  const walk = (x, y, dir, steps, width, depth) => {
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      dir += rand(-0.25, 0.25);
      dir = clamp(dir, Math.PI / 2 - 0.7, Math.PI / 2 + 0.7);
      const a = dir + rand(-0.85, 0.85); // each kink
      const len = rand(5, 13);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      pts.push([x, y]);
      if (depth < 3 && Math.random() < (depth ? 0.07 : 0.14)) walk(x, y, dir + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.9), Math.floor(steps * rand(0.2, 0.45)), width * 0.55, depth + 1);
      if (y > H * 0.82) break;
    }
    paths.push({ pts, w: width });
  };
  const x0 = rand(W * 0.58, W * 0.93);
  walk(x0, -4, Math.PI / 2 + rand(-0.25, 0.25), Math.round(rand(0.45, 0.8) * H / 8), 1.7, 0);
  return { paths, x: x0 };
}

const RAIN_LAYERS = (drizzle) => [
  { dens: drizzle ? 1 / 420 : 1 / 540, cap: 420, speed: drizzle ? [240, 320] : [520, 650], len: drizzle ? [4, 7] : [9, 15], lw: drizzle ? 0.7 : 0.9, alpha: [0.16, 0.27] },
  { dens: drizzle ? 1 / 800 : 1 / 1050, cap: 260, speed: drizzle ? [330, 430] : [720, 900], len: drizzle ? [6, 10] : [16, 25], lw: drizzle ? 0.9 : 1.2, alpha: [0.22, 0.36], hits: 'umbrella' },
  { dens: drizzle ? 1 / 2000 : 1 / 2500, cap: 140, speed: drizzle ? [430, 560] : [980, 1280], len: drizzle ? [9, 14] : [28, 46], lw: drizzle ? 1.1 : 1.7, alpha: [0.32, 0.52], hits: 'all' },
  // right in front of the lens: few, long, wide and soft (out of focus)
  { dens: drizzle ? 1 / 16000 : 1 / 12000, cap: 26, speed: drizzle ? [620, 760] : [1500, 1850], len: drizzle ? [16, 24] : [70, 110], lw: drizzle ? 2.2 : 3.4, alpha: [0.07, 0.14], blur: true },
];
const SNOW_LAYERS = [
  { dens: 1 / 1100, cap: 340, speed: [13, 22], size: [0.9, 1.7], alpha: [0.3, 0.55], sway: [3, 7], drift: 0.55, sprite: 'dot' },
  { dens: 1 / 2400, cap: 180, speed: [22, 36], size: [1.8, 3], alpha: [0.55, 0.85], sway: [6, 13], drift: 0.8, sprite: 'dot', hits: 0.1 },
  { dens: 1 / 7500, cap: 56, speed: [34, 52], size: [4.5, 7.5], alpha: [0.8, 0.98], sway: [10, 20], drift: 1, sprite: 'crystal', hits: 0.22, sticks: true },
  { dens: 1 / 26000, cap: 14, speed: [56, 84], size: [11, 20], alpha: [0.12, 0.22], sway: [16, 30], drift: 1.25, sprite: 'bokeh' },
];

export function SkyWeather({ kind, intensity = 0.8, drizzle = false, wind = 6, gusts, day = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const g = c && c.getContext && c.getContext('2d');
    if (!g) return undefined;
    const hero = c.closest('.hero') || c.parentElement;
    const snowing = kind === 'snow';
    const storm = kind === 'storm';
    const I = clamp(intensity, 0.2, 1.6);
    const still = reducedMotion();
    const streak = snowing ? null : streakSprite();
    const drop = dropSprite();
    const flake = snowing ? flakeSprite() : null;
    const crystals = snowing ? [0, 1, 2].map(crystalSprite) : null;
    const bokeh = snowing ? bokehSprite() : null;
    // Wind: ~1° of slant per mph, with gusts swinging it a little either way.
    const w0 = Number.isFinite(wind) ? wind : 6;
    const baseAng = clamp(w0 * 0.017, 0.04, 0.42);
    const gustAmp = clamp(((Number.isFinite(gusts) ? gusts : w0) - w0) * 0.006 + 0.035, 0.035, 0.16);
    const angleAt = (t) => baseAng + gustAmp * (0.6 * Math.sin(t * 0.45) + 0.4 * Math.sin(t * 1.13 + 1.7));
    // Snow falls slowly, so the wind carries it much further sideways than rain: px/s at this moment, with gusts.
    let windNow = 0;
    const snowWind = () => windNow;

    let W = 0;
    let H = 0;
    let S = 1;
    let dpr = 1;
    let layers = [];
    let splashes = [];
    let ripples = [];
    let beads = [];
    let bigs = [];
    let surfaces = [];
    let umb = null;
    let bolt = null;
    let boltT = 0;
    let flash = 0;
    let flashSeq = null;
    let nextStrike = 3 + rand(2, 7);
    let density = 1; // lowered automatically on slow devices
    let raf = 0;
    let last = 0;
    let running = false;
    let slowFrames = 0;
    let frames = 0;
    let ang = angleAt(0);
    let beadClock = 0;
    let bigClock = 0;
    const piles = new Map(); // snow lying on each surface, by element
    let stuck = []; // crystals that landed on the glass, melting
    let frost = null;
    let frostT = 0;

    const spawnRain = (L, anywhere) => {
      const k = Math.random();
      const sp = (L.speed[0] + k * (L.speed[1] - L.speed[0])) * S;
      const len = (L.len[0] + k * (L.len[1] - L.len[0])) * S; // faster = longer blur
      const spread = H * Math.tan(ang) + 40;
      // against a bright daytime sky the streaks need a little more presence
      return { x: rand(-spread, W + 20), y: anywhere ? rand(-len, H) : -len - rand(0, H * 0.35), sp, len, al: rand(L.alpha[0], L.alpha[1]) * (day ? 1.3 : 1) };
    };
    // With a wind blowing, some flakes come in from the upwind edge rather than the top.
    const spawnFlake = (L, anywhere) => {
      const side = !anywhere && snowWind() > 14 * S && Math.random() < 0.35;
      return {
        x: side ? -20 : rand(-30 - snowWind() * 1.5, W + 30),
        y: anywhere ? rand(-10, H) : side ? rand(-10, H * 0.8) : rand(-30, -6),
        sp: rand(L.speed[0], L.speed[1]) * S,
        r: rand(L.size[0], L.size[1]) * S,
        al: rand(L.alpha[0], L.alpha[1]),
        sway: rand(L.sway[0], L.sway[1]) * S,
        f: rand(0.4, 1.1),
        ph: rand(0, TAU),
        rot: rand(0, TAU),
        spin: rand(-1.2, 1.2),
        tumble: rand(0.4, 1.4),
        v: Math.floor(Math.random() * 3),
        vx: 0,
        vy: 0,
      };
    };
    const build = () => {
      const defs = snowing ? SNOW_LAYERS : RAIN_LAYERS(drizzle);
      layers = defs.map((L) => {
        const n = Math.round(clamp(W * H * L.dens * I * density, 4, L.cap));
        return { L, items: Array.from({ length: n }, () => (snowing ? spawnFlake(L, true) : spawnRain(L, true))) };
      });
      if (!snowing) {
        const area = (W * H) / 100000;
        beads = [];
        const nb = Math.round(clamp(area * (drizzle ? 90 : 55) * I, 10, 160) * (still ? 1 : 0.35));
        for (let i = 0; i < nb; i++) beads.push(newBead(rand(0, W), rand(0, H), 0, 0, true));
        bigs = [];
        const nbig = still ? Math.round(clamp(area * 6, 3, 12)) : Math.round(clamp(area * 3, 2, 6));
        for (let i = 0; i < nbig; i++) bigs.push(newBig(rand(0, W), rand(0, H * 0.85), rand(3, 5) * S));
      }
    };
    const newBead = (x, y, r, life, grown) => ({ x, y, r: r || (Math.random() < 0.8 ? rand(0.9, 1.9) : rand(1.9, 3.1)) * S, a: rand(0.45, 0.85), life: life || Infinity, max: life || Infinity, g: grown ? 1 : 0 });
    const newBig = (x, y, r) => ({ x, y, r, vy: 0, target: 0, next: 0, slide: false, dist: 0, wob: rand(0, TAU), stretch: 1 });

    const measure = () => {
      const cb = c.getBoundingClientRect();
      surfaces = [{ x0: snowing ? 0 : -1e5, x1: snowing ? W : 1e5, y: H - 1.5, ground: true, key: 'ground' }];
      hero.querySelectorAll('.cd, .hero-wx').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > cb.left && r.left < cb.right && r.top > cb.top) surfaces.push({ x0: r.left - cb.left + (snowing ? 1 : 5), x1: r.right - cb.left - (snowing ? 1 : 5), y: r.top - cb.top + 0.5, ground: false, key: el });
      });
      if (snowing) for (const sf of surfaces) sf.pile = pileFor(sf);
    };
    // A drift of snow on a surface: heights every 2px, capped lower near the rounded ends, and a little uneven.
    const pileFor = (sf) => {
      const n = Math.max(2, Math.ceil((sf.x1 - sf.x0) / 2));
      let p = piles.get(sf.key);
      if (!p || p.n !== n) {
        const old = p;
        const hMax = (sf.ground ? 8 : 4.2) * S;
        const cap = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const edge = Math.min(i, n - 1 - i) * 2;
          const wobble = 0.78 + 0.22 * Math.sin(i * 0.21 + n) * Math.sin(i * 0.063 + 1.3);
          cap[i] = hMax * (sf.ground ? 1 : Math.min(1, Math.sqrt(edge / (9 * S)))) * wobble;
        }
        const h = new Float32Array(n);
        for (let i = 0; i < n; i++) h[i] = old ? old.h[Math.min(old.n - 1, Math.floor((i / n) * old.n))] : cap[i] * (still ? 0.8 : 0.3) * rand(0.85, 1.1);
        p = { n, h, cap, hMax };
        piles.set(sf.key, p);
      }
      return p;
    };
    const deposit = (sf, x, amt) => {
      const p = sf.pile;
      if (!p) return;
      const i = Math.floor((x - sf.x0) / 2);
      for (let k = -2; k <= 2; k++) {
        const j = i + k;
        if (j < 0 || j >= p.n) continue;
        p.h[j] = Math.min(p.cap[j], p.h[j] + amt * (k === 0 ? 1 : Math.abs(k) === 1 ? 0.5 : 0.2));
      }
    };
    const size = () => {
      const b = c.getBoundingClientRect();
      if (!b.width || !b.height) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = b.width;
      H = b.height;
      S = clamp(H / 220, 0.8, 1.2);
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      build();
      measure();
      if (snowing) frost = frostSprite(W, H, S, dpr);
    };

    // ---------------------------------------------------------------- splashes
    const splash = (x, y, nx, ny, ground, small) => {
      if (splashes.length > 280) return;
      const n = small ? 1 + (Math.random() < 0.5 ? 1 : 0) : drizzle ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3);
      const base = Math.atan2(ny, nx);
      for (let i = 0; i < n; i++) {
        const a = base + rand(-1.05, 1.05);
        const v = rand(70, 175) * S * (drizzle ? 0.55 : 1) * (small ? 0.6 : 1);
        const life = rand(0.2, 0.42);
        splashes.push({ x, y: y - 0.5, vx: Math.cos(a) * v + Math.sin(ang) * 45 * S, vy: Math.sin(a) * v, life, max: life, r: rand(0.6, 1.25) * S * (small ? 0.8 : 1) });
      }
      if (ground && ripples.length < 40 && Math.random() < 0.5) ripples.push({ x, y: y - rand(0.5, 5) * S, t: 0, max: rand(0.35, 0.6), w: rand(3, 7) * S * (drizzle ? 0.7 : 1) });
    };

    // ---------------------------------------------------------------- glass
    const glass = (dt, t) => {
      const area = (W * H) / 100000;
      beadClock += dt * area * (drizzle ? 26 : 14) * I;
      while (beadClock > 1) {
        beadClock -= 1;
        beads.push(newBead(rand(0, W), rand(0, H)));
      }
      const beadMax = Math.round(clamp(area * (drizzle ? 120 : 80), 24, 240));
      if (beads.length > beadMax) beads.splice(0, beads.length - beadMax);
      bigClock += dt * area * (drizzle ? 0.8 : 1.4) * I;
      const bigMax = Math.round(clamp(area * 6 * I, 3, 18));
      while (bigClock > 1) {
        bigClock -= 1;
        if (bigs.length < bigMax) bigs.push(newBig(rand(0, W), rand(-4, H * 0.75), rand(2.6, 4.2) * S));
      }
      for (let i = bigs.length - 1; i >= 0; i--) {
        const b = bigs[i];
        if (!b.slide) {
          b.r += dt * rand(0, 0.7) * I * S; // rain landing on it
          if (b.r > 5.4 * S) b.slide = true;
        } else {
          if (t > b.next) {
            b.target = Math.random() < 0.2 ? 0 : rand(24, 105) * S * clamp(b.r / (5 * S), 0.7, 1.6);
            b.next = t + rand(0.12, 0.7);
          }
          b.vy += (b.target - b.vy) * Math.min(1, dt * 7);
          const dy = b.vy * dt;
          b.y += dy;
          b.x += Math.sin(b.y * 0.07 + b.wob) * 0.22 * S * (dy > 0 ? 1 : 0);
          b.stretch += ((b.vy > 12 * S ? 1.18 : 1) - b.stretch) * Math.min(1, dt * 8);
          b.dist += dy;
          if (b.dist > 6.5 * S) {
            b.dist = 0;
            if (Math.random() < 0.8) beads.push(newBead(b.x + rand(-0.8, 0.8) * S, b.y - b.r * 0.95, b.r * rand(0.17, 0.33), rand(4, 9)));
            b.r *= 0.988;
          }
        }
        // swallow beads it touches (a sliding drop wipes its path clear)
        for (let j = beads.length - 1; j >= 0; j--) {
          const d = beads[j];
          if (d.life !== Infinity && d.y < b.y - b.r * 0.5) continue; // its own trail behind it
          const dx = d.x - b.x;
          const dyy = d.y - b.y;
          const rr = b.r + d.r * 0.6;
          if (dx * dx + dyy * dyy < rr * rr) {
            b.r = Math.sqrt(b.r * b.r + d.r * d.r * 0.8);
            beads.splice(j, 1);
          }
        }
        if (b.r > 9 * S) b.r = 9 * S;
        if (b.y - b.r > H) bigs.splice(i, 1);
      }
      // drops that touch merge (the bigger one takes the smaller)
      for (let i = 0; i < bigs.length; i++) {
        for (let j = bigs.length - 1; j > i; j--) {
          const a = bigs[i];
          const b = bigs[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const rr = (a.r + b.r) * 0.8;
          if (dx * dx + dy * dy < rr * rr) {
            const keep = a.r >= b.r ? a : b;
            keep.r = Math.min(9 * S, Math.sqrt(a.r * a.r + b.r * b.r));
            if (keep === a) bigs.splice(j, 1);
            else {
              bigs.splice(i, 1);
              break;
            }
          }
        }
      }
      for (let j = beads.length - 1; j >= 0; j--) {
        const d = beads[j];
        if (d.life !== Infinity) {
          d.life -= dt;
          if (d.life <= 0) beads.splice(j, 1);
        }
      }
    };

    // ---------------------------------------------------------------- snow
    const snowFrame = (dt, t) => {
      const gust = 0.6 * Math.sin(t * 0.45) + 0.4 * Math.sin(t * 1.13 + 1.7);
      windNow = (w0 * 1.5 + gust * Math.max(3, (Number.isFinite(gusts) ? gusts : w0) - w0 + 3) * 0.8) * S;
      // frost creeps in over the first half minute
      if (frost) {
        frostT = still ? 1 : Math.min(1, frostT + dt / 30);
        g.globalAlpha = 0.25 + 0.75 * frostT;
        g.drawImage(frost, 0, 0, W, H);
      }
      for (const { L, items } of layers) {
        for (const p of items) {
          const py = p.y;
          if (!still) {
            // flutter: a slow sway plus a little turbulence, carried by the wind; pushed aside near the pointer
            const turb = Math.sin(p.y * 0.035 + t * 0.8 + p.ph) * p.sway * 0.45;
            if (umb && L.sprite !== 'bokeh') {
              const dx = p.x - umb.x;
              const dy = p.y - umb.y;
              const d2 = dx * dx + dy * dy;
              const R2 = umb.r * umb.r * 1.8;
              if (d2 < R2) {
                const d = Math.sqrt(d2) || 1;
                const push = (1 - d2 / R2) * 260 * S * dt;
                p.vx += (dx / d) * push;
                p.vy += (dy / d) * push * 0.6;
              }
            }
            p.vx *= Math.exp(-dt * 1.6);
            p.vy *= Math.exp(-dt * 1.6);
            p.y += (p.sp + p.vy) * dt;
            p.x += (windNow * L.drift + Math.cos(t * p.f + p.ph) * p.sway * 0.9 + turb + p.vx) * dt;
            p.rot += p.spin * dt;
            // settling on a ledge
            if (L.hits) {
              let landed = false;
              for (const sf of surfaces) {
                if (py <= sf.y && p.y > sf.y && p.x >= sf.x0 && p.x <= sf.x1) {
                  deposit(sf, p.x, L.hits * p.r);
                  landed = true;
                  break;
                }
              }
              if (landed) {
                Object.assign(p, spawnFlake(L, false));
                continue;
              }
            }
            // now and then a crystal lands on the glass
            if (L.sticks && Math.random() < dt * 0.05 && stuck.length < 10) {
              stuck.push({ x: p.x, y: p.y, r: p.r, rot: p.rot, v: p.v, life: 0, melt: rand(2.5, 5) });
              Object.assign(p, spawnFlake(L, false));
              continue;
            }
          }
          if (p.y - p.r > H || p.x > W + 40 || p.x < -60 - p.r) {
            Object.assign(p, spawnFlake(L, false));
            continue;
          }
          if (L.sprite === 'crystal') {
            // tumbling: the crystal turns in its plane and tips, so it foreshortens
            const tip = still ? 0.8 : 0.45 + 0.55 * Math.abs(Math.cos(t * p.tumble + p.ph));
            g.save();
            g.translate(p.x, p.y);
            g.rotate(p.rot);
            g.scale(1, tip);
            g.globalAlpha = p.al;
            g.drawImage(crystals[p.v], -p.r, -p.r, p.r * 2, p.r * 2);
            g.restore();
          } else {
            g.globalAlpha = p.al;
            g.drawImage(L.sprite === 'bokeh' ? bokeh : flake, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
          }
        }
      }
      // crystals melting on the glass into beads
      for (let i = stuck.length - 1; i >= 0; i--) {
        const f = stuck[i];
        f.life += dt;
        const m = f.life / f.melt;
        if (m < 1) {
          g.save();
          g.translate(f.x, f.y);
          g.rotate(f.rot);
          const k = 1 - 0.55 * m;
          g.globalAlpha = 0.95 * (1 - m);
          g.drawImage(crystals[f.v], -f.r * k, -f.r * k, f.r * 2 * k, f.r * 2 * k);
          g.restore();
        }
        const br = f.r * 0.32;
        const ba = smooth01((m - 0.35) / 0.5) * (1 - smooth01((f.life - f.melt - 5) / 3));
        if (ba > 0.01) {
          g.globalAlpha = ba * 0.9;
          g.drawImage(drop, f.x - br, f.y - br, br * 2, br * 2);
        }
        if (f.life > f.melt + 8) stuck.splice(i, 1);
      }
      // drifts on the ledges: settle (snow slides off steep steps), then draw
      g.globalAlpha = 1;
      for (const sf of surfaces) {
        const p = sf.pile;
        if (!p) continue;
        const h = p.h;
        if (!still) {
          for (let i = 0; i < p.n - 1; i++) {
            const d = h[i] - h[i + 1];
            if (Math.abs(d) > 1.1 * S) {
              const m = d * 0.25;
              h[i] -= m;
              h[i + 1] += m;
            }
          }
        }
        let peak = 0;
        for (let i = 0; i < p.n; i++) peak = Math.max(peak, h[i]);
        if (peak < 0.3) continue;
        const x0 = Math.max(sf.x0, -2);
        g.beginPath();
        g.moveTo(sf.x0, sf.y + 0.5);
        for (let i = 0; i < p.n; i++) {
          const x = sf.x0 + i * 2 + 1;
          if (x < x0 - 2 || x > W + 2) continue;
          g.lineTo(x, sf.y - h[i]);
        }
        g.lineTo(sf.x1, sf.y + 0.5);
        g.closePath();
        const sg = g.createLinearGradient(0, sf.y - p.hMax, 0, sf.y + 0.5);
        sg.addColorStop(0, day ? 'rgba(255,255,255,0.97)' : 'rgba(226,232,246,0.9)');
        sg.addColorStop(1, day ? 'rgba(205,218,238,0.95)' : 'rgba(150,164,196,0.9)');
        g.fillStyle = sg;
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = 0.7;
        g.stroke();
        // sparkle
        if (!still && day) {
          for (let i = 3; i < p.n - 3; i += 9) {
            const tw = Math.sin(t * 3.1 + i * 1.7) * Math.sin(t * 1.3 + i * 0.37);
            if (tw > 0.8 && h[i] > 1) {
              g.globalAlpha = (tw - 0.8) * 5;
              g.fillStyle = '#ffffff';
              g.fillRect(sf.x0 + i * 2, sf.y - h[i] + 0.5, 1.2, 1.2);
            }
          }
          g.globalAlpha = 1;
        }
      }
    };

    // ---------------------------------------------------------------- one frame
    const frame = (dt, t) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      ang = angleAt(t);
      const sa = Math.sin(ang);
      const ca = Math.cos(ang);
      const tn = Math.tan(ang);

      // lightning sits behind the rain
      if (storm && !still) {
        nextStrike -= dt;
        if (nextStrike <= 0) {
          bolt = makeBolt(W, H);
          boltT = 0;
          flashSeq = [0.34, -0.05, 0.1, 0.28];
          nextStrike = rand(6, 15);
        }
        if (flashSeq) {
          boltT += dt;
          const step = Math.floor(boltT / 0.06);
          if (step < flashSeq.length) flash = Math.max(0, flashSeq[step]);
          else {
            flashSeq = null;
          }
        } else flash = Math.max(0, flash - dt * 1.2);
        if (bolt && boltT < 0.6) {
          // the cloud lights up around where it strikes
          const glow = g.createRadialGradient(bolt.x, 0, 0, bolt.x, 0, H * 1.1);
          glow.addColorStop(0, 'rgba(210,222,255,0.55)');
          glow.addColorStop(1, 'rgba(210,222,255,0)');
          g.globalAlpha = Math.min(1, flash * 2.4 + 0.08 * (1 - boltT / 0.6));
          g.fillStyle = glow;
          g.fillRect(0, 0, W, H);
        }
        if (bolt && boltT < 0.42) {
          const fade = 1 - boltT / 0.42;
          g.lineCap = 'round';
          g.lineJoin = 'round';
          for (const p of bolt.paths) {
            g.beginPath();
            p.pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
            g.globalAlpha = 0.18 * fade;
            g.strokeStyle = '#c9d8ff';
            g.lineWidth = p.w * 6;
            g.stroke();
            g.globalAlpha = 0.9 * fade * (boltT < 0.12 || (boltT > 0.18 && boltT < 0.26) ? 1 : 0.35);
            g.strokeStyle = '#ffffff';
            g.lineWidth = p.w;
            g.stroke();
          }
        }
      }

      if (snowing) snowFrame(dt, t);
      else {
        // rain: far → near
        for (const { L, items } of layers) {
          const lw = L.lw * S;
          g.setTransform(dpr * ca, -dpr * sa, dpr * sa, dpr * ca, 0, 0); // rotate so streaks run along the wind
          for (const d of items) {
            const py = d.y;
            if (!still) {
              d.x += sa * d.sp * dt;
              d.y += ca * d.sp * dt;
            }
            let hit = false;
            if (!still) {
              if (umb && !L.blur) {
                const dx = d.x - umb.x;
                const dy = d.y - umb.y;
                if (dy < umb.r * 0.25 && dx * dx + dy * dy < umb.r * umb.r) {
                  const m = Math.sqrt(dx * dx + dy * dy) || 1;
                  const nx = dx / m;
                  const ny = dy / m;
                  if (L.hits) splash(umb.x + nx * umb.r, umb.y + ny * umb.r, nx, ny, false, L.hits !== 'all');
                  hit = true;
                }
              }
              if (!hit && L.hits === 'all') {
                for (const s of surfaces) {
                  if (py <= s.y && d.y > s.y) {
                    const hx = d.x - (d.y - s.y) * tn;
                    if (hx >= s.x0 && hx <= s.x1) {
                      splash(hx, s.y, -sa * 0.2, -1, s.ground, false);
                      hit = true;
                      break;
                    }
                  }
                }
              }
            }
            if (hit || d.y - d.len > H || d.x > W + 60) {
              Object.assign(d, spawnRain(L, false));
              continue;
            }
            const u = d.x * ca - d.y * sa;
            const v = d.x * sa + d.y * ca;
            const curtain = 0.72 + 0.28 * Math.sin(d.x * 0.0065 - t * 0.9) * Math.sin(d.x * 0.0021 + t * 0.31 + 1.2);
            g.globalAlpha = d.al * curtain;
            g.drawImage(streak, u - 1.5 * lw, v - d.len, 3 * lw, d.len);
          }
        }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);

        // wet ground: a faint sheen and spray along the bottom edge
        const sheen = g.createLinearGradient(0, H - 22 * S, 0, H);
        sheen.addColorStop(0, 'rgba(210,225,255,0)');
        sheen.addColorStop(1, `rgba(210,225,255,${(0.05 + 0.06 * I).toFixed(3)})`);
        g.globalAlpha = 1;
        g.fillStyle = sheen;
        g.fillRect(0, H - 22 * S, W, 22 * S);

        // ripples, then splash droplets
        g.lineWidth = 0.7;
        g.strokeStyle = '#e4ecfa';
        for (let i = ripples.length - 1; i >= 0; i--) {
          const r = ripples[i];
          r.t += dt;
          const p = r.t / r.max;
          if (p >= 1) {
            ripples.splice(i, 1);
            continue;
          }
          g.globalAlpha = 0.24 * (1 - p) * (1 - p);
          g.beginPath();
          g.ellipse(r.x, r.y, r.w * (0.25 + p), r.w * (0.25 + p) * 0.2, 0, 0, TAU);
          g.stroke();
        }
        g.lineCap = 'round';
        g.strokeStyle = '#eef3fd';
        const grav = 1100 * S;
        for (let i = splashes.length - 1; i >= 0; i--) {
          const p = splashes[i];
          p.vy += grav * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          if (p.life <= 0 || p.y > H + 4) {
            splashes.splice(i, 1);
            continue;
          }
          g.globalAlpha = 0.7 * (p.life / p.max);
          g.lineWidth = p.r;
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - p.vx * 0.014, p.y - p.vy * 0.014);
          g.stroke();
        }

        // water on the glass
        if (!still) glass(dt, t);
        for (const d of beads) {
          if (d.g < 1) d.g = Math.min(1, d.g + dt * 7);
          const r = d.r * (0.35 + 0.65 * d.g);
          g.globalAlpha = d.a * (d.life === Infinity ? 1 : Math.min(1, d.life / 2));
          g.drawImage(drop, d.x - r, d.y - r, r * 2, r * 2);
        }
        for (const b of bigs) {
          const rw = b.r / Math.sqrt(b.stretch);
          const rh = b.r * b.stretch;
          // a faint shadow on the far side of the glass gives the bead some body
          g.globalAlpha = 0.18;
          g.fillStyle = '#020814';
          g.beginPath();
          g.ellipse(b.x + rw * 0.18, b.y - rh * 0.02, rw * 1.02, rh * 1.02, 0, 0, TAU);
          g.fill();
          g.globalAlpha = 1;
          g.drawImage(drop, b.x - rw, b.y - rh * 1.08, rw * 2, rh * 2);
        }
      }

      if (flash > 0) {
        g.globalAlpha = flash * 0.55;
        g.fillStyle = '#dfe7ff';
        g.fillRect(0, 0, W, H);
      }
      g.globalAlpha = 1;
    };

    const loop = (now) => {
      const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
      last = now;
      frame(dt, now / 1000);
      // Slow device? Thin the rain (twice at most) instead of stuttering.
      frames++;
      if (dt > 1 / 36) slowFrames++;
      if (frames === 90) {
        if (slowFrames > 45 && density > 0.5) {
          density *= 0.7;
          layers.forEach((l) => (l.items.length = Math.max(4, Math.round(l.items.length * 0.7))));
        }
        frames = 0;
        slowFrames = 0;
      }
      if (running) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || still) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    size();
    if (still) frame(0, 0);
    else start();

    const ro = new ResizeObserver(() => {
      size();
      if (still) frame(0, 0);
    });
    ro.observe(c);
    // The chips move as data arrives or when scrolled sideways; re-measure the ledges now and then.
    const mt = setInterval(measure, 700);
    const chips = hero.querySelector('.chips-row');
    const onScroll = () => measure();
    if (chips) chips.addEventListener('scroll', onScroll, { passive: true });
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())) : null;
    if (io) io.observe(c);
    // The umbrella.
    const onMove = (e) => {
      const cb = c.getBoundingClientRect();
      umb = { x: e.clientX - cb.left, y: e.clientY - cb.top, r: 40 * S };
    };
    const onLeave = () => (umb = null);
    const onUp = (e) => e.pointerType !== 'mouse' && (umb = null);
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerdown', onMove, { passive: true });
    hero.addEventListener('pointerleave', onLeave);
    hero.addEventListener('pointerup', onUp);
    hero.addEventListener('pointercancel', onLeave);
    return () => {
      stop();
      ro.disconnect();
      clearInterval(mt);
      if (io) io.disconnect();
      if (chips) chips.removeEventListener('scroll', onScroll);
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerdown', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      hero.removeEventListener('pointerup', onUp);
      hero.removeEventListener('pointercancel', onLeave);
    };
  }, [kind, intensity, drizzle, day, Math.round(wind || 0), Math.round(gusts || 0)]);
  return <canvas ref={ref} className="precip" aria-hidden="true" />;
}
