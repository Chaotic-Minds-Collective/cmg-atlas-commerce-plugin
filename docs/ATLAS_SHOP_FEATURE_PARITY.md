# Atlas Shop — Feature Parity and Replacement Design

## Source boundary

The inspected `Atlas_Shop.zip` archive contains `AtlasShop.dll`, `AtlasShop.pdb`, `config.json` and `PluginInfo.json`. It contains no editable source or license file. The original binary and PDB are not reused, and no original implementation code is copied. The configuration and metadata are used only to document observable feature scope for an independent Chaotic Minds implementation.

The sample configuration contains database credentials (`apitest` / `12345`). These are example values only and must never be reused. The replacement uses Core-owned PostgreSQL data through authenticated APIs.

## Confirmed feature set

| Legacy capability | Evidence in the archived configuration | Replacement direction |
|---|---|---|
| Points/currency and balances | Timed points rewards, points display, insufficient-balance messages | Core wallet and immutable ledger; Commerce displays the Core balance through a documented API |
| Timed currency rewards | Configurable interval and reward groups such as Default and Premiums | Core reward source with group/entitlement policy, durable schedule and idempotent credit |
| Kits | Item and creature bundles; price, default claim amount, permissions, spawn-only rule, level limits and creature flags | Commerce kit catalogue plus Core entitlement; typed item/creature delivery mappings |
| Item shop and bundles | Item products with blueprint paths, quantity, quality and optional blueprint delivery | Validated item catalogue; blueprint registry and adapter grant contract |
| Creature purchases | Creature type, blueprint, level range and neutered flag | Validated creature product with level policy and server capability checks |
| Beacon and artifact crates | Supply-crate and artifact-crate product types | Explicit beacon/artifact delivery types, allowlisted class registry and anti-duplication checks |
| Experience purchases | XP amount and player-versus-creature target | Typed XP delivery action with target ownership and caps |
| Engram unlocks | Individual engram unlocks and an all-engrams command example | Typed engram-unlock policy; no arbitrary console command execution |
| Ships and hulls | Ship blueprint and hull blueprint | Typed ship/hull product mapping with ownership, placement and server validation |
| Selling items | Configured inventory item and quantity sold for points | Server-verified sell quote and atomic wallet credit; reject locked, equipped or prohibited items |
| Player-to-player transfers | `/trade` command and sent/received point messages | Core-owned atomic transfer with recipient resolution, limits, idempotency and audit |
| Pending claims/delivery | Claim command and pending/claimed item messages | Durable Core reward queue; player claim is separate from confirmed in-game delivery |
| Shop presentation | Shop pages, item count per page, display timing/text size, localized messages and commands | Commerce UI/API presentation; configurable labels without embedding privileged behavior |
| Default and permission kits | Default kit list and permission groups | Core RBAC/entitlements and explicit kit claim limits/cooldowns |

## Improvements over the legacy design

1. **Cluster-wide wallet:** one authoritative Core ledger across grids; no per-server point stores or independent MySQL copies.
2. **Atomic purchase:** wallet debit, order state and entitlement creation commit together. A retry cannot double-charge or double-grant.
3. **Idempotent delivery:** stable delivery keys, durable queue leases, retry limits and reconciliation after disconnects or server restarts.
4. **Typed actions only:** product configuration cannot run arbitrary RCON or console commands. Every action type is explicitly registered and validated.
5. **Blueprint validation:** reject unknown, malformed or unsupported item, creature, ship, hull, beacon and engram identifiers before purchase or delivery.
6. **Permission and eligibility gates:** permission group, level, spawn-only, PvP/combat, cooldown, tribe and server restrictions are evaluated server-side.
7. **Auditability:** record grants, debits, credits, transfers, refunds, admin adjustments, claim attempts and delivery acknowledgements.
8. **Safe selling:** the game adapter verifies the player's actual inventory and removes the exact eligible items before Core credits the wallet; no client-supplied inventory count is trusted.
9. **Safe reloads and migrations:** versioned configuration/schema changes; no destructive reload or silent fallback to an empty catalogue.
10. **Rate and value controls:** purchase caps, quantity limits, cooldowns, per-player/per-tribe limits and anti-exploit checks.

## Delivery sequence

1. Expose and test the Core-backed order/checkout/claim client contract.
2. Add documented Core wallet balance, ledger, credit, debit and transfer APIs. Define adjustment semantics before enabling admin adjustments.
3. Implement atomic wallet-funded purchases and transaction history.
4. Build item and kit products first, with isolated adapter grants and delivery acknowledgement.
5. Add creature, sell/trade, beacon/artifact, XP, engram and ship/hull actions in separately tested capability slices.
6. Add timed/playtime/vote/daily/event rewards, refund/revocation and reconciliation.
7. Add loot boxes only after odds publication, RNG audit and a complete refund/reconciliation policy.

## Current blockers

- Core has wallet and ledger tables but no public wallet balance or spend API.
- Core can create orders, create Stripe **test-mode** checkout sessions and queue entitlement claims; it does not currently provide a wallet-funded purchase flow.
- Core reward queue lease/acknowledgement endpoints exist, but a running delivery worker and confirmed native ATLAS grant implementation are not yet available.
- Native adapter CI compilation is not proof of live server ABI compatibility. Item delivery remains disabled until an isolated server test passes.
