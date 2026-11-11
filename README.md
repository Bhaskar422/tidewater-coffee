# Tidewater Coffee Roasters

A demo online shop that takes orders from AI shopping agents through the [Mandate gateway](https://mandate-gateway.vercel.app). It is a separate site from the gateway, with its own repository and deployment, so it joins the gateway the way any outside merchant would. Nothing here is really for sale.

## What it serves

| Path | What it is |
|---|---|
| `/` and `/products/<sku>` | The shop. Each product page carries schema.org Product data, which the gateway reads for the name, category and price. |
| `/.well-known/mandate-merchant.json` | What the shop publishes to join a gateway: its ownership token, its name, its PayPal payee, where to send paid orders and where its catalogue is. |
| `/api/orders` | Where the gateway sends the signed record of a paid order. The shop accepts it only if the gateway's signature verifies. |
| `/mcp` | The catalogue as an MCP server for shopping agents (`search_products`, `get_product`), plus `present_mandate`, which takes a mandate credential (see below). |
| `/api/mandate` | The same credential check as plain HTTP: `POST` the credential, `{ payload, signature }`. `200` with the shop's reading, `401` with a reason when the credential was changed, has expired or was issued for another shop, `400` when it is not a credential. |
| `/api/products` | The same catalogue as JSON. |

## Checking a mandate credential

An agent can ask the gateway for a short-lived signed credential that says what its buyer's mandate allows, bound to this shop's address (`get_credential` with `store_url`). The agent shows it here with `present_mandate` or `POST /api/mandate`.

The shop checks it without calling the gateway. It reads the gateway's public key once from `${GATEWAY_URL}/.well-known/mandate-gateway.json`, then for each credential verifies the Ed25519 signature over the canonical JSON of the payload, the issuer, the expiry and that the audience is this shop. The check is in [`lib/mandate.ts`](lib/mandate.ts), which uses only Node's crypto module.

If the credential holds, the shop answers with its own reading: whether the mandate's store rule covers it as far as it can tell, which products are inside the stated categories and limits, which would need the buyer's approval, and which are outside. The match is on the catalogue's category and price. A credential authorises nothing by itself. The gateway still decides every purchase and makes the payment.

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
