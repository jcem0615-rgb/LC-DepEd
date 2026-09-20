import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeQuarter,
  descriptorFor,
  finalSubjectGrade,
  generalAverage,
  honorsFor,
  percentageScore,
  promotionRemark,
  transmute,
  WEIGHTS,
} from '../src/lib/deped-grading';

test('transmutation table matches DepEd Order No. 8, s. 2015 (Table 5)', () => {
  const expected: [number, number][] = [
    [100, 100], [99.99, 99], [98.4, 99], [98.39, 98], [96.8, 98],
    [93.6, 96], [90.4, 94], [85.6, 91], [84, 90], [80.8, 88],
    [76, 85], [71.2, 82], [68, 80], [61.6, 76], [60, 75], [61.59, 75],
    [59.99, 74], [56, 74], [52, 73], [48, 72], [44, 71], [40, 70],
    [20, 65], [4, 61], [3.99, 60], [0, 60],
  ];
  for (const [initial, transmuted] of expected) {
    assert.equal(transmute(initial), transmuted, `initial grade ${initial}`);
  }
});

test('transmutation clamps out-of-range initial grades', () => {
  assert.equal(transmute(-5), 60);
  assert.equal(transmute(140), 100);
  assert.equal(transmute(Number.NaN), 60);
});

test('component weights follow the policy per subject group', () => {
  assert.deepEqual(WEIGHTS.languages, { ww: 30, pt: 50, qa: 20 });
  assert.deepEqual(WEIGHTS.science_math, { ww: 40, pt: 40, qa: 20 });
  assert.deepEqual(WEIGHTS.mapeh_tle, { ww: 20, pt: 60, qa: 20 });
  assert.deepEqual(WEIGHTS.shs_core, { ww: 25, pt: 50, qa: 25 });
  assert.deepEqual(WEIGHTS.shs_academic, { ww: 25, pt: 45, qa: 30 });
  assert.deepEqual(WEIGHTS.shs_tvl, { ww: 20, pt: 60, qa: 20 });
  for (const w of Object.values(WEIGHTS)) {
    assert.equal(w.ww + w.pt + w.qa, 100);
  }
});

test('percentage score handles empty and zero-total components safely', () => {
  assert.equal(percentageScore([], []), 0);
  assert.equal(percentageScore([10], [0]), 0);
  assert.equal(percentageScore([10, 20], [20, 20]), 75);
});

test('quarterly computation reproduces the worked example in the policy', () => {
  // Science (WW 40 / PT 40 / QA 20): perfect scores must transmute to 100.
  const perfect = computeQuarter(
    {
      writtenWork: [20, 20], writtenWorkTotals: [20, 20],
      performanceTasks: [30, 30], performanceTaskTotals: [30, 30],
      quarterlyAssessment: 50, quarterlyAssessmentTotal: 50,
    },
    'science_math',
  );
  assert.equal(perfect.initialGrade, 100);
  assert.equal(perfect.quarterlyGrade, 100);
  assert.equal(perfect.descriptor, 'Outstanding');
  assert.equal(perfect.remarks, 'Passed');

  // Half marks everywhere → initial grade 50 → transmuted 72 (failing).
  const half = computeQuarter(
    {
      writtenWork: [10], writtenWorkTotals: [20],
      performanceTasks: [15], performanceTaskTotals: [30],
      quarterlyAssessment: 25, quarterlyAssessmentTotal: 50,
    },
    'languages',
  );
  assert.equal(half.initialGrade, 50);
  assert.equal(half.quarterlyGrade, 72);
  assert.equal(half.remarks, 'Failed');
});

test('weighting differs per subject group for identical raw scores', () => {
  const input = {
    writtenWork: [20], writtenWorkTotals: [20],          // 100%
    performanceTasks: [15], performanceTaskTotals: [30], // 50%
    quarterlyAssessment: 25, quarterlyAssessmentTotal: 50, // 50%
  };
  // languages: 100*.3 + 50*.5 + 50*.2 = 65 ; science_math: 100*.4 + 50*.4 + 50*.2 = 70
  assert.equal(computeQuarter(input, 'languages').initialGrade, 65);
  assert.equal(computeQuarter(input, 'science_math').initialGrade, 70);
});

test('descriptors follow the policy bands', () => {
  assert.equal(descriptorFor(90), 'Outstanding');
  assert.equal(descriptorFor(89), 'Very Satisfactory');
  assert.equal(descriptorFor(84), 'Satisfactory');
  assert.equal(descriptorFor(75), 'Fairly Satisfactory');
  assert.equal(descriptorFor(74), 'Did Not Meet Expectations');
});

test('final and general averages ignore unposted quarters', () => {
  assert.equal(finalSubjectGrade([90, 88, 0, 0]), 89);
  assert.equal(finalSubjectGrade([]), 0);
  assert.equal(generalAverage([90, 91, 92]), 91);
});

test('promotion and honors rules', () => {
  assert.equal(promotionRemark(88, 0), 'Promoted');
  assert.equal(promotionRemark(80, 2), 'Conditional — Remedial Required');
  assert.equal(promotionRemark(70, 4), 'Retained');
  assert.equal(honorsFor(98), 'With Highest Honors');
  assert.equal(honorsFor(95), 'With High Honors');
  assert.equal(honorsFor(90), 'With Honors');
  assert.equal(honorsFor(89), null);
});
