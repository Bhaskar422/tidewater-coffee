import ProductTile from "@/components/ProductTile";
import { photoUrl, store } from "@/lib/store";

export default function Home() {
  return (
    <>
      <section className="hero" aria-label="Welcome">
        <div className="hero-copy">
          <p className="eyebrow">{store.heroEyebrow}</p>
          <h1>{store.heroTitle}</h1>
          <p className="hero-body">{store.heroBody}</p>
          <a href="#shop" className="cta">Shop now</a>
        </div>
        <div className="hero-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(store.heroPhoto, 1200, 900)} alt={store.heroAlt} />
        </div>
      </section>

      <ul className="perks">
        {store.perks.map((p) => <li key={p.title}><strong>{p.title}</strong><span>{p.body}</span></li>)}
      </ul>

      <section id="shop" className="section" aria-labelledby="shop-title">
        <div className="section-head">
          <h2 id="shop-title">{store.gridTitle}</h2>
          <p>{store.products.length} products</p>
        </div>
        <div className="grid">{store.products.map((p) => <ProductTile key={p.sku} p={p} />)}</div>
      </section>

      <section className="band" aria-label={store.closing.title}>
        <h2>{store.closing.title}</h2>
        <p>{store.closing.body}</p>
      </section>

      <section id="agents" className="band" aria-labelledby="agents-title">
        <h2 id="agents-title">Buying with a shopping agent</h2>
        <p>This shop takes orders from AI shopping agents through the Mandate gateway. The agent never sees your payment details, and the gateway only pays what your own rules allow.</p>
        <ol className="steps">
          <li><strong>Your agent finds a product</strong><span>From this site, or from the shop&apos;s catalogue for agents.</span></li>
          <li><strong>The gateway checks it</strong><span>It reads this shop&apos;s product page itself and compares the purchase with your mandate.</span></li>
          <li><strong>PayPal pays the shop</strong><span>From your saved wallet. We receive a signed record of the order and ship it.</span></li>
        </ol>
      </section>
    </>
  );
}
