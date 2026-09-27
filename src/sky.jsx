// The sky behind the Home header, drawn on a canvas.
//
// Color follows the sun's real height (from the place's sunrise and sunset), blending continuously through night,
// blue hour, sunrise, morning, noon, golden hour and dusk, with a glow along the horizon when the sun is low. Weather
// greys and darkens it. The sun has a soft bloom; the moon rises and sets by its phase (a full moon is up all night,
// a first quarter in the evening), shows tonight's shape and can hang pale in a daytime sky. Stars twinkle one by
// one, the odd shooting star crosses a clear night, and on dark moonless nights the Milky Way shows faintly.
//
// Clouds are generated from noise and lit by marching light through them, so tops catch the sun and bellies go grey,
// and at sunrise and sunset they are lit from below and the side in pink and gold (high cirrus stays lit a little
// after the sun has gone). Overcast is a full layered deck, rain and storms add dark ragged scud racing underneath,
// fog is drifting banks with a pale sun behind. Now and then birds cross a fair day, a jet draws a contrail that
// spreads and fades, and a plane blinks across the night.
//
// Rain and snow are drawn by rain.jsx on a canvas above this one. This canvas animates at 30 fps, builds its clouds a
// few per frame (they fade in), pauses off-screen, keeps the text readable by measuring how bright the sky behind it
// is, and with "reduce motion" on it paints a still sky once a minute.
import React, { useEffect, useRef } from 'react';
import { reducedMotion } from './fx.jsx';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (c, a = 1) => `rgba(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))},${a})`;
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const grey = (c, t) => {
  const l = lum(c);
  return mix(c, [l * 0.97, l * 0.99, l * 1.04], t);
};
const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
// Stepwise interpolation through [key, value] pairs (value an rgb triple or a number).
function ramp(stops, x) {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [a, va] = stops[i - 1];
      const [b, vb] = stops[i];
      const t = smooth(a, b, x);
      return typeof va === 'number' ? lerp(va, vb, t) : mix(va, vb, t);
    }
  }
  return stops[stops.length - 1][1];
}

// ---------------------------------------------------------------- value noise (optionally tileable in x)
function makeNoise(seed) {
  const R = rng(seed);
  const val = new Float32Array(256 * 256);
  for (let i = 0; i < val.length; i++) val[i] = R();
  const noise = (x, y, period) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const x0 = period ? ((xi % period) + period) % period : xi & 255;
    const x1 = period ? (x0 + 1) % period : (xi + 1) & 255;
    const y0 = (yi & 255) << 8;
    const y1 = ((yi + 1) & 255) << 8;
    const a = val[y0 | x0];
    const b = val[y0 | x1];
    const c = val[y1 | x0];
    const d = val[y1 | x1];
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, oct = 5, period = 0) => {
    let f = 0;
    let amp = 0.5;
    let fr = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      f += amp * noise(x * fr + i * 17.3, y * fr + i * 9.1, period ? period * fr : 0);
      norm += amp;
      amp *= 0.5;
      fr *= 2;
    }
    return f / norm;
  };
}
// How many octaves fit before the finest one would alias (keep its period above ~2.6 px).
const octFor = (cycles, px) => clamp(Math.floor(Math.log2(px / 2.6 / Math.max(0.5, cycles))) + 1, 1, 6);

// ---------------------------------------------------------------- sun, moon, sky color
const minutesOf = (iso, fallback) => (iso && iso.length >= 16 ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : fallback);
// Sun height from -1 (deep night) through 0 (horizon) to 1 (midday), and how far along its arc it is.
export function sunState(now, riseISO, setISO) {
  const m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const rise = minutesOf(riseISO, 6 * 60 + 45);
  const set = minutesOf(setISO, 18 * 60 + 45);
  const dayLen = set - rise;
  if (m >= rise && m <= set) {
    const f = (m - rise) / dayLen;
    return { alt: Math.sin(Math.PI * f), dayFrac: f, nightFrac: null, evening: f > 0.5, m, rise, set };
  }
  const nightLen = 1440 - dayLen;
  const k = m > set ? m - set : m + 1440 - set;
  const f = k / nightLen;
  return { alt: -Math.sin(Math.PI * f), dayFrac: null, nightFrac: f, evening: f < 0.5, m, rise, set };
}
// Moon age as a fraction of the lunar month (0 new, 0.5 full), from a known new moon (Jan 6, 2000 18:14 UTC).
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const p = (days / 29.530588853) % 1;
  return p < 0 ? p + 1 : p;
}
// Where the moon is: it crosses the sky about 12h25m after rising, and rises later each day with its phase
// (new moon with the sun, full moon at sunset). Returns how far along its arc it is, or null when it's down.
export function moonArc(sun, phase) {
  const noon = (sun.rise + sun.set) / 2;
  const transit = noon + phase * 1440;
  const f = ((((sun.m - (transit - 372)) % 1440) + 1440) % 1440) / 745;
  return f <= 1 ? f : null;
}

// Sky colors by sun height: [alt, top, middle, bottom (horizon), horizon glow, glow strength].
const KEYS = [
  [-1.0, '#040a1a', '#081329', '#0d1d3d', '#000000', 0],
  [-0.3, '#050c1f', '#0a1732', '#13254a', '#000000', 0],
  [-0.14, '#0b1633', '#182a55', '#2f3b6e', '#4b3a6e', 0.28],
  [-0.05, '#172858', '#394986', '#8a6a9a', '#e08a78', 0.5],
  [0.0, '#243d78', '#6474a6', '#ec9c6e', '#ffae6e', 0.8],
  [0.06, '#2a5690', '#7c9ec6', '#f0bd88', '#ffd49a', 0.55],
  [0.18, '#1d5d98', '#4b8dc3', '#98c3e2', '#fff2da', 0.16],
  [0.5, '#15538d', '#3981bc', '#7cb3dc', '#ffffff', 0.08],
  [1.0, '#124e87', '#337ab5', '#70abd5', '#ffffff', 0.06],
];
function skyColors(alt, evening) {
  let i = 0;
  while (i < KEYS.length - 2 && alt > KEYS[i + 1][0]) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = clamp((alt - a[0]) / (b[0] - a[0]), 0, 1);
  const out = { top: mix(hex(a[1]), hex(b[1]), t), mid: mix(hex(a[2]), hex(b[2]), t), bot: mix(hex(a[3]), hex(b[3]), t), glow: mix(hex(a[4]), hex(b[4]), t), glowA: lerp(a[5], b[5], t) };
  // Evenings run warmer and redder than mornings.
  if (evening && alt > -0.2 && alt < 0.25) {
    const w = 1 - Math.abs(alt) / 0.25;
    out.bot = mix(out.bot, [242, 128, 84], 0.22 * w);
    out.glow = mix(out.glow, [255, 120, 70], 0.3 * w);
  } else if (!evening && alt > -0.2 && alt < 0.2) {
    const w = 1 - Math.abs(alt) / 0.2;
    out.bot = mix(out.bot, [236, 160, 170], 0.18 * w);
  }
  return out;
}

