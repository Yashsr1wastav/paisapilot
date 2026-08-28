import { describe, expect, it } from 'vitest';
import { calculateCashFlow, calculateHealthScore, applyTransactionBalance, applyTransferBalances, transactionsForMonth } from '../src/domain.js';
import type { Account, Transaction } from '@paisapilot/contracts';

const account = (type: Account['type'], balancePaise: number): Account => ({ id: type, userId: 'u1', name: type, type, balancePaise, currency: 'INR', createdAt: new Date().toISOString() });
const transaction = (kind: Transaction['kind'], amountPaise: number): Transaction => ({ id: kind + amountPaise, userId: 'u1', accountId: 'cash', kind, amountPaise, description: 'test', occurredOn: '2026-01-01', createdAt: new Date().toISOString() });

describe('financial calculations', () => {
  it('excludes transfers from cash flow', () => expect(calculateCashFlow([transaction('income', 10000), transaction('expense', 2500), transaction('transfer', 9000)])).toEqual({ incomePaise: 10000, expensePaise: 2500, netPaise: 7500 }));
  it('moves transfer value between accounts without changing total money', () => { const [from, to] = applyTransferBalances(account('cash', 10000), account('bank', 2000), 3000); expect(from.balancePaise).toBe(7000); expect(to.balancePaise).toBe(5000); expect(from.balancePaise + to.balancePaise).toBe(12000); });
  it('returns a versioned bounded health score', () => { const result = calculateHealthScore([account('cash', 600000)], [transaction('income', 100000), transaction('expense', 50000)]); expect(result.version).toBe(1); expect(result.score).toBeGreaterThanOrEqual(0); expect(result.score).toBeLessThanOrEqual(100); });
  it('does not treat positive credit balances as debt', () => { const result = calculateHealthScore([account('credit_card', 5000)], []); expect(result.factors.debt).toBe(1); });
  it('applies income and expense without mutating the original account', () => { const original = account('cash', 1000); expect(applyTransactionBalance(original, 'income', 250)).toMatchObject({ balancePaise: 1250 }); expect(applyTransactionBalance(original, 'expense', 250)).toMatchObject({ balancePaise: 750 }); expect(original.balancePaise).toBe(1000); });
  it('keeps transfer balances immutable and out of cash flow', () => { const from = account('cash', 10000); const to = account('bank', 2000); const updated = applyTransferBalances(from, to, 3000); expect(from.balancePaise).toBe(10000); expect(to.balancePaise).toBe(2000); expect(calculateCashFlow([transaction('transfer', 3000)])).toEqual({ incomePaise: 0, expensePaise: 0, netPaise: 0 }); expect(updated[0].balancePaise + updated[1].balancePaise).toBe(12000); });
  it('scopes summaries to a validated calendar month', () => { const january = transaction('income', 10000); const february = { ...transaction('expense', 2000), occurredOn: '2026-02-01' }; expect(transactionsForMonth([january, february], '2026-01')).toEqual([january]); expect(() => transactionsForMonth([], '2026-13')).toThrow(); });
  it('defaults month filtering to the current calendar month', () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const current = { ...transaction('income', 100), occurredOn: `${currentMonth}-01` };
    expect(transactionsForMonth([current, transaction('expense', 200)])).toEqual([current]);
  });
});
