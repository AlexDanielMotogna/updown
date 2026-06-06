/**
 * Lightweight device fingerprint for referral anti-cheat.
 *
 * Deterministic for a given browser/device - derived from stable signals (UA,
 * language, timezone, screen, hardware, a canvas hash). Intentionally NOT
 * cached in localStorage so clearing storage doesn't reset it. It's a signal,
 * not proof: combined server-side with IP to FLAG (never ban) likely
 * self-referrals.
 */

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function canvasSignal(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(10, 10, 60, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('updown-fp', 12, 14);
    return canvas.toDataURL();
  } catch {
    return '';
  }
}

/** Returns a short fingerprint string, or '' on the server. */
export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return '';
  const parts = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages || []).join(','),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(navigator.hardwareConcurrency ?? ''),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? ''),
    canvasSignal(),
  ];
  return fnv1a(parts.join('|'));
}