// ---------------------------------------------------------------- weather
// kind from the WMO code; how grey and dark the sky goes; how much sun, moon and stars get through; how much light
// makes it through a deck to light the clouds underneath.
export function weatherOf(code) {
  const c = Number(code);
  if (c >= 95) return { kind: 'storm', grey: 0.9, dark: 0.5, sun: 0, moon: 0, stars: 0, deck: 0.3 };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { kind: 'snow', grey: 0.8, dark: 0.86, sun: 0.2, moon: 0.15, stars: 0, deck: 0.72 };
  if (c >= 51) return { kind: 'rain', grey: 0.84, dark: 0.7, sun: 0, moon: 0, stars: 0, deck: 0.5 };
  if (c === 45 || c === 48) return { kind: 'fog', grey: 0.8, dark: 0.92, sun: 0.4, moon: 0.3, stars: 0, deck: 0.78 };
  if (c === 3) return { kind: 'cloudy', grey: 0.7, dark: 0.82, sun: 0.25, moon: 0.2, stars: 0, deck: 0.66 };
  if (c === 2) return { kind: 'partly', grey: 0.1, dark: 1, sun: 1, moon: 1, stars: 0.85, deck: 1 };
  if (c === 1) return { kind: 'mostly', grey: 0.04, dark: 1, sun: 1, moon: 1, stars: 1, deck: 1 };
  return { kind: 'clear', grey: 0, dark: 1, sun: 1, moon: 1, stars: 1, deck: 1 };
}

// The light on the clouds right now: direct light (sun, or moon at night) and ambient sky light at their tops and
// bellies; `low` is how low the sun is (1 = on the horizon, lighting clouds from below and the side). High clouds
// see the sun a little longer after sunset, so they get their own direct light.
function lighting(alt, evening, wx, moonUp) {
  const set = evening ? [255, 118, 78] : [255, 138, 118];
  const gold = evening ? [255, 190, 128] : [255, 202, 160];
  const day = [214, 210, 200];
  const direct = (a) => (a >= 0.25 ? day : a >= 0.06 ? mix(gold, day, smooth(0.06, 0.25, a)) : a >= -0.01 ? mix(set, gold, smooth(-0.01, 0.06, a)) : scale(set, smooth(-0.075, -0.01, a)));
  let sun = direct(alt);
  // high cloud turns pink in twilight (tinted relative to its own brightness, so it fades out with the light)
  const dh = direct(alt + 0.06);
  let high = mix(dh, [dh[0], dh[1] * 0.6, dh[2] * (evening ? 0.72 : 0.84)], alt < 0.03 ? 0.6 * smooth(-0.12, -0.02, alt) : 0);
  const top = ramp([[-0.3, [30, 37, 60]], [-0.14, [46, 50, 84]], [-0.04, [106, 90, 128]], [0.03, [150, 134, 160]], [0.18, [166, 182, 208]], [1, [172, 190, 216]]], alt);
  const bot = ramp([[-0.3, [16, 20, 36]], [-0.14, [26, 29, 54]], [-0.04, [66, 54, 86]], [0.03, [104, 92, 118]], [0.18, [128, 140, 164]], [1, [134, 148, 172]]], alt);
  // Moonlight silvers the tops at night.
  if (alt < -0.06 && moonUp > 0) {
    const m = scale([104, 116, 146], moonUp * smooth(-0.06, -0.16, alt));
    sun = [Math.max(sun[0], m[0]), Math.max(sun[1], m[1]), Math.max(sun[2], m[2])];
    high = [Math.max(high[0], m[0]), Math.max(high[1], m[1]), Math.max(high[2], m[2])];
  }
  let low = 1 - smooth(0.02, 0.2, alt);
  let T = top;
  let B = bot;
  if (wx.deck < 1) {
    // Under a deck the light is diffuse and grey; at night the town's lights glow faintly on its underside.
    const k = wx.deck;
    sun = scale(grey(sun, 0.8), k * 0.5);
    high = scale(grey(high, 0.8), k * 0.5);
    T = scale(grey(top, 0.75), 0.25 + 0.45 * k);
    B = scale(grey(bot, 0.75), 0.22 + 0.45 * k);
    const town = smooth(-0.02, -0.15, alt) * (0.5 + 0.5 * k);
    T = mix(T, [T[0] + 16, T[1] + 13, T[2] + 12], town);
    B = mix(B, [B[0] + 40, B[1] + 30, B[2] + 26], town);
    low *= 0.3;
  }
  return { sun, high, top: T, bot: B, low };
}

