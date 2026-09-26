// Small shared chart pieces for the Health tab: a width hook, the tooltip, a line chart and a bar chart.
// Conventions: 2px lines, dots with a white ring, hairline gridlines, crosshair + tooltip on hover or tap.
import React, { useEffect, useRef, useState } from 'react';
import { dateLabel } from './budget-logic.js';

export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => setW(Math.max(200, Math.floor(es[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.lines.map((l, i) => (
        <div key={i} className={i === 0 ? 'tip-head' : 'tip-row'}>
          {l.key ? <span className={`tip-key ${l.key}`} /> : null}
          {l.value ? <b className="num">{l.value}</b> : null} {l.text}
        </div>
      ))}
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const pointLabel = (p) => (p.month ? monthLabel(p.t) : p.week ? `Week of ${dateLabel(p.t)}` : dateLabel(p.t));
const tOf = (t) => (t.length === 7 ? new Date(`${t}-15T12:00:00`).getTime() : new Date(`${t}T12:00:00`).getTime());

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const a = Math.floor(lo / step) * step;
  const b = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = a; v <= b + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo: a, hi: b, ticks };
}
const short = (v) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(v * 10) / 10));

// points: [{ t: 'YYYY-MM-DD' | 'YYYY-MM', v, lo?, hi? }]. from/to: domain ends (dates). gap: break the line after this many days.
export function LineChart({ points, from, to, fmt = (v) => String(v), label, color = 'green', height = 170, refLine, gap = 10, zero = false, dots, band, yLabel = short }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  if (!points.length) return <p className="empty">No readings in this range.</p>;
  const H = height;
  const pad = { l: 38, r: 44, t: 10, b: 22 };
  const t0 = tOf(from || points[0].t);
  const t1 = Math.max(tOf(to || points[points.length - 1].t), t0 + 86400000);
  const vals = points.flatMap((p) => (band && p.lo != null ? [p.v, p.lo, p.hi] : [p.v]));
  if (refLine != null) vals.push(refLine.v);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (zero) lo = Math.min(0, lo);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const nt = niceTicks(lo - (hi - lo) * 0.04, hi + (hi - lo) * 0.04);
  const W = width;
  const x = (t) => pad.l + ((tOf(t) - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - nt.lo) / (nt.hi - nt.lo)) * (H - pad.t - pad.b);
  const gapMs = gap * 86400000;
  let d = '';
  points.forEach((p, i) => {
    const brk = i === 0 || tOf(p.t) - tOf(points[i - 1].t) > gapMs;
    d += `${brk ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)} `;
  });
  let bandPath = '';
  if (band) {
    const bp = points.filter((p) => p.lo != null);
    if (bp.length > 1) bandPath = `M${bp.map((p) => `${x(p.t).toFixed(1)},${y(p.hi).toFixed(1)}`).join(' L')} L${[...bp].reverse().map((p) => `${x(p.t).toFixed(1)},${y(p.lo).toFixed(1)}`).join(' L')} Z`;
  }
  const showDots = dots != null ? dots : points.length <= 45;
  const lonely = points.filter((p, i) => {
    const a = i > 0 && tOf(p.t) - tOf(points[i - 1].t) <= gapMs;
    const b = i < points.length - 1 && tOf(points[i + 1].t) - tOf(p.t) <= gapMs;
    return !a && !b;
  });
  const last = points[points.length - 1];
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + pad.l;
    let best = points[0];
    for (const p of points) if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p;
    const lines = [{ text: pointLabel(best) }, { key: `k-line c-${color}`, value: fmt(best.v), text: label || '' }];
    if (band && best.lo != null) lines.push({ key: 'k-band', value: `${fmt(best.lo)}–${fmt(best.hi)}`, text: 'range' });
    setTip({ x: Math.min(W - 170, Math.max(0, x(best.t) + 10)), y: 2, at: best, lines });
  };
  // Over long spans, label the ends with month and year.
  const long = t1 - t0 > 200 * 86400000;
  const endText = (t) => (t.length === 7 || long ? monthLabel(t.slice(0, 7)) : dateLabel(t));
  const startLabel = endText(from || points[0].t);
  const endLabel = endText(to || last.t);
  return (
    <div className="chart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`${label || 'Chart'}: latest ${fmt(last.v)}`}>
        {nt.ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
            <text className="axis" x={pad.l - 6} y={y(v) + 4} textAnchor="end">
              {yLabel(v)}
            </text>
          </g>
        ))}
        {refLine ? (
          <g>
            <line className="target-line" x1={pad.l} x2={W - pad.r} y1={y(refLine.v)} y2={y(refLine.v)} />
            <text className="axis" x={W - pad.r} y={y(refLine.v) - 4} textAnchor="end">
              {refLine.label}
            </text>
          </g>
        ) : null}
        <text className="axis" x={pad.l} y={H - 5}>
          {startLabel}
        </text>
        <text className="axis" x={W - pad.r} y={H - 5} textAnchor="end">
          {endLabel}
        </text>
        {bandPath ? <path className={`band c-${color}`} d={bandPath} /> : null}
        {tip ? <line className="crosshair" x1={x(tip.at.t)} x2={x(tip.at.t)} y1={pad.t} y2={H - pad.b} /> : null}
        <path className={`sline c-${color}`} d={d} />
        {(showDots ? points : lonely).map((p) => (
          <circle key={p.t} className={`sdot c-${color}`} cx={x(p.t)} cy={y(p.v)} r="4" />
        ))}
        <text className="end-label num" x={x(last.t) + 7} y={y(last.v) + 4}>
          {fmt(last.v)}
        </text>
        <rect x={pad.l} y={0} width={Math.max(0, W - pad.l - pad.r)} height={H} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setTip(null)} />
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

