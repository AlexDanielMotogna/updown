'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastStatus = 'loading' | 'success' | 'error' | 'info';

interface Toast {
  id: number;
  status: ToastStatus;
  message: string;
}

export interface ToastApi {
  /** Create a toast; returns its id. */
  show: (status: ToastStatus, message: string) => number;
  /** Create a persistent loading toast (no auto-dismiss); returns its id. */
  loading: (message: string) => number;
  /** Update an existing toast's status + message (and (re)schedule dismissal). */
  update: (id: number, status: ToastStatus, message: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// Loading toasts persist until updated; results auto-dismiss.
const AUTO_DISMISS_MS: Record<ToastStatus, number> = { loading: 0, success: 3500, error: 6000, info: 3500 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
  }, []);

  const schedule = useCallback((id: number, status: ToastStatus) => {
    const prev = timers.current.get(id);
    if (prev) { clearTimeout(prev); timers.current.delete(id); }
    const ms = AUTO_DISMISS_MS[status];
    if (ms > 0) timers.current.set(id, setTimeout(() => dismiss(id), ms));
  }, [dismiss]);

  const show = useCallback((status: ToastStatus, message: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, status, message }]);
    schedule(id, status);
    return id;
  }, [schedule]);

  const loading = useCallback((message: string) => show('loading', message), [show]);

  const update = useCallback((id: number, status: ToastStatus, message: string) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, status, message } : x)));
    schedule(id, status);
  }, [schedule]);

  const api = useMemo<ToastApi>(() => ({ show, loading, update, dismiss }), [show, loading, update, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const NOOP: ToastApi = { show: () => 0, loading: () => 0, update: () => {}, dismiss: () => {} };

/** Access the toast API. Safe to call without a provider (returns a no-op). */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[92vw] flex-col gap-2">
      {toasts.map((t) => (
        <ToastRow key={t.id} t={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastRow({ t, onDismiss }: { t: Toast; onDismiss: () => void }) {
  const accent =
    t.status === 'success' ? 'border-l-win-500' : t.status === 'error' ? 'border-l-loss-500' : 'border-l-surface-400';
  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 rounded border-l-2 ${accent} card-elevated px-3 py-2.5 text-sm animate-slide-up`}
    >
      <Icon status={t.status} />
      <span className="flex-1 leading-snug text-surface-100">{t.message}</span>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-surface-500 hover:text-surface-200">✕</button>
    </div>
  );
}

function Icon({ status }: { status: ToastStatus }) {
  if (status === 'loading') {
    return <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-surface-600 border-t-surface-200" />;
  }
  const cls =
    status === 'success'
      ? 'bg-win-500/15 text-win-500'
      : status === 'error'
        ? 'bg-loss-500/15 text-loss-500'
        : 'bg-surface-700 text-surface-200';
  const glyph = status === 'success' ? '✓' : status === 'error' ? '✕' : 'i';
  return (
    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${cls}`}>
      {glyph}
    </span>
  );
}
