# CMG Commerce — Implementation Plan

## Purpose
A Chaotic Minds Gaming-branded multi-grid economy and shop with durable entitlements and reward delivery.

## Feature scope
- Original CMG shop catalogue and purchase history
- Cluster wallet ledger with idempotent transactions
- Kits, items, services, cosmetics, tame-color tokens and loot boxes
- Vote, playtime, daily, event and community rewards
- VIP entitlements and grid-specific delivery
- Refund/revocation and failed-delivery reconciliation

## Dependencies
- Core commerce, orders, entitlements, payment integration and reward queue
- ATLAS adapter: player resolution and item grants
- Sentinel for audit; Connect for announcements
- Tribes for optional group rewards

## Data ownership
Core owns wallet, orders, payments, entitlements and reward jobs. Commerce owns ATLAS item IDs, bundles, loot-box tables and delivery mappings.

## Milestones
1. **Map Core commerce APIs and verify schemas — completed for existing read APIs.** The module uses `GET /catalog/products`, `GET /account/entitlements`, and `GET /account/orders` as implemented by Core.
2. Define ATLAS item IDs and delivery contract — pending isolated adapter validation.
3. **Build read-only catalogue and account views — first slice implemented.** Catalogue, entitlement, delivery-target and order-history reads are available through `createCoreCommerceClient`. Wallet display is blocked because Core currently exposes no wallet-balance or wallet-ledger read endpoint.
4. Use Core orders/entitlements, no independent payment processing — pending. The current client is read-only and does not create orders or claim entitlements.
5. Build leased reward worker; acknowledge only after confirmed game grant — pending.
6. Add reward sources, loot boxes and reconciliation — pending.

## Technical gates and risks
- Actual ATLAS item delivery is not yet proven; do not enable reward delivery until the adapter passes an isolated server test.
- No live payment keys or production checkout; payment integration remains Core-owned and test-mode-only until explicitly approved.
- Publish loot-box odds and audit RNG before any loot-box implementation.
- A wallet UI must wait for a documented Core read API; never query the Core database directly.

## Shared engineering requirements
- Use authenticated, least-privilege Core APIs; no direct database credentials in plugins.
- Preserve provider identifiers as strings; display names are not identifiers.
- Carry cluster, grid and server context on applicable records/events.
- Use stable event IDs, idempotency keys and correlation IDs.
- Keep network work off game-critical threads; use bounded timeouts, retries and circuit breakers.
- Keep secrets out of source control and separate credentials per server/integration.
- Add unit tests, fake-adapter contract tests and isolated runtime compatibility tests.
- Gate unsupported features behind explicit capabilities; fail closed for privileged actions.
- Do not deploy to production or change live server configuration during repository planning.

## Current readiness
The read-only Core API client for catalogue, entitlements and order history is implemented with ten unit tests. No wallet endpoint exists in Core, and checkout, payment, reward claiming and ATLAS item delivery remain unimplemented. No production deployment is implied.
