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

  if (!res.ok || !res.body) {
    throw new Error(`Request failed: ${res.status}`);
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
  try {
    const res = await fetch(`${API_BASE}/api/admin/verify`, {
      headers: { 'x-admin-key': key },
    });
    return res.ok;
  } catch {
    return false;
  }
}