// ---------------------------------------------------------------- clouds
// A cloud is computed once as fields (density, and how much light reaches each point from above, from the lower
// left and from the lower right, found by marching toward the light), then painted for the light of the moment.
// The work is done a row at a time so it can be spread over several frames.
function cloudBuilder(fbm, type, w, h, seed, tileW, quality = 1) {
  // resolution: soft layers can be rendered small and scaled up; decks on sharp screens get a little more
  const sc = (type === 'cirrus' || type === 'cumulus' ? 0.9 : type === 'scud' ? 0.75 : type === 'cells' ? 0.55 : 0.42) * (tileW ? quality : 1);
  // Decks tile left to right; they get a column of wrapped padding each side so the joins filter seamlessly.
  const pad = tileW ? 1 : 0;
  const tc = Math.max(8, Math.round(w * sc));
  const cw = tc + pad * 2;
  const ch = Math.max(6, Math.round(h * sc));
  const N = cw * ch;
  const dens = new Float32Array(N);
  const R = rng(seed);
  const ox = R() * 150;
  const oy = R() * 150;
  const a = ch / cw; // height in units of width
  let det = null;
  let fill;
  if (type === 'cumulus') {
    // A row of big rounded towers, taller in the middle, each crowned with smaller bulges (the cauliflower look),
    // on a flat base; the outline is then eroded by noise.
    det = new Float32Array(N);
    const n = 4 + Math.floor(R() * 4);
    const baseY = a * 0.8;
    const px0 = [];
    const py0 = [];
    const pr2 = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const hump = Math.max(0.15, 1 - Math.abs(t - 0.5) * 1.7);
      const r = Math.min(a * 0.36, (0.07 + 0.12 * hump + R() * 0.035) * (a / 0.5));
      const px = clamp(0.14 + 0.72 * t + (R() - 0.5) * 0.06, r * 1.15 + 0.03, 1 - r * 1.15 - 0.03);
      const py = Math.max(r * 1.28 + a * 0.05 + 0.02, baseY - r * (0.3 + 0.45 * hump) - R() * r * 0.15);
      px0.push(px);
      py0.push(py);
      pr2.push(r * r);
      const m = 2 + Math.floor(R() * 2);
      for (let j = 0; j < m; j++) {
        const th = -Math.PI * (0.18 + 0.64 * ((j + R() * 0.8) / m));
        const rr = r * (0.34 + R() * 0.16);
        px0.push(px + Math.cos(th) * r * 0.78);
        py0.push(py + Math.sin(th) * r * 0.78);
        pr2.push(rr * rr);
      }
    }
    const np = px0.length;
    const F = 8;
    const oct = octFor(F, cw);
    const octD = octFor(F * 2.2, cw);
    fill = (y) => {
      const Y = y / cw;
      const base = 1 - smooth(baseY - a * 0.1, baseY + a * 0.03, Y);
      if (base <= 0) return;
      for (let x = 0; x < cw; x++) {
        const X = x / cw;
        const warp = (fbm(ox + 70 + X * 5, oy + Y * 5, 2) - 0.5) * 0.045;
        let keep = 1;
        for (let k = 0; k < np; k++) {
          const dx = X + warp - px0[k];
          const dy = Y - warp - py0[k];
          const q = 1 - (dx * dx + dy * dy) / pr2[k];
          if (q > 0) keep *= 1 - q;
        }
        const shape = (1 - keep) * base;
        if (shape < 0.06) continue;
        const nz = fbm(ox + X * F, oy + Y * F, oct);
        const th = 0.1 + 0.55 * nz;
        const d = (shape - th) / (1 - th);
        if (d > 0) {
          const i = y * cw + x;
          dens[i] = Math.min(1, d);
          det[i] = fbm(ox + 30 + X * F * 2.2, oy + Y * F * 2.2, octD);
        }
      }
    };
  } else if (type === 'scud') {
    // Low, ragged fragments: noise stretched along the wind inside a soft envelope, torn at the edges.
    det = new Float32Array(N);
    const F = 7;
    const oct = octFor(F, cw);
    fill = (y) => {
      const v = y / ch;
      const Y = y / cw;
      for (let x = 0; x < cw; x++) {
        const u = x / cw;
        const env = smooth(0, 0.3, u) * (1 - smooth(0.66, 1, u)) * Math.exp(-(((v - 0.52 - (fbm(ox + u * 2, oy + 9, 2) - 0.5) * 0.3) / 0.3) ** 2));
        if (env < 0.03) continue;
        const nz = fbm(ox + u * F * 0.4, oy + Y * F * 1.5, oct);
        const tear = fbm(ox + 90 + u * F * 1.2, oy + Y * F * 3.2, Math.max(1, oct - 1));
        const d = (env * 1.1 - 0.5 + (nz - 0.5) * 1.3 + (tear - 0.5) * 0.8) * 1.3;
        if (d > 0) {
          const i = y * cw + x;
          dens[i] = Math.min(1, d);
          det[i] = tear;
        }
      }
    };
  } else if (type === 'cirrus') {
    // Fibrous streaks: noise stretched along the wind, sheared and warped into hooks.
    const tilt = (R() - 0.5) * 0.5;
    const Fu = 2.2;
    const Fv = Math.min(7, ch / 9);
    const oct = Math.min(octFor(Fu, cw), octFor(Fv, ch), 4);
    fill = (y) => {
      const v = y / ch;
      for (let x = 0; x < cw; x++) {
        const u = x / cw;
        const env = smooth(0, 0.22, u) * (1 - smooth(0.62, 1, u)) * Math.exp(-(((v - 0.5 - (u - 0.5) * tilt) / 0.3) ** 2));
        if (env < 0.02) continue;
        const wv = fbm(ox + u * 2.5, oy + v * 1.5, 3) - 0.5;
        const vv = v + (u - 0.5) * tilt + wv * 0.35 + u * u * 0.12;
        const s = fbm(ox + 40 + u * Fu, oy + vv * Fv, oct);
        const f = clamp((s - 0.42) * 2.6, 0, 1);
        const d = env * f * f;
        if (d > 0.005) dens[y * cw + x] = d;
      }
    };
  } else {
    // Decks and fog: bands that tile seamlessly left to right. Stratocumulus cells shrink and flatten toward the
    // horizon (the bottom), the way a real deck recedes.
    const P = type === 'strat' ? 5 : type === 'cells' ? 8 : 6;
    const Fv = type === 'strat' ? 2.2 : type === 'cells' ? 2.4 : 1.6;
    const oct = Math.min(octFor(P, tc), octFor(Fv * (type === 'cells' ? 3 : 1), ch) + 1, 5);
    if (type === 'cells') det = new Float32Array(N);
    fill = (y) => {
      const v = y / ch;
      const band = type === 'strat' ? 1 : type === 'cells' ? smooth(0, 0.08, v) : smooth(0, 0.45, v) * (1 - smooth(0.75, 1, v));
      const Y = oy + (type === 'cells' ? v + v * v * 1.1 : v) * Fv;
      for (let x = 0; x < cw; x++) {
        const u = (x - pad) / tc;
        const nz = fbm(u * P, Y, oct, P);
        let d;
        if (type === 'strat') d = 0.3 + nz * 1.0 - 0.15 * v;
        else if (type === 'cells') {
          const cell = fbm(u * P * 0.5, oy + 50 + (Y - oy) * 0.5, 3, P * 0.5);
          d = band * (nz * 0.75 + cell * 0.7 - 0.52) * 2.3;
          det[y * cw + x] = nz;
        } else {
          // fog: soft horizontal wisps, thickest low down
          const wisp = fbm(u * P, oy + 20 + v * 4.5, Math.min(oct, 4), P);
          d = band * (nz * 0.9 + wisp * 0.9 - 0.62) * 1.9;
        }
        if (d > 0) dens[y * cw + x] = Math.min(1, d);
      }
    };
  }
  // light marched through the density: from above, and from low on either side (the rising or setting sun)
  const march = (out, dx, dy) => {
    const l = Math.hypot(dx, dy);
    const ux = dx / l;
    const uy = dy / l;
    const steps = 10;
    const step = Math.max(1, ch * 0.05);
    const sigma = 3 / (ch * 0.34);
    return (y) => {
      for (let x = 0; x < cw; x++) {
        const i = y * cw + x;
        if (!dens[i]) continue;
        let od = dens[i] * 0.5;
        let px = x;
        let py = y;
        for (let k = 0; k < steps; k++) {
          px += ux * step;
          py += uy * step;
          const iy = py | 0;
          const ix = px | 0;
          if (py < 0 || iy >= ch || px < 0 || ix >= cw) break;
          od += dens[iy * cw + ix];
        }
        od *= step * sigma;
        out[i] = Math.exp(-od) * 0.7 + Math.exp(-od * 0.22) * 0.3;
      }
    };
  };
  const phases = [fill];
  let lt = null;
  let lbl = null;
  let lbr = null;
  if (type === 'cumulus' || type === 'scud') {
    lt = new Float32Array(N);
    lbl = new Float32Array(N);
    lbr = new Float32Array(N);
    phases.push(march(lt, 0, -1), march(lbl, -1, 0.3), march(lbr, 1, 0.3));
  }
  let ph = 0;
  let y = 0;
  return {
    // work until the deadline (a performance.now() time); true when finished
    step(deadline) {
      while (ph < phases.length) {
        phases[ph](y);
        y++;
        if (y >= ch) {
          y = 0;
          ph++;
        }
        if ((y & 1) === 0 && performance.now() > deadline) break;
      }
      return ph >= phases.length;
    },
    field: () => ({ type, cw, ch, tc, pad, dens, det, lt, lbl, lbr, tileW }),
  };
}
// Build a cloud in one go (tests, and "reduce motion", where there's no animation to keep smooth).
function cloudField(fbm, type, w, h, seed, tileW) {
  const b = cloudBuilder(fbm, type, w, h, seed, tileW);
  b.step(Infinity);
  return b.field();
}

