'use client';

/** CSV (Excel-compatible) export and browser print-to-PDF helpers. */

export type CsvCell = string | number | boolean | null | undefined;

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const escape = (cell: CsvCell) => {
    const value = cell === null || cell === undefined ? '' : String(cell);
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  // BOM keeps Excel happy with UTF-8 (ñ, é) in learner names.
  const blob = new Blob(['﻿' + toCsv(headers, rows)], {
    type: 'text/csv;charset=utf-8;',
  });
  downloadBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Opens the browser print dialog scoped to one element. Users pick
 * "Save as PDF" to produce the signed form copy.
 */
export function printSection(elementId: string): void {
  const node = document.getElementById(elementId);
  if (!node) return;
  document.body.classList.add('printing');
  node.classList.add('print-target');
  const cleanup = () => {
    document.body.classList.remove('printing');
    node.classList.remove('print-target');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  // Safari does not always fire afterprint.
  setTimeout(cleanup, 3000);
}
