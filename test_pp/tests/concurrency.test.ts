import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { server } from '../src/server.js';

let baseUrl = '';
beforeAll(async () => { await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Server did not start'); baseUrl = `http://127.0.0.1:${address.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))); });

async function post(path: string, payload: unknown, token?: string): Promise<Response> {
  return fetch(baseUrl + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) });
}

describe('concurrent balance mutation', () => {
  it('does not lose updates when many income transactions post to the same account at once', async () => {
    const registered = await post('/v1/auth/register', { email: `race-${Date.now()}@example.com`, password: 'correct horse battery staple' });
    const { token } = (await registered.json()) as { token: string };
    const account = await post('/v1/accounts', { name: 'Race target', type: 'cash', balancePaise: 0 }, token);
    const { id } = (await account.json()) as { id: string };

    const concurrentWrites = 25;
    // Fire all requests without awaiting each other, so their handlers genuinely interleave
    // at the same await points that caused the original read-account -> compute -> write-account race.
    const results = await Promise.all(
      Array.from({ length: concurrentWrites }, (_, index) =>
        post('/v1/transactions', { accountId: id, amountPaise: 100, kind: 'income', description: `Concurrent ${index}`, occurredOn: '2026-01-01' }, token)
      )
    );
    expect(results.every((response) => response.status === 201)).toBe(true);

    const accounts = (await (await fetch(`${baseUrl}/v1/accounts`, { headers: { authorization: `Bearer ${token}` } })).json()) as { accounts: Array<{ id: string; balancePaise: number }> };
    const finalBalance = accounts.accounts.find((item) => item.id === id)?.balancePaise;
    // Every write must land: 25 x ₹1.00 (100 paise) = 2500 paise. A lost-update race would leave this short.
    expect(finalBalance).toBe(concurrentWrites * 100);

    const transactions = (await (await fetch(`${baseUrl}/v1/transactions`, { headers: { authorization: `Bearer ${token}` } })).json()) as { transactions: unknown[] };
    expect(transactions.transactions).toHaveLength(concurrentWrites);
  });

  it('does not lose a transfer leg when transfers race against transactions on the same account', async () => {
    const registered = await post('/v1/auth/register', { email: `race-transfer-${Date.now()}@example.com`, password: 'correct horse battery staple' });
    const { token } = (await registered.json()) as { token: string };
    const from = await post('/v1/accounts', { name: 'From', type: 'cash', balancePaise: 100_000 }, token);
    const { id: fromId } = (await from.json()) as { id: string };
    const to = await post('/v1/accounts', { name: 'To', type: 'bank', balancePaise: 0 }, token);
    const { id: toId } = (await to.json()) as { id: string };

    const rounds = 10;
    await Promise.all(
      Array.from({ length: rounds }, (_, index) => [
        post('/v1/transfers', { fromAccountId: fromId, toAccountId: toId, amountPaise: 500, description: `Transfer ${index}`, occurredOn: '2026-01-01' }, token),
        post('/v1/transactions', { accountId: fromId, amountPaise: 300, kind: 'expense', description: `Spend ${index}`, occurredOn: '2026-01-01' }, token)
      ]).flat()
    );

    const accounts = (await (await fetch(`${baseUrl}/v1/accounts`, { headers: { authorization: `Bearer ${token}` } })).json()) as { accounts: Array<{ id: string; balancePaise: number }> };
    const fromBalance = accounts.accounts.find((item) => item.id === fromId)?.balancePaise;
    const toBalance = accounts.accounts.find((item) => item.id === toId)?.balancePaise;
    expect(toBalance).toBe(rounds * 500);
    expect(fromBalance).toBe(100_000 - rounds * 500 - rounds * 300);
  });
});
