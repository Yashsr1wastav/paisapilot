export type EntryKind = 'income' | 'expense' | 'transfer';

export const paiseToRupees = (paise: number): string => `Rs ${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const rupeesToPaise = (rupees: string): number => {
  const value = Number(rupees.replace(/,/g, '').trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error('Enter an amount greater than zero');
  return Math.round(value * 100);
};
export const monthLabel = (date = new Date()): string => date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
export const progress = (current: number, target: number): number => target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
export const applyTransfer = (fromBalancePaise: number, toBalancePaise: number, amountPaise: number): [number, number] => {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error('Transfer amount must be positive');
  return [fromBalancePaise - amountPaise, toBalancePaise + amountPaise];
};