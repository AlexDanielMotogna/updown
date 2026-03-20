const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

function getKey(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('admin-key') || '';
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

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message || `Request failed: ${res.status}`);
  }
  return json as T;
}

export async function adminPost<T = unknown>(endpoint: string, body?: unknown): Promise<T> {
  return adminFetch<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function verifyKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/admin/verify`, {
      headers: { 'x-admin-key': key },
    });
    return res.ok;
  } catch {
    return false;
  }
}