// Paint a cloud's fields for the given light (cheap; done again as the light changes).
function paintCloud(cl, L) {
  const f = cl.f;
  const { cw, ch, dens, lt, type } = f;
  if (!cl.cv) {
    cl.cv = mk(cw, ch);
    cl.g = cl.cv.getContext('2d');
    cl.img = cl.g.createImageData(cw, ch);
  }
  const d8 = cl.img.data;
  const lb = cl.side > 0 ? f.lbr : f.lbl;
  const det = f.det;
  const low = L.low;
  // scud hangs below the deck, in its shadow: darker than the cloud behind it
  const dim = type === 'scud' ? 0.72 : 1;
  const sun = scale(type === 'cirrus' ? L.high : L.sun, dim);
  const top = scale(L.top, dim);
  const bot = scale(L.bot, dim * (type === 'scud' ? 0.9 : 1));
  const A = cl.alpha;
  for (let y = 0; y < ch; y++) {
    const v = y / ch;
    const vt = type === 'strat' || type === 'fog' ? v * 0.7 : v;
    const ar = top[0] + (bot[0] - top[0]) * vt;
    const ag = top[1] + (bot[1] - top[1]) * vt;
    const ab = top[2] + (bot[2] - top[2]) * vt;
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      const d = dens[i];
      const o = i * 4;
      if (!d) {
        d8[o + 3] = 0;
        continue;
      }
      let T;
      let a;
      if (lt) T = lt[i] * (1 - low) + lb[i] * low;
      if (type === 'cumulus') a = smooth(0, 0.26, d);
      else if (type === 'scud') a = smooth(0, 0.9, d) * 0.9;
      else if (type === 'cells') {
        // seen from below: thick parts dark, thin parts bright; a low sun lights the undersides near the horizon
        a = smooth(0, 0.3, d);
        T = clamp(1.05 - d * 0.95, 0.1, 1) * (1 - low) + (0.25 + 0.75 * v) * (1.1 - d * 0.6) * low;
      } else if (type === 'cirrus') {
        a = Math.min(1, d * 1.3);
        T = 0.95 - d * 0.25;
      } else if (type === 'strat') {
        a = clamp(0.8 + d * 0.3, 0, 1);
        T = clamp(1.15 - d * 0.95, 0.12, 1);
      } else {
        a = clamp(d * 1.1, 0, 1);
        T = 1.25 - d * 0.15; // fog is milky and bright, lit from all around
      }
      if (det) T *= 0.74 + 0.52 * det[i]; // crevices between bulges and cells sit in shadow
      d8[o] = ar + sun[0] * T;
      d8[o + 1] = ag + sun[1] * T;
      d8[o + 2] = ab + sun[2] * T;
      d8[o + 3] = a * A * 255;
    }
  }
  cl.g.putImageData(cl.img, 0, 0);
}

