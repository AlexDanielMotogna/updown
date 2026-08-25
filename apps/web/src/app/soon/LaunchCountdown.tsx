'use client';

import { useEffect, useState } from 'react';

/**
 * Countdown to the devnet launch. Client-only by necessity (it ticks), but kept
 * to this one component so the rest of the notice stays a static server render.
 *
 * The first paint renders the same dashes on the server and on the client, and
 * the real numbers only appear after mount. Computing a duration during SSR is
 * how you get a hydration mismatch: the server's "now" is never the browser's.
 */
const CYAN = '#5FD8EF';

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { label: 'days', value: Math.floor(s / 86400) },
    { label: 'hours', value: Math.floor((s % 86400) / 3600) },
    { label: 'min', value: Math.floor((s % 3600) / 60) },
    { label: 'sec', value: s % 60 },
  ];
}

export function LaunchCountdown({ targetIso }: { targetIso: string }) {
  const target = new Date(targetIso).getTime();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (remaining !== null && remaining <= 0) {
    return (
      <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: CYAN }}>
        Launching now
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      {parts(remaining ?? 0).map((p) => (
        <div
          key={p.label}
          style={{
            minWidth: 68,
            padding: '10px 8px',
            borderRadius: 10,
            border: '1px solid rgba(95, 216, 239, 0.22)',
            background: 'rgba(95, 216, 239, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <span
            style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              lineHeight: 1,
              color: CYAN,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {remaining === null ? '--' : String(p.value).padStart(2, '0')}
          </span>
          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#5C6B7A' }}>
            {p.label}
          </span>
        </div>
      ))}
    </div>
  );
}
