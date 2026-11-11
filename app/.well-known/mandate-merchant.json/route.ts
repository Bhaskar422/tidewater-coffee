import mandate from "@/mandate.json";
import { store, storeUrl } from "@/lib/store";

// What this store publishes to join a Mandate gateway: the ownership token the gateway issued (edit mandate.json),
// the PayPal account to pay, and where paid orders should be sent.
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({
    mandate_verification: mandate.mandate_verification || null,
    name: store.name,
    paypal: mandate.paypal,
    orders_url: `${storeUrl()}/api/orders`,
    // Where shopping agents can read the catalogue as JSON.
    catalog_url: `${storeUrl()}/api/products`,
  });
}
