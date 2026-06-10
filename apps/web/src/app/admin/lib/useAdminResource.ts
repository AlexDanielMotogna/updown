'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from './adminApi';

/**
 * Standard admin data-fetch hook. Replaces the hand-rolled
 * `[data, loading, error] + load() + useEffect` block that was copy-pasted across
 * admin components. Assumes the admin response envelope shape `{ data: T }`.
 *
 * Returns `setError` so action handlers in the same component can surface their
 * own failures through the same error slot, and `setData` for optimistic edits.
 */
export function useAdminResource<T>(endpoint: string, initial?: T) {
  const [data, setData] = useState<T | undefined>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminFetch<{ data: T }>(endpoint);
      setData(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, setError, reload, setData };
}
