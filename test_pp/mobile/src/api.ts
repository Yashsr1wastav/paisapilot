import * as SecureStore from 'expo-secure-store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';
const TOKEN_KEY = 'paisapilot.session';

export type ApiResponse<T> = T;
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function getToken(): Promise<string | null> { return SecureStore.getItemAsync(TOKEN_KEY); }
export async function saveToken(token: string): Promise<void> { await SecureStore.setItemAsync(TOKEN_KEY, token); }
export async function clearToken(): Promise<void> { await SecureStore.deleteItemAsync(TOKEN_KEY); }
export async function deleteAccount(): Promise<void> { await api<{ deleted: boolean }>('/v1/privacy/delete', { method: 'DELETE' }); }

export async function api<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = await getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) await clearToken();
    throw new ApiError(payload.error?.message ?? 'Something went wrong. Check your connection.', response.status);
  }
  return payload as T;
}

export async function validateSession(): Promise<boolean> {
  if (!(await getToken())) return false;
  await api('/v1/settings');
  return true;
}

export async function authenticate(email: string, password: string, mode: 'login' | 'register'): Promise<{ user: { id: string; email: string }; token: string }> {
  const result = await api<{ user: { id: string; email: string }; token: string }>(`/v1/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) });
  await saveToken(result.token);
  return result;
}