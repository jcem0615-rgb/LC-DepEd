/**
 * POST /api/export/pdf — renders a PdfSpec into a paginated PDF.
 *
 * Uses PDFKit rather than a headless browser: no Chromium in the deployment,
 * deterministic output, and it runs in any Node runtime. Like the XLSX route
 * it is stateless and formats only the payload it is handed.
 */
import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import {
  safeFilename,
  validatePdfSpec,
  type CellValue,
  type ColumnSpec,
  type PdfSpec,
} from '@/lib/export-spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A full-division roster can take a few seconds to render; the platform default
// of 10s is tight for the largest exports.
export const maxDuration = 30;

const MAX_BODY_BYTES = 4_000_000;

const INK = '#0f172a';
const MUTED = '#64748b';
const BRAND = '#1743e1';
const RULE = '#cbd5e1';

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

  const invalid = validatePdfSpec(parsed);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const spec = parsed as PdfSpec;
  const pdf = await render(spec);
  const filename = safeFilename(spec.filename || spec.title, 'pdf');

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}

function render(spec: PdfSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const landscape = spec.orientation === 'landscape';
    const doc = new PDFDocument({
      size: 'A4',
      layout: landscape ? 'landscape' : 'portrait',
      margins: { top: 40, bottom: 48, left: 40, right: 40 },
      info: { Title: spec.title, Author: 'LC-DepEd', Creator: 'LC-DepEd' },
      autoFirstPage: true,
      // Keep every page addressable so the footer pass can number them.
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      draw(doc, spec);
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

type Doc = InstanceType<typeof PDFDocument>;

function draw(doc: Doc, spec: PdfSpec) {
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // ---- Header -------------------------------------------------------
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text('Republic of the Philippines • Department of Education', { align: 'center' });

  if (spec.code) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND).text(spec.code, { align: 'center' });
  }

  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(spec.title, { align: 'center' });

  if (spec.school) {
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(spec.school, { align: 'center' });
  }
  if (spec.subtitle) {
    doc.moveDown(0.15);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(spec.subtitle, { align: 'center' });
  }

  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(left + usable, doc.y).lineWidth(1).strokeColor(RULE).stroke();
  doc.moveDown(0.6);

  // ---- Meta block ---------------------------------------------------
  if (spec.meta?.length) {
    const columnWidth = usable / 2;
    let column = 0;
    let rowTop = doc.y;
    for (const item of spec.meta) {
      const x = left + column * columnWidth;
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`${item.label}: `, x, rowTop, {
        continued: true,
        width: columnWidth - 8,
      });
      doc.font('Helvetica-Bold').fillColor(INK).text(item.value);
      if (column === 1) rowTop = doc.y;
      else rowTop = Math.max(rowTop, doc.y - doc.currentLineHeight());
      column = column === 0 ? 1 : 0;
      if (column === 0) rowTop = doc.y;
    }
    doc.y = rowTop;
    doc.moveDown(0.6);
  }

  // ---- Optional images (learner portrait, QR e-ID) ------------------
  if (spec.images?.length) {
    const rendered = spec.images.map((image) => ({
      buffer: Buffer.from(image.dataUrl.slice(image.dataUrl.indexOf(',') + 1), 'base64'),
      width: Math.min(image.width ?? 170, usable),
      caption: image.caption,
    }));
    const gap = rendered.length > 1 ? 24 : 0;
    const totalWidth = rendered.reduce((sum, r) => sum + r.width, 0) + gap * (rendered.length - 1);
    const scale = totalWidth > usable ? usable / totalWidth : 1;

    const top = doc.y;
    let x = left + (usable - totalWidth * scale) / 2;
    let tallest = 0;
    for (const item of rendered) {
      const width = item.width * scale;
      doc.image(item.buffer, x, top, { width });
      // PDFKit advances doc.y to the bottom of the image it just drew.
      tallest = Math.max(tallest, doc.y - top);
      doc.y = top;
      x += width + gap * scale;
    }
    doc.y = top + tallest + 8;

    const caption = spec.imageCaption ?? rendered.find((r) => r.caption)?.caption;
    if (caption) {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(caption, left, doc.y, {
        width: usable,
        align: 'center',
      });
      doc.moveDown(0.5);
    }
  }

  if (!spec.rows.length && spec.tableOptional) {
    drawNotesAndSignatures(doc, spec, left, usable);
    stampFooters(doc, spec, left, usable);
    return;
  }

  // ---- Table --------------------------------------------------------
  const widths = columnWidths(spec.columns, spec.rows, usable);
  const headerHeight = 20;

  const drawHeader = () => {
    const top = doc.y;
    doc.rect(left, top, usable, headerHeight).fill(BRAND);
    let x = left;
    spec.columns.forEach((column, i) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#ffffff')
        .text(column.header, x + 4, top + 6, {
          width: widths[i] - 8,
          align: column.align ?? 'left',
          ellipsis: true,
          lineBreak: false,
        });
      x += widths[i];
    });
    doc.y = top + headerHeight;
  };

  drawHeader();

  const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;

  const drawRow = (values: CellValue[], bold = false, shaded = false) => {
    const heights = values.map((value, i) => {
      const text = cellText(value);
      return doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).heightOfString(text, {
        width: (widths[i] ?? 40) - 8,
      });
    });
    const rowHeight = Math.max(16, Math.max(0, ...heights) + 8);

    if (doc.y + rowHeight > bottomLimit) {
      doc.addPage();
      drawHeader();
    }

    const top = doc.y;
    if (shaded) doc.rect(left, top, usable, rowHeight).fill('#f1f5f9');

    let x = left;
    spec.columns.forEach((column, i) => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .fillColor(INK)
        .text(cellText(values[i]), x + 4, top + 4, {
          width: widths[i] - 8,
          align: column.align ?? (typeof values[i] === 'number' ? 'right' : 'left'),
          ellipsis: true,
        });
      x += widths[i];
    });

    doc
      .moveTo(left, top + rowHeight)
      .lineTo(left + usable, top + rowHeight)
      .lineWidth(0.5)
      .strokeColor('#e2e8f0')
      .stroke();
    doc.y = top + rowHeight;
  };

  for (const row of spec.rows) drawRow(row);
  if (spec.totals?.length) drawRow(spec.totals, true, true);

  drawNotesAndSignatures(doc, spec, left, usable);
  stampFooters(doc, spec, left, usable);
}

