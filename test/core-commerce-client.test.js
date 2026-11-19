import assert from "node:assert/strict";
import test from "node:test";

import { createCoreCommerceClient } from "../src/core-commerce-client.js";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const ENTITLEMENT_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const SERVER_ID = "44444444-4444-4444-8444-444444444444";

function response(data, options = {}) {
  const body = options.body ?? { data };
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    async json() { return body; }
  };
}

function product(overrides = {}) {
  return {
    id: PRODUCT_ID,
    sku: "VIP-30D",
    name: "VIP 30 Days",
    description: "Thirty days of supporter access",
    productType: "subscription",
    currency: "USD",
    amountMinor: "1299",
    ...overrides
  };
}

test("rejects non-HTTPS origins and origins with a path", () => {
  assert.throws(() => createCoreCommerceClient({ coreOrigin: "http://core.example" }), /HTTPS origin/);
  assert.throws(() => createCoreCommerceClient({ coreOrigin: "https://core.example/api" }), /without credentials, path/);
});

test("lists the public catalogue without sending player credentials", async () => {
  let captured;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response([product()]);
    }
  });

  const products = await client.listProducts({ currency: "usd" });
  assert.equal(captured.url, "https://core.example/catalog/products?currency=USD");
  assert.equal(captured.options.method, "GET");
  assert.equal(captured.options.redirect, "error");
  assert.equal(captured.options.cache, "no-store");
  assert.deepEqual(captured.options.headers, { accept: "application/json" });
  assert.equal(products[0].amountMinor, "1299");
  assert.equal(products[0].currency, "USD");
  assert.equal(Object.isFrozen(products), true);
  assert.equal(Object.isFrozen(products[0]), true);
});

test("preserves large minor-unit amounts without floating-point conversion", async () => {
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response([product({ amountMinor: "9007199254740993" })])
  });
  const [item] = await client.listProducts();
  assert.equal(item.amountMinor, "9007199254740993");
});

test("rejects catalogue rows with mismatched currency or malformed amounts", async () => {
  const wrongCurrency = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response([product({ currency: "CAD" })])
  });
  await assert.rejects(wrongCurrency.listProducts({ currency: "USD" }), /does not match/);

  const invalidAmount = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response([product({ amountMinor: 1.5 })])
  });
  await assert.rejects(invalidAmount.listProducts(), /non-negative integer/);
});

test("reads entitlements with a per-request player token", async () => {
  let captured;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response([{
        id: ENTITLEMENT_ID,
        status: "active",
        grantedAt: "2026-11-01T00:00:00.000Z",
        expiresAt: null,
        quantity: 1,
        sku: "VIP-30D",
        name: "VIP 30 Days",
        productType: "subscription",
        deliveryTargets: [{ gameKey: "atlas", serverId: SERVER_ID, serverName: "A1", rewardStatus: "delivered" }]
      }]);
    }
  });

  const entitlements = await client.listEntitlements({ playerToken: "player-session-token" });
  assert.equal(captured.url, "https://core.example/account/entitlements");
  assert.equal(captured.options.headers.authorization, "Bearer player-session-token");
  assert.equal(entitlements[0].deliveryTargets[0].serverId, SERVER_ID);
  assert.equal(Object.isFrozen(entitlements[0].deliveryTargets[0]), true);
});

test("reads order history and preserves exact minor-unit strings", async () => {
  let authorization;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async (_url, options) => {
      authorization = options.headers.authorization;
      return response([{
        id: ORDER_ID,
        status: "pending",
        currency: "USD",
        totalMinor: "2598",
        createdAt: "2026-11-02T00:00:00.000Z",
        paymentStatus: null,
        items: [{ name: "VIP 30 Days", sku: "VIP-30D", quantity: 2, unitAmountMinor: "1299" }]
      }]);
    }
  });
  const orders = await client.listOrders({ playerToken: "session-token" });
  assert.equal(authorization, "Bearer session-token");
  assert.equal(orders[0].totalMinor, "2598");
  assert.equal(orders[0].items[0].unitAmountMinor, "1299");
});

