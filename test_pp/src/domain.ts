import type { Account, Transaction, TransactionKind } from '@paisapilot/contracts';

export const MAX_AMOUNT_PAISE = 1_000_000_000_000;

export function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = [31, ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1]!;
}

export function isValidMonth(value: string): boolean { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }

export function currentMonth(timeZone = 'UTC', now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (!year || !month) throw new Error('timezone is invalid');
    return `${year}-${month}`;
  } catch (caught) {
    if (caught instanceof RangeError) throw new Error('timezone is invalid');
    throw caught;
  }
}

export function transactionsForMonth(transactions: Transaction[], month?: string, timeZone = 'UTC'): Transaction[] {
  const selectedMonth = month ?? currentMonth(timeZone);
  if (!isValidMonth(selectedMonth)) throw new Error('month must use YYYY-MM format');
  return transactions.filter((item) => item.occurredOn.startsWith(`${selectedMonth}-`));
}

export function calculateCashFlow(transactions: Transaction[]): { incomePaise: number; expensePaise: number; netPaise: number } {
  const incomePaise = transactions.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amountPaise, 0);
  const expensePaise = transactions.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + item.amountPaise, 0);
  return { incomePaise, expensePaise, netPaise: incomePaise - expensePaise };
}

export function calculateHealthScore(accounts: Account[], transactions: Transaction[]): { score: number; version: 1; factors: Record<string, number> } {
  const cash = accounts.filter((account) => !['loan', 'credit_card'].includes(account.type)).reduce((sum, account) => sum + account.balancePaise, 0);
  const debt = accounts.filter((account) => ['loan', 'credit_card'].includes(account.type)).reduce((sum, account) => sum + Math.max(0, -account.balancePaise), 0);
  const flow = calculateCashFlow(transactions);
  const savingsRate = flow.incomePaise > 0 ? Math.max(0, Math.min(1, flow.netPaise / flow.incomePaise)) : 0;
  const emergencyFactor = flow.expensePaise > 0 ? Math.max(0, Math.min(1, cash / (flow.expensePaise * 6))) : 0;
  const debtFactor = debt === 0 ? 1 : Math.max(0, 1 - debt / Math.max(cash + debt, 1));
  const score = Math.round((savingsRate * 40) + (emergencyFactor * 35) + (debtFactor * 25));
  return { score, version: 1, factors: { savingsRate, emergencyFund: emergencyFactor, debt: debtFactor } };
}

export function applyTransactionBalance(account: Account, kind: TransactionKind, amountPaise: number): Account {
  const delta = kind === 'income' ? amountPaise : -amountPaise;
  return { ...account, balancePaise: account.balancePaise + delta };
}

export function applyTransferBalances(from: Account, to: Account, amountPaise: number): [Account, Account] {
  return [
    { ...from, balancePaise: from.balancePaise - amountPaise },
    { ...to, balancePaise: to.balancePaise + amountPaise }
  ];
}
