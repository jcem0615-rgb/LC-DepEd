/**
 * Dynamic student e-ID engine.
 *
 * Two verification modes, both keyed to a per-learner HMAC-SHA256 secret:
 *  - dynamic: a TOTP-style payload that rotates every 30 seconds (screen display)
 *  - static : a non-expiring signature for printed ID cards
 *
 * Payload format: LCD1|<mode>|<lrn>|<counter|0>|<signature>
 */
import { hmacSha256, safeEqual } from './crypto';

export const EID_PERIOD_SECONDS = 30;
export const EID_VERSION = 'LCD1';

export type EidMode = 'dynamic' | 'static';

export interface EidPayload {
  version: string;
  mode: EidMode;
  lrn: string;
  counter: number;
  signature: string;
}

export function currentCounter(now: number = Date.now()): number {
  return Math.floor(now / 1000 / EID_PERIOD_SECONDS);
}

export function secondsRemaining(now: number = Date.now()): number {
  const elapsed = Math.floor(now / 1000) % EID_PERIOD_SECONDS;
  return EID_PERIOD_SECONDS - elapsed;
}

export async function buildEid(
  lrn: string,
  secret: string,
  mode: EidMode = 'dynamic',
  now: number = Date.now(),
): Promise<string> {
  const counter = mode === 'dynamic' ? currentCounter(now) : 0;
  const message = `${EID_VERSION}|${mode}|${lrn}|${counter}`;
  const signature = (await hmacSha256(secret, message)).slice(0, 24);
  return `${message}|${signature}`;
}

export function parseEid(raw: string): EidPayload | null {
  const parts = (raw ?? '').trim().split('|');
  if (parts.length !== 5) return null;
  const [version, mode, lrn, counterRaw, signature] = parts;
  if (version !== EID_VERSION) return null;
  if (mode !== 'dynamic' && mode !== 'static') return null;
  const counter = Number.parseInt(counterRaw, 10);
  if (!Number.isFinite(counter)) return null;
  if (!/^\d{12}$/.test(lrn)) return null;
  return { version, mode, lrn, counter, signature };
}

export type VerifyResult =
  | { ok: true; lrn: string; mode: EidMode; driftPeriods: number }
  | { ok: false; reason: 'malformed' | 'unknown_learner' | 'bad_signature' | 'expired' };

/**
 * Verifies a scanned payload. Dynamic codes accept a +/-1 period clock drift so
 * gate kiosks with slightly skewed clocks still work offline.
 */
export async function verifyEid(
  raw: string,
  lookupSecret: (lrn: string) => Promise<string | undefined> | string | undefined,
  now: number = Date.now(),
): Promise<VerifyResult> {
  const parsed = parseEid(raw);
  if (!parsed) return { ok: false, reason: 'malformed' };
  const secret = await lookupSecret(parsed.lrn);
  if (!secret) return { ok: false, reason: 'unknown_learner' };

  if (parsed.mode === 'static') {
    const expected = (await hmacSha256(secret, `${EID_VERSION}|static|${parsed.lrn}|0`)).slice(0, 24);
    return safeEqual(expected, parsed.signature)
      ? { ok: true, lrn: parsed.lrn, mode: 'static', driftPeriods: 0 }
      : { ok: false, reason: 'bad_signature' };
  }

  const current = currentCounter(now);
  for (const drift of [0, -1, 1]) {
    const counter = current + drift;
    if (counter !== parsed.counter) continue;
    const expected = (
      await hmacSha256(secret, `${EID_VERSION}|dynamic|${parsed.lrn}|${counter}`)
    ).slice(0, 24);
    if (safeEqual(expected, parsed.signature)) {
      return { ok: true, lrn: parsed.lrn, mode: 'dynamic', driftPeriods: drift };
    }
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: false, reason: 'expired' };
}
