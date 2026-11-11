# Tidewater Coffee Roasters

A demo online shop that takes orders from AI shopping agents through the [Mandate gateway](https://mandate-gateway.vercel.app). It is a separate site from the gateway, with its own repository and deployment, so it joins the gateway the way any outside merchant would. Nothing here is really for sale.

## What it serves

| Path | What it is |
|---|---|
| `/` and `/products/<sku>` | The shop. Each product page carries schema.org Product data, which the gateway reads for the name, category and price. |
| `/.well-known/mandate-merchant.json` | What the shop publishes to join a gateway: its ownership token, its name, its PayPal payee and where to send paid orders. |
| `/api/orders` | Where the gateway sends the signed record of a paid order. The shop accepts it only if the gateway's signature verifies. |
| `/mcp` | The catalogue as an MCP server for shopping agents (`search_products`, `get_product`). |
| `/api/products` | The same catalogue as JSON. |

## Joining a gateway

1. In the gateway's merchant portal (`/for-merchants`), register this shop's address. The gateway issues an ownership token.
2. Put the token in [`mandate.json`](mandate.json) as `mandate_verification`, commit, and let the site redeploy.
3. Back in the merchant portal, click **Check the file now**. The gateway fetches `/.well-known/mandate-merchant.json`, matches the token and saves the PayPal payee. The shop is then registered and can be paid.

`mandate.json` also names the PayPal account to pay (`paypal.merchant_id` or `paypal.email`). This demo uses a PayPal sandbox business account.

## Limits

- No order book: a paid order is verified and logged, not stored.
- No returns endpoint, so the gateway cannot negotiate a refund with this shop; a buyer would use PayPal's own dispute process.
- Product photos are served by Unsplash.

## Run it locally

Needs Node 22 and pnpm.

```bash
pnpm install
pnpm dev
```

`GATEWAY_URL` chooses the gateway whose signatures the shop trusts (default `https://mandate-gateway.vercel.app`). `STORE_URL` sets the shop's public address when it is not on Vercel.

MIT licensed.
