import { useEffect, useRef, useCallback } from 'react';

export function useIntersectionObserver(callback: () => void, enabled = true) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const setRef = useCallback((node: HTMLDivElement | null) => {
    sentinelRef.current = node;
  }, []);

  useEffect(() => {
    if (!enabled || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          callbackRef.current();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinelRef.current);

    return () => observer.disconnect();
  }, [enabled]);

  return setRef;
}
