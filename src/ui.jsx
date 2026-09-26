import React from 'react';

export function Icon({ name, size = 22 }) {
  const p = {
    home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    budget: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    gear: 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    learn: 'M2 8l10-5 10 5-10 5zM6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5M22 8v6',
    up: 'M6 15l6-6 6 6',
    down: 'M6 9l6 6 6-6',
    chev: 'M9 6l6 6-6 6',
    news: 'M4 5h13v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM17 9h3v9a2 2 0 0 1-2 2h-3M7.5 9h6M7.5 12.5h6M7.5 16h3.5',
    car: 'M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11M4 17v-4.5A1.5 1.5 0 0 1 5.5 11h13a1.5 1.5 0 0 1 1.5 1.5V17zM6.5 17v2M17.5 17v2M7.5 14h.01M16.5 14h.01',
    heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM7.5 12h2.5l1.5-2.5 2 5 1.5-2.5h1.5',
    more: 'M4.5 12h1M11.5 12h1M18.5 12h1',
    flame: 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-2.9 1.8-5 3.4-6.9.3 1.6 1.2 2.8 2.4 3.4-.4-3.3 1.2-6.2 3.6-8.3-.2 2.4.9 4.2 2.2 5.9 1.1 1.5 1.9 3.3 1.9 5.6 0 3.8-3 6.5-7 6.5z',
    pot: 'M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM2 10h2M20 10h2M9 3.5c-.8.8-.8 2 0 2.8M13 3.5c-.8.8-.8 2 0 2.8',
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={p} />
    </svg>
  );
}