test("requires a player token for private account reads", async () => {
  const client = createCoreCommerceClient({ coreOrigin: "https://core.example", fetchImpl: async () => response([]) });
  await assert.rejects(client.listEntitlements(), /playerToken must be a non-empty string/);
  await assert.rejects(client.listOrders({ playerToken: " " }), /playerToken must be a non-empty string/);
});

test("surfaces Core error codes and HTTP status", async () => {
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response(null, {
      ok: false,
      status: 503,
      body: { error: { code: "DATABASE_UNAVAILABLE", message: "Try again later" } }
    })
  });
  await assert.rejects(client.listProducts(), (error) => {
    assert.equal(error.name, "CoreCommerceRequestError");
    assert.equal(error.status, 503);
    assert.equal(error.code, "DATABASE_UNAVAILABLE");
    return true;
  });
});

test("preserves HTTP status when an unsuccessful response has invalid JSON", async () => {
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => ({ ok: false, status: 503, async json() { throw new Error("empty body"); } })
  });
  await assert.rejects(client.listProducts(), (error) => {
    assert.equal(error.name, "CoreCommerceRequestError");
    assert.equal(error.status, 503);
    assert.equal(error.code, "CORE_REQUEST_FAILED");
    return true;
  });
});

test("rejects malformed response envelopes", async () => {
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response(null, { body: { data: {} } })
  });
  await assert.rejects(client.listProducts(), /data must be an array/);
});


const DELIVERY_ID = "55555555-5555-4555-8555-555555555555";
const STEAM_ID = "76561198000000000";

function delivery(overrides = {}) {
  return {
    id: DELIVERY_ID,
    gameKey: "atlas",
    serverId: SERVER_ID,
    targetExternalId: STEAM_ID,
    deliveryPayload: { deliveryType: "item", productSku: "VIP-30D", quantity: 1 },
    status: "pending",
    createdAt: "2026-11-17T00:00:00.000Z",
    ...overrides
  };
}

test("creates an idempotent Core order with validated items and per-request credentials", async () => {
  let captured;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response({
        orderId: ORDER_ID,
        status: "pending",
        currency: "USD",
        totalMinor: "2598",
        reused: false
      }, { status: 201 });
    }
  });

  const order = await client.createOrder({
    playerToken: "player-session-token",
    idempotencyKey: "order-request-001",
    currency: "usd",
    items: [{ productId: PRODUCT_ID, quantity: 2 }]
  });

  assert.equal(captured.url, "https://core.example/commerce/orders");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.authorization, "Bearer player-session-token");
  assert.equal(captured.options.headers["idempotency-key"], "order-request-001");
  assert.equal(captured.options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(captured.options.body), {
    currency: "USD",
    items: [{ productId: PRODUCT_ID, quantity: 2 }]
  });
  assert.equal(order.orderId, ORDER_ID);
  assert.equal(order.totalMinor, "2598");
  assert.equal(order.reused, false);
  assert.equal(Object.isFrozen(order), true);
});

test("rejects invalid order items and idempotency keys before making a request", async () => {
  let calls = 0;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => { calls += 1; return response({}); }
  });
  const base = { playerToken: "player-token", idempotencyKey: "order-request-001" };

  await assert.rejects(client.createOrder({ ...base, idempotencyKey: "short", items: [{ productId: PRODUCT_ID, quantity: 1 }] }), /between 8 and 128/);
  await assert.rejects(client.createOrder({ ...base, items: [] }), /between 1 and 20/);
  await assert.rejects(client.createOrder({ ...base, items: [{ productId: "not-a-uuid", quantity: 1 }] }), /must be a UUID/);
  await assert.rejects(client.createOrder({ ...base, items: [{ productId: PRODUCT_ID, quantity: 11 }] }), /between 1 and 10/);
  assert.equal(calls, 0);
});

