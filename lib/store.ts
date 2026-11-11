import config from "@/store.config.json";

export type Product = { sku: string; name: string; priceCents: number; category: string; photo: string; badge?: string | null; blurb: string; description: string; features: string[] };
export const store = config as Omit<typeof config, "products"> & { products: Product[] };
export const getProduct = (sku: string) => store.products.find((p) => p.sku === sku) ?? null;

/** This store's public address. Vercel supplies the production domain; set STORE_URL anywhere else. */
export const storeUrl = () =>
  (process.env.STORE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, "");
/** The Mandate gateway this store accepts agent orders from. */
export const gatewayUrl = () => (process.env.GATEWAY_URL ?? "https://mandate-gateway.vercel.app").replace(/\/$/, "");

export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
/** A cropped product photo, served by Unsplash under the Unsplash licence. */
export const photoUrl = (id: string, w: number, h: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=75`;
