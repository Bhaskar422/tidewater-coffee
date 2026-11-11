import Link from "next/link";
import { money, photoUrl, type Product } from "@/lib/store";

export default function ProductTile({ p }: { p: Product }) {
  return (
    <Link href={`/products/${p.sku}`} className="tile">
      <div className="tile-photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl(p.photo, 800, 600)} alt={p.name} loading="lazy" />
        {p.badge && <span className="badge">{p.badge}</span>}
      </div>
      <div className="tile-body">
        <p className="cat">{p.category}</p>
        <h3>{p.name}</h3>
        <p className="blurb">{p.blurb}</p>
        <p className="price">{money(p.priceCents)}</p>
      </div>
    </Link>
  );
}
