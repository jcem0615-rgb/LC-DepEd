import test from 'node:test';
import assert from 'node:assert/strict';
import {
  batchFingerprint,
  LIS_COLUMNS,
  maskLrnForTransit,
  toLisRow,
  validateBatch,
  type LisBatchInput,
  type LisLearnerInput,
} from '../src/lib/lis';

const NOW = new Date('2026-09-22T00:00:00Z');

const good = (over: Partial<LisLearnerInput> = {}): LisLearnerInput => ({
  lrn: '136001200001',
  lastName: 'Dela Cruz',
  firstName: 'Althea',
  middleName: 'Santos',
  sex: 'F',
  birthDate: '2014-08-21',
  gradeLevel: 5,
  section: 'Grade 5 - Mabini',
  guardianName: 'Rosalinda Dela Cruz',
  guardianContact: '09171234567',
  ...over,
});

const batch = (rows: LisLearnerInput[]): LisBatchInput => ({
  schoolId: '136001',
  schoolName: 'Lagro Central Elementary School',
  schoolYear: '2025-2026',
  submittedBy: 'usr-head',
  rows,
});

test('a clean batch is accepted in full', () => {
  const result = validateBatch(batch([good(), good({ lrn: '136001200002', sex: 'M' })]), NOW);
  assert.equal(result.status, 'validated');
  assert.equal(result.accepted, 2);
  assert.equal(result.rejected, 0);
  assert.deepEqual(result.findings, []);
});

test('each LIS rule rejects the row it governs', () => {
  const cases: [Partial<LisLearnerInput>, string][] = [
    [{ lrn: '12345' }, 'lrn_format'],
    [{ lastName: '' }, 'missing_name'],
    [{ firstName: '   ' }, 'missing_name'],
    [{ sex: 'X' }, 'sex_invalid'],
    [{ birthDate: 'not-a-date' }, 'birth_date_invalid'],
    [{ birthDate: '2030-01-01' }, 'birth_date_invalid'],
    [{ birthDate: '1980-01-01' }, 'age_implausible'],
    [{ birthDate: '2024-01-01' }, 'age_implausible'],
    [{ gradeLevel: 0 }, 'grade_range'],
    [{ gradeLevel: 13 }, 'grade_range'],
    [{ section: '' }, 'missing_section'],
    [{ guardianName: '' }, 'missing_guardian'],
    [{ guardianContact: '12345' }, 'contact_format'],
  ];
  for (const [over, code] of cases) {
    const result = validateBatch(batch([good(over)]), NOW);
    assert.equal(result.status, 'rejected', `${code} should reject the batch`);
    assert.ok(result.rows[0].errors.includes(code as never), `expected ${code}`);
  }
});

test('valid Philippine mobile formats are accepted', () => {
  for (const contact of ['09171234567', '+639171234567', '0917 123 4567', '0917-123-4567']) {
    const result = validateBatch(batch([good({ guardianContact: contact })]), NOW);
    assert.equal(result.accepted, 1, `expected ${contact} to pass`);
  }
});

test('duplicate LRNs inside a batch are both rejected', () => {
  const result = validateBatch(batch([good(), good()]), NOW);
  assert.equal(result.accepted, 0);
  assert.ok(result.rows.every((r) => r.errors.includes('lrn_duplicate')));
});

test('a mixed batch is partially accepted and the good rows still go', () => {
  const result = validateBatch(
    batch([good(), good({ lrn: '136001200003', sex: 'X' }), good({ lrn: '136001200004' })]),
    NOW,
  );
  assert.equal(result.status, 'partially_accepted');
  assert.equal(result.accepted, 2);
  assert.equal(result.rejected, 1);
});

test('findings summarise the rules that failed, most common first', () => {
  const result = validateBatch(
    batch([
      good({ lrn: '136001200005', section: '' }),
      good({ lrn: '136001200006', section: '' }),
      good({ lrn: '136001200007', sex: 'Z' }),
    ]),
    NOW,
  );
  assert.equal(result.findings[0].code, 'missing_section');
  assert.equal(result.findings[0].count, 2);
  assert.ok(result.findings[0].message.length > 0);
});

test('the fingerprint is stable across row order and changes with the data', async () => {
  const a = await batchFingerprint(batch([good(), good({ lrn: '136001200002' })]));
  const b = await batchFingerprint(batch([good({ lrn: '136001200002' }), good()]));
  assert.equal(a, b, 'row order must not change the fingerprint');

  const c = await batchFingerprint(batch([good({ section: 'Grade 5 - Rizal' })]));
  assert.notEqual(a, c, 'changed enrolment data must change the fingerprint');
});

test('LRNs are masked before they leave the school tenant', () => {
  assert.equal(maskLrnForTransit('136001200001'), '136••••••001');
  assert.equal(maskLrnForTransit('nope'), '••••••••••••');
});

test('the upload row matches the LIS template column order', () => {
  const row = toLisRow(good());
  assert.equal(row.length, LIS_COLUMNS.length);
  assert.equal(row[0], '136001200001');
  assert.equal(row[LIS_COLUMNS.indexOf('SECTION')], 'Grade 5 - Mabini');
  assert.equal(row[LIS_COLUMNS.indexOf('CONTACT NUMBER')], '09171234567');
});
