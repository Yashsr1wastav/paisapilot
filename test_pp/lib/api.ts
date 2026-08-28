import type { Account, Budget, Goal, Loan, Transaction } from '@paisapilot/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? 'https://api.paisapilot.app' : 'http://127.0.0.1:3000');
export type ApiData = { accounts: Account[] } | { transactions: Transaction[] } | { goals: Goal[] } | { budgets: Budget[] } | { loans: Loan[] } | { incomePaise: number; expensePaise: number; netPaise: number } | { score: number; version: number; factors: Record<string, number> };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: 'include', headers: { 'content-type': 'application/json', ...init.headers } });
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: { message?: string } }; throw new Error(body.error?.message ?? `Request failed (${response.status})`); }
  return response.json() as Promise<T>;
}

export async function authenticate(email: string, password: string, mode: 'login' | 'register'): Promise<void> {
  await api<{ user: { id: string; email: string } }>(`/v1/auth/${mode}`, { method: 'POST', headers: { 'x-paisapilot-client': 'web' }, body: JSON.stringify({ email, password }) });
}