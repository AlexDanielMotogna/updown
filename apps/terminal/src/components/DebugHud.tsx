'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { dbg } from '@/lib/debug';

/**
 * TEMPORARY on-screen debug HUD. Shows live identity / WS event counters / REST
 * fetch results / captured hydration errors — so we can see, without console
 * logs, whether the live-update break is: WS not connecting, effect dead (counter
 * frozen), REST not firing, or render not updating. Remove after diagnosis.
 *
 * Gated behind a `mounted` flag so the HUD itself never causes a hydration
 * mismatch (SSR + first client paint both render null).
 */
export function DebugHud() {
  const [mounted, setMounted] = useState(false);
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const s = useSyncExternalStore(dbg.subscribe, dbg.get, dbg.get);
  if (!mounted) return null;

  const age = (t: number) => (t ? `${Math.round((Date.now() - t) / 1000)}s` : '—');
  const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 999999,
        background: 'rgba(0,0,0,0.88)',
        color: '#0f0',
        font: '11px/1.5 monospace',
        padding: '6px 9px',
        borderRadius: 6,
        maxWidth: 360,
        border: '1px solid #2a2a2a',
        whiteSpace: 'pre-wrap',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: '#0ff', fontWeight: 'bold' }}>UpDown DEBUG HUD</span>
        <button onClick={() => setOpen((o) => !o)} style={{ color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>
          {open ? '–' : '+'}
        </button>
      </div>
      {open && (
        <>
          <div>evm: {short(s.evm)}</div>
          <div>wallet: {short(s.wallet)}</div>
          <div>
            wsReady: <span style={{ color: s.wsReady ? '#0f0' : '#f55' }}>{String(s.wsReady)}</span>
          </div>
          <div style={{ color: '#ff0' }}>WS events:</div>
          {Object.keys(s.ws).length === 0 ? (
            <div>{'  '}(none yet)</div>
          ) : (
            Object.entries(s.ws).map(([k, v]) => (
              <div key={k}>
                {'  '}
                {k}: n={v.n} last={age(v.t)}
              </div>
            ))
          )}
          <div style={{ color: '#ff0' }}>REST:</div>
          {Object.keys(s.rest).length === 0 ? (
            <div>{'  '}(none yet)</div>
          ) : (
            Object.entries(s.rest).map(([k, v]) => (
              <div key={k}>
                {'  '}
                {k.replace('/api/', '')}: {String(v.status)} n={v.n}
                {v.count !== undefined ? ` c=${v.count}` : ''} {age(v.t)}
              </div>
            ))
          )}
          <div style={{ color: s.errors.length ? '#f55' : '#0f0' }}>errors: {s.errors.length}</div>
          {s.errors.map((e, i) => (
            <div key={i} style={{ color: '#f88' }}>
              {'  '}
              {age(e.t)} {e.msg.slice(0, 90)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
