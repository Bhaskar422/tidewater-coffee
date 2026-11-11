// What this store trusts about the gateway: its signature, and nothing else.
import { createHash, createPublicKey, verify } from "node:crypto";
import { gatewayUrl } from "./store";

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
