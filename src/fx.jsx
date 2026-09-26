// Motion and feedback: numbers that count up, confetti for wins, swipeable rows, loading placeholders.
// Everything respects the system "reduce motion" setting: numbers appear instantly and there's no confetti.
import React, { useEffect, useRef, useState } from 'react';

export const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- count-up numbers
const ease = (t) => 1 - Math.pow(1 - t, 3);
export function CountUp({ value, format = (v) => Math.round(v).toLocaleString(), duration = 750, className }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(reducedMotion() ? target : 0);
  const frame = useRef(0);
  useEffect(() => {
    if (reducedMotion()) {
      setShown(target);
      from.current = target;
      return undefined;
    }
    const start = performance.now();
    const a = from.current;
    cancelAnimationFrame(frame.current);
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration);
      const v = a + (target - a) * ease(k);
      setShown(v);
      from.current = v;
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target]);
  return (
    <span className={className} aria-label={format(target)}>
      <span aria-hidden="true">{format(shown)}</span>
    </span>
  );
}

// ---------------------------------------------------------------- confetti
const COLORS = ['#145a3c', '#2f8a4b', '#7fd0a8', '#2c5b86', '#9cc3ea', '#b07a18', '#f0c46e', '#c2412d'];
// celebrate({ x, y }) bursts from a point (client coordinates); { big: true } rains from the top of the screen.
export function celebrate({ x, y, big = false, count } = {}) {
  if (typeof document === 'undefined' || reducedMotion()) return false;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  c.width = W * dpr;
  c.height = H * dpr;
  c.style.width = `${W}px`;
  c.style.height = `${H}px`;
  c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  const g = c.getContext('2d');
  if (!g) {
    c.remove();
    return false;
  }
  g.scale(dpr, dpr);
  const n = count || (big ? 140 : 36);
  const ox = x != null ? x : W / 2;
  const oy = y != null ? y : H / 3;
  const parts = Array.from({ length: n }, () => {
    const a = big ? Math.PI / 2 + (Math.random() - 0.5) * 0.9 : -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const v = big ? 2 + Math.random() * 3 : 4 + Math.random() * 6;
    return {
      x: big ? Math.random() * W : ox,
      y: big ? -20 - Math.random() * H * 0.3 : oy,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 5 + Math.random() * 5,
      h: 8 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });
  const t0 = performance.now();
  const life = big ? 2600 : 1400;
  const tick = (t) => {
    const k = (t - t0) / life;
    g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += big ? 0.05 : 0.22;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.color;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
      g.restore();
    }
    if (k < 1) requestAnimationFrame(tick);
    else c.remove();
  };
  requestAnimationFrame(tick);
  return true;
}
// Run fn once per key (e.g. "rings:2026-09-26"), remembered on this device.
export function cheerOnce(key, fn) {
  try {
    const seen = JSON.parse(localStorage.getItem('dash.cheer') || '{}');
    if (seen[key]) return false;
    seen[key] = Date.now();
    const keys = Object.keys(seen);
    if (keys.length > 200) keys.sort((a, b) => seen[a] - seen[b]).slice(0, keys.length - 200).forEach((k) => delete seen[k]);
    localStorage.setItem('dash.cheer', JSON.stringify(seen));
  } catch {
    /* no storage: still cheer */
  }
  fn();
  return true;
}
export const centerOf = (el) => {
  if (!el || !el.getBoundingClientRect) return {};
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
};

// ---------------------------------------------------------------- loading placeholder
export function Skeleton({ lines = 3, title = true, tall }) {
  return (
    <section className={`card skeleton ${tall ? 'tall' : ''}`} aria-busy="true" aria-label="Loading">
      {title ? <div className="sk sk-title" /> : null}
      {tall ? <div className="sk sk-block" /> : null}
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="sk sk-line" style={{ width: `${[92, 76, 84, 60, 70][i % 5]}%` }} />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- swipeable row
// Drag right past the threshold → onRight (e.g. done); left → onLeft (e.g. delete). Vertical scrolling still works.
export function SwipeRow({ onRight, onLeft, rightLabel = 'Done', leftLabel = 'Delete', className = '', children }) {
  const [dx, setDx] = useState(0);
  const st = useRef(null);
  const TH = 80;
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input, button, a, select, textarea')) return;
    st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: false };
  };
  const move = (e) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.drag) {
      if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) {
        st.current = null;
        return;
      }
      if (Math.abs(mx) > 10) {
        s.drag = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    }
    if (s.drag) setDx(Math.max(onLeft ? -140 : 0, Math.min(onRight ? 140 : 0, mx)));
  };
  const up = (e) => {
    const s = st.current;
    st.current = null;
    if (!s || !s.drag) return setDx(0);
    const v = dx;
    setDx(0);
    if (v >= TH && onRight) onRight(e);
    else if (v <= -TH && onLeft) onLeft(e);
  };
  return (
    <li className={`swipe ${className}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => ((st.current = null), setDx(0))}>
      <div className={`swipe-bg ${dx > 0 ? 'go-right' : dx < 0 ? 'go-left' : ''} ${Math.abs(dx) >= TH ? 'armed' : ''}`} aria-hidden="true">
        <span>{rightLabel}</span>
        <span>{leftLabel}</span>
      </div>
      <div className={`swipe-fg ${dx ? 'dragging' : ''}`} style={{ transform: dx ? `translateX(${dx}px)` : undefined }}>
        {children}
      </div>
    </li>
  );
}

// Horizontal swipe on an area (touch): calls onLeft / onRight. Ignores gestures that start on controls or charts.
export function useSwipe(onLeft, onRight) {
  const st = useRef(null);
  return {
    onTouchStart: (e) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || e.target.closest('input, select, textarea, button, a, .chart, .seg, .health-tabs, .sheet, .swipe, .wx-hours, .chips-row')) return (st.current = null);
      st.current = { x: t.clientX, y: t.clientY, at: Date.now() };
    },
    onTouchEnd: (e) => {
      const s = st.current;
      st.current = null;
      if (!s) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - s.at < 800) (dx < 0 ? onLeft : onRight)();
    },
  };
}
