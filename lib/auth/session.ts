/**
 * Demo access session tokens.
 *
 * Stateless, signed-expiry cookies — no session store needed (this MVP has no
 * server-side database of sessions, and Netlify functions are not guaranteed
 * to share memory across invocations). The cookie carries an expiry timestamp
 * plus an HMAC-SHA256 signature over that timestamp, keyed off a SHA-256
 * digest of DEMO_ACCESS_PASSWORD — so a session cannot be forged without the
 * password, and rotating the password invalidates every outstanding session.
 *
 * Uses only Web Crypto (globalThis.crypto.subtle), which is available in both
 * the Next.js Edge middleware runtime and the Node.js route-handler runtime —
 * no node:crypto import, so this module works unchanged in either.
 */

export const SESSION_COOKIE_NAME = "vantrock_session";
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 hours

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacKey(password: string): Promise<CryptoKey> {
  // Derive a fixed-length key from the password via SHA-256 rather than using
  // the raw password as the HMAC key directly — keeps key length uniform
  // regardless of how long/short the configured password is.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function createSessionToken(password: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const key = await hmacKey(password);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(expiresAt)),
  );
  return `${expiresAt}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  password: string,
): Promise<boolean> {
  if (!token) return false;
  const separatorIndex = token.indexOf(".");
  if (separatorIndex < 1) return false;

  const expiresRaw = token.slice(0, separatorIndex);
  const providedSig = token.slice(separatorIndex + 1);
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const key = await hmacKey(password);
  const expectedSignature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(expiresRaw),
  );
  const expectedSig = base64UrlEncode(new Uint8Array(expectedSignature));

  return timingSafeEqual(providedSig, expectedSig);
}

/** Constant-time-ish string comparison — avoids a length/prefix timing leak on the signature check. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
