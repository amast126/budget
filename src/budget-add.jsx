// Adding an expense, the quick way: type a few letters and pick the merchant (its category, card and usual amount
// fill in), or tap one of the merchants you use most. Used by the Budget tab, Home's Quick add and #/add links
// (the Apple Pay shortcut).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { merchantIndex, suggestMerchants, recentMerchants, matchMerchant, cleanMerchant, parseAddLink } from './budget-insights.js';
import { todayISO, keyOf, fmt, newTxn, categoryUse } from './budget-core.js';
import { CategoryMark, Sheet } from './budget-ui.jsx';

export function useMerchants(data) {
  return useMemo(() => (data ? merchantIndex(data) : new Map()), [data]);
}

// A description field with merchant suggestions (arrow keys, Enter or tap to pick).
export function MerchantInput({ index, value, onChange, onPick, className = 'input', inputRef, placeholder = 'What was it?', label = 'Description', ...rest }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const list = useMemo(() => (open ? suggestMerchants(index, value, 6) : []), [index, value, open]);
  const exact = list.length === 1 && list[0].name.toLowerCase() === String(value).trim().toLowerCase();
  const show = open && list.length > 0 && !exact;
  const pick = (e) => {
    onPick(e);
    setOpen(false);
  };
  return (
    <div className="minput">
      <input
        {...rest}
        ref={inputRef}
        className={className}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={show}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(list.length - 1, h + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === 'Enter' && list[hi]) {
            e.preventDefault();
            pick(list[hi]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {show ? (
        <ul className="msuggest" role="listbox" aria-label="Merchants you've used">
          {list.map((e, i) => (
            <li key={e.key} role="option" aria-selected={i === hi}>
              <button type="button" className={i === hi ? 'on' : ''} onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(e)}>
                <CategoryMark category={e.category} size={22} />
                <span className="grow">
                  <b>{e.name}</b>
                  <span className="muted small">
                    {e.category} · usually {fmt(e.amount)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RecentChips({ index, onPick, n = 6 }) {
  const list = useMemo(() => recentMerchants(index, n), [index, n]);
  if (!list.length) return null;
  return (
    <div className="rchips" role="group" aria-label="Your usual merchants">
      {list.map((e) => (
        <button key={e.key} type="button" className="chip rchip" onClick={() => onPick(e)}>
          {e.name}
        </button>
      ))}
    </div>
  );
}

// The fields an expense needs; picking a merchant fills category, card and amount (amount selected, ready to type over).
export function AddForm({ data, onAdd, initial, submitLabel = 'Add expense', autoFocus = false, chips = true, dateDefault }) {
  const index = useMerchants(data);
  const cats = data.config.categories.map((c) => c.name);
  const methods = data.config.paymentMethods && data.config.paymentMethods.length ? data.config.paymentMethods : ['Apple Card'];
  const blank = () => ({ date: dateDefault || todayISO(), desc: '', amount: '', category: cats[0] || '', method: methods[0] || '', ...(initial || {}) });
  const [d, setD] = useState(blank);
  const [busy, setBusy] = useState(false);
  const amt = useRef(null);
  const desc = useRef(null);
  useEffect(() => {
    setD((x) => ({ ...x, category: cats.includes(x.category) ? x.category : cats[0] || '', method: methods.includes(x.method) ? x.method : methods[0] || '' }));
  }, [cats.join('|'), methods.join('|')]);
  const fill = (e) => {
    setD((x) => ({ ...x, desc: e.name, category: cats.includes(e.category) ? e.category : x.category, method: methods.includes(e.method) ? e.method : x.method, amount: x.amount === '' || x.fromPick ? String(e.amount || '') : x.amount, fromPick: true }));
    setTimeout(() => amt.current && (amt.current.focus(), amt.current.select()), 0);
  };
  const amount = Number(d.amount);
  const ok = String(d.desc).trim() && d.amount !== '' && Number.isFinite(amount) && amount !== 0 && d.date && d.category;
  const submit = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    const t = newTxn({ date: d.date, desc: d.desc, category: d.category, amount, method: d.method });
    const done = await onAdd(t);
    setBusy(false);
    if (done !== false) {
      setD((x) => ({ ...blank(), category: x.category, method: x.method, date: x.date }));
      desc.current && desc.current.focus();
    }
  };
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value, fromPick: k === 'amount' ? false : d.fromPick });
  return (
    <form className="addform" onSubmit={submit}>
      <label className="af-amt">
        <span className="sr">Amount</span>
        <span className="af-dollar">$</span>
        <input ref={amt} className="input num" inputMode="decimal" placeholder="0.00" value={d.amount} onChange={set('amount')} aria-label="Amount" />
      </label>
      <MerchantInput index={index} value={d.desc} inputRef={desc} className="input af-desc" autoFocus={autoFocus} onChange={(v) => setD({ ...d, desc: v })} onPick={fill} />
      <select className="input" value={d.category} onChange={set('category')} aria-label="Category">
        {cats.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <select className="input" value={d.method} onChange={set('method')} aria-label="Paid with">
        {methods.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <input className="input" type="date" value={d.date} onChange={set('date')} aria-label="Date" />
      <button className="btn primary" disabled={!ok || busy} type="submit">
        {busy ? 'Adding…' : submitLabel}
      </button>
      {chips ? (
        <div className="af-chips">
          <RecentChips index={index} onPick={fill} />
        </div>
      ) : null}
    </form>
  );
}

// The Month view's add box: an amount, what it was, and a category chip. The date (today), the card (the one you used
// last) and "money in" for a refund or a sale wait under More options; picking a merchant you've used fills in its
// category, card and usual amount.
export function QuickAdd({ data, onAdd, dateDefault, note }) {
  const index = useMerchants(data);
  const cfgCats = data.config.categories.map((c) => c.name);
  // categories you use most come first
  const cats = useMemo(() => {
    const use = categoryUse(data);
    return [...cfgCats].sort((a, b) => (use[b] || 0) - (use[a] || 0));
  }, [data.months, cfgCats.join('|')]);
  const methods = data.config.paymentMethods && data.config.paymentMethods.length ? data.config.paymentMethods : ['Apple Card'];
  const lastMethod = useMemo(() => {
    let best = null;
    Object.values(data.months || {}).forEach((m) => (m.transactions || []).forEach((t) => (!best || t.date > best.date ? (best = t) : null)));
    return best && methods.includes(best.method) ? best.method : methods[0] || '';
  }, [data.months, methods.join('|')]);
  const blank = (keep = {}) => ({ date: dateDefault || todayISO(), desc: '', amount: '', category: cats[0] || '', method: lastMethod, back: false, fromPick: false, ...keep });
  const [d, setD] = useState(() => blank());
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const amt = useRef(null);
  const desc = useRef(null);
  useEffect(() => {
    setD((x) => ({ ...x, category: cfgCats.includes(x.category) ? x.category : cats[0] || '', method: methods.includes(x.method) ? x.method : lastMethod }));
  }, [cfgCats.join('|'), methods.join('|')]);
  const fill = (e) => {
    setD((x) => ({ ...x, desc: e.name, category: cfgCats.includes(e.category) ? e.category : x.category, method: methods.includes(e.method) ? e.method : x.method, amount: x.amount === '' || x.fromPick ? String(e.amount || '') : x.amount, fromPick: true }));
    setTimeout(() => amt.current && (amt.current.focus(), amt.current.select()), 0);
  };
  const raw = Math.abs(Number(d.amount));
  const ok = String(d.desc).trim() && d.amount !== '' && Number.isFinite(raw) && raw !== 0 && d.date && d.category;
  const submit = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    const t = newTxn({ date: d.date, desc: d.desc, category: d.category, amount: d.back ? -raw : raw, method: d.method });
    const done = await onAdd(t);
    setBusy(false);
    if (done !== false) {
      setD((x) => blank({ category: x.category, method: x.method, date: x.date }));
      desc.current && desc.current.focus();
    }
  };
  return (
    <form className="qadd" onSubmit={submit}>
      <div className="qadd-row">
        <label className={`af-amt ${d.back ? 'back' : ''}`}>
          <span className="sr">Amount</span>
          <span className="af-dollar">{d.back ? '+$' : '$'}</span>
          <input ref={amt} className="input num" inputMode="decimal" placeholder="0.00" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value.replace(/^-/, ''), fromPick: false })} aria-label="Amount" />
        </label>
        <MerchantInput index={index} value={d.desc} inputRef={desc} className="input af-desc" onChange={(v) => setD({ ...d, desc: v })} onPick={fill} />
      </div>
      <div className="chips-row qadd-cats" role="group" aria-label="Category">
        {cats.map((c) => (
          <button key={c} type="button" className={`chip catchip ${d.category === c ? 'on' : ''}`} aria-pressed={d.category === c} onClick={() => setD({ ...d, category: c })}>
            {c}
          </button>
        ))}
      </div>
      <div className="qadd-go">
        <button className="btn primary" disabled={!ok || busy} type="submit">
          {busy ? 'Adding…' : d.back ? 'Add money in' : 'Add expense'}
        </button>
        <button type="button" className="btn quiet qadd-more" onClick={() => setMore(!more)} aria-expanded={more}>
          More options {more ? '▴' : '▾'}
        </button>
      </div>
      {!more && (note || d.method !== methods[0] || d.back) ? (
        <p className="muted small qadd-note">
          {[note, `Paid with ${d.method}`, d.back ? 'money in' : ''].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      {more ? (
        <div className="qadd-extra">
          <label>
            <span className="muted small">Date</span>
            <input className="input" type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} aria-label="Date" />
          </label>
          <label>
            <span className="muted small">Paid with</span>
            <select className="input" value={d.method} onChange={(e) => setD({ ...d, method: e.target.value })} aria-label="Paid with">
              {methods.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="check-row qadd-back">
            <input type="checkbox" checked={d.back} onChange={(e) => setD({ ...d, back: e.target.checked })} /> Money in (a refund or something you sold)
          </label>
          <div className="qadd-merchants">
            <span className="muted small">Your usual places</span>
            <RecentChips index={index} onPick={fill} />
          </div>
        </div>
      ) : null}
    </form>
  );
}

// "Log this purchase?" — opened by a link like #/add?amount=12.34&merchant=Corner%20Cafe (the Apple Pay shortcut).
export { parseAddLink };
export function AddSheet({ data, link, onAdd, onClose }) {
  const index = useMerchants(data);
  const initial = useMemo(() => {
    const known = link.merchant ? matchMerchant(index, link.merchant) : null;
    const out = { amount: link.amount === '' ? '' : Number(link.amount).toFixed(2), desc: known ? known.name : link.merchant ? cleanMerchant(link.merchant) : '' };
    if (link.date) out.date = link.date;
    if (known) {
      out.category = known.category;
      out.method = known.method;
    }
    return out;
  }, [link.merchant, link.amount, link.date, index.size]);
  return (
    <Sheet title="Log this purchase" onClose={onClose} className="add-sheet">
      <p className="muted small">{link.merchant ? `From Apple Pay: ${link.merchant}${link.amount !== '' ? `, ${fmt(link.amount)}` : ''}. Check the category and add it.` : 'Add an expense to this month’s budget.'}</p>
      <AddForm data={data} initial={initial} onAdd={async (t) => {
        const ok = await onAdd(t);
        if (ok !== false) onClose(keyOf(t.date));
        return ok;
      }} submitLabel="Add to budget" chips={!link.merchant} />
    </Sheet>
  );
}
