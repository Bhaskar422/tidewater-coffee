import { verifyEntry, type LedgerEntry } from "@/lib/gateway";
import { getProduct } from "@/lib/store";

/**
 * The gateway tells this store about a paid order by sending its signed capture record. The store accepts it only
 * if the signature verifies. This demo keeps no order book: it checks the record, logs it and acknowledges.
 */
export async function POST(req: Request) {
  try {
    const entry = ((await req.json()) as { entry?: LedgerEntry }).entry;
    if (!entry || entry.type !== "payment.captured" || !entry.purchaseId) return Response.json({ error: "Not a capture record" }, { status: 400 });
    const v = await verifyEntry(entry);
    if (!v.ok) return Response.json({ error: `Rejected: ${v.why}` }, { status: 400 });
    const p = entry.payload as { sku?: string; amountCents?: number; paypalCaptureId?: string };
    if (!p.sku || !getProduct(p.sku)) return Response.json({ error: "Unknown product" }, { status: 400 });
    console.log("paid order", { purchaseId: entry.purchaseId, sku: p.sku, amountCents: p.amountCents, paypalCaptureId: p.paypalCaptureId });
    return Response.json({ orderId: `ord_${entry.purchaseId}`, accepted: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Bad request" }, { status: 400 });
  }
}
