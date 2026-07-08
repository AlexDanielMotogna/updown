const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

/**
 * Custom event fired by adminFetch / adminPostSSE when the backend returns
 * 401 (key rotated, key revoked, key not configured). Listened to by the
 * admin shell (page.tsx) to drop back to the login screen and clear the
 * stale key from sessionStorage. See PLAN-ADMIN-REFACTOR.md Phase 1 #15.
 */
export const ADMIN_AUTH_EXPIRED_EVENT = 'admin-auth-expired';

function getKey(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('admin-key') || '';
}

function fireAuthExpired(): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem('admin-key'); } catch { /* best effort */ }
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_EXPIRED_EVENT));
}

export class AdminAuthExpiredError extends Error {
  constructor() {
    super('Admin session expired. Please log in again.');
    this.name = 'AdminAuthExpiredError';
  }
}

export async function adminFetch<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api/admin${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': getKey(),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    fireAuthExpired();
    throw new AdminAuthExpiredError();
  }

  // Try to parse JSON even on non-200 so we can surface the server's message
  // (categories.ts now returns sanitized human messages on errors).
  let json: { success?: boolean; error?: { message?: string; code?: string } } | T;
  try {
    json = await res.json() as typeof json;
  } catch {
    throw new Error(`Request failed: ${res.status}`);
  }

  const envelope = json as { success?: boolean; error?: { message?: string } };
  if (!res.ok || envelope.success === false) {
    throw new Error(envelope.error?.message || `Request failed: ${res.status}`);
  }
  return json as T;
}

export async function adminPost<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
  return adminFetch<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function adminGet<T = unknown>(endpoint: string): Promise<T> {
  return adminFetch<T>(endpoint, { method: 'GET' });
}

export async function adminPostSSE(
  endpoint: string,
  body?: unknown,
  onEvent?: (event: Record<string, unknown>) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': getKey(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    fireAuthExpired();
    throw new AdminAuthExpiredError();
  }

  if (!res.ok || !res.body) {
    // Try to extract a server message; fall back to the generic if the body
    // isn't JSON (SSE error path might not be).
    let message = `Request failed: ${res.status}`;
    try {
      const j = await res.json() as { error?: { message?: string } };
      if (j.error?.message) message = j.error.message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent?.(data);
        } catch { /* skip malformed */ }
      }
    }
  }
}

export async function verifyKey(key: string): Promise<boolean> {
  const r = await verifyKeyDetailed(key);
  return r.kind === 'ok';
}

/**
 * Verify the admin key against /admin/verify with a richer result so the
 * login form can distinguish 'server unreachable' from '401 invalid' and
 * 'rate limited'. Phase 6 polish - Plan §Phase 6.
 */
export type AdminRole = 'super' | 'marketing';

export type VerifyResult =
  | { kind: 'ok'; role: AdminRole }
  | { kind: 'invalid'; message: string }
  | { kind: 'rate-limited'; message: string }
  | { kind: 'unreachable'; message: string };

/** Role of the currently authenticated admin (defaults to 'super' for older sessions). */
export function getAdminRole(): AdminRole {
  if (typeof sessionStorage === 'undefined') return 'super';
  return sessionStorage.getItem('admin-role') === 'marketing' ? 'marketing' : 'super';
}
export function setAdminRole(role: AdminRole): void {
  try { sessionStorage.setItem('admin-role', role); } catch { /* best effort */ }
}

export async function verifyKeyDetailed(key: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/verify`, {
      headers: { 'x-admin-key': key },
    });
    if (res.ok) {
      let role: AdminRole = 'super';
      try { const j = await res.json(); if (j?.role === 'marketing') role = 'marketing'; } catch { /* default super */ }
      return { kind: 'ok', role };
    }
    if (res.status === 429) {
      return { kind: 'rate-limited', message: 'Too many attempts - wait a minute and try again.' };
    }
    if (res.status === 401) {
      return { kind: 'invalid', message: 'Invalid API key.' };
    }
    return { kind: 'invalid', message: `Server returned ${res.status}.` };
  } catch (err) {
    // Network failure (DNS, CORS, server down). Distinct from 401 so the
    // operator can react: 'API is down' is a deploy/ops issue, 'invalid key'
    // is a key issue.
    return {
      kind: 'unreachable',
      message: err instanceof Error
        ? `Cannot reach the API at ${API_BASE}: ${err.message}`
        : `Cannot reach the API at ${API_BASE}.`,
    };
  }
}
