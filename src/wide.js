// Wide screens: every tab's two-column layout (.grid and .bud-cols, each with two .col stacks) becomes a masonry of as
// many columns as fit — 3 on a 1920 screen, 4 on 2560, 6 on a 3440 ultrawide. Cards keep their priority: Home's
// slots follow their o1…o15 order, and other pages take the two stacks alternately (left top, right top, left second…),
// each card going into whichever column is shortest. Below 1800px wide nothing changes.
//
// How: the container becomes a CSS grid with 4px rows, each card spans as many rows as it is tall (measured with a
// ResizeObserver, so cards that grow or shrink re-flow), and `grid-auto-flow: dense` puts each one at the top of the
// shortest column. Cards are never moved in the DOM, so nothing remounts or loses what you were typing.
const WIDE = '(min-width: 1800px)';
const MIN_COL = 470; // narrowest column
const MAX_COLS = 6;
const GAP = 16; // matches .masonry's column-gap
const UNIT = 4; // matches .masonry's grid-auto-rows
const CONTAINERS = '.grid, .bud-cols';

const slotOrder = (el) => {
  const m = typeof el.className === 'string' && el.className.match(/(?:^|\s)o(\d+)(?:\s|$)/);
  return m ? Number(m[1]) : null;
};
const inFlow = (el) => {
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.position !== 'fixed' && cs.position !== 'absolute';
};

// The cards of a container, in the order they should fill the columns.
export function itemsOf(container) {
  const out = [];
  let run = [];
  const flush = () => {
    const longest = Math.max(0, ...run.map((r) => r.length));
    for (let i = 0; i < longest; i++) run.forEach((r) => r[i] && out.push(r[i]));
    run = [];
  };
  for (const ch of container.children) {
    if (ch.classList.contains('col')) run.push([...ch.children].filter(inFlow));
    else {
      flush();
      if (inFlow(ch)) out.push(ch);
    }
  }
  flush();
  if (out.some((el) => slotOrder(el) != null)) {
    const pos = new Map(out.map((el, i) => [el, i]));
    out.sort((a, b) => (slotOrder(a) ?? 1000 + pos.get(a)) - (slotOrder(b) ?? 1000 + pos.get(b)));
  }
  return out;
}
export const columnsFor = (width) => Math.max(1, Math.min(MAX_COLS, Math.floor((width + GAP) / (MIN_COL + GAP))));

export function startWideLayout(root) {
  if (!root || typeof ResizeObserver === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(WIDE);
  const managed = new Map(); // container → the cards it's laying out
  let raf = 0;
  const setSpan = (el, h) => {
    const span = Math.max(1, Math.ceil((h + GAP) / UNIT));
    if (el.__span !== span) {
      el.__span = span;
      el.style.setProperty('--span', String(span));
    }
  };
  const itemRO = new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.borderBoxSize && e.borderBoxSize[0];
      setSpan(e.target, box ? box.blockSize : e.target.getBoundingClientRect().height);
    }
  });
  const release = (el) => {
    itemRO.unobserve(el);
    el.style.removeProperty('--span');
    el.style.removeProperty('order');
    delete el.__span;
  };
  const unmanage = (c) => {
    const items = managed.get(c);
    if (!items) return;
    items.forEach(release);
    c.classList.remove('masonry');
    c.style.removeProperty('--cols');
    managed.delete(c);
  };
  const scan = () => {
    raf = 0;
    const found = mq.matches ? [...root.querySelectorAll(CONTAINERS)].filter((c) => !c.parentElement.closest(`${CONTAINERS}, .card, .sheet`)) : [];
    for (const c of [...managed.keys()]) if (!found.includes(c)) unmanage(c);
    for (const c of found) {
      const items = itemsOf(c);
      const n = Math.min(columnsFor(c.clientWidth), items.length);
      if (n < 2) {
        unmanage(c);
        continue;
      }
      const before = managed.get(c) || [];
      if (!managed.has(c)) c.classList.add('masonry');
      c.style.setProperty('--cols', String(n));
      const keep = new Set(items);
      before.forEach((el) => keep.has(el) || release(el));
      const had = new Set(before);
      items.forEach((el, i) => {
        if (el.style.order !== String(i)) el.style.order = String(i);
        if (!had.has(el)) itemRO.observe(el);
      });
      managed.set(c, items);
    }
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(scan);
  };
  const mo = new MutationObserver(schedule);
  mo.observe(root, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  mq.addEventListener ? mq.addEventListener('change', schedule) : mq.addListener(schedule);
  schedule();
  return () => {
    mo.disconnect();
    window.removeEventListener('resize', schedule);
    mq.removeEventListener ? mq.removeEventListener('change', schedule) : mq.removeListener(schedule);
    [...managed.keys()].forEach(unmanage);
    itemRO.disconnect();
    if (raf) cancelAnimationFrame(raf);
  };
}
