'use client';

import { useEffect, useState } from 'react';

/** True on small screens (< `breakpoint`px). Client-only — safe inside the
 * already mounted-gated terminal workspace, so no hydration mismatch. The lazy
 * initializer reads matchMedia synchronously to avoid a desktop→mobile flash. */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}
