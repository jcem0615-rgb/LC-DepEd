import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEid, EID_VERSION, parseEid, verifyEid } from '../src/lib/eid';

const LRN = '136001200001';
const SECRET = 'demo-eid-seed::136001200001::LC-DepEd';
const OTHER_LRN = '136001200002';
const OTHER_SECRET = 'demo-eid-seed::136001200002::LC-DepEd';

const lookup = async (lrn: string) =>
  lrn === LRN ? SECRET : lrn === OTHER_LRN ? OTHER_SECRET : undefined;

test('a learner code is well formed and verifies', async () => {
  const payload = await buildEid(LRN, SECRET);
  const parsed = parseEid(payload);
  assert.ok(parsed);
  assert.equal(parsed.version, EID_VERSION);
  assert.equal(parsed.lrn, LRN);
  assert.equal(payload.split('|').length, 3);

  const result = await verifyEid(payload, lookup);
  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.lrn, LRN);
});

test('the code is stable — same learner, same code every time', async () => {
  const first = await buildEid(LRN, SECRET);
  const second = await buildEid(LRN, SECRET);
  assert.equal(first, second);
});

test('the code never expires, whenever it is verified', async () => {
  const payload = await buildEid(LRN, SECRET);
  // Verification takes no clock at all, so a year-old printed card still works.
  for (let i = 0; i < 3; i += 1) {
    const result = await verifyEid(payload, lookup);
    assert.equal(result.ok, true);
  }
});

test('each learner gets a different code', async () => {
  const mine = await buildEid(LRN, SECRET);
  const theirs = await buildEid(OTHER_LRN, OTHER_SECRET);
  assert.notEqual(mine, theirs);

  const mineResult = await verifyEid(mine, lookup);
  const theirsResult = await verifyEid(theirs, lookup);
  assert.equal(mineResult.ok === true && mineResult.lrn, LRN);
  assert.equal(theirsResult.ok === true && theirsResult.lrn, OTHER_LRN);
});

test('a learner cannot present another learner code by swapping the LRN', async () => {
  const payload = await buildEid(LRN, SECRET);
  const swapped = payload.replace(LRN, OTHER_LRN);
  const result = await verifyEid(swapped, lookup);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'bad_signature');
});

test('tampered signatures are rejected', async () => {
  const payload = await buildEid(LRN, SECRET);
  const forged = payload.slice(0, -4) + 'AAAA';
  const result = await verifyEid(forged, lookup);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'bad_signature');
});

test('a code signed with the wrong secret is rejected', async () => {
  const payload = await buildEid(LRN, 'some-other-secret');
  const result = await verifyEid(payload, lookup);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'bad_signature');
});

test('unknown learners are rejected', async () => {
  const payload = await buildEid('999999999999', SECRET);
  const result = await verifyEid(payload, lookup);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'unknown_learner');
});

test('malformed codes are rejected', async () => {
  const junk = [
    '',
    'hello',
    'LCD1|abc|sig',
    'LCD9|136001200001|sig',
    'LCD1|136001200001',
    'LCD1|136001200001|sig|extra',
    'LCD1|136001200001|',
  ];
  for (const raw of junk) {
    const result = await verifyEid(raw, lookup);
    assert.equal(result.ok, false, `expected rejection for "${raw}"`);
    assert.equal(result.ok === false && result.reason, 'malformed');
  }
});
