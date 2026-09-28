// Small shared pieces for the Budget tab: category marks, status pills, pacing bars, sheets, and inputs that save
// when you're done typing (so a Firestore write doesn't go out on every keystroke).
import React, { useEffect, useRef, useState } from 'react';
import { STATUS, fmt } from './budget-core.js';

// One hue per category; the tint and ink come from it so they sit in one palette (as in the budget app).
export const CATEGORY_HUE = {
  Groceries: 130,
  'Dining & Drinks': 24,
  Shopping: 300,
  Subscriptions: 210,
  'Gaming & Entertainment': 262,
  'Personal & Health': 340,
  Medical: 4,
  Health: 340,
  'Gas & Auto': 195,
  Travel: 172,
  'Misc Discretionary': 45,
};
const hueFor = (name) => {
  if (CATEGORY_HUE[name] !== undefined) return CATEGORY_HUE[name];
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};
export const categoryColor = (name, dark) => `hsl(${hueFor(name)} ${dark ? 55 : 45}% ${dark ? 62 : 46}%)`;
const ICON = {
  Groceries: 'M5 10h14l-1.6 8.6a1.6 1.6 0 0 1-1.6 1.4H8.2a1.6 1.6 0 0 1-1.6-1.4zM8.5 10 12 4.5l3.5 5.5M10 13.5v3.5M14 13.5v3.5',
  'Dining & Drinks': 'M7 3v7.5a2 2 0 0 0 2 2V21M5 3v5.5a2 2 0 0 0 4 0V3M16.5 21V3c2 1 3.2 3.4 3.2 6.2 0 2.6-1.3 4.1-3.2 4.3',
  Shopping: 'M5.5 8h13l-1 12.5h-11zM9 8V6.5a3 3 0 0 1 6 0V8',
  'Gaming & Entertainment': 'M7.5 7h9a4.5 4.5 0 0 1 4.4 5.4l-.9 4.4a2.2 2.2 0 0 1-3.9.9L14.5 15h-5l-1.6 2.7a2.2 2.2 0 0 1-3.9-.9l-.9-4.4A4.5 4.5 0 0 1 7.5 7zM8 9.8v3M6.5 11.3h3M15.5 10.5h.01M17.5 12.3h.01',
  Health: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  'Gas & Auto': 'M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11M4 17v-4.5A1.5 1.5 0 0 1 5.5 11h13a1.5 1.5 0 0 1 1.5 1.5V17zM6.5 17v2M17.5 17v2',
  Travel: 'M2.5 12.5 9 14l3.5 6.5h1.8l-1.3-6 5.6-1a1.8 1.8 0 0 0 0-3.4l-5.6-1 1.3-6h-1.8L9 10 2.5 11.5z',
  Subscriptions: 'M4.5 12a7.5 7.5 0 0 1 13-5M19.5 4v4h-4M19.5 12a7.5 7.5 0 0 1-13 5M4.5 20v-4h4',
};
ICON['Personal & Health'] = ICON.Health;
ICON.Medical = ICON.Health;
export function CategoryMark({ category, size = 26 }) {
  const d = ICON[category];
  return (
    <span className="cmark" style={{ '--h': hueFor(category), width: size, height: size }} aria-hidden="true" title={category}>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={d ? undefined : '3 3'}>
        {d ? <path d={d} /> : <circle cx="12" cy="12" r="8" />}
      </svg>
    </span>
  );
}

export function StatusPill({ st }) {
  const s = STATUS[st] || STATUS.none;
  return <span className={`spill t-${s.tone}`}>{s.label}</span>;
}
// A spending bar: how much of the budget is gone, and (this month) where an even pace would be today.
export function PaceBar({ spent, budget, p, st }) {
  const fill = budget > 0 ? Math.min(spent / budget, 1) : spent > 0 ? 1 : 0;
  const marker = p && p.state === 'current' && budget > 0;
  return (
    <div className="pbar" title={marker ? `Line: an even pace today (${fmt(budget * p.frac)})` : undefined}>
      <div className={`pbar-fill t-${(STATUS[st] || STATUS.none).tone}`} style={{ width: `${fill * 100}%` }} />
      {marker ? <div className="pbar-mark" style={{ left: `${p.frac * 100}%` }} /> : null}
    </div>
  );
}
export function Money({ v, cents = true, sign = false, className = '' }) {
  const n = Number(v) || 0;
  const s = cents ? fmt(Math.abs(n)) : fmt(Math.abs(n)).replace(/\.\d\d$/, '');
  return <span className={`num ${className}`}>{n < 0 ? '−' : sign && n > 0 ? '+' : ''}{s}</span>;
}

export function Sheet({ title, onClose, children, wide, className = '', label }) {
  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className={`sheet tall bsheet ${wide ? 'wide-sheet' : ''} ${className}`} role="dialog" aria-label={label || title} onClick={(e) => e.stopPropagation()}>
        <div className="row-between bsheet-head">
          <h2 className="card-title">{title}</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// A text or number input that saves on blur or Enter (and after a pause while typing).
export function Commit({ value, onCommit, type = 'text', className = 'input', delay = 900, ...rest }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  const focused = useRef(false);
  const timer = useRef(0);
  useEffect(() => {
    if (!focused.current) setV(value == null ? '' : String(value));
  }, [value]);
  const commit = (x) => {
    clearTimeout(timer.current);
    const out = type === 'number' ? (x === '' ? '' : Number(x)) : x;
    if (String(out) !== String(value == null ? '' : value)) onCommit(out);
  };
  return (
    <input
      {...rest}
      type={type}
      className={className}
      value={v}
      onFocus={() => (focused.current = true)}
      onChange={(e) => {
        setV(e.target.value);
        clearTimeout(timer.current);
        const x = e.target.value;
        timer.current = setTimeout(() => commit(x), delay);
      }}
      onBlur={() => {
        focused.current = false;
        commit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

export function Kpi({ label, value, sub, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-l">{label}</div>
      <div className={`kpi-v num ${tone ? `c-${tone}` : ''}`}>{value}</div>
      {sub ? <div className="kpi-s">{sub}</div> : null}
    </div>
  );
}

export const isPhoneLike = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
