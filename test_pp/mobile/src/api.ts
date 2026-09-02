import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';
const KEY = 'pp_token';

export const getToken = () => SecureStore.getItemAsync(KEY);
export const saveToken = (t: string) => SecureStore.setItemAsync(KEY, t);
export const clearToken = () => SecureStore.deleteItemAsync(KEY);

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }

  return res.json();
}

export async function authenticate(email: string, password: string, mode: 'login' | 'register') {
  const result = await api<{ user: { id: string; email: string }; token: string }>(`/v1/auth/${mode}`, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (result.token) await saveToken(result.token);
  return result;
}

export async function validateSession(): Promise<{ id: string; email: string } | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const result = await api<{ user: { id: string; email: string } }>('/v1/auth/session');
    return result.user ?? null;
  } catch {
    await clearToken();
    return null;
  }
}

export async function deleteAccount(): Promise<void> {
  await api('/v1/privacy/delete', { method: 'DELETE' });
}
