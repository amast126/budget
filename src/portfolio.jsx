// Portfolio on Home: the holdings from the budget's Portfolio tab with today's prices (Finnhub, the same key the
// budget uses), plus one feed of headlines: news on your own tickers (Finnhub, fetched in the browser so the
// holdings never leave your account) and the energy, quantum and robotics themes from news.json.
import React, { useEffect, useMemo, useState } from 'react';
import { fmt, fmt0 } from './budget-logic.js';

const QKEY = 'dash.quotes.v1';
const NKEY = 'dash.coNews.v1';
const QUOTE_TTL = 5 * 60000;
const NEWS_TTL = 30 * 60000;
const key = () => ((window.BUDGET_CONFIG || {}).finnhubKey || '').trim();
const read = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function timeAgo(iso) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function holdingsOf(data) {
  const hs = (data && data.portfolio && Array.isArray(data.portfolio.holdings) ? data.portfolio.holdings : []).filter((h) => h && String(h.ticker || '').trim());
  const by = new Map();
  hs.forEach((h) => {
    const t = String(h.ticker).trim().toUpperCase();
    const cur = by.get(t) || { ticker: t, shares: 0, basis: 0 };
    cur.shares += Number(h.shares) || 0;
    cur.basis += Number(h.basis) || 0;
    by.set(t, cur);
  });
  return [...by.values()];
}

// Live quotes, cached for a few minutes; falls back to the prices the budget saved last time it refreshed.
function useQuotes(tickers, saved) {
  const sig = tickers.join(',');
  const [q, setQ] = useState(() => {
    const c = read(QKEY);
    return { ...(saved || {}), ...((c && c.q) || {}) };
  });
  useEffect(() => {
    const k = key();
    if (!k || !tickers.length) return;
    const c = read(QKEY);
    if (c && Date.now() - c.at < QUOTE_TTL && tickers.every((t) => c.q && c.q[t])) {
      setQ((x) => ({ ...x, ...c.q }));
      return;
    }
    let live = true;
    (async () => {
      const got = {};
      for (const t of tickers) {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t)}&token=${encodeURIComponent(k)}`);
          if (r.status === 429) break;
          const j = r.ok ? await r.json() : null;
          if (j && j.c) got[t] = { price: j.c, change: j.d, change_pct: j.dp };
        } catch {
          /* keep the last price */
        }
      }
      if (Object.keys(got).length) {
        const prev = read(QKEY) || { q: {} };
        write(QKEY, { at: Date.now(), q: { ...(prev.q || {}), ...got } });
        if (live) setQ((x) => ({ ...x, ...got }));
      }
    })();
    return () => {
      live = false;
    };
  }, [sig]);
  return q;
}

// Recent company news for each ticker (last 3 days, the newest 2 each), cached for half an hour.
function useCompanyNews(tickers) {
  const sig = tickers.join(',');
  const [items, setItems] = useState(() => {
    const c = read(NKEY);
    return c && c.sig === sig ? c.items : [];
  });
  useEffect(() => {
    const k = key();
    if (!k || !tickers.length) return;
    const c = read(NKEY);
    if (c && c.sig === sig && Date.now() - c.at < NEWS_TTL) {
      setItems(c.items);
      return;
    }
    let live = true;
    (async () => {
      const to = isoDay(new Date());
      const from = isoDay(new Date(Date.now() - 3 * 86400000));
      const out = [];
      for (const t of tickers) {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(t)}&from=${from}&to=${to}&token=${encodeURIComponent(k)}`);
          if (r.status === 429) break;
          const list = r.ok ? await r.json() : [];
          (Array.isArray(list) ? list : [])
            .filter((n) => n && n.headline && n.url)
            .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
            .slice(0, 2)
            .forEach((n) => out.push({ id: `fh-${n.id || n.url}`, title: n.headline, url: n.url, source: n.source || 'Finnhub', date: new Date((n.datetime || 0) * 1000).toISOString(), tag: t }));
        } catch {
          /* skip this one */
        }
      }
      write(NKEY, { at: Date.now(), sig, items: out });
      if (live) setItems(out);
    })();
    return () => {
      live = false;
    };
  }, [sig]);
  return items;
}

