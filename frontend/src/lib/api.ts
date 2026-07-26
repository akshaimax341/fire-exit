const API_BASE = import.meta.env.VITE_API_URL || '';

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export function wsUrl(path: string): string {
  const base = import.meta.env.VITE_WS_URL;
  if (base) return `${base}${path}`;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // Dev: Vite proxies /ws → backend
  return `${proto}://${window.location.host}${path}`;
}
