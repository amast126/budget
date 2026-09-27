// Birthdays: a Home card with who's next, and a sheet to add, import (Contacts .vcf or a .csv) and export them
// to Calendar with reminders the day before.
import React, { useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import { celebrate } from './fx.jsx';
import { todayISO } from './budget-logic.js';
import * as B from './birthdays-logic.js';

const who = (x) => `${x.p.name}${x.turning ? ` turns ${x.turning}` : ''}`;

export function BirthdaysCard({ data, mutate, onManage }) {
  if (!data) return null;
  const list = B.upcoming(data, todayISO(), 60).slice(0, 4);
  return (
    <section className="card birthdays">
      <div className="card-head">
        <h2 className="card-title">Birthdays</h2>
        <button className="link-btn small" onClick={onManage}>
          {data.people.length ? 'All birthdays →' : 'Add'}
        </button>
      </div>
      {!data.people.length ? (
        <>
          <p className="empty">No birthdays yet. Import them from Contacts or add a few, and the next ones show here and in the header.</p>
          <button className="btn quiet block" onClick={onManage}>
            Add or import birthdays
          </button>
        </>
      ) : list.length ? (
        <ul className="list">
          {list.map((x) => (
            <li key={x.p.id} className={`bday ${x.days === 0 ? 'today' : ''}`}>
              <span className="bday-date" aria-hidden="true">
                <span>{B.MONTHS[x.p.m - 1].slice(0, 3)}</span>
                <b>{x.p.d}</b>
              </span>
              <div className="grow">
                <div className="bill-name">
                  {x.days === 0 ? '🎂 ' : ''}
                  {who(x)}
                </div>
                {x.p.note ? <div className="muted small">{x.p.note}</div> : null}
              </div>
              <span className={`days-pill ${x.days <= 7 ? 'soon' : ''}`}>{B.whenLabel(x.days)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Nobody in the next two months. Next up: {(() => {
          const n = B.upcoming(data)[0];
          return n ? `${n.p.name}, ${B.dateText(n.p)}` : '—';
        })()}.</p>
      )}
    </section>
  );
}

export function BirthdaySheet({ data, mutate, onClose, onToast }) {
  const [f, setF] = useState({ name: '', m: '', d: '', y: '', note: '' });
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const file = useRef(null);
  const today = todayISO();
  const all = data ? B.upcoming(data, today) : [];
  const shown = q.trim() ? all.filter((x) => x.p.name.toLowerCase().includes(q.trim().toLowerCase())) : all;
  const days = f.m ? new Date(2024, Number(f.m), 0).getDate() : 31;
  const ok = f.name.trim() && f.m && f.d;
  const add = (e) => {
    e.preventDefault();
    if (!ok) return;
    mutate((d) => B.addPerson(d, f), `Added ${f.name.trim()}`);
    setF({ name: '', m: f.m, d: '', y: '', note: '' });
  };
  const onFile = async (e) => {
    const fl = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!fl) return;
    const text = await fl.text();
    const list = /\.vcf$/i.test(fl.name) || /BEGIN:VCARD/i.test(text) ? B.parseVcf(text) : B.parseCsv(text);
    if (!list.length) {
      setMsg(/\.vcf$/i.test(fl.name) || /BEGIN:VCARD/i.test(text) ? 'No birthdays in that file. Only contacts with a birthday filled in come through.' : 'Couldn’t find names and birthdays in that file. It needs a header row with a Name column and a Birthday column.');
      return;
    }
    let res = null;
    await mutate((d) => (res = B.importPeople(d, list)));
    const r = res || { added: 0, updated: 0, same: 0 };
    setMsg(`Imported from ${fl.name}: ${r.added} added${r.updated ? `, ${r.updated} updated` : ''}${r.same ? `, ${r.same} already here` : ''}.`);
    if (r.added) celebrate({ big: r.added >= 10 });
  };
  const exportIcs = () => {
    const blob = new Blob([B.toIcs(data)], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'birthdays.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const remove = async (p) => {
    let removed = null;
    await mutate((d) => (removed = B.removePerson(d, p.id)));
    onToast &&
      onToast({
        text: `Removed ${p.name}`,
        undo: async () => {
          if (removed) await mutate((d) => B.restorePerson(d, removed.item, removed.index));
          onToast({ text: 'Restored' });
        },
      });
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet bday-sheet" role="dialog" aria-label="Birthdays" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <h2 className="card-title">Birthdays</h2>
          <button className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="bday-form" onSubmit={add}>
          <input className="input bf-name" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Name" />
          <select className="input" value={f.m} onChange={(e) => setF({ ...f, m: e.target.value })} aria-label="Month">
            <option value="">Month</option>
            {B.MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select className="input" value={f.d} onChange={(e) => setF({ ...f, d: e.target.value })} aria-label="Day">
            <option value="">Day</option>
            {Array.from({ length: days }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <input className="input num" inputMode="numeric" placeholder="Year (optional)" value={f.y} onChange={(e) => setF({ ...f, y: e.target.value.replace(/\D/g, '').slice(0, 4) })} aria-label="Birth year" />
          <input className="input bf-note" placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} aria-label="Note" />
          <button className="btn primary" type="submit" disabled={!ok}>
            Add
          </button>
        </form>
        <div className="bday-io">
          <button className="btn quiet small" onClick={() => file.current && file.current.click()}>
            Import .vcf or .csv
          </button>
          <input ref={file} type="file" accept=".vcf,.csv,text/vcard,text/x-vcard,text/csv" hidden onChange={onFile} aria-label="Import birthdays file" />
          {data && data.people.length ? (
            <button className="btn quiet small" onClick={exportIcs}>
              <Icon name="ext" size={14} /> Add to Calendar (.ics)
            </button>
          ) : null}
        </div>
        {msg ? <p className="ok-note small">{msg}</p> : null}
        <p className="muted small">
          From an iPhone: Contacts on a Mac (or icloud.com/contacts) → select all → Export vCard. Only contacts with a birthday come through. The calendar file adds each one yearly with a reminder the day before.
        </p>
        {all.length > 8 ? <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search birthdays" /> : null}
        {shown.length ? (
          <ul className="list bday-all">
            {shown.map((x) => (
              <li key={x.p.id} className="bday">
                <div className="grow">
                  <div className="bill-name">{x.p.name}</div>
                  <div className="muted small">
                    {B.dateText(x.p)}
                    {x.p.y ? `, ${x.p.y}` : ''} · {x.days === 0 ? 'today' : `in ${x.days} day${x.days === 1 ? '' : 's'}`}
                    {x.turning ? ` · turns ${x.turning}` : ''}
                    {x.p.note ? ` · ${x.p.note}` : ''}
                  </div>
                </div>
                <button className="x" aria-label={`Remove ${x.p.name}`} onClick={() => remove(x.p)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : data && data.people.length ? (
          <p className="empty small">No one matches.</p>
        ) : null}
        <button className="btn primary block" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
