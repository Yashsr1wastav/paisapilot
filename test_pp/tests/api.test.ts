import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { server } from '../src/server.js';

let baseUrl = '';
beforeAll(async () => { await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Server did not start'); baseUrl = `http://127.0.0.1:${address.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

async function post(path: string, payload: unknown, token?: string): Promise<Response> { return fetch(baseUrl + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) }); }
describe('API authorization', () => {
  it('allows the deployed web origin and rejects unlisted origins', async () => {
    const allowed = await fetch(`${baseUrl}/health`, { headers: { origin: 'https://paisapilot.app' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://paisapilot.app');
    expect(allowed.headers.get('x-content-type-options')).toBe('nosniff');
    expect(allowed.headers.get('x-frame-options')).toBe('DENY');
    const blocked = await fetch(`${baseUrl}/health`, { headers: { origin: 'https://unlisted.example' } });
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('defaults summary and health filtering to the current UTC month', async () => {
    const registered = await post('/v1/auth/register', { email: `current-month-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const { token } = await registered.json() as { token: string };
    const account = await post('/v1/accounts', { name: 'Current month', type: 'cash' }, token); const { id } = await account.json() as { id: string };
    const currentMonth = new Date().toISOString().slice(0, 7); const previousMonth = currentMonth === '2026-01' ? '2025-12' : `${currentMonth.slice(0, 5)}${String(Number(currentMonth.slice(5)) - 1).padStart(2, '0')}`;
    await post('/v1/transactions', { accountId: id, amountPaise: 1000, kind: 'income', description: 'Current', occurredOn: `${currentMonth}-01` }, token);
    await post('/v1/transactions', { accountId: id, amountPaise: 9000, kind: 'expense', description: 'Previous', occurredOn: `${previousMonth}-01` }, token);
    const summary = await fetch(`${baseUrl}/v1/summary`, { headers: { authorization: `Bearer ${token}` } });
    expect(await summary.json()).toEqual({ incomePaise: 1000, expensePaise: 0, netPaise: 1000 });
    const health = await fetch(`${baseUrl}/v1/health-score`, { headers: { authorization: `Bearer ${token}` } });
    expect((await health.json()).version).toBe(1);
  });

  it('exports only the authenticated user data', async () => {
    const first = await post('/v1/auth/register', { email: `export-one-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const firstBody = await first.json() as { token: string };
    const second = await post('/v1/auth/register', { email: `export-two-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const secondBody = await second.json() as { token: string };
    await post('/v1/accounts', { name: 'Private export account', type: 'cash' }, firstBody.token);
    const exported = await fetch(`${baseUrl}/v1/privacy/export`, { headers: { authorization: `Bearer ${secondBody.token}` } });
    const payload = await exported.json() as { user: { email: string }; accounts: Array<{ name: string }> };
    expect(payload.user.email).toContain('export-two-');
    expect(payload.accounts).toEqual([]);
  });

  it('supports HttpOnly cookie sessions without changing bearer auth', async () => {
    const registered = await post('/v1/auth/register', { email: `cookie-${Date.now()}@example.com`, password: 'correct horse battery staple' });
    expect(registered.headers.get('set-cookie')).toMatch(/paisapilot_session=.*HttpOnly/);
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    const session = await fetch(`${baseUrl}/v1/auth/session`, { headers: { cookie } });
    expect(session.status).toBe(200);
    expect((await session.json() as { user: { email: string } }).user.email).toContain('cookie-');
    const response = await fetch(`${baseUrl}/v1/accounts`, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(registered.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('does not expose bearer tokens to web auth responses', async () => {
    const response = await fetch(`${baseUrl}/v1/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-paisapilot-client': 'web' }, body: JSON.stringify({ email: `web-auth-${Date.now()}@example.com`, password: 'correct horse battery staple' }) });
    const payload = await response.json() as { user: { email: string }; token?: string };
    expect(response.status).toBe(201);
    expect(payload.user.email).toContain('web-auth-');
    expect(payload.token).toBeUndefined();
    expect(response.headers.get('set-cookie')).toMatch(/paisapilot_session=.*HttpOnly/);
  });

  it('requires an allowlisted origin for cookie-authenticated state changes', async () => {
    const registered = await post('/v1/auth/register', { email: `csrf-${Date.now()}@example.com`, password: 'correct horse battery staple' });
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    const rejected = await fetch(`${baseUrl}/v1/accounts`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', origin: 'https://unlisted.example' }, body: JSON.stringify({ name: 'Blocked', type: 'cash' }) });
    expect(rejected.status).toBe(403);
    const allowed = await fetch(`${baseUrl}/v1/accounts`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', origin: 'https://paisapilot.app' }, body: JSON.stringify({ name: 'Allowed', type: 'cash' }) });
    expect(allowed.status).toBe(201);
    const bearer = await registered.json() as { token: string };
    const mobile = await post('/v1/accounts', { name: 'Mobile', type: 'cash' }, bearer.token);
    expect(mobile.status).toBe(201);
  });

  it('publishes the selected period and accepts a client timezone', async () => {
    const registered = await post('/v1/auth/register', { email: `period-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const { token } = await registered.json() as { token: string };
    const summary = await fetch(`${baseUrl}/v1/summary?timezone=Asia%2FKolkata`, { headers: { authorization: `Bearer ${token}` } });
    expect(summary.headers.get('x-period')).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    const invalid = await fetch(`${baseUrl}/v1/summary?timezone=Not%2FA%20Timezone`, { headers: { authorization: `Bearer ${token}` } });
    expect(invalid.status).toBe(400);
  });

  it('scopes account access to the authenticated user', async () => {
    const first = await post('/v1/auth/register', { email: `one-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const firstBody = await first.json() as { token: string };
    const account = await post('/v1/accounts', { name: 'Private cash', type: 'cash', balancePaise: 5000 }, firstBody.token); const accountBody = await account.json() as { id: string };
    const second = await post('/v1/auth/register', { email: `two-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const secondBody = await second.json() as { token: string };
    const response = await fetch(`${baseUrl}/v1/accounts`, { headers: { authorization: `Bearer ${secondBody.token}` } }); const list = await response.json() as { accounts: Array<{ id: string }> };
    expect(list.accounts.some((item) => item.id === accountBody.id)).toBe(false);
  });

  it('keeps transfers out of summaries and updates both owned account balances', async () => {
    const registered = await post('/v1/auth/register', { email: `transfer-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const { token } = await registered.json() as { token: string };
    const from = await post('/v1/accounts', { name: 'From', type: 'cash', balancePaise: 10000 }, token); const fromBody = await from.json() as { id: string };
    const to = await post('/v1/accounts', { name: 'To', type: 'bank', balancePaise: 2000 }, token); const toBody = await to.json() as { id: string };
    const transfer = await post('/v1/transfers', { fromAccountId: fromBody.id, toAccountId: toBody.id, amountPaise: 3000, description: 'Move money', occurredOn: '2026-01-01' }, token);
    expect(transfer.status).toBe(201);
    expect((await (await fetch(`${baseUrl}/v1/summary`, { headers: { authorization: `Bearer ${token}` } })).json())).toEqual({ incomePaise: 0, expensePaise: 0, netPaise: 0 });
    const accounts = await (await fetch(`${baseUrl}/v1/accounts`, { headers: { authorization: `Bearer ${token}` } })).json() as { accounts: Array<{ id: string; balancePaise: number }> };
    expect(accounts.accounts.find((item) => item.id === fromBody.id)?.balancePaise).toBe(7000);
    expect(accounts.accounts.find((item) => item.id === toBody.id)?.balancePaise).toBe(5000);
  });

  it('imports transactions into an account and includes them in the summary', async () => {
    const registered = await post('/v1/auth/register', { email: `import-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const { token } = await registered.json() as { token: string };
    const account = await post('/v1/accounts', { name: 'Imported bank', type: 'bank', balancePaise: 100000 }, token); const accountBody = await account.json() as { id: string };
    const imported = await post('/v1/import/transactions', { accountId: accountBody.id, csv: 'date,description,amount,type\n2026-01-01,Salary,25000,income\n2026-01-02,Groceries,1200.50,expense' }, token);
    expect(imported.status).toBe(201);
    expect((await imported.json() as { imported: number }).imported).toBe(2);
    const accounts = await (await fetch(`${baseUrl}/v1/accounts`, { headers: { authorization: `Bearer ${token}` } })).json() as { accounts: Array<{ id: string; balancePaise: number }> };
    expect(accounts.accounts.find((item) => item.id === accountBody.id)?.balancePaise).toBe(2479950);
    const summary = await (await fetch(`${baseUrl}/v1/summary?month=2026-01`, { headers: { authorization: `Bearer ${token}` } })).json();
    expect(summary).toEqual({ incomePaise: 2500000, expensePaise: 120050, netPaise: 2379950 });
  });

  it('deduplicates repeated imports and scopes summaries by month', async () => {
    const registered = await post('/v1/auth/register', { email: `dedupe-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const { token } = await registered.json() as { token: string };
    const account = await post('/v1/accounts', { name: 'Import target', type: 'bank' }, token); const { id } = await account.json() as { id: string };
    const csv = 'date,description,amount,type\n2026-01-01,Salary,100,income\n2026-02-01,Bonus,50,income';
    expect((await post('/v1/import/transactions', { accountId: id, csv }, token)).status).toBe(201);
    const repeated = await post('/v1/import/transactions', { accountId: id, csv }, token);
    expect((await repeated.json() as { imported: number }).imported).toBe(0);
    const january = await fetch(`${baseUrl}/v1/summary?month=2026-01`, { headers: { authorization: `Bearer ${token}` } });
    expect(await january.json()).toEqual({ incomePaise: 10000, expensePaise: 0, netPaise: 10000 });
  });

  it('rejects impossible calendar dates at the transaction API boundary', async () => {
    const registered = await post('/v1/auth/register', { email: `date-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const { token } = await registered.json() as { token: string };
    const account = await post('/v1/accounts', { name: 'Date check', type: 'cash' }, token); const { id } = await account.json() as { id: string };
    const response = await post('/v1/transactions', { accountId: id, amountPaise: 100, kind: 'expense', description: 'Invalid date', occurredOn: '2026-02-31' }, token);
    expect(response.status).toBe(400);
  });

  it('does not invoke AI when the account setting is disabled', async () => {
    const registered = await post('/v1/auth/register', { email: `ai-off-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const { token } = await registered.json() as { token: string };
    expect((await fetch(`${baseUrl}/v1/settings`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
    const updated = await fetch(`${baseUrl}/v1/settings`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ aiEnabled: false }) });
    expect(updated.status).toBe(200);
    const answer = await post('/v1/ai/answer', { prompt: 'Summarize my data' }, token);
    expect(answer.status).toBe(403);
  });

  it('rejects another user account for transaction and import operations', async () => {
    const first = await post('/v1/auth/register', { email: `owner-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const firstBody = await first.json() as { token: string };
    const account = await post('/v1/accounts', { name: 'Private', type: 'cash' }, firstBody.token); const accountBody = await account.json() as { id: string };
    const second = await post('/v1/auth/register', { email: `intruder-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const secondBody = await second.json() as { token: string };
    const transaction = await post('/v1/transactions', { accountId: accountBody.id, amountPaise: 100, kind: 'expense', description: 'Nope', occurredOn: '2026-01-01' }, secondBody.token);
    const imported = await post('/v1/import/transactions', { accountId: accountBody.id, csv: 'date,description,amount,type\n2026-01-01,Nope,1,expense' }, secondBody.token);
    expect(transaction.status).toBe(400);
    expect(imported.status).toBe(400);
  });

  it('invalidates the session after privacy deletion', async () => {
    const registered = await post('/v1/auth/register', { email: `delete-${Date.now()}@example.com`, password: 'correct horse battery staple' }); const { token } = await registered.json() as { token: string };
    const deleted = await fetch(`${baseUrl}/v1/privacy/delete`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    expect(deleted.status).toBe(200);
    const after = await fetch(`${baseUrl}/v1/accounts`, { headers: { authorization: `Bearer ${token}` } });
    expect(after.status).toBe(401);
  });

  it('revokes only the current session', async () => {
    const email = `revoke-${Date.now()}@example.com`;
    const registered = await post('/v1/auth/register', { email, password: 'correct horse battery staple' }); const { token } = await registered.json() as { token: string };
    const loggedIn = await post('/v1/auth/login', { email, password: 'correct horse battery staple' });
    const loggedInBody = await loggedIn.json() as { token: string };
    const revoked = await fetch(`${baseUrl}/v1/auth/session`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    expect(revoked.status).toBe(200);
    expect((await fetch(`${baseUrl}/v1/accounts`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
    expect((await fetch(`${baseUrl}/v1/accounts`, { headers: { authorization: `Bearer ${loggedInBody.token}` } })).status).toBe(200);
  });
});