'use client';

/**
 * TEMPORARY debug store for the on-screen HUD. Records WS event counters, REST
 * fetch results, identity, and captured React hydration errors. Remove once the
 * live-update bug is diagnosed. Client-only (guarded by `window`).
 *
 * The console.error patch is installed at MODULE LOAD (not in an effect) so it's
 * active before React hydrates — that's the only way to catch the recoverable
 * hydration error React logs DURING the hydration pass (an effect runs too late).
 */
export interface DebugState {
  evm?: string;
  wallet?: string;
  wsReady: boolean;
  ws: Record<string, { n: number; t: number }>;
  rest: Record<string, { status: number | string; n: number; t: number; count?: number }>;
  errors: { msg: string; t: number }[];
}

let state: DebugState = { wsReady: false, ws: {}, rest: {}, errors: [] };
const subs = new Set<() => void>();
const now = () => (typeof performance !== 'undefined' ? Date.now() : Date.now());
function emit() {
  state = { ...state };
  subs.forEach((f) => f());
}

export const dbg = {
  subscribe(cb: () => void) {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  },
  get(): DebugState {
    return state;
  },
  identity(evm?: string, wallet?: string) {
    if (state.evm === evm && state.wallet === wallet) return;
    state.evm = evm;
    state.wallet = wallet;
    emit();
  },
  wsReady(r: boolean) {
    if (state.wsReady === r) return;
    state.wsReady = r;
    emit();
  },
  bumpWs(kind: string) {
    const cur = state.ws[kind] ?? { n: 0, t: 0 };
    state.ws[kind] = { n: cur.n + 1, t: now() };
    emit();
  },
  rest(path: string, status: number | string, count?: number) {
    const cur = state.rest[path] ?? { n: 0 };
    state.rest[path] = { status, n: cur.n + 1, t: now(), count };
    emit();
  },
  error(msg: string) {
    state.errors = [{ msg: msg.slice(0, 220), t: now() }, ...state.errors].slice(0, 10);
    emit();
  },
};

// ── Install hydration / global error capture at module load (client only) ──────
declare global {
  interface Window {
    __updownDbgPatched?: boolean;
  }
}
if (typeof window !== 'undefined' && !window.__updownDbgPatched) {
  window.__updownDbgPatched = true;
  const orig = console.error.bind(console);
  // React logs recoverable hydration errors via console.error (minified codes
  // #418/#423/#425/#310/#421/#422 in prod, full text in dev). Flag those.
  const HYDRATION =
    /hydrat|#(418|423|425|310|419|421|422)|did not match|server rendered|text content|tree was rendered/i;
  console.error = (...args: unknown[]) => {
    try {
      const msg = args
        .map((a) => (typeof a === 'string' ? a : (a as Error)?.message ?? String(a)))
        .join(' ');
      if (HYDRATION.test(msg)) dbg.error('HYDRATION: ' + msg);
    } catch {
      /* never let the patch throw */
    }
    orig(...(args as []));
  };
  window.addEventListener('error', (e) => dbg.error('window.error: ' + (e.message || String(e))));
  window.addEventListener('unhandledrejection', (e) =>
    dbg.error('unhandledRejection: ' + String((e as PromiseRejectionEvent).reason)),
  );
}
