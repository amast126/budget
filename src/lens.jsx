// Real refraction at the edges of the glass tab bar, the part of Liquid Glass that bends what's behind it like a lens.
// Browsers can only do this with an SVG displacement filter used as a backdrop filter, which Chrome and Edge
// support and Safari doesn't, so it's added only there; everywhere else the bar stays frosted glass.
import React, { useEffect, useRef, useState } from 'react';

export function lensSupported() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const chromium = !!(navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)));
  if (!chromium || /iPhone|iPad|iPod/.test(ua)) return false;
  try {
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return false;
  } catch {
    /* fine */
  }
  return true;
}

// A displacement map for a rounded rectangle: pixels near the rim are pushed along the inward normal, most at the
// very edge and fading to nothing a "bezel" in (like light through the curved edge of a thick pane).
export function lensMap(w, h, radius, bezel = 18) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const r = Math.min(radius, c.width / 2, c.height / 2);
  const d = img.data;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      // signed distance to the rounded rect (negative inside) and its gradient
      const px = x + 0.5 - c.width / 2;
      const py = y + 0.5 - c.height / 2;
      const qx = Math.abs(px) - (c.width / 2 - r);
      const qy = Math.abs(py) - (c.height / 2 - r);
      let dist;
      let nx;
      let ny;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        dist = l - r;
        nx = (qx / l) * Math.sign(px);
        ny = (qy / l) * Math.sign(py);
      } else if (qx > qy) {
        dist = qx - r;
        nx = Math.sign(px);
        ny = 0;
      } else {
        dist = qy - r;
        nx = 0;
        ny = Math.sign(py);
      }
      const inside = -dist; // 0 at the rim, growing inward
      const k = inside >= 0 && inside < bezel ? Math.pow(1 - inside / bezel, 2) : 0;
      const i = (y * c.width + x) * 4;
      // sample from further inside near the rim, so the backdrop looks magnified and bent toward the edge
      d[i] = 128 + Math.round(-nx * k * 127);
      d[i + 1] = 128 + Math.round(-ny * k * 127);
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

// Wraps nothing visible: it keeps an SVG filter sized to `selector`'s element and applies it as that element's
// backdrop filter (with a little blur and extra color, the rest of the look comes from the stylesheet).
export function Lens({ selector, id = 'lens', radius = 32, scale = 36, enabled = true }) {
  const [box, setBox] = useState(null);
  const [map, setMap] = useState('');
  const ok = useRef(enabled && lensSupported());
  useEffect(() => {
    if (!ok.current || !enabled) return undefined;
    const el = document.querySelector(selector);
    if (!el) return undefined;
    let t = 0;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const w = Math.round(b.width);
      const h = Math.round(b.height);
      const cr = parseFloat(getComputedStyle(el).borderTopLeftRadius);
      const r = Math.min(Number.isFinite(cr) && cr > 0 ? cr : radius, h / 2);
      setBox((x) => (x && x.w === w && x.h === h ? x : { w, h, r }));
    };
    measure();
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(measure, 120);
    });
    ro.observe(el);
    el.classList.add('has-lens');
    return () => {
      ro.disconnect();
      clearTimeout(t);
      el.classList.remove('has-lens');
      el.style.removeProperty('backdrop-filter');
    };
  }, [selector, enabled]);
  useEffect(() => {
    if (!box) return;
    setMap(lensMap(box.w, box.h, box.r));
  }, [box && box.w, box && box.h, box && box.r]);
  useEffect(() => {
    const el = document.querySelector(selector);
    if (!el || !map || !enabled) return;
    el.style.backdropFilter = `url(#${id}) blur(9px) saturate(185%) brightness(1.04)`;
  }, [map, selector, id, enabled]);
  if (!ok.current || !enabled || !box || !map) return null;
  return (
    <svg className="lens-defs" width="0" height="0" aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0 }}>
      <filter id={id} x="0" y="0" width={box.w} height={box.h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feImage href={map} x="0" y="0" width={box.w} height={box.h} result="map" preserveAspectRatio="none" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
