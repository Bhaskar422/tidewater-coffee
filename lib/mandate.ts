// A store's side of the mandate credential. It needs only node:crypto and the gateway's public key, which the
// store reads once from <gateway>/.well-known/mandate-gateway.json and keeps. Nothing here calls the gateway or a
// database, so an outside store can copy this file as it is.
//
// A credential authorises nothing by itself. It tells the store what the buyer's mandate allows, so the store can
// say what it has that fits. Payment still goes through the gateway, which makes the decision.
import { createPublicKey, verify } from "node:crypto";

export const CREDENTIAL_TYPE = "mandate.authorisation";
export const CREDENTIAL_VERSION = 1;
/** The longest life a store accepts, whatever the credential says. The gateway issues 15 minutes. */
export const MAX_LIFETIME_MS = 60 * 60_000;
const CLOCK_SKEW_MS = 2 * 60_000;

export type CredentialMandate = {
  id: string; rulesHash: string; currency: string; remainingCents: number; perPurchaseLimitCents: number | null; approvalThresholdCents: number | null;
  allowedCategories: string[]; merchantPolicy: "verified_only" | "allowlist" | "any_registered"; allowedMerchants: string[]; expiresAt: string;
};
export type CredentialPayload = {
  type: typeof CREDENTIAL_TYPE; version: number; id: string; issuer: string; agent: { id: string }; audience: string | null;
  issuedAt: string; expiresAt: string; mandates: CredentialMandate[]; neverBuy: string[]; note?: string;
  /** The gateway's own, signed statement of where the audience store stands with it. Present when the credential is bound to a store. */
  store?: { registered: boolean; verified: boolean };
};
export type SignedCredential = { payload: CredentialPayload; signature: string; algorithm?: string };

/** The canonical form that is signed: JSON with object keys sorted, no whitespace, undefined keys left out. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

/** A store address in the one form used for the audience: scheme, host and path, no trailing slash. Null when it is not a web address. */
export function normalizeAudience(u: unknown): string | null {
  if (typeof u !== "string" || !u.trim() || u.length > 300) return null;
  try {
    const x = new URL(u.trim());
    if ((x.protocol !== "https:" && x.protocol !== "http:") || x.username || x.password) return null;
    return `${x.origin}${x.pathname.replace(/\/+$/, "")}`;
  } catch { return null; }
}

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const cents = (v: unknown) => typeof v === "number" && Number.isInteger(v);
const centsOrNull = (v: unknown) => v === null || (cents(v) && (v as number) >= 0);
const time = (v: unknown) => (str(v) ? Date.parse(v) : NaN);

/** The first thing wrong with a payload's shape, or null when every required field is present and well formed. */
export function payloadProblem(p: unknown): string | null {
  if (!p || typeof p !== "object" || Array.isArray(p)) return "payload is missing";
  const o = p as Record<string, unknown>;
  if (o.type !== CREDENTIAL_TYPE) return `type must be "${CREDENTIAL_TYPE}"`;
  if (o.version !== CREDENTIAL_VERSION) return `version must be ${CREDENTIAL_VERSION}`;
  if (!str(o.id)) return "id is missing";
  if (!str(o.issuer)) return "issuer is missing";
  if (!o.agent || typeof o.agent !== "object" || !str((o.agent as Record<string, unknown>).id)) return "agent.id is missing";
  if (o.audience !== null && !str(o.audience)) return "audience must be a store address or null";
  if (Number.isNaN(time(o.issuedAt))) return "issuedAt is missing or not a date";
  if (Number.isNaN(time(o.expiresAt))) return "expiresAt is missing or not a date";
  if (!strs(o.neverBuy)) return "neverBuy must be a list";
  if (o.store !== undefined) {
    const st = o.store as Record<string, unknown> | null;
    if (!st || typeof st !== "object" || typeof st.registered !== "boolean" || typeof st.verified !== "boolean") return "store must say registered and verified";
  }
  if (!Array.isArray(o.mandates) || !o.mandates.length) return "mandates is missing or empty";
  for (const [i, raw] of o.mandates.entries()) {
    const m = (raw ?? {}) as Record<string, unknown>, at = `mandates[${i}]`;
    if (!str(m.id)) return `${at}.id is missing`;
    if (!str(m.currency) || m.currency.length !== 3) return `${at}.currency is missing`;
    if (!cents(m.remainingCents)) return `${at}.remainingCents is missing`;
    if (!centsOrNull(m.perPurchaseLimitCents)) return `${at}.perPurchaseLimitCents must be a number of cents or null`;
    if (!centsOrNull(m.approvalThresholdCents)) return `${at}.approvalThresholdCents must be a number of cents or null`;
    if (!strs(m.allowedCategories) || !m.allowedCategories.length) return `${at}.allowedCategories is missing`;
    if (m.merchantPolicy !== "verified_only" && m.merchantPolicy !== "allowlist" && m.merchantPolicy !== "any_registered") return `${at}.merchantPolicy is not one this store knows`;
    if (!strs(m.allowedMerchants)) return `${at}.allowedMerchants must be a list`;
    if (Number.isNaN(time(m.expiresAt))) return `${at}.expiresAt is missing or not a date`;
  }
  return null;
}

