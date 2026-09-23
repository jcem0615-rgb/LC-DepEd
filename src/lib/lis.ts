/**
 * DepEd Learner Information System (LIS) transmittal.
 *
 * The LIS has no public API: schools transact with it through the portal and
 * its spreadsheet templates. So this module does the part that is ours to do —
 * turn local learner records into a validated, idempotent transmittal batch —
 * and stops at a documented adapter where a DepEd endpoint would receive it.
 *
 * The rules below mirror the checks the LIS applies on upload, so a batch that
 * passes here is one the portal will accept.
 */

export interface LisLearnerInput {
  lrn: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  sex: string;
  birthDate: string;
  gradeLevel: number;
  section: string;
  guardianName?: string;
  guardianContact?: string;
  motherTongue?: string;
  address?: string;
}

export interface LisBatchInput {
  schoolId: string;
  schoolName: string;
  schoolYear: string;
  submittedBy: string;
  rows: LisLearnerInput[];
}

export type LisRuleCode =
  | 'lrn_format'
  | 'lrn_duplicate'
  | 'missing_name'
  | 'sex_invalid'
  | 'birth_date_invalid'
  | 'age_implausible'
  | 'grade_range'
  | 'missing_section'
  | 'missing_guardian'
  | 'contact_format';

export const LIS_RULES: Record<LisRuleCode, string> = {
  lrn_format: 'LRN must be exactly 12 digits',
  lrn_duplicate: 'LRN appears more than once in this batch',
  missing_name: 'Last name and first name are required',
  sex_invalid: 'Sex must be M or F',
  birth_date_invalid: 'Birth date must be a valid date in the past',
  age_implausible: 'Age on record is outside the range the LIS accepts (4-25)',
  grade_range: 'Grade level must be between 1 and 12',
  missing_section: 'Section is required',
  missing_guardian: 'Parent or guardian name is required',
  contact_format: 'Contact must be a Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)',
};

export interface LisRowResult {
  lrn: string;
  accepted: boolean;
  errors: LisRuleCode[];
}

export interface LisValidation {
  rows: LisRowResult[];
  accepted: number;
  rejected: number;
  status: 'validated' | 'partially_accepted' | 'rejected';
  findings: { code: LisRuleCode; message: string; count: number }[];
}

const MOBILE = /^(09\d{9}|\+639\d{9})$/;

function ageOn(birthDate: string, at: Date): number {
  const born = new Date(birthDate);
  let age = at.getFullYear() - born.getFullYear();
  const monthDelta = at.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && at.getDate() < born.getDate())) age -= 1;
  return age;
}

/** Applies the LIS upload rules to one batch. Pure — no clock beyond `now`. */
export function validateBatch(input: LisBatchInput, now: Date = new Date()): LisValidation {
  const seen = new Map<string, number>();
  for (const row of input.rows) {
    seen.set(row.lrn, (seen.get(row.lrn) ?? 0) + 1);
  }

  const rows: LisRowResult[] = input.rows.map((row) => {
    const errors: LisRuleCode[] = [];

    if (!/^\d{12}$/.test(row.lrn ?? '')) errors.push('lrn_format');
    else if ((seen.get(row.lrn) ?? 0) > 1) errors.push('lrn_duplicate');

    if (!row.lastName?.trim() || !row.firstName?.trim()) errors.push('missing_name');
    if (row.sex !== 'M' && row.sex !== 'F') errors.push('sex_invalid');

    const born = new Date(row.birthDate);
    if (!row.birthDate || Number.isNaN(born.getTime()) || born > now) {
      errors.push('birth_date_invalid');
    } else {
      const age = ageOn(row.birthDate, now);
      if (age < 4 || age > 25) errors.push('age_implausible');
    }

    if (!Number.isInteger(row.gradeLevel) || row.gradeLevel < 1 || row.gradeLevel > 12) {
      errors.push('grade_range');
    }
    if (!row.section?.trim()) errors.push('missing_section');
    if (!row.guardianName?.trim()) errors.push('missing_guardian');
    if (row.guardianContact && !MOBILE.test(row.guardianContact.replace(/[\s-]/g, ''))) {
      errors.push('contact_format');
    }

    return { lrn: row.lrn, accepted: errors.length === 0, errors };
  });

  const accepted = rows.filter((r) => r.accepted).length;
  const rejected = rows.length - accepted;

  const counts = new Map<LisRuleCode, number>();
  for (const row of rows) {
    for (const code of row.errors) counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return {
    rows,
    accepted,
    rejected,
    status: accepted === 0 ? 'rejected' : rejected === 0 ? 'validated' : 'partially_accepted',
    findings: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, message: LIS_RULES[code], count })),
  };
}

/**
 * Stable fingerprint of a batch: the same enrolment data submitted twice yields
 * the same key, so a retry or a double-tap does not create a second batch.
 */
export async function batchFingerprint(input: LisBatchInput): Promise<string> {
  const canonical = JSON.stringify({
    schoolId: input.schoolId,
    schoolYear: input.schoolYear,
    rows: [...input.rows]
      .map((r) => [
        r.lrn, r.lastName, r.firstName, r.middleName ?? '', r.sex, r.birthDate,
        r.gradeLevel, r.section, r.guardianName ?? '', r.guardianContact ?? '',
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Masks an LRN for anything that leaves the school's own tenant. */
export function maskLrnForTransit(lrn: string): string {
  return /^\d{12}$/.test(lrn) ? `${lrn.slice(0, 3)}••••••${lrn.slice(-3)}` : '••••••••••••';
}

/** Column order of the LIS enrolment upload template. */
export const LIS_COLUMNS = [
  'LRN',
  'LAST NAME',
  'FIRST NAME',
  'MIDDLE NAME',
  'SEX',
  'BIRTH DATE',
  'GRADE LEVEL',
  'SECTION',
  'PARENT/GUARDIAN',
  'CONTACT NUMBER',
  'MOTHER TONGUE',
  'ADDRESS',
] as const;

export function toLisRow(row: LisLearnerInput): (string | number)[] {
  return [
    row.lrn,
    row.lastName,
    row.firstName,
    row.middleName ?? '',
    row.sex,
    row.birthDate,
    row.gradeLevel,
    row.section,
    row.guardianName ?? '',
    row.guardianContact ?? '',
    row.motherTongue ?? '',
    row.address ?? '',
  ];
}
