/**
 * Shared contract between the portals and the export endpoints.
 *
 * The client builds the spec from data it already holds; the server only
 * formats it. The export routes never read the database, so generating a
 * workbook or a PDF grants the server no access it did not already have.
 */

export type CellValue = string | number | boolean | null;

export type Align = 'left' | 'center' | 'right';

export interface ColumnSpec {
  header: string;
  width?: number;
  align?: Align;
  /** Renders as a percentage column in XLSX (value is 0-100). */
  percent?: boolean;
}

export interface MetaRow {
  label: string;
  value: string;
}

export interface SheetSpec {
  name: string;
  columns: ColumnSpec[];
  rows: CellValue[][];
  /** Key/value block printed above the table (school, section, period…). */
  meta?: MetaRow[];
  /** Bold summary row appended under the table. */
  totals?: CellValue[];
  notes?: string[];
}

export interface WorkbookSpec {
  filename: string;
  title: string;
  subtitle?: string;
  sheets: SheetSpec[];
}

export interface PdfImage {
  /** data:image/png;base64,… or data:image/jpeg;base64,… */
  dataUrl: string;
  /** Rendered width in points (the height follows the aspect ratio). */
  width?: number;
  caption?: string;
}

export interface PdfSpec {
  filename: string;
  /** Form code such as "SF2" — printed above the title. */
  code?: string;
  title: string;
  subtitle?: string;
  school?: string;
  meta?: MetaRow[];
  columns: ColumnSpec[];
  rows: CellValue[][];
  totals?: CellValue[];
  notes?: string[];
  /** Centred images printed between the meta block and the table (portrait, QR). */
  images?: PdfImage[];
  /** Caption printed under the image row. */
  imageCaption?: string;
  /** Signature lines printed at the end, e.g. ["Class adviser", "School head"]. */
  signatures?: string[];
  /** Set when the document is an image/notes card rather than a table. */
  tableOptional?: boolean;
  orientation?: 'portrait' | 'landscape';
  footer?: string;
}

/* ------------------------------------------------------------------ */
/* Limits — these endpoints accept unauthenticated input in the demo,   */
/* so every dimension is bounded before any rendering work starts.      */
/* ------------------------------------------------------------------ */

export const EXPORT_LIMITS = {
  sheets: 12,
  rows: 5000,
  columns: 40,
  cellChars: 1000,
  notes: 20,
  signatures: 6,
  metaRows: 20,
  titleChars: 200,
  imageBytes: 400_000,
  images: 2,
} as const;

/** Strips anything that could escape the download filename. */
export function safeFilename(name: string, extension: string): string {
  const base = (name || 'export')
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  const stem = base || 'export';
  return stem.toLowerCase().endsWith(`.${extension}`) ? stem : `${stem}.${extension}`;
}

function isCell(value: unknown): value is CellValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function validateTable(
  columns: unknown,
  rows: unknown,
  label: string,
): string | null {
  if (!Array.isArray(columns) || columns.length === 0) return `${label}: columns are required.`;
  if (columns.length > EXPORT_LIMITS.columns) {
    return `${label}: too many columns (max ${EXPORT_LIMITS.columns}).`;
  }
  for (const column of columns) {
    if (!column || typeof (column as ColumnSpec).header !== 'string') {
      return `${label}: every column needs a header.`;
    }
    if ((column as ColumnSpec).header.length > EXPORT_LIMITS.cellChars) {
      return `${label}: column header is too long.`;
    }
  }
  if (!Array.isArray(rows)) return `${label}: rows must be an array.`;
  if (rows.length > EXPORT_LIMITS.rows) {
    return `${label}: too many rows (max ${EXPORT_LIMITS.rows}).`;
  }
  for (const row of rows) {
    if (!Array.isArray(row)) return `${label}: every row must be an array.`;
    if (row.length > EXPORT_LIMITS.columns) return `${label}: a row has too many cells.`;
    for (const cell of row) {
      if (!isCell(cell)) return `${label}: unsupported cell value.`;
      if (typeof cell === 'string' && cell.length > EXPORT_LIMITS.cellChars) {
        return `${label}: a cell value is too long.`;
      }
    }
  }
  return null;
}

export function validateWorkbookSpec(input: unknown): string | null {
  const spec = input as WorkbookSpec | null;
  if (!spec || typeof spec !== 'object') return 'A workbook spec is required.';
  if (typeof spec.title !== 'string' || spec.title.length > EXPORT_LIMITS.titleChars) {
    return 'A title of at most 200 characters is required.';
  }
  if (!Array.isArray(spec.sheets) || spec.sheets.length === 0) return 'At least one sheet is required.';
  if (spec.sheets.length > EXPORT_LIMITS.sheets) {
    return `Too many sheets (max ${EXPORT_LIMITS.sheets}).`;
  }
  for (const sheet of spec.sheets) {
    if (!sheet || typeof sheet.name !== 'string' || !sheet.name.trim()) {
      return 'Every sheet needs a name.';
    }
    if (sheet.meta && (!Array.isArray(sheet.meta) || sheet.meta.length > EXPORT_LIMITS.metaRows)) {
      return 'Too many meta rows.';
    }
    if (sheet.notes && (!Array.isArray(sheet.notes) || sheet.notes.length > EXPORT_LIMITS.notes)) {
      return 'Too many notes.';
    }
    const error = validateTable(sheet.columns, sheet.rows, `Sheet "${sheet.name}"`);
    if (error) return error;
  }
  return null;
}

export function validatePdfSpec(input: unknown): string | null {
  const spec = input as PdfSpec | null;
  if (!spec || typeof spec !== 'object') return 'A document spec is required.';
  if (typeof spec.title !== 'string' || spec.title.length > EXPORT_LIMITS.titleChars) {
    return 'A title of at most 200 characters is required.';
  }
  if (spec.orientation && spec.orientation !== 'portrait' && spec.orientation !== 'landscape') {
    return 'Orientation must be portrait or landscape.';
  }
  if (spec.signatures && (!Array.isArray(spec.signatures) || spec.signatures.length > EXPORT_LIMITS.signatures)) {
    return 'Too many signature lines.';
  }
  if (spec.meta && (!Array.isArray(spec.meta) || spec.meta.length > EXPORT_LIMITS.metaRows)) {
    return 'Too many meta rows.';
  }
  if (spec.notes && (!Array.isArray(spec.notes) || spec.notes.length > EXPORT_LIMITS.notes)) {
    return 'Too many notes.';
  }
  if (spec.images) {
    if (!Array.isArray(spec.images) || spec.images.length > EXPORT_LIMITS.images) {
      return `At most ${EXPORT_LIMITS.images} images are allowed.`;
    }
    for (const image of spec.images) {
      const error = validateImage(image);
      if (error) return error;
    }
    // An image card may legitimately carry no table.
    if (spec.tableOptional) return null;
  }
  return validateTable(spec.columns, spec.rows, 'Document');
}

function validateImage(image: unknown): string | null {
  const img = image as PdfImage;
  if (!img || typeof img.dataUrl !== 'string') return 'Image must carry a data URL.';
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(img.dataUrl)) {
    return 'Only base64 PNG or JPEG data URLs are accepted.';
  }
  if (img.dataUrl.length > EXPORT_LIMITS.imageBytes) return 'Image is too large.';
  if (img.width !== undefined && (typeof img.width !== 'number' || img.width <= 0 || img.width > 600)) {
    return 'Image width must be between 1 and 600 points.';
  }
  return null;
}

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 characters. */
export function safeSheetName(name: string, fallback = 'Sheet1'): string {
  const cleaned = (name || '').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return cleaned || fallback;
}
