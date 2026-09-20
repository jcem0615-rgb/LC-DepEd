/**
 * Security primitives used by the e-ID engine and local-storage encryption.
 * All operations use the Web Crypto API (available in browsers and Node >= 20).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('Web Crypto is unavailable in this context.');
  }
  return c.subtle;
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(arr).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomId(prefix = ''): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return prefix + toBase64Url(bytes);
}

export function randomSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return subtle().importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await subtle().sign('HMAC', key, enc.encode(message));
  return toBase64Url(sig);
}

export async function sha256Hex(message: string): Promise<string> {
  const digest = await subtle().digest('SHA-256', enc.encode(message));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/* AES-256-GCM helpers for encrypted local (IndexedDB) payloads         */
/* ------------------------------------------------------------------ */

async function aesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 150_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptLocal(passphrase: string, plaintext: string): Promise<string> {
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(salt);
  globalThis.crypto.getRandomValues(iv);
  const key = await aesKey(passphrase, salt);
  const cipher = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(plaintext),
  );
  return [toBase64Url(salt), toBase64Url(iv), toBase64Url(cipher)].join('.');
}

export async function decryptLocal(passphrase: string, payload: string): Promise<string> {
  const [s, i, c] = payload.split('.');
  if (!s || !i || !c) throw new Error('Malformed ciphertext.');
  const key = await aesKey(passphrase, fromBase64Url(s));
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(i) as unknown as BufferSource },
    key,
    fromBase64Url(c) as unknown as BufferSource,
  );
  return dec.decode(plain);
}

/** PBKDF2 password hashing used by the demo credential store. */
export async function hashPassword(password: string, saltB64?: string): Promise<string> {
  const salt = saltB64 ? fromBase64Url(saltB64) : (() => {
    const s = new Uint8Array(16);
    globalThis.crypto.getRandomValues(s);
    return s;
  })();
  const base = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 120_000, hash: 'SHA-256' },
    base,
    256,
  );
  return `${toBase64Url(salt)}:${toBase64Url(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, digest] = stored.split(':');
  if (!salt || !digest) return false;
  const again = await hashPassword(password, salt);
  return safeEqual(again, stored);
}
