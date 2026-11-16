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

test("preserves HTTP errors with unparseable bodies for every read method", async () => {
  for (const method of ["listProducts", "listEntitlements", "listOrders"]) {
    for (const [status, body] of [[401, ""], [502, "<html>Bad gateway</html>"], [503, "{invalid"]]) {
      const client = createCoreCommerceClient({
        coreOrigin: "https://core.example",
        fetchImpl: async () => new Response(body, { status })
      });
      await assert.rejects(client[method]({ playerToken: "session-token" }), {
        name: "CoreCommerceRequestError",
        status,
        code: "CORE_REQUEST_FAILED",
        message: "Core commerce request failed"
      });
    }
  }
});

test("rejects successful responses with unparseable bodies", async () => {
  for (const body of ["", "<html>Unexpected page</html>", "{invalid"]) {
    const client = createCoreCommerceClient({
      coreOrigin: "https://core.example",
      fetchImpl: async () => new Response(body, { status: 200 })
    });
    await assert.rejects(client.listProducts(), {
      name: "TypeError",
      message: "Core commerce response returned invalid JSON"
    });
  }
});

test("rejects malformed response envelopes", async () => {
  const client = createCoreCommerceClient({
    coreOrigin: "https://core.example",
    fetchImpl: async () => response(null, { body: { data: {} } })
  });
  await assert.rejects(client.listProducts(), /data must be an array/);
});
