import { describe, expect, it } from 'vitest';
import { formatDate, formatINR } from '../lib/format';
import { validateImportCsv } from '../lib/import-validation';

describe('web formatting', () => {
  it('formats paise using Indian rupee grouping', () => {
    expect(formatINR(123456789)).toBe('₹12,34,568');
  });

  it('formats API dates for the Indian product locale', () => {
    expect(formatDate('2026-01-05')).toBe('05 Jan 2026');
  });

  it('preflights valid quoted CSV and rejects invalid transaction rows', () => {
    expect(validateImportCsv('date,description,amount,type\n2026-01-01,"Tea, cafe",120.50,expense')).toEqual({ rows: 1 });
    expect(() => validateImportCsv('date,description,amount,type\n2026-01-01,Tea,-1,expense')).toThrow('invalid amount');
  });

  it('preflights escaped quotes and multiline fields as one transaction', () => {
    const csv = 'date,description,amount,type\r\n2026-01-01,"Tea, ""large""\r\ncafe",120.50,expense';
    expect(validateImportCsv(csv)).toEqual({ rows: 1 });
  });

  it('rejects an unterminated quoted field during preflight', () => {
    expect(() => validateImportCsv('date,description,amount,type\n2026-01-01,"Tea,10,expense')).toThrow('Malformed CSV quote');
  });
});