const pct = (v) => (v == null || isNaN(v) ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`);
const THEMES = ['Energy', 'Quantum', 'Robotics'];

export function PortfolioCard({ data, news }) {
  const holdings = useMemo(() => holdingsOf(data), [data]);
  const tickers = useMemo(() => holdings.map((h) => h.ticker), [holdings]);
  const quotes = useQuotes(tickers, data && data.portfolio ? data.portfolio.quotes : null);
  const coNews = useCompanyNews(tickers);
  const [tab, setTab] = useState('all');
  const [limit, setLimit] = useState(5);
  if (!holdings.length) return null;
  const themed = ((news && news.markets) || []).slice(0, 40);
  const merged = [...coNews, ...themed].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const seen = new Set();
  const feed = merged.filter((i) => {
    const k = i.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const tabs = [['all', 'All'], ['mine', 'My stocks'], ...THEMES.map((t) => [t, t])].filter(([k]) => k === 'all' || feed.some((i) => (k === 'mine' ? tickers.includes(i.tag) : i.tag === k)));
  const shown = feed.filter((i) => (tab === 'all' ? true : tab === 'mine' ? tickers.includes(i.tag) : i.tag === tab));
  // value and today's move, when shares are entered in the budget
  let value = 0;
  let dayMove = 0;
  let priced = 0;
  const moves = [];
  holdings.forEach((h) => {
    const q = quotes[h.ticker];
    if (!q || q.price == null) return;
    priced++;
    if (q.change_pct != null) moves.push(q.change_pct);
    if (h.shares > 0) {
      value += h.shares * q.price;
      dayMove += h.shares * (Number(q.change) || 0);
    }
  });
  const avg = moves.length ? moves.reduce((a, x) => a + x, 0) / moves.length : null;
  const cash = data && data.portfolio ? Number(data.portfolio.cash) || 0 : 0;
  return (
    <section className="card portfolio">
      <div className="card-head">
        <h2 className="card-title">Portfolio</h2>
        <a className="link small" href="#/budget">
          Holdings →
        </a>
      </div>
      {value > 0 ? (
        <div className="pf-top">
          <div>
            <div className="muted small">Holdings</div>
            <div className="mid num">{fmt0(value + cash)}</div>
          </div>
          <div className={`pf-move num ${dayMove >= 0 ? 'up' : 'down'}`}>
            {dayMove >= 0 ? '+' : '−'}
            {fmt(Math.abs(dayMove))} today
          </div>
        </div>
      ) : avg != null ? (
        <div className="muted small pf-avg">
          Your picks are <b className={avg >= 0 ? 'up' : 'down'}>{pct(avg)}</b> on average today
        </div>
      ) : null}
      <div className="tickers" role="list" aria-label="Your holdings today">
        {holdings.map((h) => {
          const q = quotes[h.ticker] || {};
          const dir = q.change_pct == null ? '' : q.change_pct >= 0 ? 'up' : 'down';
          return (
            <div key={h.ticker} role="listitem" className={`tk ${dir}`}>
              <b>{h.ticker}</b>
              <span className="num">{q.price != null ? fmt(q.price) : '—'}</span>
              <span className="num tk-pct">{pct(q.change_pct)}</span>
            </div>
          );
        })}
      </div>
      {!priced && !key() ? <p className="muted small note">Prices show once the Finnhub key is set in config.js.</p> : null}
      {feed.length ? (
        <>
          <div className="seg mini-seg pf-tabs" role="tablist" aria-label="Headlines">
            {tabs.map(([k, l]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={`seg-btn ${tab === k ? 'on' : ''}`}
                onClick={() => {
                  setTab(k);
                  setLimit(5);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <ul className="list pf-news">
            {shown.slice(0, limit).map((i) => (
              <li key={i.id}>
                <a className="story" href={i.url} target="_blank" rel="noopener">
                  <div className="grow">
                    <div className="story-title">{i.title}</div>
                    <div className="muted small">
                      <span className={`tag tag-theme ${THEMES.includes(i.tag) ? `th-${i.tag.toLowerCase()}` : 'th-mine'}`}>{i.tag}</span>
                      {i.source}
                      {i.date ? ` · ${timeAgo(i.date)}` : ''}
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
          <div className="row-between">
            {shown.length > limit ? (
              <button className="link-btn small" onClick={() => setLimit(limit + 5)}>
                More headlines
              </button>
            ) : (
              <span />
            )}
            <a
              className="link small"
              href="#/news"
              onClick={() => {
                try {
                  localStorage.setItem('dash.newsTab', JSON.stringify('markets'));
                } catch {
                  /* fine */
                }
              }}
            >
              Markets news →
            </a>
          </div>
        </>
      ) : null}
    </section>
  );
}
