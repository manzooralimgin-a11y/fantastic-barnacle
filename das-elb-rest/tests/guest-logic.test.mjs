import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAvailabilityPath,
  buildRestaurantOrderPayload,
  buildRestaurantReservationPayload,
  normalizeApiBaseUrl,
  parsePositiveInt,
  readRuntimeConfig,
  summarizeOrderStatus,
} from "../public/assets/guest-logic.js";

test("normalizeApiBaseUrl keeps canonical /api suffix", () => {
  assert.equal(normalizeApiBaseUrl("http://localhost:8000"), "http://localhost:8000/api");
  assert.equal(normalizeApiBaseUrl("http://localhost:8000/api/"), "http://localhost:8000/api");
});

test("parsePositiveInt accepts only positive integers", () => {
  assert.equal(parsePositiveInt("5"), 5);
  assert.equal(parsePositiveInt("0"), null);
  assert.equal(parsePositiveInt("-1"), null);
  assert.equal(parsePositiveInt("abc"), null);
});

test("readRuntimeConfig prefers explicit runtime configuration and parses table code", () => {
  const config = readRuntimeConfig({
    API_BASE_URL: "http://localhost:9000",
    RESTAURANT_ID: "42",
    location: { search: "?table=ABC123" },
  });
  assert.deepEqual(config, {
    apiBaseUrl: "http://localhost:9000/api",
    restaurantId: 42,
    defaultTableCode: "ABC123",
    reservationSource: "restaurant_guest_web",
  });
});

test("buildAvailabilityPath produces canonical availability query", () => {
  assert.equal(
    buildAvailabilityPath({
      restaurantId: 42,
      reservationDate: "2026-08-01",
      partySize: 4,
    }),
    "/availability?restaurant_id=42&date=2026-08-01&party_size=4",
  );
});

test("buildRestaurantReservationPayload maps the guest reservation form into the unified backend payload", () => {
  const payload = buildRestaurantReservationPayload(
    {
      guestName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+49 40 555 0000",
      partySize: "4",
      reservationDate: "2026-09-01",
      startTime: "19:30",
      specialRequests: "Window table",
    },
    {
      restaurantId: 77,
      reservationSource: "restaurant_guest_web",
    },
  );

  assert.deepEqual(payload, {
    kind: "restaurant",
    restaurant_id: 77,
    guest_name: "Ada Lovelace",
    guest_email: "ada@example.com",
    guest_phone: "+49 40 555 0000",
    party_size: 4,
    reservation_date: "2026-09-01",
    start_time: "19:30:00",
    special_requests: "Window table",
    source: "restaurant_guest_web",
  });
});

test("buildRestaurantOrderPayload preserves menu items and guest table context", () => {
  const payload = buildRestaurantOrderPayload({
    tableCode: "TABLE-XYZ",
    guestName: "Grace Hopper",
    notes: "Extra napkins",
    items: [
      { menu_item_id: 10, quantity: 2, notes: "No onions" },
      { menu_item_id: 11, quantity: 1 },
    ],
  });

  assert.deepEqual(payload, {
    table_code: "TABLE-XYZ",
    guest_name: "Grace Hopper",
    notes: "Extra napkins",
    items: [
      { menu_item_id: 10, quantity: 2, notes: "No onions" },
      { menu_item_id: 11, quantity: 1, notes: null },
    ],
  });
});

test("summarizeOrderStatus aggregates waiter and kitchen status counts", () => {
  const summary = summarizeOrderStatus({
    items: [
      { status: "pending", quantity: 2 },
      { status: "preparing", quantity: 1 },
      { status: "ready", quantity: 3 },
      { status: "served", quantity: 1 },
    ],
  });

  assert.deepEqual(summary, {
    pending: 2,
    preparing: 1,
    ready: 3,
    served: 1,
    cancelled: 0,
    total: 7,
  });
});
