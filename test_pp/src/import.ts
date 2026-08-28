import type { TransactionKind } from '@paisapilot/contracts';
import { isValidCalendarDate, MAX_AMOUNT_PAISE } from './domain.js';
import { parseCsv } from '../lib/csv.js';

export interface ImportedTransaction { occurredOn: string; description: string; amountPaise: number; kind: TransactionKind; category?: string; }

function parseAmount(value: string): number {
  const normalized = value.replace(/[₹,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Invalid amount');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT_PAISE / 100) throw new Error('Invalid amount');
  const amountPaise = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise > MAX_AMOUNT_PAISE) throw new Error('Invalid amount');
  return amountPaise;
}
export function parseTransactionCsv(csv: string): ImportedTransaction[] {
  if (typeof csv !== 'string' || Buffer.byteLength(csv, 'utf8') > 2_000_000) throw new Error('CSV is missing or too large');
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error('CSV requires a header and at least one row');
  const headers = rows[0]!.map((header) => header.toLowerCase().replace(/\s+/g, '_'));
  const required = ['date', 'description', 'amount', 'type'];
  if (required.some((header) => !headers.includes(header))) throw new Error('CSV requires date, description, amount, and type columns');
  return rows.slice(1).map((values, index) => {
    const row = Object.fromEntries(headers.map((header, position) => [header, values[position] ?? '']));
    if (!isValidCalendarDate(row.date)) throw new Error(`Invalid date on row ${index + 2}`);
    if (!row.description || row.description.length > 500) throw new Error(`Invalid description on row ${index + 2}`);
    if (row.type !== 'income' && row.type !== 'expense') throw new Error(`Type must be income or expense on row ${index + 2}`);
    const result: ImportedTransaction = { occurredOn: row.date, description: row.description, amountPaise: parseAmount(row.amount), kind: row.type };
    if (row.category) result.category = row.category.slice(0, 100);
    return result;
  });
}
