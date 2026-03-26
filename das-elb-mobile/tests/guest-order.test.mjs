import test from "node:test";
import assert from "node:assert/strict";

import {
  addCartItem,
  buildOrderSubmission,
  createInitialGuestOrderState,
  extractGuestCode,
  generateGuestSessionId,
  getCartCount,
  getCartTotal,
  guestOrderReducer,
  setCartItemQuantity,
} from "../src/domain/guest-order.ts";
import { buildApiUrl } from "../src/api/client.ts";

const sampleItem = {
  id: 10,
  name: "Masala Bowl",
  description: "Warm bowl",
  price: 14.5,
  category_id: 2,
  category_name: "Main",
  image_url: null,
  is_available: true,
  prep_time_min: 12,
  allergens: [],
  dietary_tags: ["vegan"],
};

test("extractGuestCode accepts raw codes and deep links", () => {
  assert.equal(extractGuestCode("abc123"), "abc123");
  assert.equal(extractGuestCode(" daselb://order?code=qr-token "), "qr-token");
  assert.equal(
    extractGuestCode("https://www.das-elb-hotel.com/order?code=table-9"),
    "table-9",
  );
  assert.equal(extractGuestCode(""), null);
});

test("guestOrderReducer starts a session and resets table-scoped state when table changes", () => {
  const initial = createInitialGuestOrderState();
  const first = guestOrderReducer(initial, {
    type: "start_session",
    payload: { tableCode: "A-1", guestName: "Ali" },
  });
  const withCart = guestOrderReducer(
    guestOrderReducer(first, { type: "add_item", payload: sampleItem }),
    { type: "set_order_notes", payload: "No onions" },
  );
  const second = guestOrderReducer(withCart, {
    type: "start_session",
    payload: { tableCode: "B-2", guestName: "Ali" },
  });

  assert.equal(first.tableCode, "A-1");
  assert.equal(first.guestName, "Ali");
  assert.equal(withCart.cart.length, 1);
  assert.equal(second.tableCode, "B-2");
  assert.equal(second.cart.length, 0);
  assert.equal(second.orderNotes, "");
});

test("cart helpers compute totals and quantities", () => {
  const one = addCartItem([], sampleItem);
  const two = addCartItem(one, sampleItem);
  const reduced = setCartItemQuantity(two, sampleItem.id, 1);

  assert.equal(getCartCount(two), 2);
  assert.equal(getCartTotal(two), 29);
  assert.equal(reduced[0].quantity, 1);
});

test("buildOrderSubmission uses the stable QR payload shape", () => {
  const cart = addCartItem([], sampleItem);
  const payload = buildOrderSubmission({
    tableCode: "table-code-99",
    guestName: "",
    cart,
    orderNotes: "Please fire together",
  });

  assert.deepEqual(payload, {
    table_code: "table-code-99",
    guest_name: "Guest",
    items: [
      {
        menu_item_id: 10,
        quantity: 1,
        notes: null,
      },
    ],
    notes: "Please fire together",
  });
});

test("shared API client preserves the stable QR endpoint paths", () => {
  assert.equal(
    buildApiUrl("/qr/menu/A%2FB", "https://api.das-elb.com/api"),
    "https://api.das-elb.com/api/qr/menu/A%2FB",
  );
  assert.equal(
    buildApiUrl("/qr/order", "https://api.das-elb.com/api"),
    "https://api.das-elb.com/api/qr/order",
  );
  assert.equal(
    buildApiUrl("/qr/order/42/status", "https://api.das-elb.com/api"),
    "https://api.das-elb.com/api/qr/order/42/status",
  );
});

test("generateGuestSessionId returns a deterministic prefix", () => {
  const sessionId = generateGuestSessionId(1700000000000);
  assert.match(sessionId, /^guest-/);
});
