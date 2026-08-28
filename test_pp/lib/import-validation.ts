import { parseCsv } from './csv';

const MAX_IMPORT_BYTES = 2_000_000;

export function validateImportCsv(csv: string): { rows: number } {
  if (new TextEncoder().encode(csv).byteLength > MAX_IMPORT_BYTES) throw new Error('CSV is too large (maximum 2 MB).');
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error('CSV needs a header and at least one transaction.');
  const headers = rows[0]!.map((header) => header.trim().toLowerCase());
  const required = ['date', 'description', 'amount', 'type'];
  if (required.some((header) => !headers.includes(header))) throw new Error('CSV needs date, description, amount, and type columns.');
  const dateIndex = headers.indexOf('date');
  const descriptionIndex = headers.indexOf('description');
  const amountIndex = headers.indexOf('amount');
  const typeIndex = headers.indexOf('type');
  rows.slice(1).forEach((values, index) => {
    const row = index + 2;
    const date = values[dateIndex] ?? '';
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new Error(`Row ${row} has an invalid date.`);
    if (!values[descriptionIndex] || values[descriptionIndex]!.length > 500) throw new Error(`Row ${row} has an invalid description.`);
    const amount = Number((values[amountIndex] ?? '').replace(/[₹,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Row ${row} has an invalid amount.`);
    if (values[typeIndex] !== 'income' && values[typeIndex] !== 'expense') throw new Error(`Row ${row} must be income or expense.`);
  });
  return { rows: rows.length - 1 };
}