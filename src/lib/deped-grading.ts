/**
 * DepEd Order No. 8, s. 2015 — Policy Guidelines on Classroom Assessment.
 * Implements component weighting, initial grade computation and the official
 * transmutation table (Table 5 of the enclosure).
 */
import type { SubjectWeightGroup } from './types';

export interface ComponentWeights {
  /** Written Work */
  ww: number;
  /** Performance Tasks */
  pt: number;
  /** Quarterly Assessment */
  qa: number;
}

export const WEIGHTS: Record<SubjectWeightGroup, ComponentWeights> = {
  // Grades 1-10
  languages: { ww: 30, pt: 50, qa: 20 }, // Languages, AP, EsP
  science_math: { ww: 40, pt: 40, qa: 20 }, // Science and Mathematics
  mapeh_tle: { ww: 20, pt: 60, qa: 20 }, // MAPEH, EPP/TLE
  // Senior High School
  shs_core: { ww: 25, pt: 50, qa: 25 },
  shs_academic: { ww: 25, pt: 45, qa: 30 },
  shs_tvl: { ww: 20, pt: 60, qa: 20 },
};

export const WEIGHT_GROUP_LABELS: Record<SubjectWeightGroup, string> = {
  languages: 'Languages / AP / EsP (G1-10)',
  science_math: 'Science & Mathematics (G1-10)',
  mapeh_tle: 'MAPEH / EPP / TLE (G1-10)',
  shs_core: 'SHS Core Subjects',
  shs_academic: 'SHS Academic Track (Applied/Specialized)',
  shs_tvl: 'SHS TVL / Sports / Arts & Design',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Percentage score of a component: total raw / total highest possible * 100. */
export function percentageScore(scores: number[], totals: number[]): number {
  const raw = scores.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const highest = totals.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  if (highest <= 0) return 0;
  return round2(clamp((raw / highest) * 100, 0, 100));
}

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Weighted score = percentage score x component weight. */
export function weightedScore(percentage: number, weight: number): number {
  return round2((percentage * weight) / 100);
}

export interface QuarterInput {
  writtenWork: number[];
  writtenWorkTotals: number[];
  performanceTasks: number[];
  performanceTaskTotals: number[];
  quarterlyAssessment: number;
  quarterlyAssessmentTotal: number;
}

export interface QuarterComputation {
  wwPs: number;
  wwWs: number;
  ptPs: number;
  ptWs: number;
  qaPs: number;
  qaWs: number;
  initialGrade: number;
  quarterlyGrade: number;
  descriptor: Descriptor;
  remarks: 'Passed' | 'Failed';
  weights: ComponentWeights;
}

/**
 * Transmutation table of DO 8, s. 2015.
 * Initial grades >= 60 map in 1.60 steps from 75; below 60 in 4.00 steps from 60.
 */
export function transmute(initialGrade: number): number {
  const ig = clamp(initialGrade, 0, 100);
  if (ig >= 100) return 100;
  // Work in hundredths: binary floating point makes 96.8 - 60 land just under
  // 36.8, which would drop a grade at every table boundary.
  const hundredths = Math.round(ig * 100);
  if (hundredths >= 6000) return 75 + Math.floor((hundredths - 6000) / 160);
  return 60 + Math.floor(hundredths / 400);
}

export type Descriptor =
  | 'Outstanding'
  | 'Very Satisfactory'
  | 'Satisfactory'
  | 'Fairly Satisfactory'
  | 'Did Not Meet Expectations';

export function descriptorFor(grade: number): Descriptor {
  if (grade >= 90) return 'Outstanding';
  if (grade >= 85) return 'Very Satisfactory';
  if (grade >= 80) return 'Satisfactory';
  if (grade >= 75) return 'Fairly Satisfactory';
  return 'Did Not Meet Expectations';
}

export function computeQuarter(
  input: QuarterInput,
  group: SubjectWeightGroup,
): QuarterComputation {
  const weights = WEIGHTS[group] ?? WEIGHTS.languages;
  const wwPs = percentageScore(input.writtenWork, input.writtenWorkTotals);
  const ptPs = percentageScore(input.performanceTasks, input.performanceTaskTotals);
  const qaPs = percentageScore(
    [input.quarterlyAssessment],
    [input.quarterlyAssessmentTotal],
  );
  const wwWs = weightedScore(wwPs, weights.ww);
  const ptWs = weightedScore(ptPs, weights.pt);
  const qaWs = weightedScore(qaPs, weights.qa);
  const initialGrade = round2(wwWs + ptWs + qaWs);
  const quarterlyGrade = transmute(initialGrade);
  return {
    wwPs,
    wwWs,
    ptPs,
    ptWs,
    qaPs,
    qaWs,
    initialGrade,
    quarterlyGrade,
    descriptor: descriptorFor(quarterlyGrade),
    remarks: quarterlyGrade >= 75 ? 'Passed' : 'Failed',
    weights,
  };
}

/** Final subject grade = average of the four quarterly grades, rounded. */
export function finalSubjectGrade(quarterGrades: number[]): number {
  const valid = quarterGrades.filter((g) => Number.isFinite(g) && g > 0);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

/** General average across subjects (DepEd rounds to whole number). */
export function generalAverage(finalGrades: number[]): number {
  const valid = finalGrades.filter((g) => Number.isFinite(g) && g > 0);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

export function promotionRemark(average: number, failedSubjects: number): string {
  if (average <= 0) return 'No grades yet';
  if (failedSubjects === 0 && average >= 75) return 'Promoted';
  if (failedSubjects > 0 && failedSubjects <= 2) return 'Conditional — Remedial Required';
  return 'Retained';
}

/** Honors classification under DepEd Order No. 36, s. 2016. */
export function honorsFor(average: number): string | null {
  if (average >= 98) return 'With Highest Honors';
  if (average >= 95) return 'With High Honors';
  if (average >= 90) return 'With Honors';
  return null;
}
