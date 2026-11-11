// How a store proves a request to the gateway is its own. Both sides use this file, and it needs only node:crypto,
// so a store outside this repository can copy it as it stands.
//
// The store publishes an Ed25519 public key (SPKI PEM) as "signing_key" in /.well-known/mandate-merchant.json and
// signs each request with the private half. What is signed is five lines joined by "\n":
//
//   METHOD            upper case, e.g. POST
//   path              the path and query string exactly as requested, e.g. /api/merchant/shipments
//   sha256(body)      lower-case hex of the raw request body; of the empty string when there is no body
//   timestamp         Unix time in seconds
//   requestId         a value the store has not used before (8 to 128 characters of A-Z a-z 0-9 . _ -)
//
// The request carries three headers: Mandate-Store-Signature (base64 Ed25519 signature of those bytes),
// Mandate-Store-Timestamp and Mandate-Store-Request-Id. The gateway accepts it when the signature verifies against
// the key on file, the timestamp is within five minutes of its own clock and the request id has not been seen.
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, verify, type KeyObject } from "node:crypto";

export const SIGNATURE_HEADER = "Mandate-Store-Signature";
export const TIMESTAMP_HEADER = "Mandate-Store-Timestamp";
export const REQUEST_ID_HEADER = "Mandate-Store-Request-Id";
/** How far a request's timestamp may be from the verifier's clock, either way. */
export const MAX_SKEW_SECONDS = 300;

const REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/** The exact bytes that are signed. */
export function signingString(r: { method: string; path: string; body?: string | null; timestamp: string; requestId: string }) {
  return [r.method.toUpperCase(), r.path, createHash("sha256").update(r.body ?? "").digest("hex"), r.timestamp, r.requestId].join("\n");
}

/** The three headers for one request. `path` includes the query string; `body` is the exact text that will be sent. */
export function signRequest(privateKey: KeyObject | string, r: { method: string; path: string; body?: string | null }, o: { now?: number; requestId?: string } = {}): Record<string, string> {
  const key = typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  const timestamp = String(Math.floor((o.now ?? Date.now()) / 1000)), requestId = o.requestId ?? randomUUID();
  return {
    [SIGNATURE_HEADER]: sign(null, Buffer.from(signingString({ ...r, timestamp, requestId })), key).toString("base64"),
    [TIMESTAMP_HEADER]: timestamp,
    [REQUEST_ID_HEADER]: requestId,
  };
}

export type SignatureFailure = "missing_signature" | "bad_timestamp" | "stale_timestamp" | "bad_request_id" | "bad_signature" | "replayed";
export type SignatureCheck = { ok: true; requestId: string; timestamp: number } | { ok: false; code: SignatureFailure; reason: string };
const no = (code: SignatureFailure, reason: string): SignatureCheck => ({ ok: false, code, reason });
type Headers = { get(name: string): string | null } | Record<string, string | undefined>;
const header = (h: Headers, name: string) => {
  if (typeof (h as { get?: unknown }).get === "function") return (h as { get(n: string): string | null }).get(name);
  const rec = h as Record<string, string | undefined>;
  return rec[name] ?? rec[name.toLowerCase()] ?? null;
};

/**
 * Check one request against a store's public key. `firstUse` records the request id and says whether this is the
 * first time it has been seen; it is asked only once everything else holds, so a forged request cannot use up ids.
 */
export async function verifyRequest(publicKeyPem: string, r: { method: string; path: string; body?: string | null; headers: Headers },
  o: { now?: number; firstUse: (requestId: string) => boolean | Promise<boolean> }): Promise<SignatureCheck> {
  const signature = header(r.headers, SIGNATURE_HEADER), timestamp = header(r.headers, TIMESTAMP_HEADER), requestId = header(r.headers, REQUEST_ID_HEADER);
  if (!signature || !timestamp || !requestId) return no("missing_signature", `This store signs its requests, so ${SIGNATURE_HEADER}, ${TIMESTAMP_HEADER} and ${REQUEST_ID_HEADER} are required.`);
  if (!/^\d{1,12}$/.test(timestamp)) return no("bad_timestamp", `${TIMESTAMP_HEADER} must be Unix time in seconds.`);
  if (Math.abs(Math.floor((o.now ?? Date.now()) / 1000) - Number(timestamp)) > MAX_SKEW_SECONDS) return no("stale_timestamp", `${TIMESTAMP_HEADER} is more than ${MAX_SKEW_SECONDS / 60} minutes from the gateway's clock.`);
  if (!REQUEST_ID.test(requestId)) return no("bad_request_id", `${REQUEST_ID_HEADER} must be 8 to 128 characters of letters, digits, ".", "_" or "-".`);
  let valid = false;
  try { valid = verify(null, Buffer.from(signingString({ ...r, timestamp, requestId })), createPublicKey(publicKeyPem), Buffer.from(signature, "base64")); } catch { valid = false; }
  if (!valid) return no("bad_signature", "The signature does not match the signing key this store published.");
  if (!(await o.firstUse(requestId))) return no("replayed", `${REQUEST_ID_HEADER} has been used before. Send each request with a new id.`);
  return { ok: true, requestId, timestamp: Number(timestamp) };
}

/** A replay store that lives in memory: enough for one process, and for tests. */
export function memoryReplayStore(now: () => number = Date.now) {
  const seen = new Map<string, number>();
  return (requestId: string) => {
    const t = now();
    for (const [id, at] of seen) if (t - at > 2 * MAX_SKEW_SECONDS * 1000) seen.delete(id);
    if (seen.has(requestId)) return false;
    seen.set(requestId, t);
    return true;
  };
}

/** Read a published "signing_key": an Ed25519 public key as SPKI PEM. Returns it in one normal form, or null if it is not one. */
export function readSigningKey(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  try {
    const key = createPublicKey(raw.trim());
    return key.asymmetricKeyType === "ed25519" ? (key.export({ type: "spki", format: "pem" }) as string) : null;
  } catch { return null; }
}

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
/** An Ed25519 private key from its 32-byte seed. */
export function privateKeyFromSeed(seed: Uint8Array): KeyObject {
  if (seed.length !== 32) throw new Error("An Ed25519 seed is 32 bytes");
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seed)]), format: "der", type: "pkcs8" });
}
export const publicPemOf = (privateKey: KeyObject) => createPublicKey(privateKey).export({ type: "spki", format: "pem" }) as string;
