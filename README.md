# CMG Commerce

A Chaotic Minds Gaming-branded multi-grid economy and shop built on Chaotic Minds Gaming Core. This repository now contains the first read-only Core integration slice.

## Implemented

- `listProducts({ currency })` reads Core's public, active product catalogue.
- `listEntitlements({ playerToken })` reads the authenticated player's entitlements and delivery targets.
- `listOrders({ playerToken })` reads the authenticated player's order history.
- Minor-unit money values remain decimal strings to avoid JavaScript floating-point precision loss.
- Player session tokens are supplied per account-read call and are not retained by the client.
- HTTPS-only origin validation, redirect rejection, bounded request timeouts, response validation, and injectable `fetch` for tests.

## Explicitly not implemented yet

- **Wallet display:** Core currently has no wallet-balance or wallet-ledger read endpoint. This module does not invent one or query Core's database directly.
- Checkout/order creation, payment processing, reward claims, item grants, loot boxes, and refunds remain out of scope for this read-only slice.
- No payment keys, production credentials, or game-server configuration are used.

Core remains authoritative for products, orders, entitlements, payments and reward jobs. Commerce must not connect directly to PostgreSQL. Actual ATLAS item delivery remains gated on isolated adapter validation.

## Development

Requires Node.js 22 or later.

```bash
npm ci
npm run check
npm test
```

The tests use a fake Fetch implementation; they do not call a live Core instance.

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for the remaining delivery gates.