function drawNotesAndSignatures(doc: Doc, spec: PdfSpec, left: number, usable: number) {
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;

  if (spec.notes?.length) {
    doc.moveDown(0.8);
    for (const note of spec.notes) {
      if (doc.y > bottomLimit - 14) doc.addPage();
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(note, left, doc.y, { width: usable });
      doc.moveDown(0.2);
    }
  }

  if (spec.signatures?.length) {
    if (doc.y + 60 > bottomLimit) doc.addPage();
    doc.moveDown(2.2);
    const slot = usable / spec.signatures.length;
    const lineY = doc.y;
    spec.signatures.forEach((label, i) => {
      const x = left + i * slot;
      doc.moveTo(x, lineY).lineTo(x + slot - 24, lineY).lineWidth(0.8).strokeColor('#94a3b8').stroke();
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label, x, lineY + 4, { width: slot - 24 });
    });
    doc.y = lineY + 20;
  }
}

function stampFooters(doc: Doc, spec: PdfSpec, left: number, usable: number) {
  const range = doc.bufferedPageRange();
  const footer = spec.footer ?? 'Generated by LC-DepEd';
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Writing below the bottom margin would trigger PDFKit's automatic page
    // break and append a blank page, so drop the margin for the footer pass.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        `${footer}  •  Page ${i - range.start + 1} of ${range.count}`,
        left,
        doc.page.height - bottom + 14,
        { width: usable, align: 'center', lineBreak: false },
      );
    doc.page.margins.bottom = bottom;
  }
  doc.flushPages();
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** Proportional widths driven by the longest content in each column. */
function columnWidths(columns: ColumnSpec[], rows: CellValue[][], usable: number): number[] {
  const weights = columns.map((column, i) => {
    const longest = Math.max(
      column.header.length,
      ...rows.slice(0, 200).map((row) => cellText(row[i]).length),
    );
    return Math.min(38, Math.max(6, longest));
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((w) => (w / total) * usable);
}
