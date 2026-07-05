/**
 * Build-time feature flags (NEXT_PUBLIC_* are inlined at build, so these are
 * constants — same value on server and client, no hydration mismatch).
 */

type EnvKind = 'LOCAL' | 'DEV' | 'PROD' | 'UNKNOWN';

/** Mirrors the admin env detection: explicit NEXT_PUBLIC_ENV wins, else infer. */
function detectEnv(): EnvKind {
  const explicit = (process.env.NEXT_PUBLIC_ENV || '').toUpperCase();
  if (explicit === 'LOCAL' || explicit === 'DEV' || explicit === 'PROD') return explicit;
  const api = (process.env.NEXT_PUBLIC_API_URL || '').toLowerCase();
  if (!api) return 'UNKNOWN';
  if (api.includes('localhost') || api.includes('127.0.0.1')) return 'LOCAL';
  if (api.includes('dev') || api.includes('staging') || api.includes('railway.app')) return 'DEV';
  return 'PROD';
}

/**
 * UP-Coin sink UI (Store page + nav links, profile Inventory/backpack, active-boost
 * badges). Dev-only for now — the backend ships everywhere, but the user-facing UI
 * is hidden in production while it's still being polished. Fail-closed: only LOCAL
 * and DEV show it; PROD and UNKNOWN hide it. Override with NEXT_PUBLIC_ENABLE_STORE.
 */
export const STORE_UI_ENABLED: boolean = (() => {
  const override = process.env.NEXT_PUBLIC_ENABLE_STORE;
  if (override === 'true') return true;
  if (override === 'false') return false;
  // Local `next dev` sets NODE_ENV=development — always show there.
  if (process.env.NODE_ENV === 'development') return true;
  const env = detectEnv();
  return env === 'LOCAL' || env === 'DEV';
})();
