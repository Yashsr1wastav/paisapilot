import type { Account, Budget, Goal, Loan, Transaction } from '@paisapilot/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? 'https://api.paisapilot.app' : 'http://127.0.0.1:3000');
export type ApiData = { accounts: Account[] } | { transactions: Transaction[] } | { goals: Goal[] } | { budgets: Budget[] } | { loans: Loan[] } | { incomePaise: number; expensePaise: number; netPaise: number } | { score: number; version: number; factors: Record<string, number> };

const TOKEN_KEY = 'pp_session_token';
export const session = {
  get: (): string | null => (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null),
  set: (token: string): void => { if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token); },
  clear: (): void => { if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY); },
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.get();
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) };
  if (token) headers['authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401) { session.clear(); throw new Error('Authentication required'); }
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: { message?: string } }; throw new Error(body.error?.message ?? `Request failed (${response.status})`); }
  return response.json() as Promise<T>;
}

export async function authenticate(email: string, password: string, mode: 'login' | 'register'): Promise<string> {
  const result = await fetch(`${API_URL}/v1/auth/${mode}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!result.ok) { const body = await result.json().catch(() => ({})) as { error?: { message?: string } }; throw new Error(body.error?.message ?? `Request failed (${result.status})`); }
  const data = await result.json() as { token?: string; user?: { email: string } };
  if (!data.token) throw new Error('No token returned from server');
  session.set(data.token);
  return data.user?.email ?? email;
}
