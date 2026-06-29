'use client';

/**
 * setInterval that pauses while the tab is hidden and fires `fn` once the moment it
 * becomes visible again (so data is fresh on return), then resumes. Saves resources
 * when the user isn't looking. Does NOT fire `fn` on setup — callers do their own
 * initial load. Returns a cleanup function.
 */
export function pollWhileVisible(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => { if (timer == null) timer = setInterval(fn, ms); };
  const stop = () => { if (timer != null) { clearInterval(timer); timer = null; } };

  const onVis = () => {
    if (document.hidden) stop();
    else { fn(); start(); }
  };

  const hidden = typeof document !== 'undefined' && document.hidden;
  if (!hidden) start();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

  return () => {
    stop();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
  };
}
