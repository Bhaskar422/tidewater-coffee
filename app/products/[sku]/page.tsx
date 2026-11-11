import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductTile from "@/components/ProductTile";
import { getProduct, money, photoUrl, store, storeUrl } from "@/lib/store";

// Every product page is built ahead of time, so what a shopper sees and what the gateway fetches are the same document.
export const dynamicParams = false;
export const generateStaticParams = () => store.products.map((p) => ({ sku: p.sku }));
export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }): Promise<Metadata> {
  const p = getProduct((await params).sku);
  return p ? { title: p.name, description: p.description } : {};
}

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const p = getProduct((await params).sku);
  if (!p) notFound();
  const url = `${storeUrl()}/products/${p.sku}`;
  // The Mandate gateway reads this block to learn the product's name, SKU, category and price.
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.name, sku: p.sku, category: p.category, description: p.description, image: photoUrl(p.photo, 1200, 900),
    brand: { "@type": "Brand", name: store.name },
    offers: { "@type": "Offer", price: (p.priceCents / 100).toFixed(2), priceCurrency: "USD", availability: "https://schema.org/InStock", url } };
  const others = store.products.filter((x) => x.sku !== p.sku).slice(0, 3);

  return (
    <>
      <nav aria-label="Breadcrumb" className="crumbs"><Link href="/">{store.name}</Link><span>/</span><span>{p.category}</span></nav>
      <article className="product">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
        <div className="product-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(p.photo, 1200, 900)} alt={p.name} />
          {p.badge && <span className="badge">{p.badge}</span>}
        </div>
        <div>
          <p className="cat">{p.category} · SKU {p.sku}</p>
          <h1>{p.name}</h1>
          <p className="price">{money(p.priceCents)}</p>
          <p className="ship">In stock · {store.shipping}</p>
          <p className="desc">{p.description}</p>
          <ul className="features">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
          <div className="agent-box">
            <strong>Pay with PayPal through your shopping agent</strong>
            <p>Give your agent this page. The Mandate gateway checks the purchase against your rules and pays from your PayPal wallet.</p>
            <code>{url}</code>
          </div>
        </div>
      </article>

      <section className="section" aria-label={`More from ${store.name}`}>
        <div className="section-head"><h2>More from {store.name}</h2></div>
        <div className="grid">{others.map((x) => <ProductTile key={x.sku} p={x} />)}</div>
      </section>
    </>
  );
}
