# CMG Commerce

A Chaotic Minds Gaming-branded multi-grid economy and shop built on Chaotic Minds Gaming Core. This repository contains the player-facing Core client; Core remains authoritative for balances, orders, payments, entitlements and reward jobs.

## Implemented

- `listProducts({ currency })` reads Core's public, active product catalogue.
- `listEntitlements({ playerToken })` reads the authenticated player's entitlements and delivery targets.
- `listOrders({ playerToken })` reads the authenticated player's order history.
- `createOrder({ playerToken, idempotencyKey, currency, items })` creates an idempotent Core order from 1–20 product lines, with quantities limited to 1–10.
- `getCheckoutStatus()` reports whether Core's Stripe **test-mode** checkout is enabled.
- `createCheckoutSession({ playerToken, orderId, idempotencyKey })` asks Core to create or reuse a hosted Stripe test checkout session. The client accepts only HTTPS URLs on `checkout.stripe.com`.
- `claimEntitlement({ playerToken, entitlementId })` asks Core to enqueue the entitlement's configured game deliveries and returns the queue records. A queued or pending record is **not** proof that an item has been granted in-game.
- Minor-unit money values remain decimal strings to avoid JavaScript floating-point precision loss.
- Player session tokens are supplied per call and are not retained by the client.
- HTTPS-only Core origin validation, redirect rejection, bounded request timeouts, response validation, and injectable `fetch` for tests.

## Explicitly not implemented yet

- **Wallet balance/read/spend/transfer APIs:** Core's commerce schema contains wallet and ledger tables, but Core does not yet expose a wallet-balance or wallet-ledger endpoint. This module does not invent one or query Core's database directly.
- **Virtual-currency checkout:** order creation and Stripe test checkout are available through Core, but an atomic wallet debit-and-purchase flow is not yet implemented.
- **Actual game delivery:** Core can queue entitlement deliveries and exposes lease/acknowledgement contracts, but a running delivery worker and verified native item-grant adapter are still required. The client never grants items itself.
- Production/live payment processing, refunds, and production payment credentials. Core currently accepts only Stripe test-mode checkout events; no live payment mode is enabled by this client.
- The full legacy Atlas Shop catalogue parity: kits, sell/trade, creature and ship purchases, beacon/artifact crates, XP, engram actions, timed rewards, and admin controls are tracked in [ATLAS Shop feature parity](docs/ATLAS_SHOP_FEATURE_PARITY.md).

## Security and ownership

- Core owns wallets, orders, payments, entitlements, reward jobs and their audit trail. Commerce must not connect directly to PostgreSQL.
- Stripe secrets and webhook verification remain inside Core. This client accepts no card details or payment-provider secrets.
- `claimEntitlement` only requests durable queueing. The delivery worker must acknowledge success only after the game-side grant is confirmed.
- Arbitrary RCON or console command execution is not a Commerce product action. Use a typed, explicitly allowlisted delivery/action registry.
- Actual ATLAS item delivery remains gated on isolated adapter validation.

## Development

Requires Node.js 22 or later.

```bash
npm ci
npm run check
npm test
```

The tests use a fake Fetch implementation; they do not call a live Core instance or Stripe. The current suite contains 19 tests.

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for delivery gates.
