import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_LIMITS,
  safeFilename,
  safeSheetName,
  validatePdfSpec,
  validateWorkbookSpec,
} from '../src/lib/export-spec';

const columns = [{ header: 'LRN' }, { header: 'Learner' }];
const rows = [['136001200001', 'Dela Cruz, Althea S.']];

test('filenames cannot escape the download directory', () => {
  assert.equal(safeFilename('../../etc/passwd', 'xlsx'), 'etc-passwd.xlsx');
  assert.equal(safeFilename('SF2 Grade 5 - Mabini', 'xlsx'), 'SF2-Grade-5-Mabini.xlsx');
  assert.equal(safeFilename('report.pdf', 'pdf'), 'report.pdf');
  assert.equal(safeFilename('', 'pdf'), 'export.pdf');
  assert.equal(safeFilename('...', 'xlsx'), 'export.xlsx');
  assert.ok(!safeFilename('a"; rm -rf /', 'xlsx').includes('"'));
});

test('sheet names are sanitised for Excel', () => {
  assert.equal(safeSheetName('Grade 5 - Mabini'), 'Grade 5 - Mabini');
  assert.equal(safeSheetName('SY 2025/2026 [Q1]'), 'SY 2025 2026  Q1');
  assert.equal(safeSheetName(''), 'Sheet1');
  assert.ok(safeSheetName('x'.repeat(50)).length <= 31);
});

test('valid specs pass validation', () => {
  assert.equal(
    validateWorkbookSpec({ filename: 'f', title: 'T', sheets: [{ name: 'S', columns, rows }] }),
    null,
  );
  assert.equal(validatePdfSpec({ filename: 'f', title: 'T', columns, rows }), null);
});

test('workbook validation rejects malformed input', () => {
  assert.ok(validateWorkbookSpec(null));
  assert.ok(validateWorkbookSpec({ title: 'T', sheets: [] }));
  assert.ok(validateWorkbookSpec({ title: 'T', sheets: [{ name: '', columns, rows }] }));
  assert.ok(validateWorkbookSpec({ title: 'T', sheets: [{ name: 'S', columns: [], rows }] }));
  assert.ok(
    validateWorkbookSpec({ title: 'T', sheets: [{ name: 'S', columns, rows: 'nope' }] }),
  );
  assert.ok(
    validateWorkbookSpec({
      title: 'T',
      sheets: [{ name: 'S', columns, rows: [[{ nested: true }, 'x']] }],
    }),
    'object cells are rejected',
  );
});

test('limits bound every dimension', () => {
  const many = Array.from({ length: EXPORT_LIMITS.sheets + 1 }, (_, i) => ({
    name: `S${i}`,
    columns,
    rows,
  }));
  assert.ok(validateWorkbookSpec({ title: 'T', sheets: many }));

  const tooManyRows = Array.from({ length: EXPORT_LIMITS.rows + 1 }, () => ['a', 'b']);
  assert.ok(validateWorkbookSpec({ title: 'T', sheets: [{ name: 'S', columns, rows: tooManyRows }] }));

  const wideColumns = Array.from({ length: EXPORT_LIMITS.columns + 1 }, () => ({ header: 'c' }));
  assert.ok(validateWorkbookSpec({ title: 'T', sheets: [{ name: 'S', columns: wideColumns, rows: [] }] }));

  const longCell = [['x'.repeat(EXPORT_LIMITS.cellChars + 1), 'y']];
  assert.ok(validateWorkbookSpec({ title: 'T', sheets: [{ name: 'S', columns, rows: longCell }] }));

  assert.ok(validatePdfSpec({ title: 'x'.repeat(EXPORT_LIMITS.titleChars + 1), columns, rows }));
});

test('pdf image payloads are restricted to inline PNG/JPEG', () => {
  const base = { filename: 'card', title: 'e-ID', columns: [], rows: [], tableOptional: true };
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(validatePdfSpec({ ...base, images: [{ dataUrl: png, width: 190 }] }), null);
  // A portrait alongside the QR is the ID-card case.
  assert.equal(
    validatePdfSpec({ ...base, images: [{ dataUrl: png, width: 130 }, { dataUrl: png, width: 170 }] }),
    null,
  );

  assert.ok(validatePdfSpec({ ...base, images: [{ dataUrl: 'https://example.com/qr.png' }] }));
  assert.ok(validatePdfSpec({ ...base, images: [{ dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }] }));
  assert.ok(validatePdfSpec({ ...base, images: [{ dataUrl: png, width: 9000 }] }));
  assert.ok(
    validatePdfSpec({
      ...base,
      images: [{ dataUrl: `data:image/png;base64,${'A'.repeat(EXPORT_LIMITS.imageBytes)}` }],
    }),
  );
  assert.ok(
    validatePdfSpec({
      ...base,
      images: Array.from({ length: EXPORT_LIMITS.images + 1 }, () => ({ dataUrl: png })),
    }),
    'too many images are rejected',
  );
});

test('a table is still required when the document is not an image card', () => {
  assert.ok(validatePdfSpec({ filename: 'x', title: 'T', columns: [], rows: [] }));
  assert.equal(
    validatePdfSpec({
      filename: 'x',
      title: 'T',
      columns: [],
      rows: [],
      tableOptional: true,
      images: [{ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }],
    }),
    null,
  );
});

test('orientation is constrained', () => {
  assert.equal(validatePdfSpec({ title: 'T', columns, rows, orientation: 'landscape' }), null);
  assert.ok(validatePdfSpec({ title: 'T', columns, rows, orientation: 'sideways' }));
});
