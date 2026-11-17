const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(field + " must be a non-empty string");
  }
  return value.trim();
}

function validateUuid(value, field) {
  const result = requiredString(value, field);
  if (!UUID.test(result)) throw new TypeError(field + " must be a UUID");
  return result;
}

function validateOrigin(value) {
  const raw = requiredString(value, "coreOrigin");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError("coreOrigin must be a valid HTTPS origin");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new TypeError("coreOrigin must be an HTTPS origin without credentials, path, query, or fragment");
  }
  return url.origin;
}

function validateCurrency(value) {
  const currency = requiredString(value, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError("currency must be a three-letter code");
  return currency;
}

function validateIdempotencyKey(value) {
  const key = requiredString(value, "idempotencyKey");
  if (key.length < 8 || key.length > 128) {
    throw new TypeError("idempotencyKey must contain between 8 and 128 characters");
  }
  return key;
}

function validateMinorAmount(value, field) {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  if (Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new TypeError(field + " must be a non-negative integer or decimal integer string");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateProduct(item, index, requestedCurrency) {
  const field = "products[" + index + "]";
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new TypeError(field + " must be an object");
  }
  const description = item.description;
  if (description !== null && typeof description !== "string") {
    throw new TypeError(field + ".description must be a string or null");
  }
  const currency = validateCurrency(item.currency);
  if (currency !== requestedCurrency) throw new TypeError(field + ".currency does not match the requested currency");
  return deepFreeze({
    id: validateUuid(item.id, field + ".id"),
    sku: requiredString(item.sku, field + ".sku"),
    name: requiredString(item.name, field + ".name"),
    description,
    productType: requiredString(item.productType, field + ".productType"),
    currency,
    amountMinor: validateMinorAmount(item.amountMinor, field + ".amountMinor")
  });
}

function validateDeliveryTarget(target, index) {
  const field = "deliveryTargets[" + index + "]";
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw new TypeError(field + " must be an object");
  }
  const serverId = target.serverId === null ? null : validateUuid(target.serverId, field + ".serverId");
  for (const key of ["serverName", "rewardStatus"]) {
    if (target[key] !== null && typeof target[key] !== "string") {
      throw new TypeError(field + "." + key + " must be a string or null");
    }
  }
  return deepFreeze({
    gameKey: requiredString(target.gameKey, field + ".gameKey"),
    serverId,
    serverName: target.serverName,
    rewardStatus: target.rewardStatus
  });
}

function validateEntitlement(item, index) {
  const field = "entitlements[" + index + "]";
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new TypeError(field + " must be an object");
  }
  if (item.expiresAt !== null && typeof item.expiresAt !== "string") {
    throw new TypeError(field + ".expiresAt must be a string or null");
  }
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
    throw new TypeError(field + ".quantity must be a positive safe integer");
  }
  if (!Array.isArray(item.deliveryTargets)) throw new TypeError(field + ".deliveryTargets must be an array");
  return deepFreeze({
    id: validateUuid(item.id, field + ".id"),
    status: requiredString(item.status, field + ".status"),
    grantedAt: requiredString(item.grantedAt, field + ".grantedAt"),
    expiresAt: item.expiresAt,
    quantity: item.quantity,
    sku: requiredString(item.sku, field + ".sku"),
    name: requiredString(item.name, field + ".name"),
    productType: requiredString(item.productType, field + ".productType"),
    deliveryTargets: Object.freeze(item.deliveryTargets.map(validateDeliveryTarget))
  });
}

function validateOrderItem(item, index) {
  const field = "orders.items[" + index + "]";
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new TypeError(field + " must be an object");
  }
  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
    throw new TypeError(field + ".quantity must be a positive safe integer");
  }
  return deepFreeze({
    name: requiredString(item.name, field + ".name"),
    sku: requiredString(item.sku, field + ".sku"),
    quantity: item.quantity,
    unitAmountMinor: validateMinorAmount(item.unitAmountMinor, field + ".unitAmountMinor")
  });
}

function validateOrder(item, index) {
  const field = "orders[" + index + "]";
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new TypeError(field + " must be an object");
  }
  if (!Array.isArray(item.items)) throw new TypeError(field + ".items must be an array");
  if (item.paymentStatus !== null && typeof item.paymentStatus !== "string") {
    throw new TypeError(field + ".paymentStatus must be a string or null");
  }
  return deepFreeze({
    id: validateUuid(item.id, field + ".id"),
    status: requiredString(item.status, field + ".status"),
    currency: validateCurrency(item.currency),
    totalMinor: validateMinorAmount(item.totalMinor, field + ".totalMinor"),
    createdAt: requiredString(item.createdAt, field + ".createdAt"),
    paymentStatus: item.paymentStatus,
    items: Object.freeze(item.items.map(validateOrderItem))
  });
}

function validateOrderItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    throw new TypeError("items must contain between 1 and 20 products");
  }
  return Object.freeze(items.map((item, index) => {
    const field = "items[" + index + "]";
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError(field + " must be an object");
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
      throw new TypeError(field + ".quantity must be an integer between 1 and 10");
    }
    return deepFreeze({
      productId: validateUuid(item.productId, field + ".productId"),
      quantity: item.quantity
    });
  }));
}

function validateCreatedOrder(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Core order creation data must be an object");
  }
  if (data.reused !== undefined && typeof data.reused !== "boolean") {
    throw new TypeError("Core order creation reused flag must be a boolean");
  }
  const result = {
    orderId: validateUuid(data.orderId, "orderId"),
    status: requiredString(data.status, "order status")
  };
  if (data.currency !== undefined) result.currency = validateCurrency(data.currency);
  if (data.totalMinor !== undefined) result.totalMinor = validateMinorAmount(data.totalMinor, "totalMinor");
  if (data.reused !== undefined) result.reused = data.reused;
  return deepFreeze(result);
}

function validateCheckoutStatus(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Core checkout status data must be an object");
  }
  if (typeof data.enabled !== "boolean") throw new TypeError("Core checkout status enabled must be a boolean");
  if (data.provider !== "stripe" || data.mode !== "test") {
    throw new TypeError("Core checkout status must identify Stripe test mode");
  }
  return deepFreeze({ enabled: data.enabled, provider: data.provider, mode: data.mode });
}

function validateCheckoutSession(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Core checkout session data must be an object");
  }
  const checkoutUrl = requiredString(data.checkoutUrl, "checkoutUrl");
  let url;
  try {
    url = new URL(checkoutUrl);
  } catch {
    throw new TypeError("checkoutUrl must be a valid Stripe HTTPS checkout URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password || url.hash) {
    throw new TypeError("checkoutUrl must use the trusted Stripe HTTPS checkout host");
  }
  const expiresAt = data.expiresAt;
  if (expiresAt !== null && (typeof expiresAt !== "string" || Number.isNaN(Date.parse(expiresAt)))) {
    throw new TypeError("expiresAt must be a valid date string or null");
  }
  return deepFreeze({
    checkoutUrl: url.toString(),
    sessionId: requiredString(data.sessionId, "sessionId"),
    expiresAt
  });
}

function validateRewardDelivery(item, index) {
  const field = "deliveries[" + index + "]";
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new TypeError(field + " must be an object");
  }
  const serverId = item.serverId === null ? null : validateUuid(item.serverId, field + ".serverId");
  if (!item.deliveryPayload || typeof item.deliveryPayload !== "object" || Array.isArray(item.deliveryPayload)) {
    throw new TypeError(field + ".deliveryPayload must be an object");
  }
  return deepFreeze({
    id: validateUuid(item.id, field + ".id"),
    gameKey: requiredString(item.gameKey, field + ".gameKey"),
    serverId,
    targetExternalId: requiredString(item.targetExternalId, field + ".targetExternalId"),
    deliveryPayload: item.deliveryPayload,
    status: requiredString(item.status, field + ".status"),
    createdAt: requiredString(item.createdAt, field + ".createdAt")
  });
}

function validateEntitlementClaim(data, requestedEntitlementId) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Core entitlement claim data must be an object");
  }
  const entitlementId = validateUuid(data.entitlementId, "entitlementId");
  if (entitlementId !== requestedEntitlementId) {
    throw new TypeError("Core entitlement claim returned a different entitlement ID");
  }
  if (!Array.isArray(data.deliveries)) throw new TypeError("Core entitlement claim deliveries must be an array");
  return deepFreeze({
    entitlementId,
    deliveries: Object.freeze(data.deliveries.map(validateRewardDelivery))
  });
}

async function readResponse(response, operation) {
  if (!response || typeof response !== "object" ||
      typeof response.ok !== "boolean" || typeof response.status !== "number") {
    throw new TypeError("Core " + operation + " response must be a Fetch API Response");
  }
  let body;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      const error = new Error("Core commerce request failed");
      error.name = "CoreCommerceRequestError";
      error.status = response.status;
      error.code = "CORE_REQUEST_FAILED";
      throw error;
    }
    throw new TypeError("Core " + operation + " response returned invalid JSON");
  }
  if (!response.ok) {
    const error = new Error(typeof body?.error?.message === "string" ? body.error.message : "Core commerce request failed");
    error.name = "CoreCommerceRequestError";
    error.status = response.status;
    error.code = typeof body?.error?.code === "string" ? body.error.code : "CORE_REQUEST_FAILED";
    throw error;
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.hasOwn(body, "data")) {
    throw new TypeError("Core " + operation + " response must contain a data field");
  }
  return body.data;
}

