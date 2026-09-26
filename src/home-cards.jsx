import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './ui.jsx';
import { SwipeRow, celebrate, centerOf } from './fx.jsx';
import { DEFAULT_PLACE, forecastUrl, geocodeUrl, placesFrom, summarize, addTodo, toggleTodo, clearDone } from './home-logic.js';

const CACHE = 'dash.weather';
const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE)) || null;
  } catch {
    return null;
  }
};
const writeCache = (v) => {
  try {
    localStorage.setItem(CACHE, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};
const placeKey = (p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
const placeLabel = (p) => `${p.name}${p.zip ? ` ${p.zip}` : ''}`;

// ---------------------------------------------------------------- weather
function PlaceSearch({ onPick, onCancel }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [err, setErr] = useState('');
  const search = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch(geocodeUrl(q));
      const list = placesFrom(await r.json(), q);
      setResults(list);
      if (!list.length) setErr('No places found. Try a town name or a 5-digit ZIP.');
    } catch {
      setErr('Couldn’t search right now. Check your connection and try again.');
    }
    setBusy(false);
  };
  return (
    <div className="wx-search">
      <form className="add-row" onSubmit={search}>
        <input className="input" placeholder="Town or ZIP code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Weather location" autoFocus />
        <button className="btn" type="submit" disabled={busy || !q.trim()}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      {err ? <p className="muted small">{err}</p> : null}
      {results && results.length ? (
        <ul className="list wx-results">
          {results.map((p, i) => (
            <li key={i}>
              <button className="rc" onClick={() => onPick(p)}>
                <span className="grow">
                  <span className="rc-title">{placeLabel(p)}</span>
                  <span className="muted small">{p.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="plan-actions">
        <button className="btn quiet small" onClick={() => onPick({ ...DEFAULT_PLACE })}>
          Use {placeLabel(DEFAULT_PLACE)}
        </button>
        <button className="btn quiet small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// The forecast for a place, cached on this device and refreshed every 30 minutes (shared by the header and the card).
export function useForecast(place) {
  const key = placeKey(place);
  const [w, setW] = useState(() => readCache());
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    fetch(forecastUrl(place))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((data) => {
        const v = { key, at: Date.now(), data };
        setW(v);
        writeCache(v);
        setErr('');
      })
      .catch(() => setErr('Couldn’t load the weather. It will try again shortly.'));
  }, [key]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    const on = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', on);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', on);
    };
  }, [load]);
  const s = useMemo(() => (w && w.key === key ? summarize(w.data) : null), [w, key]);
  return { s, err };
}

export function WeatherCard({ place, onPlace, forecast }) {
  const [editing, setEditing] = useState(false);
  const { s, err } = forecast;
  return (
    <section className="card weather">
      <div className="card-head">
        <h2 className="card-title">Weather</h2>
        <button className="link-btn small" onClick={() => setEditing(!editing)} aria-expanded={editing} title="Change location">
          {placeLabel(place)} <span aria-hidden="true">✎</span>
        </button>
      </div>
      {editing ? (
        <PlaceSearch
          onPick={(p) => {
            onPlace(p);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}
      {s ? (
        <>
          <div className="wx-now">
            <span className="wx-icon" aria-hidden="true">
              {s.now.icon}
            </span>
            <div className="grow">
              <div className="big num">{s.temp}°</div>
              <div className="muted small">
                {s.now.text} · feels like {s.feels}°
              </div>
            </div>
            <div className="wx-hl">
              <div className="num">
                H {s.high}° <span className="muted">/</span> L {s.low}°
              </div>
              <div className="muted small">Rain {s.rainChance}%</div>
            </div>
          </div>
          <p className="wx-sentence">{s.sentence}</p>
          {s.tennis ? (
            <p className="wx-tennis small">
              <span aria-hidden="true">🎾</span> Good tennis weather {s.tennis.label}
            </p>
          ) : null}
          <div className="wx-hours" role="list" aria-label="Next 12 hours">
            {s.hours.map((h) => (
              <div key={h.time} className="wx-hour" role="listitem" title={h.text}>
                <span className="muted small">{h.label}</span>
                <span className="wx-hicon" aria-hidden="true">
                  {h.icon}
                </span>
                <b className="num">{h.temp}°</b>
                <span className="small wx-rain">{h.rain >= 20 ? `${h.rain}%` : ' '}</span>
              </div>
            ))}
          </div>
          <p className="muted small note">
            Wind {s.wind} mph{s.gusts > s.wind + 5 ? `, gusts ${s.gusts}` : ''} · Humidity {s.humidity}% · UV {s.uv} · Sunrise {s.sunrise} · Sunset {s.sunset}
          </p>
        </>
      ) : (
        <p className="empty">{err || 'Loading the weather…'}</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- to-do
export function TodoCard({ data, mutate, onDelete }) {
  const [text, setText] = useState('');
  const [showDone, setShowDone] = useState(false);
  if (!data) return null;
  const open = data.todos.filter((t) => !t.done);
  const done = data.todos.filter((t) => t.done);
  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const v = text;
    setText('');
    mutate((d) => addTodo(d, v));
  };
  // Finishing a to-do gets a small burst of confetti from where you tapped.
  const toggle = (t, from) => {
    if (!t.done) celebrate(from || {});
    mutate((d) => toggleTodo(d, t.id));
  };
  const row = (t) => (
    <SwipeRow key={t.id} className={`bill todo-row ${t.done ? 'done' : ''}`} onRight={(e) => toggle(t, e && e.clientX != null ? { x: e.clientX, y: e.clientY } : {})} onLeft={() => onDelete(t)} rightLabel={t.done ? 'Undo' : 'Done'}>
      <label className="bill-check">
        <input type="checkbox" checked={!!t.done} onChange={(e) => toggle(t, centerOf(e.currentTarget.parentElement))} aria-label={`${t.text} done`} />
        <span className="box">{t.done ? <Icon name="check" size={14} /> : null}</span>
      </label>
      <span className="grow bill-name todo-text">{t.text}</span>
      <button className="x" aria-label={`Delete ${t.text}`} onClick={() => onDelete(t)}>
        ×
      </button>
    </SwipeRow>
  );
  return (
    <section className="card todo">
      <div className="card-head">
        <h2 className="card-title">To-do</h2>
        <span className="muted small">{open.length ? `${open.length} open` : 'All done'}</span>
      </div>
      <form className="add-row" onSubmit={add}>
        <input className="input" placeholder="Add a to-do" value={text} onChange={(e) => setText(e.target.value)} aria-label="New to-do" />
        <button className="btn" type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>
      {open.length ? <ul className="list">{open.map(row)}</ul> : <p className="empty">{done.length ? 'Everything’s done.' : 'Nothing on the list yet.'}</p>}
      {open.length ? <p className="muted small swipe-hint">Swipe right to finish, left to delete.</p> : null}
      {done.length ? (
        <div className="todo-done">
          <div className="row-between">
            <button className="link-btn small" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
              <Icon name={showDone ? 'down' : 'chev'} size={14} /> Done ({done.length})
            </button>
            <button className="link-btn small muted-link" onClick={() => mutate((d) => clearDone(d), `Cleared ${done.length} done`)}>
              Clear done
            </button>
          </div>
          {showDone ? <ul className="list">{done.map(row)}</ul> : null}
        </div>
      ) : null}
    </section>
  );
}
