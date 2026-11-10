/**
 * Utility for exporting reporting datasets to CSV.
 * Strict Excel compatibility:
 * 1. Prepends UTF-8 BOM (\uFEFF) so Excel respects UTF-8 without mojibake.
 * 2. Formats all monetary values as two-decimal numbers without floating-point math.
 * 3. Proper RFC-4180 CSV escaping for quotes, commas, and newlines.
 */

export function centsToDecimalString(cents: number | bigint): string {
  const n = Number(cents);
  const isNegative = n < 0;
  const abs = Math.abs(n);
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  const fracStr = fraction < 10 ? `0${fraction}` : `${fraction}`;
  return `${isNegative ? '-' : ''}${rupees}.${fracStr}`;
}

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
  isMoneyCents?: boolean;
}

export function generateCsvString<T>(
  data: T[],
  columns: CsvColumn<T>[]
): string {
  const escapeCell = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = columns.map((col) => escapeCell(col.header)).join(',');
  const rowLines = data.map((row) =>
    columns
      .map((col) => {
        const raw = col.accessor(row);
        if (col.isMoneyCents && (typeof raw === 'number' || typeof raw === 'bigint')) {
          return escapeCell(centsToDecimalString(raw));
        }
        return escapeCell(raw);
      })
      .join(',')
  );

  // Return with UTF-8 BOM
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
}

export function downloadCsv<T>(
  filename: string,
  data: T[],
  columns: CsvColumn<T>[]
): void {
  const csvContent = generateCsvString(data, columns);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCsv<T extends Record<string, unknown>>(
  filename: string,
  headers: { key: keyof T | string; label: string }[],
  rows: T[]
): void {
  const columns: CsvColumn<T>[] = headers.map((h) => ({
    header: h.label,
    accessor: (row) => (row as Record<string, unknown>)[h.key as string] as string | number | null | undefined,
  }));
  downloadCsv(filename, rows, columns);
}