/**
 * Create a player-facing client for Core's catalogue, account views, order creation,
 * test-mode checkout, and entitlement delivery claims. Player credentials are supplied
 * per call and are never retained. Core remains authoritative for payments and rewards.
 */
export function createCoreCommerceClient({
  coreOrigin,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const origin = validateOrigin(coreOrigin);
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError("timeoutMs must be an integer between 100 and 30000");
  }

  async function request(path, { playerToken, method = "GET", body, idempotencyKey, operation = "commerce" } = {}) {
    if (method !== "GET" && method !== "POST") throw new TypeError("Core commerce method must be GET or POST");
    const headers = { accept: "application/json" };
    if (playerToken !== undefined) headers.authorization = "Bearer " + requiredString(playerToken, "playerToken");
    if (idempotencyKey !== undefined) headers["idempotency-key"] = validateIdempotencyKey(idempotencyKey);
    const init = {
      method,
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs)
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchImpl(origin + path, init);
    } catch (error) {
      const failure = new Error("Core commerce request failed");
      failure.cause = error;
      throw failure;
    }
    return readResponse(response, operation);
  }

  async function listProducts({ currency = "USD" } = {}) {
    const normalizedCurrency = validateCurrency(currency);
    const url = new URL("/catalog/products", origin);
    url.searchParams.set("currency", normalizedCurrency);
    const data = await request(url.pathname + url.search, { operation: "product catalogue" });
    if (!Array.isArray(data)) throw new TypeError("Core product catalogue data must be an array");
    return Object.freeze(data.map((item, index) => validateProduct(item, index, normalizedCurrency)));
  }

  async function listEntitlements({ playerToken } = {}) {
    requiredString(playerToken, "playerToken");
    const data = await request("/account/entitlements", { playerToken, operation: "entitlement list" });
    if (!Array.isArray(data)) throw new TypeError("Core entitlement data must be an array");
    return Object.freeze(data.map(validateEntitlement));
  }

  async function listOrders({ playerToken } = {}) {
    requiredString(playerToken, "playerToken");
    const data = await request("/account/orders", { playerToken, operation: "order history" });
    if (!Array.isArray(data)) throw new TypeError("Core order history data must be an array");
    return Object.freeze(data.map(validateOrder));
  }

  async function createOrder({ playerToken, idempotencyKey, currency = "USD", items } = {}) {
    requiredString(playerToken, "playerToken");
    const payload = {
      currency: validateCurrency(currency),
      items: validateOrderItems(items)
    };
    const data = await request("/commerce/orders", {
      playerToken,
      method: "POST",
      idempotencyKey,
      body: payload,
      operation: "order creation"
    });
    return validateCreatedOrder(data);
  }

  async function getCheckoutStatus() {
    const data = await request("/commerce/checkout/status", { operation: "checkout status" });
    return validateCheckoutStatus(data);
  }

  async function createCheckoutSession({ playerToken, orderId, idempotencyKey } = {}) {
    requiredString(playerToken, "playerToken");
    const normalizedOrderId = validateUuid(orderId, "orderId");
    const data = await request("/commerce/orders/" + encodeURIComponent(normalizedOrderId) + "/checkout", {
      playerToken,
      method: "POST",
      idempotencyKey,
      operation: "checkout session"
    });
    return validateCheckoutSession(data);
  }

  async function claimEntitlement({ playerToken, entitlementId } = {}) {
    requiredString(playerToken, "playerToken");
    const normalizedEntitlementId = validateUuid(entitlementId, "entitlementId");
    const data = await request("/account/entitlements/" + encodeURIComponent(normalizedEntitlementId) + "/claim", {
      playerToken,
      method: "POST",
      operation: "entitlement claim"
    });
    return validateEntitlementClaim(data, normalizedEntitlementId);
  }

  return Object.freeze({
    listProducts,
    listEntitlements,
    listOrders,
    createOrder,
    getCheckoutStatus,
    createCheckoutSession,
    claimEntitlement
  });
}

export const CORE_COMMERCE_DEFAULTS = Object.freeze({
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxTimeoutMs: MAX_TIMEOUT_MS
});
