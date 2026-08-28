export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;
  let atFieldStart = true;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        field += character;
      }
    } else if (afterQuote) {
      if (character === ',') {
        row.push(field.trim());
        field = '';
        afterQuote = false;
        atFieldStart = true;
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && csv[index + 1] === '\n') index += 1;
        row.push(field.trim());
        if (row.some((value) => value)) rows.push(row);
        row = [];
        field = '';
        afterQuote = false;
        atFieldStart = true;
      } else {
        throw new Error('Malformed CSV quote');
      }
    } else if (character === '"' && atFieldStart) {
      quoted = true;
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
      atFieldStart = true;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some((value) => value)) rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
    } else {
      field += character;
      atFieldStart = false;
    }
  }

  if (quoted) throw new Error('Malformed CSV quote');
  if (field || row.length || afterQuote) {
    row.push(field.trim());
    if (row.some((value) => value)) rows.push(row);
  }
  return rows;
}