test("reads the Core checkout capability without sending player credentials", async () => {
  let captured;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response({ enabled: true, provider: "stripe", mode: "test" });
    }
  });

  const status = await client.getCheckoutStatus();
  assert.equal(captured.url, "https://core.example/commerce/checkout/status");
  assert.equal(captured.options.method, "GET");
  assert.deepEqual(captured.options.headers, { accept: "application/json" });
  assert.deepEqual(status, { enabled: true, provider: "stripe", mode: "test" });
});

test("rejects a checkout capability response that advertises live or unknown payment mode", async () => {
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response({ enabled: true, provider: "stripe", mode: "live" })
  });
  await assert.rejects(client.getCheckoutStatus(), /Stripe test mode/);
});

test("creates a Stripe test checkout session with a separate idempotency key", async () => {
  let captured;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response({
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
        sessionId: "cs_test_123",
        expiresAt: "2026-11-17T01:00:00.000Z"
      }, { status: 201 });
    }
  });

  const session = await client.createCheckoutSession({
    playerToken: "player-session-token",
    orderId: ORDER_ID,
    idempotencyKey: "checkout-request-001"
  });
  assert.equal(captured.url, "https://core.example/commerce/orders/" + ORDER_ID + "/checkout");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.authorization, "Bearer player-session-token");
  assert.equal(captured.options.headers["idempotency-key"], "checkout-request-001");
  assert.equal(captured.options.body, undefined);
  assert.equal(session.sessionId, "cs_test_123");
  assert.equal(session.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_123");
  assert.equal(Object.isFrozen(session), true);
});

test("rejects checkout URLs outside the trusted Stripe HTTPS host", async () => {
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response({
      checkoutUrl: "https://checkout.evil.example/c/pay/cs_test_123",
      sessionId: "cs_test_123",
      expiresAt: "2026-11-17T01:00:00.000Z"
    })
  });
  await assert.rejects(client.createCheckoutSession({
    playerToken: "player-token",
    orderId: ORDER_ID,
    idempotencyKey: "checkout-request-001"
  }), /trusted Stripe HTTPS checkout host/);
});

test("queues an entitlement delivery claim and returns pending delivery records", async () => {
  let captured;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response({ entitlementId: ENTITLEMENT_ID, deliveries: [delivery()] }, { status: 202 });
    }
  });

  const claim = await client.claimEntitlement({
    playerToken: "player-session-token",
    entitlementId: ENTITLEMENT_ID
  });
  assert.equal(captured.url, "https://core.example/account/entitlements/" + ENTITLEMENT_ID + "/claim");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.authorization, "Bearer player-session-token");
  assert.equal(captured.options.headers["idempotency-key"], undefined);
  assert.equal(captured.options.body, undefined);
  assert.equal(claim.deliveries[0].status, "pending");
  assert.equal(claim.deliveries[0].targetExternalId, STEAM_ID);
  assert.equal(Object.isFrozen(claim.deliveries[0].deliveryPayload), true);
});

test("rejects claim responses with mismatched entitlement IDs or malformed deliveries", async () => {
  const mismatched = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response({ entitlementId: ORDER_ID, deliveries: [] }, { status: 202 })
  });
  await assert.rejects(mismatched.claimEntitlement({ playerToken: "player-token", entitlementId: ENTITLEMENT_ID }), /different entitlement ID/);

  const malformed = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response({ entitlementId: ENTITLEMENT_ID, deliveries: [delivery({ deliveryPayload: null })] }, { status: 202 })
  });
  await assert.rejects(malformed.claimEntitlement({ playerToken: "player-token", entitlementId: ENTITLEMENT_ID }), /deliveryPayload must be an object/);
});

test("preserves Core's checkout-disabled error without suggesting a payment was taken", async () => {
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response(null, {
      ok: false,
      status: 503,
      body: { error: { code: "CHECKOUT_DISABLED", message: "Test-mode checkout is not configured." } }
    })
  });
  await assert.rejects(client.createCheckoutSession({
    playerToken: "player-token",
    orderId: ORDER_ID,
    idempotencyKey: "checkout-request-001"
  }), (error) => {
    assert.equal(error.name, "CoreCommerceRequestError");
    assert.equal(error.status, 503);
    assert.equal(error.code, "CHECKOUT_DISABLED");
    return true;
  });
});


