/**
 * POST /api/export/xlsx — renders a WorkbookSpec into a real .xlsx workbook.
 *
 * The route is stateless: it formats the payload it is given and never reads
 * the database, so it cannot widen anyone's access to learner data. A
 * production deployment puts the session check in front of it and records the
 * export in the audit trail (the portals already log the export action).
 */
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import {
  safeFilename,
  safeSheetName,
  validateWorkbookSpec,
  type WorkbookSpec,
} from '@/lib/export-spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BRAND = 'FF1743E1';
const MAX_BODY_BYTES = 4_000_000;

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Export payload is too large.' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const invalid = validateWorkbookSpec(parsed);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const spec = parsed as WorkbookSpec;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LC-DepEd';
  workbook.created = new Date();
  workbook.title = spec.title;

  const usedNames = new Set<string>();

  for (const [index, sheet] of spec.sheets.entries()) {
    let name = safeSheetName(sheet.name, `Sheet${index + 1}`);
    while (usedNames.has(name.toLowerCase())) name = safeSheetName(`${name}-${index + 1}`);
    usedNames.add(name.toLowerCase());

    const ws = workbook.addWorksheet(name, {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const width = sheet.columns.length;
    const lastCol = String.fromCharCode(64 + Math.min(width, 26));

    // Title block
    const titleRow = ws.addRow([spec.title]);
    titleRow.font = { bold: true, size: 14 };
    if (width > 1) ws.mergeCells(`A${titleRow.number}:${lastCol}${titleRow.number}`);

    if (spec.subtitle) {
      const subtitleRow = ws.addRow([spec.subtitle]);
      subtitleRow.font = { size: 10, color: { argb: 'FF64748B' } };
      if (width > 1) ws.mergeCells(`A${subtitleRow.number}:${lastCol}${subtitleRow.number}`);
    }

    for (const meta of sheet.meta ?? []) {
      const row = ws.addRow([`${meta.label}:`, meta.value]);
      row.getCell(1).font = { bold: true, size: 10 };
      row.getCell(2).font = { size: 10 };
    }

    ws.addRow([]);

    // Header
    const header = ws.addRow(sheet.columns.map((c) => c.header));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    header.height = 22;
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    // Body
    for (const values of sheet.rows) {
      const row = ws.addRow(values);
      row.eachCell((cell, colNumber) => {
        const column = sheet.columns[colNumber - 1];
        cell.font = { size: 10 };
        cell.alignment = { horizontal: column?.align ?? (typeof cell.value === 'number' ? 'right' : 'left') };
        if (column?.percent && typeof cell.value === 'number') cell.numFmt = '0.0"%"';
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
      });
    }

    if (sheet.totals?.length) {
      const totals = ws.addRow(sheet.totals);
      totals.font = { bold: true, size: 10 };
      totals.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      });
    }

    for (const note of sheet.notes ?? []) {
      const row = ws.addRow([note]);
      row.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
      if (width > 1) ws.mergeCells(`A${row.number}:${lastCol}${row.number}`);
    }

    // Column widths: explicit, else sized to the longest value in the column.
    ws.columns.forEach((column, i) => {
      const spec = sheet.columns[i];
      if (spec?.width) {
        column.width = spec.width;
        return;
      }
      const longest = Math.max(
        spec?.header.length ?? 8,
        ...sheet.rows.map((row) => String(row[i] ?? '').length),
      );
      column.width = Math.min(46, Math.max(10, longest + 2));
    });

    // Freeze the header so long rosters stay readable while scrolling.
    ws.views = [{ state: 'frozen', ySplit: header.number }];
    ws.autoFilter = {
      from: { row: header.number, column: 1 },
      to: { row: header.number, column: width },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = safeFilename(spec.filename || spec.title, 'xlsx');

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String((buffer as ArrayBuffer).byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
