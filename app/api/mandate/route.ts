import { presentToStore } from "@/lib/gateway";

/**
 * An agent posts the credential the gateway issued for this store, { payload, signature }. The store verifies it
 * offline against the gateway's public key and answers with its own reading: whether the store is covered, which
 * products fit the mandate's categories and limits, and which would need the buyer's approval. Same as the
 * present_mandate tool on /mcp. It authorises nothing: the gateway still decides every purchase.
 */
export async function POST(req: Request) {
  let sent: unknown = null;
  try { sent = await req.json(); } catch { /* answered as malformed below */ }
  try {
    const r = await presentToStore((sent as { credential?: unknown } | null)?.credential ?? sent);
    return Response.json(r.body, { status: r.status });
  } catch {
    return Response.json({ accepted: false, code: "unavailable", reason: "This store could not read the gateway's public key. Try again shortly." }, { status: 503 });
  }
}
