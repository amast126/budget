// Small trend graphics for Home cards: a line with an optional reference line, and a row of mini columns.
// Single series each (no legend box: the card's label names it); hover or tap shows the value.
import React, { useState } from 'react';
import { useWidth } from './chart-kit.jsx';

// points: [{ t, v, label }]; ref: [{ t, v }] drawn as a thin reference line (e.g. budget pace).
export function Sparkline({ points, reference: refLine, domain, height = 46, tone = 'green', fmt = (v) => String(Math.round(v)), label, endLabel = true }) {
  const [box, width] = useWidth();
  const [hover, setHover] = useState(null);
  if (!points || points.length < 2) return null;
  const pad = { l: 2, r: endLabel ? 46 : 6, t: 6, b: 6 };
  const n = domain ? domain : points.length - 1;
  const vals = [...points.map((p) => p.v), ...((refLine || []).map((p) => p.v) || [])];
  const lo = Math.min(0, ...vals);
  const hi = Math.max(...vals, 1);
  const W = width;
  const x = (i) => pad.l + (i / Math.max(1, n)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (height - pad.t - pad.b);
  const path = (list) => list.map((p, i) => `${i ? 'L' : 'M'}${x(p.i != null ? p.i : i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const li = last.i != null ? last.i : points.length - 1;
  const onMove = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - b.left + pad.l;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.i != null ? p.i : i) - px) < Math.abs(x(points[best].i != null ? points[best].i : best) - px)) best = i;
    });
    setHover(best);
  };
  const hp = hover != null ? points[hover] : null;
  return (
    <div className="spark" ref={box}>
      <svg width={W} height={height} role="img" aria-label={`${label || 'Trend'}: ${fmt(last.v)}`}>
        {refLine && refLine.length > 1 ? <path className="spark-ref" d={path(refLine)} /> : null}
        <path className={`spark-line t-${tone}`} d={path(points)} pathLength="1" />
        {hp ? <circle className={`spark-dot t-${tone}`} cx={x(hp.i != null ? hp.i : hover)} cy={y(hp.v)} r="4" /> : <circle className={`spark-dot t-${tone}`} cx={x(li)} cy={y(last.v)} r="4" />}
        {endLabel ? (
          <text className="spark-end num" x={x(li) + 8} y={y(last.v) + 4}>
            {fmt(last.v)}
          </text>
        ) : null}
        <rect x={pad.l} y={0} width={Math.max(0, W - pad.l - pad.r)} height={height} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hp ? (
        <div className="spark-tip small" role="status">
          {hp.label}: <b className="num">{fmt(hp.v)}</b>
        </div>
      ) : null}
    </div>
  );
}

// values: [{ label, v, current }]; goal: reference line. Current column in the accent, the rest de-emphasized.
export function MiniBars({ values, goal, fmt = (v) => String(Math.round(v)), height = 40, label }) {
  const [hover, setHover] = useState(null);
  if (!values || !values.length) return null;
  const max = Math.max(goal || 0, ...values.map((d) => d.v), 1);
  const hv = hover != null ? values[hover] : null;
  return (
    <div className="minibars-wrap">
      <div className="minibars" style={{ height }} role="img" aria-label={`${label || 'Recent'}: ${values.map((d) => `${d.label} ${fmt(d.v)}`).join(', ')}`} onPointerLeave={() => setHover(null)}>
        {goal ? <div className="mb-goal" style={{ bottom: `${(goal / max) * 100}%` }} /> : null}
        {values.map((d, i) => (
          <div key={i} className="mb-slot" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
            <div className={`mb-bar ${d.current ? 'cur' : ''} ${goal && d.v >= goal ? 'hit' : ''}`} style={{ height: `${Math.max(d.v > 0 ? 3 : 0, (d.v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mb-caption small muted">{hv ? `${hv.label}: ${fmt(hv.v)}` : label}</div>
    </div>
  );
}
