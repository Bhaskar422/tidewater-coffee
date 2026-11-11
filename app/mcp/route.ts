import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { store, storeUrl, type Product } from "@/lib/store";

// This store's catalogue for shopping agents. An agent finds a product here, then asks the Mandate gateway to buy it.
const view = (p: Product) => ({ sku: p.sku, name: p.name, price: (p.priceCents / 100).toFixed(2), currency: "USD", category: p.category, description: p.description, url: `${storeUrl()}/products/${p.sku}` });
const out = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o, null, 2) }] });

const handler = createMcpHandler((server) => {
  server.registerTool("search_products", { title: `Search ${store.name}`, description: `Search the ${store.name} catalogue. Returns products with prices and product page URLs.`,
    inputSchema: z.object({ query: z.string().describe("Search terms; empty returns everything").default("") }) },
    async ({ query }) => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = store.products.filter((p) => !words.length || words.some((w) => `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(w)));
      return out({ store: store.name, products: hits.map(view) });
    });
  server.registerTool("get_product", { title: "Get a product", description: `Full details for one ${store.name} product.`, inputSchema: z.object({ sku: z.string() }) },
    async ({ sku }) => { const p = store.products.find((x) => x.sku === sku); return out(p ? view(p) : { error: "No such product" }); });
}, { serverInfo: { name: "tidewater-coffee", version: "1.0.0" } });

export { handler as GET, handler as POST, handler as DELETE };
