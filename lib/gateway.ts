// What this store trusts about the gateway: its signature, and nothing else.
import { createHash, createPrivateKey, createPublicKey, verify, type KeyObject } from "node:crypto";
import { presentMandate } from "./mandate";
import { publicPemOf, signRequest } from "./sign-request";
import { gatewayUrl, store, storeUrl } from "./store";

/**
 * This store's own signing key, if it has one: STORE_SIGNING_KEY holds an Ed25519 private key, as the base64 of its
 * PKCS8 PEM. With it set, the store publishes the public half as "signing_key" in its well-known file and signs every
 * request it makes to the gateway, and the gateway then refuses requests in this store's name that are not signed.
 * With it unset the store publishes no key and sends its requests unsigned.
 */
function storeSigningKey(): KeyObject | null {
  const raw = process.env.STORE_SIGNING_KEY?.trim();
  if (!raw) return null;
  try {
    const key = createPrivateKey(Buffer.from(raw, "base64").toString("utf8"));
    if (key.asymmetricKeyType !== "ed25519") throw new Error("not Ed25519");
    return key;
  } catch { throw new Error("STORE_SIGNING_KEY is set but is not an Ed25519 private key (base64 of a PKCS8 PEM)"); }
}
/** The public key to publish as "signing_key" (SPKI PEM), or null when the store has no signing key. */
export const signingPublicKey = () => { const key = storeSigningKey(); return key ? publicPemOf(key) : null; };

/**
 * Call the gateway as this store. `path` starts with "/" and includes any query string; a body must be the exact
 * text that is sent, because the signature covers its hash. The scheme is in ./sign-request.ts.
 */
export function gatewayFetch(path: string, init: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal } = {}) {
  const key = storeSigningKey(), method = init.method ?? "GET";
  return fetch(`${gatewayUrl()}${path}`, { ...init, method, cache: "no-store",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers, ...(key ? signRequest(key, { method, path, body: init.body }) : {}) } });
}

export type LedgerEntry = { seq: number; userId: string; purchaseId: string | null; type: string; payload: Record<string, unknown>; at: string; prevHash: string; hash: string; signature: string };

/** Keys sorted, no whitespace: the same canonical form the gateway hashes. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

let key: Promise<string> | null = null;
/** The gateway publishes its public key; a store reads it once and keeps it. */
const gatewayKey = () => (key ??= fetch(`${gatewayUrl()}/.well-known/mandate-gateway.json`, { cache: "no-store" })
  .then((r) => r.json()).then((j: { evidence?: { publicKey?: string } }) => {
    if (!j.evidence?.publicKey) throw new Error("the gateway did not publish a public key");
    return j.evidence.publicKey;
  }).catch((e) => { key = null; throw e; }));

/** Check one signed ledger entry: its hash must cover its content, and the signature must be the gateway's. */
export async function verifyEntry(e: LedgerEntry): Promise<{ ok: true } | { ok: false; why: string }> {
  const body = { userId: e.userId, purchaseId: e.purchaseId, type: e.type, payload: e.payload, at: e.at };
  const hash = createHash("sha256").update(`${e.prevHash}\n${canonical(body)}`).digest("hex");
  if (hash !== e.hash) return { ok: false, why: "content does not match its hash" };
  const pub = createPublicKey(await gatewayKey());
  if (!verify(null, Buffer.from(e.hash, "hex"), pub, Buffer.from(e.signature, "base64"))) return { ok: false, why: "signature is not the gateway's" };
  return { ok: true };
}

/**
 * An agent shows this store a mandate credential. The store checks the signature, the expiry and that it was issued
 * for this store, using only the gateway key it already holds: no call to the gateway. Then it answers from its own
 * catalogue. The check is in ./mandate.ts. A credential authorises nothing by itself; the gateway decides every purchase.
 */
export async function presentToStore(credential: unknown) {
  const url = storeUrl();
  const products = store.products.map((p) => ({ sku: p.sku, name: p.name, priceCents: p.priceCents, currency: "USD", category: p.category, url: `${url}/products/${p.sku}` }));
  return presentMandate(credential, { name: store.name, url, products }, { publicKeyPem: await gatewayKey(), issuer: gatewayUrl() });
}
