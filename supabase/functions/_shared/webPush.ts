/**
 * Web Push encryption (RFC 8291) + VAPID signing (RFC 8292), implemented with
 * the Web Crypto API only — no external dependency.
 *
 * Why hand-rolled: the npm `web-push` library relies on Node's `crypto`
 * (`createECDH` / `createCipheriv`), which is brittle under the Deno edge
 * runtime that Supabase Edge Functions use. `crypto.subtle` is native in both
 * Deno and Node 18+, so this stays dependency-free and is round-trip testable.
 *
 * A non-empty Web Push payload MUST be encrypted with the `aes128gcm` content
 * encoding using the subscription's `p256dh` (recipient public key) and `auth`
 * (shared secret). Sending plaintext makes push services reject the request
 * (HTTP 400) or the service worker fail to decrypt, so notifications never
 * arrive. See public/sw.js — its `push` handler reads the decrypted JSON.
 */

const enc = new TextEncoder();

export interface WebPushKeys {
  /** Recipient public key — base64url, 65-byte uncompressed P-256 point. */
  p256dh: string;
  /** Recipient auth secret — base64url, 16 bytes. */
  auth: string;
}

export interface WebPushSubscription {
  endpoint: string;
  keys?: WebPushKeys;
}

export interface VapidConfig {
  /** base64url, 65-byte uncompressed P-256 point (same value the client passes
   *  to `pushManager.subscribe` as `applicationServerKey`). */
  publicKey: string;
  /** base64url, 32-byte P-256 private scalar. */
  privateKey: string;
  /** Contact, e.g. `mailto:you@example.com` or `https://example.com`. */
  subject: string;
}

// ── base64url helpers ───────────────────────────────────────────────────────
export function b64urlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** HKDF (extract + expand) via native Web Crypto. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypt a Web Push payload with the `aes128gcm` content encoding
 * (RFC 8188 framing + RFC 8291 key derivation). Returns the full request
 * body: `header || ciphertext`.
 */
export async function encryptPayload(p256dh: string, auth: string, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(p256dh); // recipient public key (65 bytes)
  const authSecret = b64urlToBytes(auth); // recipient auth secret (16 bytes)

  // Ephemeral application-server ECDH key pair (one per message).
  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  ) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey)); // 65 bytes

  // ECDH shared secret with the recipient's public key.
  const uaPublicKey = await crypto.subtle.importKey(
    'raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaPublicKey }, asKeyPair.privateKey, 256,
  )); // 32 bytes (P-256 shared X coordinate)

  // RFC 8291 §3.4: combine auth secret + ECDH secret into the input keying material.
  const keyInfo = concatBytes(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  // RFC 8188: per-message salt → content encryption key + nonce.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // Single record: plaintext || 0x02 (last-record padding delimiter).
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const padded = concatBytes(payload, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, padded,
  ));

  // RFC 8188 §2.1 header: salt(16) | rs(4, big-endian) | idlen(1) | keyid(=asPublic).
  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = asPublic.length; // idlen = 65
  header.set(asPublic, 21);

  return concatBytes(header, ciphertext);
}

/**
 * Build a signed VAPID JWT (RFC 8292). Web Crypto cannot import a raw EC
 * *private* scalar, so we assemble a JWK from the x/y (public) + d (private)
 * coordinates and sign with ES256 (raw r||s, exactly what JWT expects).
 */
export async function signVapidJwt(audience: string, expirySeconds: number, vapid: VapidConfig): Promise<string> {
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64url(enc.encode(JSON.stringify({ aud: audience, exp: expirySeconds, sub: vapid.subject })));
  const message = `${header}.${claims}`;

  const publicBytes = b64urlToBytes(vapid.publicKey); // 0x04 || X(32) || Y(32)
  const privateBytes = b64urlToBytes(vapid.privateKey); // d(32)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(publicBytes.slice(1, 33)),
    y: bytesToB64url(publicBytes.slice(33, 65)),
    d: bytesToB64url(privateBytes),
    ext: true,
  };
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(message),
  ));
  return `${message}.${bytesToB64url(signature)}`;
}

/**
 * Encrypt and POST a Web Push notification to a subscription endpoint.
 * Returns a short status string (never throws). `payload` is JSON-serialized;
 * the service worker reads `{ title, body, icon }` from the decrypted message.
 */
export async function sendWebPush(
  subscriptionJson: string,
  payload: unknown,
  vapid: VapidConfig,
): Promise<string> {
  let subscription: WebPushSubscription;
  try {
    subscription = JSON.parse(subscriptionJson) as WebPushSubscription;
  } catch {
    return 'vapid_bad_subscription';
  }

  const endpoint = subscription.endpoint ?? '';
  if (!endpoint) return 'vapid_no_endpoint';
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (!p256dh || !auth) return 'vapid_no_subscription_keys';

  let body: Uint8Array;
  let authorization: string;
  try {
    body = await encryptPayload(p256dh, auth, enc.encode(JSON.stringify(payload)));
    const audience = new URL(endpoint).origin;
    const expiry = Math.floor(Date.now() / 1000) + 12 * 3600;
    const jwt = await signVapidJwt(audience, expiry, vapid);
    // RFC 8292: the `k` parameter carries the VAPID public key (required).
    authorization = `vapid t=${jwt}, k=${vapid.publicKey}`;
  } catch {
    return 'vapid_encrypt_error';
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
      },
      body,
    });
    if (res.ok) return 'vapid_sent';
    // 404/410 mean the subscription is gone — caller may prune it.
    return `vapid_error_${res.status}`;
  } catch {
    return 'vapid_exception';
  }
}