export type RejectCode = "malformed" | "bad_signature" | "wrong_issuer" | "expired" | "not_yet_valid" | "unbound" | "wrong_audience";
export type Verified = { ok: true; payload: CredentialPayload } | { ok: false; code: RejectCode; reason: string };

/**
 * Check a credential offline. In order: shape, the gateway's signature, the issuer (when the store pins one), the
 * times, and that it was issued for this store. `audience` is the store's own address; pass null only for a check
 * that is not made by a store (the gateway's own verify endpoint does this).
 */
export function verifyCredential(credential: unknown, o: { publicKeyPem: string; audience: string | null; issuer?: string; now?: number }): Verified {
  const no = (code: RejectCode, reason: string) => ({ ok: false as const, code, reason });
  const c = credential as { payload?: unknown; signature?: unknown } | null;
  if (!c || typeof c !== "object" || typeof c.signature !== "string" || !c.payload) return no("malformed", "Send the credential exactly as the gateway issued it: { payload, signature }.");
  let signed = false;
  try { signed = verify(null, Buffer.from(canonical(c.payload)), createPublicKey(o.publicKeyPem), Buffer.from(c.signature, "base64")); } catch { signed = false; }
  if (!signed) return no("bad_signature", "The signature does not match the gateway's key. The credential was changed or was not issued by this gateway.");
  const problem = payloadProblem(c.payload);
  if (problem) return no("malformed", `This is not a mandate credential this store can read: ${problem}.`);
  const p = c.payload as CredentialPayload;
  if (o.issuer && normalizeAudience(p.issuer) !== normalizeAudience(o.issuer)) return no("wrong_issuer", `The credential names ${p.issuer} as its issuer. This store trusts ${o.issuer}.`);
  const now = o.now ?? Date.now(), from = Date.parse(p.issuedAt), until = Date.parse(p.expiresAt);
  if (until <= now) return no("expired", `The credential expired at ${p.expiresAt}. Ask the gateway for a new one.`);
  if (from > now + CLOCK_SKEW_MS) return no("not_yet_valid", "The credential is dated in the future.");
  if (until - from > MAX_LIFETIME_MS) return no("expired", "The credential is valid for longer than this store accepts.");
  if (o.audience !== null) {
    if (!p.audience) return no("unbound", `The credential is not bound to a store. Ask the gateway for one issued for ${o.audience}.`);
    if (normalizeAudience(p.audience) !== normalizeAudience(o.audience)) return no("wrong_audience", `The credential was issued for ${p.audience}, not for this store (${o.audience}).`);
  }
  return { ok: true, payload: p };
}

// ---- What the store answers --------------------------------------------------------------------

export type StoreProductView = { sku: string; name: string; priceCents: number; currency?: string; category: string; url: string };
export type StoreView = { name: string; url: string; /** What the store believes about its own standing at the gateway, when it knows. */ verified?: boolean; products: StoreProductView[] };
type Covered = "yes" | "no" | "unknown";

const host = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return null; } };
/** The same matching the gateway uses for store names in a mandate: the name, the host or a parent domain, or the start of the address. */
const named = (s: StoreView, list: string[]) => list.some((a) => {
  const x = a.trim().toLowerCase(), h = host(s.url);
  return !!x && (x === s.name.toLowerCase() || (!!h && (h === x || h.endsWith(`.${x}`))) || s.url.toLowerCase().startsWith(x));
});
const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => (w.length > 3 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
/** A plain match: every word of the mandate's category appears in the catalogue's category. */
const categoryFits = (allowed: string, category: string) => { const a = words(allowed), c = new Set(words(category)); return a.length > 0 && a.every((w) => c.has(w)); };
const money = (c: number, currency: string) => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(c / 100); } catch { return `${(c / 100).toFixed(2)} ${currency}`; } };