// Bars in time slots. points: [{ t, v } | { t, parts: [{ v, cls, label }] }]. slots: the full list of slot keys, in order.
export function BarChart({ points, slots, fmt = (v) => String(v), label, goal, goalLabel, height = 150, color = 'green', tipExtra, xLabels, tickStep, yLabel = short }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const H = height;
  const pad = { l: 38, r: 8, t: 14, b: 22 };
  const byT = new Map(points.map((p) => [p.t, p]));
  const total = (p) => (p.parts ? p.parts.reduce((s, x) => s + (x.v || 0), 0) : p.v || 0);
  const max = Math.max(goal || 0, ...points.map(total), 1);
  let nt = niceTicks(0, max * 1.04, 3);
  if (tickStep) {
    const hi = Math.ceil((max * 1.04) / tickStep) * tickStep;
    const ticks = [];
    for (let v = 0; v <= hi; v += tickStep) ticks.push(v);
    nt = { lo: 0, hi, ticks };
  }
  const n = slots.length || 1;
  const slot = (width - pad.l - pad.r) / n;
  const bw = Math.max(1, Math.min(24, slot * 0.7));
  const y = (v) => pad.t + (1 - v / nt.hi) * (H - pad.t - pad.b);
  const base = H - pad.b;
  const r = Math.min(4, bw / 2);
  const bar = (x0, top, h) => {
    if (h <= 0) return '';
    const rr = Math.min(r, h);
    return `M${x0},${top + h} V${top + rr} Q${x0},${top} ${x0 + rr},${top} H${x0 + bw - rr} Q${x0 + bw},${top} ${x0 + bw},${top + rr} V${top + h} Z`;
  };
  const show = (i) => {
    const t = slots[i];
    const p = byT.get(t);
    const cx = pad.l + slot * i + slot / 2;
    const lines = [{ text: pointLabel(p || { t, month: t.length === 7 }) }];
    if (!p) lines.push({ text: 'no data' });
    else if (p.parts) p.parts.filter((x) => x.v).forEach((x) => lines.push({ key: `k-bar ${x.cls}`, value: fmt(x.v), text: x.label }));
    else lines.push({ key: `k-bar c-${color}`, value: fmt(p.v), text: label || '' });
    if (p && tipExtra) tipExtra(p).forEach((l) => lines.push(l));
    setTip({ x: Math.min(width - 170, Math.max(0, cx - 70)), y: 0, i, lines });
  };
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - box.left) / slot)));
    show(i);
  };
  const labels = xLabels || [slots[0], slots[slots.length - 1]];
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={label || 'Bar chart'}>
        {nt.ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} />
            <text className="axis" x={pad.l - 6} y={y(v) + 4} textAnchor="end">
              {yLabel(v)}
            </text>
          </g>
        ))}
        {tip ? <rect className="hover-col" x={pad.l + slot * tip.i} y={pad.t} width={slot} height={base - pad.t} /> : null}
        {slots.map((t, i) => {
          const p = byT.get(t);
          if (!p) return null;
          const x0 = pad.l + slot * i + (slot - bw) / 2;
          if (p.parts) {
            let acc = 0;
            return (
              <g key={t}>
                {p.parts.map((part, j) => {
                  if (!part.v) return null;
                  const top = y(acc + part.v);
                  const h = y(acc) - top;
                  acc += part.v;
                  const isTop = p.parts.slice(j + 1).every((q) => !q.v);
                  return isTop ? <path key={j} className={`cbar ${part.cls}`} d={bar(x0, top, h)} /> : <rect key={j} className={`cbar ${part.cls}`} x={x0} y={top} width={bw} height={Math.max(0, h)} />;
                })}
              </g>
            );
          }
          const top = y(p.v);
          return <path key={t} className={`cbar c-${p.cls || color}`} d={bar(x0, top, base - top)} />;
        })}
        {goal ? (
          <g>
            <line className="target-line" x1={pad.l} x2={width - pad.r} y1={y(goal)} y2={y(goal)} />
            <text className="axis" x={width - pad.r} y={y(goal) - 4} textAnchor="end">
              {goalLabel || `Goal ${short(goal)}`}
            </text>
          </g>
        ) : null}
        <line className="grid" x1={pad.l} x2={width - pad.r} y1={base} y2={base} />
        {labels.map((t, i) => {
          const idx = slots.indexOf(t);
          if (idx < 0) return null;
          const anchor = i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle';
          const xx = anchor === 'start' ? pad.l : anchor === 'end' ? width - pad.r : pad.l + slot * idx + slot / 2;
          return (
            <text key={t} className="axis" x={xx} y={H - 5} textAnchor={anchor}>
              {t.length === 7 ? monthLabel(t) : dateLabel(t)}
            </text>
          );
        })}
        <rect x={pad.l} y={0} width={Math.max(0, width - pad.l - pad.r)} height={H} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setTip(null)} />
      </svg>
      <Tip tip={tip} />
    </div>
  );
}
