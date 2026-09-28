// A drawn plate for recipes without a photo: seen from above on a tablecloth, with the dish's main parts (the
// protein, the rice or noodles, the vegetables, a sauce, a garnish) picked from its title and ingredients and
// drawn in their colors. The same recipe always gets the same plate.
import React, { useId } from 'react';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashOf(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// keyword → [role, look, color, second color]
const PARTS = [
  [/meatball|falafel|dumpling|gyoza|potsticker/, 'protein', 'balls', '#8d4a33', '#b8664a'],
  [/salmon|trout|arctic char/, 'protein', 'fillet', '#f08a5d', '#f7b08e'],
  [/steak|sirloin|flank|ribeye|strip|beef tenderloin|filet/, 'protein', 'slices', '#8b3f2c', '#c8705c'],
  [/ground (beef|turkey|pork|chicken|lamb)|chorizo|crumbled/, 'protein', 'crumble', '#7a4431', '#9a5a3f'],
  [/chicken|turkey/, 'protein', 'slices', '#dca56b', '#efcb97'],
  [/pork|ham|bacon|prosciutto/, 'protein', 'slices', '#d99a78', '#eab89c'],
  [/shrimp|prawn/, 'protein', 'curls', '#f19a70', '#fbc5a6'],
  [/cod|tilapia|halibut|haddock|white fish|fish/, 'protein', 'fillet', '#efe3cf', '#fbf3e6'],
  [/sausage|kielbasa|andouille|bratwurst/, 'protein', 'coins', '#9f4d35', '#c4735a'],
  [/tofu|paneer|halloumi/, 'protein', 'cubes', '#efdcae', '#f8ecca'],
  [/\begg/, 'protein', 'egg', '#fdfaf2', '#f6b93b'],
  [/black bean|kidney bean|pinto|lentil/, 'protein', 'dots', '#4a3530', '#6a4b44'],
  [/chickpea|white bean|cannellini/, 'protein', 'dots', '#dcb46c', '#ebcd91'],
  [/pancake|waffle|french toast|crepe/, 'carb', 'stack', '#e2a24c', '#f3cf87'],
  [/rice|risotto/, 'carb', 'grain', '#ece0c4', '#dccba4'],
  [/quinoa|couscous|farro|bulgur|freekeh/, 'carb', 'grain', '#e6d3a4', '#cdb57d'],
  [/spaghetti|linguine|fettuccine|noodle|ramen|udon|lo mein|pasta|penne|rigatoni|orzo|gnocchi|cavatappi|tortellini|ravioli/, 'carb', 'noodles', '#efcf85', '#e2b964'],
  [/sweet potato|butternut|squash/, 'carb', 'cubes', '#e8893f', '#f2a764'],
  [/potato|fries|wedges/, 'carb', 'cubes', '#e8c275', '#f3d898'],
  [/tortilla|taco|burrito|quesadilla|flatbread|naan|pita|wrap/, 'carb', 'tortilla', '#e9c98f', '#d6ad69'],
  [/bread|toast|bun|brioche|ciabatta|baguette|sourdough/, 'carb', 'bread', '#d9a560', '#f1d6a4'],
  [/green bean|haricot|asparagus/, 'veg', 'sticks', '#5c9947', '#7cb65f'],
  [/broccoli|broccolini/, 'veg', 'florets', '#4f8a3c', '#6fa853'],
  [/cauliflower/, 'veg', 'florets', '#efe7d6', '#ddd2bb'],
  [/brussels/, 'veg', 'balls', '#6a9a45', '#8db767'],
  [/spinach|kale|arugula|lettuce|romaine|greens|chard|bok choy|salad|cabbage|slaw/, 'veg', 'leaves', '#5f9a4a', '#86b86a'],
  [/carrot/, 'veg', 'coins', '#ee8a2d', '#f6ab5c'],
  [/zucchini|cucumber/, 'veg', 'coins', '#a2c25e', '#d9e7a8'],
  [/bell pepper|red pepper|poblano/, 'veg', 'strips', '#df452f', '#f0a33b'],
  [/tomato/, 'veg', 'coins', '#dc4a36', '#ef7b62'],
  [/corn/, 'veg', 'dots', '#f3cc45', '#f8df86'],
  [/mushroom/, 'veg', 'cubes', '#a8896c', '#c7ab8f'],
  [/avocado|guacamole/, 'veg', 'fillet', '#a9c45b', '#d6e39a'],
  [/pea\b|peas|edamame|snap pea/, 'veg', 'dots', '#7eb24a', '#a2cc72'],
  [/onion/, 'veg', 'strips', '#e7d2dc', '#c98aa8'],
  [/sriracha|chili|gochujang|harissa|hot sauce|firecracker|buffalo/, 'sauce', 'drizzle', '#d8452f', null],
  [/sour cream|crema|yogurt|tzatziki|mayo|aioli|ranch/, 'sauce', 'drizzle', '#fbf7ee', null],
  [/teriyaki|soy|hoisin|bbq|barbecue|balsamic|glaze/, 'sauce', 'drizzle', '#6b3a22', null],
  [/pesto|chimichurri|salsa verde/, 'sauce', 'drizzle', '#5a8a3a', null],
  [/cheddar|parmesan|mozzarella|monterey|cheese|feta|cotija/, 'sauce', 'shreds', '#f3d27a', '#fbe7b0'],
  [/scallion|green onion|chive/, 'garnish', 'rings', '#6fae4f', null],
  [/cilantro|parsley|basil|dill|mint|thyme|herb/, 'garnish', 'herbs', '#4f9640', null],
  [/sesame/, 'garnish', 'seeds', '#f7efdc', null],
  [/lime|lemon/, 'garnish', 'wedge', '#b9d24a', '#e9f2b0'],
];
const CLOTHS = ['#f1e1cb', '#ead6c2', '#e2e5d1', '#f0dccf', '#e7dfcc', '#dfe3e2', '#efe4d2', '#e8d5cf'];
const BOWL = /\b(soup|stew|chili(?!-)|curry|ramen|pho|chowder|bisque|gumbo|dal|broth|pozole|tikka masala|congee|laksa)\b/;

export function partsFor(r) {
  const words = [r.title, r.subtitle, ...(r.ingredients || []).filter((i) => !i.h && !i.pantry).map((i) => i.item || '')].join(' | ').toLowerCase();
  const titleWords = `${r.title} ${r.subtitle || ''}`.toLowerCase();
  const picked = {};
  // title words first (they name the dish), then the ingredient list
  for (const src of [titleWords, words]) {
    for (const [re, role, look, c1, c2] of PARTS) {
      if (picked[role]) continue;
      if (re.test(src)) picked[role] = { look, c1, c2 };
    }
  }
  return { ...picked, bowl: BOWL.test(titleWords) };
}

// a lumpy closed blob around (cx, cy)
function blob(R, cx, cy, r, n = 9, wob = 0.14) {
  const pts = [];
  const a0 = R() * Math.PI;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    const rr = r * (1 - wob / 2 + R() * wob);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    if (i === 0) d += `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
}
// points scattered inside a circle
const scatter = (R, cx, cy, r, n) =>
  Array.from({ length: n }, () => {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * r;
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d, R()];
  });

function Piece({ R, part, cx, cy, r, k }) {
  const { look, c1, c2 } = part;
  const shade = 'rgba(60,30,10,0.18)';
  switch (look) {
    case 'grain':
      return (
        <g key={k}>
          <path d={blob(R, cx, cy, r, 10, 0.1)} fill="rgba(90,60,30,0.12)" transform="translate(1.5 2.5)" />
          <path d={blob(R, cx, cy, r, 10, 0.1)} fill={c1} />
          {scatter(R, cx, cy, r * 0.9, Math.round(r * 1.3)).map(([x, y, t], i) => (
            <ellipse key={i} cx={x} cy={y} rx="3.8" ry="1.8" fill={t > 0.6 ? c2 : '#fffdf6'} transform={`rotate(${t * 180} ${x} ${y})`} />
          ))}
        </g>
      );
    case 'noodles':
      return (
        <g key={k} fill="none" strokeLinecap="round">
          <path d={blob(R, cx, cy, r * 0.95, 9, 0.12)} fill={c2} opacity="0.55" />
          {Array.from({ length: 9 }, (_, i) => {
            const y = cy - r * 0.7 + (i / 8) * r * 1.4;
            const w = Math.sqrt(Math.max(0, r * r - (y - cy) ** 2)) * 0.95;
            const amp = 4 + R() * 5;
            return <path key={i} d={`M${cx - w},${y} q${w / 2},${-amp} ${w},0 t${w},0`} stroke={i % 3 ? c1 : c2} strokeWidth="5" />;
          })}
        </g>
      );
    case 'balls':
      return (
        <g key={k}>
          {[
            [0, 0],
            [-0.55, -0.35],
            [0.55, -0.3],
            [-0.45, 0.5],
            [0.5, 0.5],
          ].map(([dx, dy], i) => (
            <g key={i}>
              <circle cx={cx + dx * r + 2} cy={cy + dy * r + 3} r={r * 0.38} fill={shade} />
              <circle cx={cx + dx * r} cy={cy + dy * r} r={r * 0.38} fill={c1} />
              <circle cx={cx + dx * r - r * 0.12} cy={cy + dy * r - r * 0.12} r={r * 0.14} fill={c2} opacity="0.7" />
            </g>
          ))}
        </g>
      );
    case 'slices': {
      const a = -20 + R() * 40;
      return (
        <g key={k} transform={`rotate(${a} ${cx} ${cy})`}>
          {[-1, 0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={cx - r * 0.95 + i * r * 0.42} y={cy - r * 0.62 + 3} width={r * 0.5} height={r * 1.24} rx={r * 0.18} fill={shade} />
              <rect x={cx - r * 0.95 + i * r * 0.42} y={cy - r * 0.62} width={r * 0.5} height={r * 1.24} rx={r * 0.18} fill={c1} />
              <rect x={cx - r * 0.95 + i * r * 0.42 + r * 0.1} y={cy - r * 0.45} width={r * 0.3} height={r * 0.9} rx={r * 0.12} fill={c2} opacity="0.75" />
            </g>
          ))}
        </g>
      );
    }
    case 'fillet': {
      const a = -25 + R() * 50;
      return (
        <g key={k} transform={`rotate(${a} ${cx} ${cy})`}>
          <rect x={cx - r} y={cy - r * 0.55 + 4} width={r * 2} height={r * 1.1} rx={r * 0.5} fill={shade} />
          <rect x={cx - r} y={cy - r * 0.55} width={r * 2} height={r * 1.1} rx={r * 0.5} fill={c1} />
          {[-0.5, -0.1, 0.3].map((t, i) => (
            <path key={i} d={`M${cx + t * r},${cy - r * 0.45} q${r * 0.25},${r * 0.45} 0,${r * 0.9}`} stroke={c2} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          ))}
        </g>
      );
    }
    case 'crumble':
      return (
        <g key={k}>
          <path d={blob(R, cx, cy, r * 0.95, 9, 0.2)} fill={c2} opacity="0.5" />
          {scatter(R, cx, cy, r * 0.85, 26).map(([x, y, t], i) => (
            <path key={i} d={blob(R, x, y, 5 + t * 5, 6, 0.5)} fill={t > 0.45 ? c1 : c2} />
          ))}
        </g>
      );
    case 'curls':
      return (
        <g key={k} fill="none" strokeLinecap="round">
          {scatter(R, cx, cy, r * 0.6, 5).map(([x, y, t], i) => (
            <g key={i} transform={`rotate(${t * 360} ${x} ${y})`}>
              <path d={`M${x - 11},${y} a11,11 0 1,1 11,11`} stroke={shade} strokeWidth="10" transform="translate(1.5 2.5)" />
              <path d={`M${x - 11},${y} a11,11 0 1,1 11,11`} stroke={c1} strokeWidth="10" />
              <path d={`M${x - 11},${y} a11,11 0 1,1 11,11`} stroke={c2} strokeWidth="3" />
            </g>
          ))}
        </g>
      );
    case 'coins':
      return (
        <g key={k}>
          {scatter(R, cx, cy, r * 0.7, 7).map(([x, y, t], i) => (
            <g key={i}>
              <circle cx={x + 1.5} cy={y + 2} r={r * 0.3} fill={shade} />
              <circle cx={x} cy={y} r={r * 0.3} fill={c1} />
              <circle cx={x} cy={y} r={r * 0.18} fill={c2} opacity="0.7" />
            </g>
          ))}
        </g>
      );
    case 'cubes':
      return (
        <g key={k}>
          {scatter(R, cx, cy, r * 0.72, 9).map(([x, y, t], i) => (
            <g key={i} transform={`rotate(${t * 90} ${x} ${y})`}>
              <rect x={x - 9 + 1.5} y={y - 9 + 2.5} width="18" height="18" rx="5" fill={shade} />
              <rect x={x - 9} y={y - 9} width="18" height="18" rx="5" fill={c1} />
              <rect x={x - 5} y={y - 6} width="8" height="6" rx="3" fill={c2} opacity="0.8" />
            </g>
          ))}
        </g>
      );
    case 'dots':
      return (
        <g key={k}>
          <path d={blob(R, cx, cy, r * 0.9, 9, 0.16)} fill={c2} opacity="0.45" />
          {scatter(R, cx, cy, r * 0.8, 30).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4.6" fill={i % 4 ? c1 : c2} />
          ))}
        </g>
      );
    case 'sticks':
      return (
        <g key={k} strokeLinecap="round">
          {Array.from({ length: 9 }, (_, i) => {
            const a = -30 + R() * 22;
            const x = cx - r * 0.7 + (i / 8) * r * 1.4;
            const len = r * (0.9 + R() * 0.5);
            return (
              <g key={i} transform={`rotate(${a} ${x} ${cy})`}>
                <line x1={x + 1.5} y1={cy - len / 2 + 2} x2={x + 1.5} y2={cy + len / 2 + 2} stroke={shade} strokeWidth="8" />
                <line x1={x} y1={cy - len / 2} x2={x} y2={cy + len / 2} stroke={i % 2 ? c1 : c2} strokeWidth="8" />
              </g>
            );
          })}
        </g>
      );
    case 'florets':
      return (
        <g key={k}>
          {scatter(R, cx, cy, r * 0.62, 6).map(([x, y], i) => (
            <g key={i}>
              <circle cx={x + 2} cy={y + 3} r="13" fill={shade} />
              {[
                [0, 0],
                [-7, -5],
                [7, -5],
                [-6, 6],
                [6, 6],
              ].map(([dx, dy], j) => (
                <circle key={j} cx={x + dx} cy={y + dy} r="8" fill={j % 2 ? c1 : c2} />
              ))}
            </g>
          ))}
        </g>
      );
    case 'leaves':
      return (
        <g key={k}>
          {scatter(R, cx, cy, r * 0.7, 11).map(([x, y, t], i) => (
            <g key={i} transform={`rotate(${t * 360} ${x} ${y})`}>
              <ellipse cx={x} cy={y} rx="17" ry="9" fill={i % 3 ? c1 : c2} />
              <line x1={x - 13} y1={y} x2={x + 13} y2={y} stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
            </g>
          ))}
        </g>
      );
    case 'strips':
      return (
        <g key={k} fill="none" strokeLinecap="round">
          {scatter(R, cx, cy, r * 0.62, 8).map(([x, y, t], i) => (
            <path key={i} d={`M${x - 14},${y + 4} q14,${-14 + t * 6} 28,0`} stroke={i % 3 ? c1 : c2} strokeWidth="6.5" transform={`rotate(${t * 180} ${x} ${y})`} />
          ))}
        </g>
      );
    case 'tortilla':
      return (
        <g key={k}>
          <path d={`M${cx - r},${cy + 6} a${r},${r * 0.8} 0 0,1 ${r * 2},0 z`} fill={shade} transform="translate(2 4)" />
          <path d={`M${cx - r},${cy} a${r},${r * 0.8} 0 0,1 ${r * 2},0 z`} fill={c1} />
          {scatter(R, cx, cy - r * 0.35, r * 0.4, 7).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3" fill={c2} opacity="0.8" />
          ))}
        </g>
      );
    case 'bread':
      return (
        <g key={k}>
          <rect x={cx - r * 0.8 + 2} y={cy - r * 0.7 + 4} width={r * 1.6} height={r * 1.4} rx={r * 0.35} fill={shade} />
          <rect x={cx - r * 0.8} y={cy - r * 0.7} width={r * 1.6} height={r * 1.4} rx={r * 0.35} fill={c1} />
          <rect x={cx - r * 0.62} y={cy - r * 0.52} width={r * 1.24} height={r * 1.04} rx={r * 0.26} fill={c2} />
        </g>
      );
    case 'stack':
      return (
        <g key={k}>
          {[2, 1, 0].map((n) => (
            <g key={n}>
              <ellipse cx={cx - n * 7 + 2} cy={cy - n * 6 + 4} rx={r * 0.78} ry={r * 0.74} fill={shade} />
              <ellipse cx={cx - n * 7} cy={cy - n * 6} rx={r * 0.78} ry={r * 0.74} fill={c1} />
              <ellipse cx={cx - n * 7} cy={cy - n * 6} rx={r * 0.6} ry={r * 0.56} fill={c2} />
            </g>
          ))}
          <path d={`M${cx - 30},${cy - 16} q10,-8 22,0 t22,0`} stroke="#b0641f" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
          <rect x={cx - 16} y={cy - 22} width="14" height="10" rx="2" fill="#fbe6a2" />
        </g>
      );
    case 'egg':
      return (
        <g key={k}>
          <path d={blob(R, cx, cy, r * 0.8, 8, 0.22)} fill={shade} transform="translate(2 3)" />
          <path d={blob(R, cx, cy, r * 0.8, 8, 0.22)} fill={c1} />
          <circle cx={cx + 3} cy={cy - 2} r={r * 0.32} fill={c2} />
        </g>
      );
    default:
      return <path key={k} d={blob(R, cx, cy, r)} fill={c1} />;
  }
}

function Topping({ R, part, k }) {
  const { look, c1, c2 } = part;
  if (look === 'drizzle') {
    // a zigzag drizzle over the middle of the plate
    const x0 = 150 + R() * 20;
    const y0 = 128 + R() * 20;
    let d = `M${x0},${y0}`;
    for (let i = 0; i < 7; i++) d += ` l${12},${i % 2 ? -22 : 22}`;
    return <path key={k} d={d} stroke={c1} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" transform={`rotate(${-18 + R() * 36} 200 140)`} />;
  }
  if (look === 'shreds')
    return (
      <g key={k}>
        {scatter(R, 200, 150, 60, 22).map(([x, y, t], i) => (
          <rect key={i} x={x} y={y} width="11" height="3" rx="1.5" fill={i % 2 ? c1 : c2} transform={`rotate(${t * 180} ${x} ${y})`} />
        ))}
      </g>
    );
  if (look === 'rings')
    return (
      <g key={k} fill="none">
        {scatter(R, 200, 150, 64, 14).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.6" stroke={c1} strokeWidth="2.2" />
        ))}
      </g>
    );
  if (look === 'herbs')
    return (
      <g key={k}>
        {scatter(R, 200, 150, 66, 16).map(([x, y, t], i) => (
          <ellipse key={i} cx={x} cy={y} rx="4.8" ry="2.6" fill={i % 3 ? c1 : '#6db255'} transform={`rotate(${t * 180} ${x} ${y})`} />
        ))}
      </g>
    );
  if (look === 'seeds')
    return (
      <g key={k}>
        {scatter(R, 200, 150, 60, 26).map(([x, y, t], i) => (
          <ellipse key={i} cx={x} cy={y} rx="2.3" ry="1.3" fill={i % 5 ? c1 : '#3a2f2a'} transform={`rotate(${t * 180} ${x} ${y})`} />
        ))}
      </g>
    );
  if (look === 'wedge')
    return (
      <g key={k} transform="rotate(-24 268 206)">
        <path d="M244,206 a24,24 0 0,0 48,0 z" fill="rgba(60,30,10,0.18)" transform="translate(2 3)" />
        <path d="M244,206 a24,24 0 0,0 48,0 z" fill={c1} />
        <path d="M249,207 a19,19 0 0,0 38,0 z" fill={c2} />
      </g>
    );
  return null;
}

// Where the parts sit on the plate: a few arrangements, picked per recipe.
const LAYOUTS = [
  { carb: [164, 154, 60], protein: [238, 124, 48], veg: [234, 200, 42] },
  { carb: [236, 152, 60], protein: [164, 128, 50], veg: [168, 204, 42] },
  { carb: [196, 172, 66], protein: [196, 118, 46], veg: [262, 168, 36] },
];

export function PlateArt({ r, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const seed = hashOf(`${r.id}|${r.title}`);
  const R = rng(seed);
  const p = partsFor(r);
  const cloth = CLOTHS[seed % CLOTHS.length];
  const L = LAYOUTS[(seed >>> 4) % LAYOUTS.length];
  // nothing recognized: rice, a protein and greens in the dish's own colors
  const protein = p.protein || { look: 'cubes', c1: '#c98a5a', c2: '#e4b489' };
  const carb = p.carb || (p.bowl ? null : { look: 'grain', c1: '#f4eedf', c2: '#e3d8bf' });
  const veg = p.veg || { look: 'leaves', c1: '#5f9a4a', c2: '#86b86a' };
  const broth = p.sauce && p.sauce.look === 'drizzle' && p.sauce.c1 !== '#fbf7ee' ? p.sauce.c1 : '#d98b3f';
  return (
    <svg className={`plate-art ${className}`} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Drawing of ${r.title}`}>
      <defs>
        <radialGradient id={`sh${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.78" stopColor="rgba(70,40,20,0.22)" />
          <stop offset="1" stopColor="rgba(70,40,20,0)" />
        </radialGradient>
        <pattern id={`ln${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0,0.5H6M0.5,0V6" stroke="rgba(120,80,40,0.07)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="400" height="300" fill={cloth} />
      <rect width="400" height="300" fill={`url(#ln${uid})`} />
      <circle cx="204" cy="158" r="146" fill={`url(#sh${uid})`} />
      {p.bowl ? (
        <>
          <circle cx="200" cy="150" r="118" fill="#fbf8f2" />
          <circle cx="200" cy="150" r="118" fill="none" stroke="rgba(110,80,50,0.14)" strokeWidth="1.5" />
          <circle cx="200" cy="150" r="96" fill={broth} opacity="0.88" />
          <circle cx="200" cy="150" r="96" fill="none" stroke="rgba(60,30,10,0.12)" strokeWidth="6" />
          <Piece R={R} part={protein} cx={176} cy={132} r={34} k="p" />
          {carb ? <Piece R={R} part={carb} cx={226} cy={170} r={32} k="c" /> : null}
          <Piece R={R} part={veg} cx={220} cy={118} r={28} k="v" />
        </>
      ) : (
        <>
          <circle cx="200" cy="150" r="128" fill="#fcfaf5" />
          <circle cx="200" cy="150" r="128" fill="none" stroke="rgba(110,80,50,0.13)" strokeWidth="1.5" />
          <circle cx="200" cy="150" r="100" fill="#f7f3eb" stroke="rgba(110,80,50,0.07)" strokeWidth="1.2" />
          {carb ? <Piece R={R} part={carb} cx={L.carb[0]} cy={L.carb[1]} r={L.carb[2]} k="c" /> : null}
          <Piece R={R} part={veg} cx={L.veg[0]} cy={L.veg[1]} r={L.veg[2]} k="v" />
          <Piece R={R} part={protein} cx={L.protein[0]} cy={L.protein[1]} r={L.protein[2]} k="p" />
        </>
      )}
      {p.sauce && !p.bowl ? <Topping R={R} part={p.sauce} k="s" /> : null}
      {p.garnish ? <Topping R={R} part={p.garnish} k="g" /> : null}
    </svg>
  );
}
