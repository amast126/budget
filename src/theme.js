// Look of the app: "glass" (Liquid Glass over the live sky, light or dark with the system) or "classic" (the
// original paper-and-green). The glass has a transparency setting like iOS 27's, from Clear (0) to Tinted (1).
// Both are per device (saved in this browser), like the system setting they imitate.
import { useEffect, useState } from 'react';

const KEY = 'dash.theme';
const TINT = 'dash.glassTint';
export const DEFAULT_TINT = 0.5;

const get = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: still applies for this visit */
  }
};
let mem = {};
export const getTheme = () => ((mem.theme || get(KEY)) === 'classic' ? 'classic' : 'glass');
export function getTint() {
  if (mem.tint != null) return mem.tint;
  const raw = get(TINT);
  const v = raw == null ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_TINT;
}
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
export const systemDark = () => !!(mq && mq.matches);

// Put the classes and the tint on <html> (and on the budget frame, which follows along).
export function applyTheme() {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const glass = getTheme() === 'glass';
  const dark = glass && systemDark();
  el.classList.toggle('theme-glass', glass);
  el.classList.toggle('theme-classic', !glass);
  el.classList.toggle('dark', dark);
  el.style.setProperty('--tint', String(getTint()));
  el.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', glass ? (dark ? '#0c1422' : '#5b7fa8') : '#F5F6F2');
  document.querySelectorAll('iframe.frame').forEach((f) => {
    try {
      const d = f.contentDocument && f.contentDocument.documentElement;
      if (d) {
        d.classList.toggle('in-glass', glass);
        d.classList.toggle('in-dark', dark);
      }
    } catch {
      /* not loaded yet: it reads the parent when it starts */
    }
  });
}

export function useTheme() {
  const snap = () => ({ theme: getTheme(), tint: getTint(), dark: getTheme() === 'glass' && systemDark() });
  const [s, setS] = useState(snap);
  useEffect(() => {
    const on = () => {
      applyTheme();
      setS(snap());
    };
    if (mq && mq.addEventListener) mq.addEventListener('change', on);
    else if (mq && mq.addListener) mq.addListener(on);
    window.addEventListener('storage', on);
    return () => {
      if (mq && mq.removeEventListener) mq.removeEventListener('change', on);
      else if (mq && mq.removeListener) mq.removeListener(on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return {
    ...s,
    setTheme(t) {
      mem.theme = t;
      set(KEY, t);
      applyTheme();
      setS(snap());
    },
    setTint(v) {
      const x = Math.max(0, Math.min(1, Number(v)));
      mem.tint = x;
      set(TINT, String(x));
      applyTheme();
      setS(snap());
    },
  };
}

// On desktop, a soft highlight follows the pointer across glass cards (like light catching the glass).
export function trackGlassLight() {
  if (typeof window === 'undefined' || !window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return () => {};
  let raf = 0;
  let ev = null;
  let lastCard = null;
  const paint = () => {
    raf = 0;
    const e = ev;
    const card = e && e.target && e.target.closest ? e.target.closest('.card') : null;
    if (lastCard && lastCard !== card) {
      lastCard.style.removeProperty('--mx');
      lastCard.style.removeProperty('--my');
    }
    lastCard = card;
    if (!card || !document.documentElement.classList.contains('theme-glass')) return;
    const b = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${Math.round(e.clientX - b.left)}px`);
    card.style.setProperty('--my', `${Math.round(e.clientY - b.top)}px`);
  };
  const on = (e) => {
    ev = e;
    if (!raf) raf = requestAnimationFrame(paint);
  };
  window.addEventListener('pointermove', on, { passive: true });
  return () => window.removeEventListener('pointermove', on);
}
