/**
 * Student e-ID engine.
 *
 * Every learner carries one fixed QR code, derived from their Learner Reference
 * Number and a per-learner HMAC-SHA256 secret. The code never changes and never
 * expires, so a printed card, a screenshot and the card on screen are all the
 * same credential — but it still cannot be forged without the learner's secret,
 * and the gate verifies it offline.
 *
 * Payload format: LCD1|<lrn>|<signature>
 */
import { hmacSha256, safeEqual } from './crypto';

export const EID_VERSION = 'LCD1';

/** Length of the truncated signature carried in the QR payload. */
const SIGNATURE_CHARS = 24;

export interface EidPayload {
  version: string;
  lrn: string;
  signature: string;
}

function message(lrn: string): string {
  return `${EID_VERSION}|${lrn}`;
}

/** Builds the learner's permanent e-ID payload. */
export async function buildEid(lrn: string, secret: string): Promise<string> {
  const signature = (await hmacSha256(secret, message(lrn))).slice(0, SIGNATURE_CHARS);
  return `${message(lrn)}|${signature}`;
}

export function parseEid(raw: string): EidPayload | null {
  const parts = (raw ?? '').trim().split('|');
  if (parts.length !== 3) return null;
  const [version, lrn, signature] = parts;
  if (version !== EID_VERSION) return null;
  if (!/^\d{12}$/.test(lrn)) return null;
  if (!signature) return null;
  return { version, lrn, signature };
}

export type VerifyResult =
  | { ok: true; lrn: string }
  | { ok: false; reason: 'malformed' | 'unknown_learner' | 'bad_signature' };

/**
 * Verifies a scanned payload against the learner's secret. No clock is
 * involved, so gate kiosks work offline regardless of clock drift.
 */
export async function verifyEid(
  raw: string,
  lookupSecret: (lrn: string) => Promise<string | undefined> | string | undefined,
): Promise<VerifyResult> {
  const parsed = parseEid(raw);
  if (!parsed) return { ok: false, reason: 'malformed' };

  const secret = await lookupSecret(parsed.lrn);
  if (!secret) return { ok: false, reason: 'unknown_learner' };

  const expected = (await hmacSha256(secret, message(parsed.lrn))).slice(0, SIGNATURE_CHARS);
  return safeEqual(expected, parsed.signature)
    ? { ok: true, lrn: parsed.lrn }
    : { ok: false, reason: 'bad_signature' };
}
