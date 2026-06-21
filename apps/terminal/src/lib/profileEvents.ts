'use client';

// Tiny pub/sub so a reward credit can refresh the navbar level/UP-coins chip
// immediately (instead of waiting for its 30s poll). No store/deps needed.
type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to "profile changed" pings. Returns an unsubscribe fn. */
export function onProfileRefresh(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Notify subscribers that the profile (XP / coins / level) likely changed. */
export function emitProfileRefresh(): void {
  for (const cb of listeners) cb();
}
