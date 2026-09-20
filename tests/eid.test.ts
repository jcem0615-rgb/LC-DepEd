import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEid,
  currentCounter,
  EID_PERIOD_SECONDS,
  parseEid,
  verifyEid,
} from '../src/lib/eid';

const LRN = '136001200001';
const SECRET = 'demo-eid-seed::136001200001::LC-DepEd';
const lookup = async (lrn: string) => (lrn === LRN ? SECRET : undefined);

test('dynamic payloads verify within the current time window', async () => {
  const payload = await buildEid(LRN, SECRET, 'dynamic');
  const parsed = parseEid(payload);
  assert.ok(parsed);
  assert.equal(parsed.lrn, LRN);
  assert.equal(parsed.counter, currentCounter());
  const result = await verifyEid(payload, lookup);
  assert.equal(result.ok, true);
});

test('dynamic payloads rotate every 30 seconds', async () => {
  const now = Date.now();
  const a = await buildEid(LRN, SECRET, 'dynamic', now);
  const b = await buildEid(LRN, SECRET, 'dynamic', now + EID_PERIOD_SECONDS * 1000);
  assert.notEqual(a, b);
});

test('a ±1 window clock drift is tolerated for offline kiosks', async () => {
  const now = Date.now();
  const earlier = await buildEid(LRN, SECRET, 'dynamic', now - EID_PERIOD_SECONDS * 1000);
  const result = await verifyEid(earlier, lookup, now);
  assert.equal(result.ok, true);
});

test('stale payloads outside the drift window are rejected', async () => {
  const now = Date.now();
  const old = await buildEid(LRN, SECRET, 'dynamic', now - 10 * EID_PERIOD_SECONDS * 1000);
  const result = await verifyEid(old, lookup, now);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'expired');
});

test('tampered signatures are rejected', async () => {
  const payload = await buildEid(LRN, SECRET, 'dynamic');
  const forged = payload.slice(0, -4) + 'AAAA';
  const result = await verifyEid(forged, lookup);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'bad_signature');
});

test('a payload signed with the wrong learner secret is rejected', async () => {
  const payload = await buildEid(LRN, 'some-other-secret', 'dynamic');
  const result = await verifyEid(payload, lookup);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'bad_signature');
});

test('unknown learners and malformed codes are rejected', async () => {
  const other = await buildEid('999999999999', SECRET, 'dynamic');
  const unknown = await verifyEid(other, lookup);
  assert.equal(unknown.ok === false && unknown.reason, 'unknown_learner');

  for (const junk of ['', 'hello', 'LCD1|dynamic|abc|1|sig', 'LCD9|dynamic|136001200001|1|sig']) {
    const result = await verifyEid(junk, lookup);
    assert.equal(result.ok, false, `expected rejection for "${junk}"`);
  }
});

test('static printed-card signatures never expire', async () => {
  const now = Date.now();
  const printed = await buildEid(LRN, SECRET, 'static', now);
  const result = await verifyEid(printed, lookup, now + 400 * 86_400_000);
  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.mode, 'static');
});
