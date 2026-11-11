import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import { gatewayUrl, store } from "@/lib/store";
import "./globals.css";

const heading = Fraunces({ variable: "--font-heading", subsets: ["latin"] });
const body = Inter({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = { title: { default: `${store.name} · ${store.tagline}`, template: `%s · ${store.name}` }, description: store.heroBody };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>
        <header className="site-header">
          <div className="wrap bar">
            <Link href="/" className="brand">
              <span className="mark">{store.mark}</span>
              <span>
                <span className="brand-name">{store.name}</span>
                <span className="brand-tag">{store.tagline}</span>
              </span>
            </Link>
            <nav aria-label="Store" className="nav">
              <Link href="/#shop">Shop</Link>
              <Link href="/#agents">Agent checkout</Link>
            </nav>
          </div>
        </header>
        <main className="wrap main">{children}</main>
        <footer className="site-footer">
          <div className="wrap foot">
            <p>{store.name} is a demo shop for the <a href={gatewayUrl()}>Mandate gateway</a>. Nothing here is really for sale.</p>
            <p>Catalogue for shopping agents: <code>/mcp</code> (MCP) and <code>/api/products</code> (JSON)</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