test("rejects a live Stripe checkout session ID even when the URL host is trusted", async () => {
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_live_123",
      sessionId: "cs_live_123",
      expiresAt: "2026-11-17T01:00:00.000Z"
    })
  });
  await assert.rejects(client.createCheckoutSession({
    playerToken: "player-token",
    orderId: ORDER_ID,
    idempotencyKey: "checkout-request-001"
  }), /Stripe test checkout session/);
});


test("lists authenticated wallet balances and preserves exact minor-unit strings", async () => {
  let captured;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response([
        { currencyCode: "ATK", balanceMinor: "9007199254740993", lastActivityAt: "2026-11-19T12:00:00.000Z" },
        { currencyCode: "USD", balanceMinor: "0", lastActivityAt: null }
      ]);
    }
  });

  const wallets = await client.listWallets({ playerToken: "player-session-token" });
  assert.equal(captured.url, "https://core.example/account/wallets");
  assert.equal(captured.options.method, "GET");
  assert.equal(captured.options.headers.authorization, "Bearer player-session-token");
  assert.equal(wallets[0].currencyCode, "ATK");
  assert.equal(wallets[0].balanceMinor, "9007199254740993");
  assert.equal(wallets[1].lastActivityAt, null);
  assert.equal(Object.isFrozen(wallets), true);
  assert.equal(Object.isFrozen(wallets[0]), true);
});

test("requires player credentials and rejects malformed wallet balances", async () => {
  let calls = 0;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => { calls += 1; return response([]); }
  });
  await assert.rejects(client.listWallets(), /playerToken must be a non-empty string/);

  for (const wallet of [
    { currencyCode: "US", balanceMinor: "10", lastActivityAt: null },
    { currencyCode: "USD", balanceMinor: "-1", lastActivityAt: null },
    { currencyCode: "USD", balanceMinor: "10", lastActivityAt: "not-a-date" }
  ]) {
    const malformed = createCoreCommerceClient({
      coreOrigin: "https://core.example",
      fetchImpl: async () => response([wallet])
    });
    await assert.rejects(malformed.listWallets({ playerToken: "player-token" }));
  }
  assert.equal(calls, 0);
});

test("lists wallet ledger entries with a bounded limit and authenticated player token", async () => {
  let captured;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response([{
        id: "66666666-6666-4666-8666-666666666666",
        entryType: "credit",
        amountMinor: "9007199254740993",
        referenceType: "payment",
        referenceId: "payment-123",
        createdAt: "2026-11-19T12:00:00.000Z"
      }]);
    }
  });

  const entries = await client.listWalletLedger({
    playerToken: "player-session-token",
    currencyCode: "atk",
    limit: 10
  });
  assert.equal(captured.url, "https://core.example/account/wallets/ATK/ledger?limit=10");
  assert.equal(captured.options.method, "GET");
  assert.equal(captured.options.headers.authorization, "Bearer player-session-token");
  assert.equal(entries[0].amountMinor, "9007199254740993");
  assert.equal(entries[0].entryType, "credit");
  assert.equal(Object.isFrozen(entries[0]), true);
});

test("rejects invalid wallet ledger currency, limit, entry type and amount before trusting the response", async () => {
  let calls = 0;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => { calls += 1; return response([]); }
  });
  await assert.rejects(client.listWalletLedger({ playerToken: "player-token", currencyCode: "AT", limit: 10 }), /three-letter code/);
  await assert.rejects(client.listWalletLedger({ playerToken: "player-token", currencyCode: "ATK", limit: 101 }), /between 1 and 100/);
  assert.equal(calls, 0);

  for (const entry of [
    { id: "66666666-6666-4666-8666-666666666666", entryType: "transfer", amountMinor: "10", referenceType: "order", referenceId: "x", createdAt: "2026-11-19T12:00:00.000Z" },
    { id: "66666666-6666-4666-8666-666666666666", entryType: "debit", amountMinor: "0", referenceType: "order", referenceId: "x", createdAt: "2026-11-19T12:00:00.000Z" },
    { id: "66666666-6666-4666-8666-666666666666", entryType: "debit", amountMinor: "10", referenceType: "order", referenceId: "x", createdAt: "invalid-date" }
  ]) {
    const malformed = createCoreCommerceClient({
      coreOrigin: "https://core.example",
      fetchImpl: async () => response([entry])
    });
    await assert.rejects(malformed.listWalletLedger({ playerToken: "player-token", currencyCode: "ATK" }));
  }
});

