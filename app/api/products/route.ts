import { store, storeUrl } from "@/lib/store";

/** The catalogue as JSON, for agents that do not speak MCP. */
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ store: store.name, products: store.products.map((p) => ({
    sku: p.sku, name: p.name, price: (p.priceCents / 100).toFixed(2), currency: "USD", category: p.category, description: p.description, url: `${storeUrl()}/products/${p.sku}`,
  })) });
}