function storeCovered(s: StoreView, m: CredentialMandate, neverBuy: string[], standing?: CredentialPayload["store"]): { covered: Covered; why: string } {
  if (named(s, neverBuy)) return { covered: "no", why: "The buyer's never-buy list names this store." };
  if (m.merchantPolicy === "allowlist")
    return named(s, m.allowedMerchants) ? { covered: "yes", why: "The mandate names this store." } : { covered: "no", why: "The mandate names its stores, and this store is not one of them." };
  // The gateway's signed word on this store, when the credential carries it, outranks what the store believes about itself.
  if (standing) {
    if (!standing.registered) return { covered: "no", why: "The gateway says, in this credential, that this store is not registered with it yet." };
    if (m.merchantPolicy === "any_registered") return { covered: "yes", why: "The mandate accepts any store registered with the gateway, and the gateway says in this credential that this store is." };
    return standing.verified ? { covered: "yes", why: "The mandate accepts verified stores only, and the gateway says in this credential that it has verified this store." }
      : { covered: "no", why: "The mandate accepts verified stores only, and the gateway says in this credential that it has not verified this store." };
  }
  if (m.merchantPolicy === "any_registered") return { covered: "yes", why: "The mandate accepts any store registered with the gateway." };
  if (s.verified === true) return { covered: "yes", why: "The mandate accepts verified stores only. This store's own records say the gateway has verified it." };
  if (s.verified === false) return { covered: "no", why: "The mandate accepts verified stores only. This store's own records say the gateway has not verified it." };
  return { covered: "unknown", why: "The mandate accepts verified stores only. This store cannot tell from here whether the gateway has verified it." };
}

type Reading = { reading: "inside" | "needs_approval" | "outside"; why: string };
function readProduct(p: StoreProductView, m: CredentialMandate, now: number): Reading {
  const currency = p.currency ?? "USD", price = money(p.priceCents, currency);
  if (Date.parse(m.expiresAt) <= now) return { reading: "outside", why: "The mandate has ended." };
  if (currency !== m.currency) return { reading: "outside", why: `Priced in ${currency}; the mandate is in ${m.currency}.` };
  if (!m.allowedCategories.some((a) => categoryFits(a, p.category))) return { reading: "outside", why: `The catalogue category "${p.category}" is not one the mandate names (${m.allowedCategories.join(", ")}).` };
  if (m.perPurchaseLimitCents !== null && p.priceCents > m.perPurchaseLimitCents) return { reading: "outside", why: `${price} is over the ${money(m.perPurchaseLimitCents, m.currency)} limit for one purchase.` };
  if (p.priceCents > m.remainingCents) return { reading: "outside", why: `${price} is more than the ${money(Math.max(m.remainingCents, 0), m.currency)} that was left when the credential was issued.` };
  if (m.approvalThresholdCents !== null && p.priceCents > m.approvalThresholdCents) return { reading: "needs_approval", why: `${price} is above the buyer's ask-first amount of ${money(m.approvalThresholdCents, m.currency)}.` };
  return { reading: "inside", why: `"${p.category}" is a named category and ${price} is within the limits.` };
}

export const STORE_NOTE = "This is the store's own reading of the credential, matched on its catalogue's category and price for one item. It authorises nothing. Ask the gateway to buy: the gateway reads the product page itself, checks the whole mandate and decides.";
const RANK = { inside: 0, needs_approval: 1, outside: 2 } as const;

/** What a store tells an agent that showed a credential which verified: whether the store is covered, and which products fit. */
export function readMandate(p: CredentialPayload, s: StoreView, now = Date.now()) {
  const each = p.mandates.map((m) => ({ m, ...storeCovered(s, m, p.neverBuy, p.store) }));
  const open = each.filter((x) => x.covered !== "no");
  const covered: Covered = each.some((x) => x.covered === "yes") ? "yes" : open.length ? "unknown" : "no";
  const why = (each.find((x) => x.covered === covered) ?? each[0]).why;
  const rows = s.products.map((prod) => {
    // The best reading across the mandates under which this store could be paid.
    const best = open.map((x) => readProduct(prod, x.m, now)).sort((a, b) => RANK[a.reading] - RANK[b.reading])[0] ?? { reading: "outside" as const, why };
    return { sku: prod.sku, name: prod.name, price: (prod.priceCents / 100).toFixed(2), currency: prod.currency ?? "USD", category: prod.category, url: prod.url, ...best };
  });
  const pick = (r: Reading["reading"]) => rows.filter((x) => x.reading === r).map(({ reading: _r, ...rest }) => rest);
  return {
    accepted: true as const,
    credential: { id: p.id, issuer: p.issuer, agent_id: p.agent.id, audience: p.audience, issued_at: p.issuedAt, expires_at: p.expiresAt },
    store: { name: s.name, url: s.url },
    store_covered: covered, store_covered_why: why,
    inside: pick("inside"), needs_approval: pick("needs_approval"), outside: pick("outside"),
    note: STORE_NOTE,
  };
}

/** The whole store-side check in one call: verify, then answer. `status` is the HTTP status for the plain endpoint. */
export function presentMandate(credential: unknown, s: StoreView, o: { publicKeyPem: string; issuer?: string; now?: number }) {
  const v = verifyCredential(credential, { ...o, audience: s.url });
  if (!v.ok) return { status: v.code === "malformed" ? 400 : 401, body: { accepted: false as const, code: v.code, reason: v.reason, note: "Nothing was checked against the catalogue. A credential authorises nothing by itself; the gateway decides every purchase." } };
  return { status: 200, body: readMandate(v.payload, s, o.now) };
}