test("pays a pending order from the authenticated wallet without sending client-supplied amounts", async () => {
  let captured;
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response({ orderId: ORDER_ID, status: "paid", provider: "wallet", balanceMinor: "300", reused: false }, { status: 201 });
    }
  });

  const payment = await client.payOrderWithWallet({ playerToken: "player-session-token", orderId: ORDER_ID });
  assert.equal(captured.url, "https://core.example/commerce/orders/" + ORDER_ID + "/pay-with-wallet");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.authorization, "Bearer player-session-token");
  assert.equal(captured.options.body, undefined);
  assert.equal(captured.options.headers["idempotency-key"], undefined);
  assert.equal(payment.status, "paid");
  assert.equal(payment.provider, "wallet");
  assert.equal(payment.balanceMinor, "300");
  assert.equal(payment.reused, false);
  assert.equal(Object.isFrozen(payment), true);
});

test("validates wallet payment order identity and reused response", async () => {
  const mismatched = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response({ orderId: ENTITLEMENT_ID, status: "paid", provider: "wallet", balanceMinor: "300", reused: true })
  });
  await assert.rejects(mismatched.payOrderWithWallet({ playerToken: "player-token", orderId: ORDER_ID }), /different order ID/);

  const reused = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response({ orderId: ORDER_ID, status: "paid", provider: "wallet", balanceMinor: "300", reused: true })
  });
  assert.equal((await reused.payOrderWithWallet({ playerToken: "player-token", orderId: ORDER_ID })).reused, true);
});

test("surfaces insufficient wallet balance as a typed Core commerce error", async () => {
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response(null, {
      ok: false,
      status: 409,
      body: { error: { code: "INSUFFICIENT_WALLET_BALANCE", message: "The wallet balance is not sufficient for this order." } }
    })
  });
  await assert.rejects(client.payOrderWithWallet({ playerToken: "player-token", orderId: ORDER_ID }), (error) => {
    assert.equal(error.name, "CoreCommerceRequestError");
    assert.equal(error.status, 409);
    assert.equal(error.code, "INSUFFICIENT_WALLET_BALANCE");
    return true;
  });
});


test("accepts UUID case differences when matching the wallet payment response", async () => {
  const letteredOrderId = "abcdef12-3456-4abc-8def-abcdef123456";
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response({
      orderId: letteredOrderId,
      status: "paid",
      provider: "wallet",
      balanceMinor: "300",
      reused: false
    })
  });
  const payment = await client.payOrderWithWallet({
    playerToken: "player-token",
    orderId: letteredOrderId.toUpperCase()
  });
  assert.equal(payment.orderId, letteredOrderId);
});

test("rejects wallet payment responses with invalid status, provider or reused flag", async () => {
  const invalidResponses = [
    { orderId: ORDER_ID, status: "pending", provider: "wallet", balanceMinor: "300", reused: false },
    { orderId: ORDER_ID, status: "paid", provider: "stripe", balanceMinor: "300", reused: false },
    { orderId: ORDER_ID, status: "paid", provider: "wallet", balanceMinor: "300", reused: "true" }
  ];
  for (const data of invalidResponses) {
    const client = createCoreCommerceClient({
      coreOrigin: "https://core.example",
      fetchImpl: async () => response(data)
    });
    await assert.rejects(client.payOrderWithWallet({ playerToken: "player-token", orderId: ORDER_ID }));
  }
});
