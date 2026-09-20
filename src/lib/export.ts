'use client';

/**
 * Export helpers.
 *
 * XLSX and PDF are rendered server-side (/api/export/*) so the portals get real
 * Office and PDF documents without shipping a megabyte of formatting code to a
 * phone on 3G. Offline — or if the endpoint is unreachable — each helper falls
 * back to something that works on-device: CSV for spreadsheets, the browser's
 * print dialog for PDFs.
 */
import type { PdfSpec, WorkbookSpec } from './export-spec';

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

/* ------------------------------------------------------------------ */
/* Server-rendered XLSX / PDF with on-device fallbacks                  */
/* ------------------------------------------------------------------ */

export type XlsxOutcome = 'xlsx' | 'csv';
export type PdfOutcome = 'pdf' | 'print';

async function postForFile(endpoint: string, spec: unknown): Promise<Blob | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
    });
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/**
 * Downloads a real .xlsx workbook. Falls back to CSV of the first sheet when
 * the device is offline or the endpoint cannot be reached.
 */
export async function downloadXlsx(spec: WorkbookSpec): Promise<XlsxOutcome> {
  const blob = await postForFile('/api/export/xlsx', spec);
  const name = spec.filename || spec.title || 'export';
  if (blob) {
    downloadBlob(blob, name.endsWith('.xlsx') ? name : `${name}.xlsx`);
    return 'xlsx';
  }
  const sheet = spec.sheets[0];
  downloadCsv(
    name.replace(/\.xlsx$/i, ''),
    sheet.columns.map((c) => c.header),
    sheet.totals ? [...sheet.rows, sheet.totals] : sheet.rows,
  );
  return 'csv';
}

/**
 * Downloads a server-rendered PDF. Falls back to the browser print dialog
 * (scoped to `fallbackElementId`, when given) if the endpoint is unavailable.
 */
export async function downloadPdf(
  spec: PdfSpec,
  fallbackElementId?: string,
): Promise<PdfOutcome> {
  const blob = await postForFile('/api/export/pdf', spec);
  if (blob) {
    const name = spec.filename || spec.title || 'document';
    downloadBlob(blob, name.endsWith('.pdf') ? name : `${name}.pdf`);
    return 'pdf';
  }
  if (fallbackElementId) printSection(fallbackElementId);
  return 'print';
}

/** Single-sheet convenience wrapper. */
export function workbook(
  filename: string,
  title: string,
  headers: string[],
  rows: CsvCell[][],
  options: {
    subtitle?: string;
    sheetName?: string;
    meta?: { label: string; value: string }[];
    totals?: CsvCell[];
    notes?: string[];
  } = {},
): WorkbookSpec {
  return {
    filename,
    title,
    subtitle: options.subtitle,
    sheets: [
      {
        name: options.sheetName ?? title.slice(0, 31),
        columns: headers.map((header) => ({ header })),
        rows: rows.map((row) => row.map((cell) => cell ?? null)),
        meta: options.meta,
        totals: options.totals?.map((cell) => cell ?? null),
        notes: options.notes,
      },
    ],
  };
}