// The Milky Way: a faint band of dust with a dark rift, for dark moonless nights.
function milkyWay(fbm, W, H) {
  const sc = 0.5;
  const cw = Math.max(8, Math.round(W * sc));
  const ch = Math.max(6, Math.round(H * sc));
  const cv = mk(cw, ch);
  const g = cv.getContext('2d');
  const img = g.createImageData(cw, ch);
  const d = img.data;
  // the band runs from low on the left up to the top right
  const x0 = cw * 0.08;
  const y0 = ch * 1.1;
  const x1 = cw * 0.8;
  const y1 = -ch * 0.1;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  const width = Math.max(ch * 0.34, 40 * sc);
  const oct = octFor(8, cw);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const dist = ((x - x0) * nx + (y - y0) * ny) / width;
      const along = ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / (len * len);
      if (Math.abs(dist) > 1.6) continue;
      const n = fbm(x / cw * 8, y / cw * 8 + 30, oct);
      const glow = Math.exp(-dist * dist * 1.6) * (0.35 + n * 0.9) * (0.6 + 0.4 * Math.sin(along * 3.1));
      const rift = 1 - 0.7 * Math.exp(-(((dist + 0.1 - 0.25 * Math.sin(along * 5)) / 0.22) ** 2)) * smooth(0.15, 0.55, n);
      const a = clamp((glow * rift - 0.18) * 0.55, 0, 0.5);
      const i = (y * cw + x) * 4;
      d[i] = 214;
      d[i + 1] = 214 + n * 10;
      d[i + 2] = 236;
      d[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// for tests and benchmarks
export const skyInternals = { cloudField, makeNoise, lighting, weatherOf };

// ---------------------------------------------------------------- the component
// `page`: the sky behind the whole app (glass theme) instead of just the Home header. It draws at a lower
// resolution and frame rate (it sits behind frosted glass), pauses while the page scrolls, and shades only the top,
// where titles sit on the sky.
export function SkyCanvas({ code, riseISO, setISO, wind = 6, page = false, onTone }) {
  const ref = useRef(null);
  // The wind only sets how fast things drift, so a new reading changes the speed without rebuilding the sky.
  const windRef = useRef(wind);
  windRef.current = wind;
  const toneRef = useRef(onTone);
  toneRef.current = onTone;
  useEffect(() => {
    const c = ref.current;
    const g = c && c.getContext && c.getContext('2d');
    if (!g) return undefined;
    const still = reducedMotion();
    const wx = weatherOf(code);
    const fbm = makeNoise(1000 + (Number(code) || 0) * 7);
    const R = Math.random;
    const drift = 1; // cloud speeds below are relative; the wind scales them each frame
    const windPx = () => 4 + clamp(Number(windRef.current) || 6, 0, 40) * 0.8; // px/s for the nearest clouds
    let W = 0;
    let H = 0;
    let S = 1;
    let dpr = 1;
    let laidW = 0;
    let stars = [];
    let milky = null;
    let clouds = []; // cumulus / scud / cirrus in motion: { type, w, h, x, yF, v, alpha, f, cv, side, fade }
    let decks = []; // seamless layers: { type, w, hF, yF, off, v, alpha, f, cv, fade }
    let jobs = [];
    let L = null;
    let lightKey = '';
    let birds = null;
    let plane = null;
    let jet = null;
    let meteor = null;
    let nextBirds = 8 + R() * 25;
    let nextPlane = 8 + R() * 30;
    let nextJet = 10 + R() * 40;
    let nextMeteor = 5 + R() * 20;
    let shadeA = 0.2;
    let lastTone = '';
    const toneProbe = page ? mk(8, 2) : null;
    const tg = toneProbe ? toneProbe.getContext('2d', { willReadFrequently: true }) : null;
    // Behind the page: read the sky's actual colors along the top edge and at the bottom of the screen, so the
    // strips the phone paints outside the page (status bar, Safari's bars) can be matched to them.
    const readTone = () => {
      if (!tg || !toneRef.current || !c.width || !c.height) return;
      const band = Math.max(1, Math.round(4 * dpr));
      const vb = clamp(Math.round((window.innerHeight - 6) * dpr), 0, c.height - band);
      tg.clearRect(0, 0, 8, 2);
      tg.drawImage(c, 0, 0, c.width, band, 0, 0, 8, 1);
      tg.drawImage(c, 0, vb, c.width, band, 0, 1, 8, 1);
      const d = tg.getImageData(0, 0, 8, 2).data;
      const row = (r) => {
        const sum = [0, 0, 0];
        for (let x = 0; x < 8; x++) for (let k = 0; k < 3; k++) sum[k] += d[(r * 8 + x) * 4 + k];
        return sum.map((v) => Math.round(v / 8 / 2) * 2);
      };
      const tone = { top: row(0), bottom: row(1) };
      const key = `${tone.top}|${tone.bottom}`;
      if (key !== lastTone) {
        lastTone = key;
        toneRef.current(tone);
      }
    };
    let measureIn = 0;
    const probe = mk(24, 10);
    const pg = probe.getContext('2d', { willReadFrequently: true });
    let raf = 0;
    let last = 0;
    let acc = 0;
    let running = false;

    const buildStars = () => {
      const n = Math.round(clamp((W * H) / 1100, 40, 320));
      stars = Array.from({ length: n }, () => {
        const m = Math.pow(R(), 2.6); // most are faint
        const tint = R();
        return { x: R() * W, y: R() * H * 0.9, r: (0.35 + m * 1.2) * S, a: 0.25 + m * 0.75, f: 1 + R() * 4, ph: R() * TAU, col: tint < 0.15 ? [200, 215, 255] : tint > 0.9 ? [255, 228, 200] : [255, 255, 255] };
      });
    };
    // Which clouds this weather gets. They are computed a few per frame (and fade in) so opening the page never stalls.
    const layout = () => {
      clouds = [];
      decks = [];
      jobs = [];
      const k = wx.kind;
      const area = clamp(W / 900, 0.45, 1.6);
      const add = (type, n, wMin, wMax, aspect, yMin, yMax, speed, alpha) => {
        for (let i = 0; i < n; i++) {
          const w = (wMin + R() * (wMax - wMin)) * S;
          const cl = { type, w, h: w * aspect, x: R() * (W + w) - w, yF: yMin + R() * (yMax - yMin), v: speed * (0.8 + R() * 0.4), alpha, f: null, fade: still ? 1 : 0, side: 1 };
          clouds.push(cl);
          jobs.push(cl);
        }
      };
      const deck = (type, hF, yF, speed, alpha) => {
        const w = Math.round(Math.max(W * 1.25, 560 * S));
        const dk = { type, w, hF, yF, off: R() * w, v: speed, alpha, f: null, fade: still ? 1 : 0, side: 1 };
        decks.push(dk);
        jobs.unshift(dk); // decks first: they cover the most sky
      };
      if (k === 'clear') add('cirrus', R() < 0.6 ? 1 : 0, 240, 380, 0.24, 0.14, 0.34, drift * 0.22, 0.55);
      if (k === 'mostly') {
        add('cirrus', 1 + Math.round(R()), 240, 380, 0.24, 0.1, 0.36, drift * 0.22, 0.65);
        add('cumulus', Math.max(1, Math.round(2 * area)), 100, 170, 0.42, 0.45, 0.8, drift * 0.55, 1);
      }
      if (k === 'partly') {
        add('cirrus', 1, 260, 400, 0.24, 0.08, 0.26, drift * 0.22, 0.5);
        add('cumulus', Math.max(2, Math.round(3 * area)), 110, 180, 0.46, 0.2, 0.45, drift * 0.42, 0.95);
        add('cumulus', Math.max(2, Math.round(2.5 * area)), 200, 330, 0.5, 0.5, 0.86, drift * 0.72, 1);
      }
      if (k === 'cloudy') {
        deck('strat', 1.12, -0.06, drift * 0.12, 1);
        deck('cells', 1.12, -0.06, drift * 0.3, 0.95);
      }
      if (k === 'snow') {
        deck('strat', 1.12, -0.06, drift * 0.1, 1);
        deck('cells', 1.12, -0.06, drift * 0.22, 0.5);
      }
      if (k === 'rain' || k === 'storm') {
        deck('strat', 1.12, -0.06, drift * 0.14, 1);
        deck('cells', 1.12, -0.06, drift * 0.34, 0.6);
        // ragged scud racing underneath: more of it, and darker, the heavier the rain
        const c = Number(code);
        const heavy = k === 'storm' ? 1.3 : c === 65 || c === 67 || c === 82 ? 1.1 : c >= 51 && c <= 57 ? 0.45 : c === 61 || c === 80 ? 0.7 : 0.9;
        add('scud', Math.max(1, Math.round(3.2 * heavy * area)), 220, 420, 0.32, 0.4, 0.95, drift * 1.15, clamp(0.55 + 0.35 * heavy, 0.6, 1));
      }
      if (k === 'fog') {
        deck('strat', 1.12, -0.06, drift * 0.08, 0.9);
        deck('fog', 0.8, 0.02, drift * 0.12, 0.6);
        deck('fog', 0.75, 0.28, drift * 0.22, 0.75);
        deck('fog', 0.7, 0.5, drift * 0.34, 0.85);
        deck('fog', 0.6, 0.62, drift * 0.5, 0.95);
      }
      laidW = W;
    };
    // Clouds are computed a slice at a time within a small budget per frame, so building never stutters the page.
    const runJobs = (budgetMs) => {
      const deadline = budgetMs == null ? Infinity : performance.now() + budgetMs;
      while (jobs.length) {
        const it = jobs[0];
        if (!it.build) {
          const isDeck = !('x' in it);
          it.build = cloudBuilder(fbm, it.type, it.w, isDeck ? H * it.hF : it.h, Math.floor(R() * 1e9), isDeck ? it.w : 0, clamp(dpr * 0.75, 1, 1.4));
        }
        if (!it.build.step(deadline)) return;
        it.f = it.build.field();
        it.build = null;
        jobs.shift();
        if (L) paintCloud(it, L);
        if (performance.now() > deadline) return;
      }
    };
    const size = () => {
      const b = c.getBoundingClientRect();
      if (!b.width || !b.height) return false;
      if (Math.abs(b.width - W) < 0.5 && Math.abs(b.height - H) < 0.5) return false;
      dpr = Math.min(page ? 1.25 : 2, window.devicePixelRatio || 1);
      W = b.width;
      H = b.height;
      S = clamp(H / 220, 0.8, 1.2);
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      buildStars();
      milky = null;
      // Height changes (as the header's content loads) just rescale; a real width change lays the sky out again.
      if (!laidW || Math.abs(W - laidW) / laidW > 0.25) layout();
      return true;
    };

    // ---------------------------------------------------------------- one frame
    const frame = (dt, t) => {
      const now = new Date();
      const sun = sunState(now, riseISO, setISO);
      const alt = sun.alt;
      const phase = moonPhase(now);
      const moonLight = 1 - Math.abs(phase - 0.5) * 2; // 0 new → 1 full
      const mf = moonArc(sun, phase);
      const moonUp = mf == null ? 0 : moonLight * smooth(0, 0.15, Math.sin(Math.PI * mf));
      const key = `${Math.round(alt * 60)}|${sun.evening ? 1 : 0}|${Math.round(moonUp * 8)}`;
      if (key !== lightKey || !L) {
        lightKey = key;
        L = lighting(alt, sun.evening, wx, moonUp);
        for (const it of decks) if (it.f) paintCloud(it, L);
        for (const it of clouds) if (it.f) paintCloud(it, L);
      }
      if (jobs.length) runJobs(still ? null : 5);

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;

      // sky gradient, greyed and darkened for the weather
      const sc = skyColors(alt, sun.evening);
      const wxc = (col) => scale(grey(col, wx.grey), wx.dark);
      const top = wxc(sc.top);
      const mid = wxc(sc.mid);
      const bot = wxc(sc.bot);
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, rgba(top));
      grd.addColorStop(0.55, rgba(mid));
      grd.addColorStop(1, rgba(bot));
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // where the sun or moon sits: across the right half (the text is on the left), low at the ends of its arc
      const horizon = H * 1.04;
      const arcX = (f) => (W > 560 ? W * (0.56 + 0.39 * f) : W * (0.5 + 0.43 * f)); // clear of the text on wide screens
      const arcY = (h) => horizon - Math.max(0, h) * (horizon - H * 0.17);
      const sx = arcX(sun.dayFrac != null ? sun.dayFrac : sun.evening ? 1 : 0);
      const sy = sun.dayFrac != null ? arcY(alt) : horizon;

      // glow along the horizon when the sun is near it
      if (sc.glowA > 0.01) {
        const ga = sc.glowA * (1 - wx.grey * 0.8);
        const rg = g.createRadialGradient(sx, H * 1.05, 0, sx, H * 1.05, W * 0.75);
        rg.addColorStop(0, rgba(sc.glow, ga));
        rg.addColorStop(0.45, rgba(sc.glow, ga * 0.35));
        rg.addColorStop(1, rgba(sc.glow, 0));
        g.fillStyle = rg;
        g.fillRect(0, 0, W, H);
      }

      // stars: fade in through twilight, twinkle, hide behind weather; the moon washes out the faint ones
      const starVis = smooth(-0.04, -0.2, alt) * wx.stars;
      if (starVis > 0.01) {
        const dark = (1 - moonUp) * (1 - moonUp) * starVis * smooth(-0.22, -0.4, alt); // needs full darkness
        if (dark > 0.05) {
          if (!milky) milky = milkyWay(fbm, W, H);
          g.globalAlpha = dark * 0.8;
          g.drawImage(milky, 0, 0, W, H);
        }
        for (const s of stars) {
          const tw = still ? 1 : 0.72 + 0.28 * Math.sin(t * s.f + s.ph) * (0.6 + 0.4 * Math.sin(t * s.f * 0.37 + s.ph * 2));
          const a = s.a * tw * starVis * (s.a < 0.45 ? 1 - moonUp * 0.6 : 1);
          if (a < 0.02) continue;
          g.globalAlpha = a;
          g.fillStyle = rgba(s.col);
          g.beginPath();
          g.arc(s.x, s.y, s.r, 0, TAU);
          g.fill();
          if (s.r > 1.1 * S) {
            g.globalAlpha = a * 0.25; // a little glint on the bright ones
            g.fillRect(s.x - s.r * 3, s.y - 0.3, s.r * 6, 0.6);
            g.fillRect(s.x - 0.3, s.y - s.r * 3, 0.6, s.r * 6);
          }
        }
        g.globalAlpha = 1;
        // shooting star
        if (!still && wx.stars > 0.8 && alt < -0.15) {
          nextMeteor -= dt;
          if (!meteor && nextMeteor <= 0) {
            const dir = R() < 0.5 ? -1 : 1;
            meteor = { x: W * (0.3 + R() * 0.6), y: H * (0.05 + R() * 0.25), vx: dir * (500 + R() * 300) * S, vy: (220 + R() * 160) * S, life: 0, max: 0.55 + R() * 0.35 };
            nextMeteor = 14 + R() * 40;
          }
          if (meteor) {
            meteor.life += dt;
            meteor.x += meteor.vx * dt;
            meteor.y += meteor.vy * dt;
            const p = meteor.life / meteor.max;
            if (p >= 1) meteor = null;
            else {
              const a = Math.sin(Math.PI * p);
              const len = 0.12;
              const lg = g.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * len, meteor.y - meteor.vy * len);
              lg.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
              lg.addColorStop(1, 'rgba(255,255,255,0)');
              g.strokeStyle = lg;
              g.lineWidth = 1.3 * S;
              g.lineCap = 'round';
              g.beginPath();
              g.moveTo(meteor.x, meteor.y);
              g.lineTo(meteor.x - meteor.vx * len, meteor.y - meteor.vy * len);
              g.stroke();
            }
          }
        }
      }

      // the moon, in tonight's phase (pale and ghostly when it's up by day)
      if (mf != null && wx.moon > 0 && moonLight > 0.04) {
        const mh = Math.sin(Math.PI * mf);
        const mx = arcX(mf);
        const my = arcY(mh);
        const r = 10.5 * S;
        const daylight = smooth(-0.06, 0.12, alt);
        const vis = wx.moon * smooth(0, 0.06, mh) * (1 - daylight * 0.62);
        if (vis > 0.02) {
          const halo = g.createRadialGradient(mx, my, r * 0.8, mx, my, r * (5 + 3 * moonLight));
          halo.addColorStop(0, `rgba(236,232,210,${0.24 * vis * moonLight * (1 - daylight)})`);
          halo.addColorStop(1, 'rgba(236,232,210,0)');
          g.fillStyle = halo;
          g.fillRect(mx - r * 9, my - r * 9, r * 18, r * 18);
          if (wx.moon >= 1) {
            const waxing = phase < 0.5;
            const k = Math.cos(phase * TAU); // 1 new, -1 full
            g.save();
            // earthshine on the dark part at night
            g.globalAlpha = 0.16 * vis * (1 - daylight);
            g.fillStyle = '#9aa3b8';
            g.beginPath();
            g.arc(mx, my, r, 0, TAU);
            g.fill();
            // the lit part: a half disc plus or minus a half ellipse (the terminator)
            g.globalAlpha = vis;
            g.beginPath();
            g.arc(mx, my, r, -Math.PI / 2, Math.PI / 2, !waxing);
            g.ellipse(mx, my, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, waxing ? k > 0 : k < 0);
            g.closePath();
            const mg = g.createRadialGradient(mx - r * 0.3, my - r * 0.3, r * 0.1, mx, my, r);
            mg.addColorStop(0, daylight > 0.5 ? '#f4f7fb' : '#fbf8ec');
            mg.addColorStop(1, daylight > 0.5 ? '#d9e2ee' : '#ddd7c2');
            g.fillStyle = mg;
            g.fill();
            g.clip();
            // the maria, roughly where they are on the near side
            for (const [dx, dy, rr, al] of [[-0.46, 0.02, 0.36, 0.2], [-0.2, -0.36, 0.26, 0.22], [0.2, -0.34, 0.17, 0.24], [0.33, -0.04, 0.2, 0.22], [0.68, -0.26, 0.1, 0.24], [-0.12, 0.42, 0.17, 0.16], [0.52, 0.22, 0.13, 0.18]]) {
              const bx = mx + dx * r;
              const by = my + dy * r;
              const rg = g.createRadialGradient(bx, by, 0, bx, by, rr * r);
              rg.addColorStop(0, `rgba(128,124,110,${al})`);
              rg.addColorStop(1, 'rgba(128,124,110,0)');
              g.fillStyle = rg;
              g.fillRect(bx - rr * r, by - rr * r, rr * r * 2, rr * r * 2);
            }
            g.restore();
            g.globalAlpha = 1;
          }
        }
      }

      // the sun: a wide soft bloom and a bright disk (only a brighter patch through a deck)
      const low = 1 - smooth(0, 0.3, alt);
      const glowC = mix([255, 244, 214], [255, 170, 100], low);
      if (sun.dayFrac != null && wx.sun > 0 && alt > -0.04) {
        const R0 = (120 + 100 * low) * S;
        const bg = g.createRadialGradient(sx, sy, 0, sx, sy, R0);
        bg.addColorStop(0, rgba(glowC, 0.5 * wx.sun));
        bg.addColorStop(0.12, rgba(glowC, 0.26 * wx.sun));
        bg.addColorStop(0.4, rgba(glowC, 0.08 * wx.sun));
        bg.addColorStop(1, rgba(glowC, 0));
        g.fillStyle = bg;
        g.fillRect(sx - R0, sy - R0, R0 * 2, R0 * 2);
        if (wx.sun >= 1) {
          const rd = (10 + 4 * low) * S;
          const coreC = mix([255, 253, 240], [255, 200, 130], low);
          const dg = g.createRadialGradient(sx, sy, 0, sx, sy, rd);
          dg.addColorStop(0, '#ffffff');
          dg.addColorStop(0.75, rgba(coreC));
          dg.addColorStop(1, rgba(coreC, 0.85));
          g.fillStyle = dg;
          g.beginPath();
          g.arc(sx, sy, rd, 0, TAU);
          g.fill();
        }
      }

      // clouds: decks first (behind), then the moving clouds, far to near
      for (const dk of decks) {
        if (!dk.cv) continue;
        if (!still) {
          dk.off = (dk.off + dk.v * windPx() * dt) % dk.w;
          dk.fade = Math.min(1, dk.fade + dt / 0.9);
        }
        g.globalAlpha = dk.fade;
        const h = H * dk.hF;
        const y = H * dk.yF;
        const f = dk.f;
        for (let x = Math.round((dk.off - dk.w) * dpr) / dpr; x < W; x += dk.w) g.drawImage(dk.cv, f.pad, 0, f.tc, f.ch, x, y, dk.w, h);
      }
      for (const cl of clouds) {
        if (!cl.cv) continue;
        if (!still) {
          cl.x += cl.v * windPx() * dt;
          cl.fade = Math.min(1, cl.fade + dt / 0.9);
          if (cl.x > W + 10) {
            cl.x = -cl.w - R() * 80;
            cl.fade = 1;
          }
        }
        // Low sun lights a cloud from whichever side the sun is on.
        const side = sx > cl.x + cl.w / 2 ? 1 : -1;
        if (side !== cl.side) {
          cl.side = side;
          if (L.low > 0.05 && cl.f.lt) paintCloud(cl, L);
        }
        g.globalAlpha = cl.fade;
        g.drawImage(cl.cv, cl.x, cl.yF * H - cl.h / 2, cl.w, cl.h);
      }
      g.globalAlpha = 1;

      // under a storm or heavy rain by day, the far horizon shows paler beneath the dark base
      if ((wx.kind === 'storm' || wx.kind === 'rain') && alt > -0.05) {
        const hb = g.createLinearGradient(0, H * 0.55, 0, H);
        const ha = (wx.kind === 'storm' ? 0.22 : 0.12) * smooth(-0.05, 0.1, alt);
        const hc = mix([176, 184, 190], sc.glow, 0.25 * sc.glowA);
        hb.addColorStop(0, rgba(hc, 0));
        hb.addColorStop(1, rgba(hc, ha));
        g.fillStyle = hb;
        g.fillRect(0, H * 0.55, W, H * 0.45);
      }

      // glare: the sun's light spills over cloud edges in front of it; through fog or a thin deck it's a pale disk
      if (sun.dayFrac != null && wx.sun > 0 && alt > -0.02) {
        g.globalCompositeOperation = 'screen';
        if (wx.sun >= 1) {
          const r1 = (46 + 30 * low) * S;
          const gl = g.createRadialGradient(sx, sy, 0, sx, sy, r1);
          gl.addColorStop(0, rgba(glowC, 0.55));
          gl.addColorStop(0.3, rgba(glowC, 0.14));
          gl.addColorStop(1, rgba(glowC, 0));
          g.fillStyle = gl;
          g.fillRect(sx - r1, sy - r1, r1 * 2, r1 * 2);
        } else {
          const r1 = 12 * S;
          const halo = g.createRadialGradient(sx, sy, 0, sx, sy, r1 * 9);
          halo.addColorStop(0, rgba([255, 250, 235], 0.3 * wx.sun));
          halo.addColorStop(1, 'rgba(255,250,235,0)');
          g.fillStyle = halo;
          g.fillRect(sx - r1 * 9, sy - r1 * 9, r1 * 18, r1 * 18);
          if (wx.kind === 'fog' || wx.kind === 'snow') {
            const dg = g.createRadialGradient(sx, sy, r1 * 0.7, sx, sy, r1);
            dg.addColorStop(0, `rgba(255,252,242,${(0.5 * wx.sun * 2).toFixed(3)})`);
            dg.addColorStop(1, 'rgba(255,252,242,0)');
            g.fillStyle = dg;
            g.beginPath();
            g.arc(sx, sy, r1, 0, TAU);
            g.fill();
          }
        }
        g.globalCompositeOperation = 'source-over';
      }

      const fair = wx.kind === 'clear' || wx.kind === 'mostly' || wx.kind === 'partly';
      // a jet high up, drawing a contrail that spreads and fades
      if (!still && alt > 0.04 && fair) {
        nextJet -= dt;
        if (!jet && nextJet <= 0) {
          const dir = R() < 0.5 ? 1 : -1;
          const y = H * (0.08 + R() * 0.3);
          jet = { x: dir > 0 ? -20 : W + 20, y, vx: dir * (24 + R() * 14) * S, vy: (R() - 0.5) * 6 * S, trail: [], acc: 0, life: 28 + R() * 20 };
          nextJet = 80 + R() * 120;
        }
        if (jet) {
          jet.x += jet.vx * dt;
          jet.y += jet.vy * dt;
          jet.acc += dt;
          if (jet.acc > 0.25 && jet.x > -30 && jet.x < W + 30) {
            jet.acc = 0;
            jet.trail.push({ x: jet.x, y: jet.y, age: 0 });
          }
          const tc = mix([255, 255, 255], L.high, 0.35);
          g.lineCap = 'round';
          for (let i = jet.trail.length - 1; i >= 0; i--) {
            const p = jet.trail[i];
            p.age += dt;
            p.y += 0.6 * S * dt; // it sinks and spreads a little
            if (p.age > jet.life) {
              jet.trail.splice(0, i + 1);
              break;
            }
          }
          for (let i = 1; i < jet.trail.length; i++) {
            const p = jet.trail[i];
            const q = jet.trail[i - 1];
            const form = smooth(0.2, 1.2, p.age); // forms just behind the plane
            const a = 0.42 * form * (1 - p.age / jet.life);
            if (a < 0.01) continue;
            g.globalAlpha = a;
            g.strokeStyle = rgba(tc);
            g.lineWidth = (1 + p.age * 0.22) * S;
            g.beginPath();
            g.moveTo(q.x, q.y);
            g.lineTo(p.x, p.y);
            g.stroke();
          }
          if (jet.x > -30 && jet.x < W + 30) {
            g.globalAlpha = 0.8;
            g.fillStyle = '#f4f6fa';
            g.beginPath();
            g.arc(jet.x, jet.y, 1.1 * S, 0, TAU);
            g.fill();
          }
          g.globalAlpha = 1;
          if (!jet.trail.length && (jet.x < -40 || jet.x > W + 40)) jet = null;
        }
      }

      // fair-weather day: a flock of birds now and then
      if (!still && alt > 0.06 && (fair || wx.kind === 'cloudy')) {
        nextBirds -= dt;
        if (!birds && nextBirds <= 0) {
          const n = 3 + Math.floor(R() * 6);
          const dir = R() < 0.7 ? 1 : -1;
          birds = { x: dir > 0 ? -40 : W + 40, y: H * (0.2 + R() * 0.35), vx: dir * (26 + R() * 18) * S, list: Array.from({ length: n }, (_, i) => ({ dx: -dir * (i * 11 + R() * 6) * S, dy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 6 * S + R() * 3, ph: R() * TAU, s: (3.2 + R() * 1.6) * S })) };
          nextBirds = 40 + R() * 70;
        }
        if (birds) {
          birds.x += birds.vx * dt;
          birds.y += Math.sin(t * 0.7) * 2 * dt;
          g.strokeStyle = alt < 0.15 ? 'rgba(30,24,34,0.7)' : 'rgba(22,34,52,0.55)';
          g.lineWidth = 1.1 * S;
          g.lineCap = 'round';
          for (const b of birds.list) {
            const x = birds.x + b.dx;
            const y = birds.y + b.dy + Math.sin(t * 1.3 + b.ph) * 1.5;
            const f = Math.sin(t * 9 + b.ph); // wingbeat
            g.beginPath();
            g.moveTo(x - b.s, y - b.s * 0.35 * f);
            g.quadraticCurveTo(x - b.s * 0.45, y - b.s * 0.55 * f - b.s * 0.2, x, y);
            g.quadraticCurveTo(x + b.s * 0.45, y - b.s * 0.55 * f - b.s * 0.2, x + b.s, y - b.s * 0.35 * f);
            g.stroke();
          }
          if (birds.x < -W * 0.6 || birds.x > W * 1.6) birds = null;
        }
      }

      // night: a plane blinking its way across (nav light, red beacon, white strobes)
      if (!still && alt < -0.04 && wx.kind !== 'rain' && wx.kind !== 'storm' && wx.kind !== 'fog') {
        nextPlane -= dt;
        if (!plane && nextPlane <= 0) {
          const dir = R() < 0.5 ? 1 : -1;
          plane = { x: dir > 0 ? -10 : W + 10, y: H * (0.08 + R() * 0.3), vx: dir * (14 + R() * 10) * S, vy: (R() - 0.5) * 2 * S, t: 0 };
          nextPlane = 50 + R() * 90;
        }
        if (plane) {
          plane.t += dt;
          plane.x += plane.vx * dt;
          plane.y += plane.vy * dt;
          const dot = (x, y, r, col, a) => {
            g.globalAlpha = a;
            g.fillStyle = col;
            g.beginPath();
            g.arc(x, y, r, 0, TAU);
            g.fill();
          };
          dot(plane.x, plane.y, 0.9 * S, '#fff6e0', 0.55);
          const bt = plane.t % 1.1;
          if (bt < 0.12) dot(plane.x, plane.y + 1.5 * S, 1.6 * S, '#ff4b3e', 0.9);
          const st = plane.t % 1.4;
          if (st < 0.06 || (st > 0.16 && st < 0.22)) {
            dot(plane.x - 3 * S, plane.y, 1.5 * S, '#ffffff', 1);
            dot(plane.x + 3 * S, plane.y, 1.5 * S, '#ffffff', 1);
          }
          g.globalAlpha = 1;
          if (plane.x < -30 || plane.x > W + 30) plane = null;
        }
      }

      // Keep the text readable: now and then measure how bright the sky is behind it and shade it just enough.
      const wide = W > 560;
      measureIn -= dt;
      if (measureIn <= 0 || still) {
        measureIn = 1.5;
        try {
          pg.clearRect(0, 0, 24, 10);
          if (page) pg.drawImage(c, 0, 0, c.width, Math.min(c.height, Math.round(320 * dpr)), 0, 0, 24, 10);
          else pg.drawImage(c, 0, 0, c.width * (wide ? 0.66 : 1), c.height, 0, 0, 24, 10);
          const px = pg.getImageData(0, 0, 24, 10).data;
          const ls = [];
          for (let i = 0; i < px.length; i += 4) ls.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
          ls.sort((p, q) => p - q);
          const mean = ls.reduce((s, l) => s + l, 0) / ls.length;
          const bright = ls[Math.floor(ls.length * 0.85)];
          // aim to keep the sky behind the text around a mid-dark tone, whatever the weather
          const target = clamp(1 - 108 / Math.max(1, mean * 0.5 + bright * 0.5), 0.06, 0.52);
          shadeA = still || dt === 0 ? target : shadeA + (target - shadeA) * 0.35;
          if (page) readTone();
        } catch (e) {
          shadeA = 0.25;
        }
      }
      g.globalAlpha = 1;
      if (page) {
        // a band across the top, where page titles and the Home greeting sit on the sky
        const band = Math.min(H * 0.5, 360);
        const vg = g.createLinearGradient(0, 0, 0, band);
        vg.addColorStop(0, `rgba(3,12,30,${shadeA.toFixed(3)})`);
        vg.addColorStop(0.55, `rgba(3,12,30,${(shadeA * 0.62).toFixed(3)})`);
        vg.addColorStop(1, 'rgba(3,12,30,0)');
        g.fillStyle = vg;
        g.fillRect(0, 0, W, band);
      } else {
        const lg = g.createLinearGradient(0, 0, W * (wide ? 0.8 : 1), 0);
        lg.addColorStop(0, `rgba(3,12,30,${shadeA.toFixed(3)})`);
        lg.addColorStop(0.55, `rgba(3,12,30,${(shadeA * (wide ? 0.72 : 0.85)).toFixed(3)})`);
        lg.addColorStop(1, `rgba(3,12,30,${(wide ? 0 : shadeA * 0.7).toFixed(3)})`);
        g.fillStyle = lg;
        g.fillRect(0, 0, W, H);
      }
    };

    // Behind the whole page, hold still while scrolling so the glass above doesn't have to re-blur every frame.
    let scrollHold = 0;
    const onScroll = () => (scrollHold = performance.now() + 220);
    if (page) window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    const loop = (now) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 30;
      last = now;
      acc += dt;
      if (acc >= (page ? 1 / 21 : 1 / 31) && !(page && now < scrollHold)) {
        frame(Math.min(acc, 0.25), now / 1000); // ~30 fps is plenty for a sky (20 behind the page)
        acc = 0;
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
    frame(0, performance.now() / 1000);
    if (!still) start();
    const ro = new ResizeObserver(() => {
      if (size()) frame(0, performance.now() / 1000);
    });
    ro.observe(c);
    const io = !still && 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())) : null;
    if (io) io.observe(c);
    const minute = still ? setInterval(() => frame(0, 0), 60000) : null;
    return () => {
      stop();
      ro.disconnect();
      if (io) io.disconnect();
      if (minute) clearInterval(minute);
      if (page) window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [code, riseISO, setISO, page]);
  return <canvas ref={ref} className="sky-canvas" aria-hidden="true" />;
}

// The live sky behind the whole app in the glass theme (weather `s` from the forecast summary). The page's own
// background follows the sky's top color, since phones paint the status bar strip (and Safari its bars) with it.
export function skyTone({ top, bottom }) {
  const el = document.documentElement;
  const k = el.classList.contains('dark') ? 0.68 : 1; // the sky is dimmed in dark mode
  const css = (rgb) => `rgb(${rgb.map((v) => Math.round(v * k)).join(',')})`;
  el.style.setProperty('--sky-top', css(top));
  el.style.setProperty('--sky-bottom', css(bottom));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && el.classList.contains('theme-glass')) meta.setAttribute('content', css(top));
}
// Safari on iPhone colors its status bar strip and bottom bar from solid-colored fixed elements touching the top and
// bottom edges (it can't see a canvas), so two thin strips carry the sky's edge colors there.
export function PageSky({ wx }) {
  return (
    <>
      <div className="page-sky" aria-hidden="true">
        <SkyCanvas code={wx ? wx.code : 1} riseISO={wx && wx.sunriseISO} setISO={wx && wx.sunsetISO} wind={wx && wx.wind} page onTone={skyTone} />
      </div>
      <div className="sky-edge top" aria-hidden="true" />
      <div className="sky-edge bottom" aria-hidden="true" />
    </>
  );
}
