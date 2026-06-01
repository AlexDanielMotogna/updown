'use client';

/**
 * Global toast queue for the admin shell. Replaces ~10 ad-hoc
 * `useState<{ ok, message }>` patterns where each component re-rendered
 * an inline `<Alert>` and forgot to auto-dismiss.
 *
 * - useToast().show({ kind: 'success' | 'error' | 'info' | 'warning', message, title?, details? })
 * - useMutationFeedback(): hook returning { wrap, ...}. `wrap` accepts a
 *   useMutation result and a success message; it pipes onSuccess/onError
 *   through the toast queue automatically.
 *
 * Auto-dismiss: success 4s, info 5s, warning 6s, error 8s. Errors stay
 * pinned in the queue (max 4 simultaneous) so the admin can read details
 * before the next mutation lands.
 *
 * Wrap your subtree once at the admin shell (page.tsx) with <ToastProvider>.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Snackbar, Box } from '@mui/material';
import { ErrorAlert } from './ErrorState';
import { darkTokens as t } from '@/lib/theme';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastInput {
  kind: ToastKind;
  message: ReactNode;
  title?: ReactNode;
  details?: unknown;
}

interface QueuedToast extends ToastInput {
  id: number;
}

interface ToastContextValue {
  show(input: ToastInput): void;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_HIDE_MS: Record<ToastKind, number> = {
  success: 4_000,
  info: 5_000,
  warning: 6_000,
  error: 8_000,
};

const KIND_COLORS: Record<ToastKind, string> = {
  success: t.gain,
  info: t.info,
  warning: t.warning,
  error: t.error,
};

const MAX_QUEUE = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedToast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setQueue(q => q.filter(t0 => t0.id !== id));
  }, []);

  const show = useCallback((input: ToastInput) => {
    const id = ++counter.current;
    setQueue(q => {
      const next = [...q, { ...input, id }];
      if (next.length > MAX_QUEUE) next.shift();
      return next;
    });
  }, []);

  const ctx = useMemo<ToastContextValue>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Stacked at bottom-right; newest on top of the stack. */}
      <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: (theme) => theme.zIndex.snackbar, display: 'flex', flexDirection: 'column-reverse', gap: 1, maxWidth: 420 }}>
        {queue.map(item => (
          <ToastItem key={item.id} item={item} onClose={() => dismiss(item.id)} />
        ))}
      </Box>
    </ToastContext.Provider>
  );
}

function ToastItem({ item, onClose }: { item: QueuedToast; onClose: () => void }) {
  // Errors get the rich ErrorAlert (with collapsible details); everything
  // else uses a minimal colored Snackbar surface.
  if (item.kind === 'error') {
    return (
      <Box sx={{ pointerEvents: 'auto' }}>
        <ErrorAlert title={item.title ?? 'Error'} message={item.message} details={item.details} onClose={onClose} />
      </Box>
    );
  }
  return (
    <Snackbar
      open
      autoHideDuration={AUTO_HIDE_MS[item.kind]}
      onClose={(_, reason) => { if (reason !== 'clickaway') onClose(); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      sx={{ position: 'static', transform: 'none' }}
    >
      <Box
        onClick={onClose}
        sx={{
          cursor: 'pointer',
          px: 1.75, py: 1,
          borderRadius: 1.5,
          bgcolor: t.bg.surface,
          border: `1px solid ${KIND_COLORS[item.kind]}55`,
          borderLeft: `3px solid ${KIND_COLORS[item.kind]}`,
          color: t.text.primary,
          fontSize: '0.85rem',
          minWidth: 260, maxWidth: 420,
          boxShadow: t.shadow.default,
        }}
      >
        {item.title ? <Box sx={{ fontWeight: 600, fontSize: '0.8rem', mb: 0.25, color: KIND_COLORS[item.kind] }}>{item.title}</Box> : null}
        <Box>{item.message}</Box>
      </Box>
    </Snackbar>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Lazy fallback so components don't crash if rendered outside the
    // provider (e.g. in Storybook or unit tests). Logs to the console so
    // the missing provider is still visible during development.
    return {
      show: (i) => console.warn('[useToast] no ToastProvider; toast dropped:', i),
      dismiss: () => {},
    };
  }
  return ctx;
}

// ─── useMutationFeedback ────────────────────────────────────────────────
/**
 * Funnel react-query mutations into the toast queue without each caller
 * writing onSuccess/onError boilerplate.
 *
 * Usage:
 *   const feedback = useMutationFeedback();
 *   const m = useMutation({ mutationFn });
 *   const submit = (vars) => feedback.run(m, vars, { success: 'Pool created' });
 */
interface MutationLike<TVariables, TData> {
  mutateAsync(vars: TVariables): Promise<TData>;
}

interface RunOptions<TData> {
  success?: string | ((data: TData) => string);
  /** Override the error toast title; otherwise the default is "Action failed". */
  errorTitle?: string;
}

export function useMutationFeedback() {
  const toast = useToast();
  const run = useCallback(async <TVariables, TData>(
    mutation: MutationLike<TVariables, TData>,
    vars: TVariables,
    opts: RunOptions<TData> = {},
  ): Promise<TData | undefined> => {
    try {
      const data = await mutation.mutateAsync(vars);
      if (opts.success) {
        const message = typeof opts.success === 'function' ? opts.success(data) : opts.success;
        toast.show({ kind: 'success', message });
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Operation failed';
      toast.show({ kind: 'error', title: opts.errorTitle ?? 'Action failed', message, details: err });
      return undefined;
    }
  }, [toast]);

  // Effect-form for components that prefer to attach via callbacks.
  return { run };
}

// Re-export for callers that import everything from ./Toast without the
// barrel.
export { ToastContext };

// ─── effect helpers ─────────────────────────────────────────────────────
/**
 * Tiny hook to flash a one-shot success toast from a state flag (handy
 * for non-mutation flows like "key copied" or "row pinned").
 */
export function useToastOnChange(flag: unknown, input: ToastInput) {
  const toast = useToast();
  useEffect(() => {
    if (flag) toast.show(input);
    // We intentionally only react to `flag` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag]);
}
