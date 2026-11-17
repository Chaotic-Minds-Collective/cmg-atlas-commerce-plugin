# CMG Commerce — Implementation Plan

## Purpose

A Chaotic Minds Gaming-branded multi-grid economy and shop with durable entitlements, a cluster wallet, and safe reward delivery.

## Feature scope

- Legacy Atlas Shop parity: points/currency, timed rewards, kits, item and creature purchases, beacon/artifact crates, XP, engram unlocks, ships/hulls, selling, player transfers, claim queues and shop presentation.
- Cluster wallet ledger with atomic, idempotent transactions.
- Kits, items, services, cosmetics, tame-color tokens and loot boxes.
- Vote, playtime, daily, event and community rewards.
- VIP entitlements and grid-specific delivery.
- Refund/revocation and failed-delivery reconciliation.

See [ATLAS_SHOP_FEATURE_PARITY.md](ATLAS_SHOP_FEATURE_PARITY.md) for the confirmed legacy feature inventory and the replacement design.

## Dependencies

- Core commerce, orders, wallet APIs, payments, entitlements and reward queue.
- ATLAS adapter: player resolution, blueprint validation and item/creature grants.
- Sentinel for audit and abuse signals; Connect for announcements; Tribes for optional group rewards.

## Data ownership

Core owns wallet balances/ledger, orders, payments, entitlements and durable reward jobs. Commerce owns ATLAS product catalogue metadata, SKU/blueprint references, bundles, kits, loot-box tables and delivery mappings. Commerce never reads Core's PostgreSQL database directly.

## Milestones

1. **Map Core commerce APIs and verify schemas — completed.** Core exposes catalogue, entitlement and order-history reads.
2. **Expose Core order and claim workflows in the Commerce client — implemented in this branch.** The client creates idempotent orders, reads checkout capability, requests Stripe test-mode checkout sessions, and queues entitlement claims. Nineteen unit tests cover the current client contract.
3. **Add Core wallet APIs — pending.** Wallet and ledger tables already exist in Core's commerce schema, but there is no player wallet read endpoint or atomic wallet-spend endpoint. Define balance semantics, currency isolation, idempotency, limits, transfer rules and admin audit before exposing these APIs.
4. **Add atomic virtual-currency purchases — pending Core work.** Debit and order/entitlement creation must occur in one database transaction. A failed or retried request must never double-charge or grant twice.
5. **Build the leased reward worker and native grant adapter — pending.** Core has reward claim/acknowledgement endpoints and lease schema; a worker must claim jobs, resolve the correct grid/server/player, perform a typed game grant, and acknowledge only after confirmed success.
6. **Implement Atlas Shop catalogue parity — pending.** Start with items and kits; then creatures, sell/trade, beacon/artifact crates, XP, engrams and ships/hulls after each delivery capability is proven.
7. **Add reward sources and reconciliation — pending.** Timed, playtime, vote, daily, event and community rewards; refund/revocation; failed-delivery retry and audit. Publish loot-box odds and audit RNG before loot boxes.

## Technical gates and risks

- Core Stripe checkout is test-mode-only. No live payment keys, production checkout or payment-mode expansion without separate approval.
- Core's `commerce.wallets` and `commerce.wallet_ledger` tables do not constitute a wallet API. Do not query them from Commerce or a game plugin.
- The reward claim endpoint queues delivery records; it does not grant items. Do not report a queued record as delivered.
- Actual ATLAS item delivery is not yet proven; do not enable reward delivery until the adapter passes an isolated server test.
- Validate every blueprint path and delivery type against an explicit registry. Reject unknown or unsupported actions.
- Never execute arbitrary commands from product configuration. Use a typed allowlist for supported game actions.
- Publish loot-box odds and audit RNG before any loot-box implementation.
- Do not deploy to production or change live server configuration during repository planning.

## Shared engineering requirements

- Use authenticated, least-privilege Core APIs; no direct database credentials in plugins.
- Preserve provider identifiers as strings; display names are not identifiers.
- Carry cluster, grid and server context on applicable records/events.
- Use stable event IDs, idempotency keys and correlation IDs.
- Keep network work off game-critical threads; use bounded timeouts, retries and circuit breakers.
- Keep secrets out of source control and separate credentials per server/integration.
- Add unit tests, fake-adapter contract tests and isolated runtime compatibility tests.
- Gate unsupported features behind explicit capabilities; fail closed for privileged actions.

## Current readiness

The Commerce client supports catalogue, entitlement and order-history reads, idempotent order creation, Stripe test-mode checkout status/session requests, and entitlement claim queueing. Core has test-mode Stripe webhook verification and reward queue claim/acknowledgement contracts. Core has wallet/ledger tables but no wallet API. A running reward worker and verified ATLAS item-grant adapter are still missing. No production deployment or live payment mode is implied.
