import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPublicMenuPath,
  buildRestaurantOrderPayload,
  buildRestaurantReservationPayload,
  normalizeMenuCategories,
  normalizeApiBaseUrl,
  readRuntimeConfig,
} from '../src/lib/restaurantClient.js';

test('normalizeApiBaseUrl enforces /api suffix', () => {
  assert.equal(normalizeApiBaseUrl('http://localhost:8000'), 'http://localhost:8000/api');
  assert.equal(normalizeApiBaseUrl('http://localhost:8000/api/'), 'http://localhost:8000/api');
});

test('readRuntimeConfig prefers runtime window config over defaults', () => {
  const config = readRuntimeConfig(
    {
      location: { search: '?table=ABC123' },
      RES_WEB_CONFIG: {
        apiBaseUrl: 'http://127.0.0.1:8000/api',
        restaurantId: 4240,
        reservationSource: 'test-suite',
      },
    },
    {},
  );

  assert.equal(config.apiBaseUrl, 'http://127.0.0.1:8000/api');
  assert.equal(config.restaurantId, 4240);
  assert.equal(config.defaultTableCode, 'ABC123');
  assert.equal(config.reservationSource, 'test-suite');
});

test('buildRestaurantReservationPayload maps canonical reservation fields', () => {
  const payload = buildRestaurantReservationPayload(
    {
      guestName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+49 123 456',
      partySize: '4',
      dateTime: '2026-08-14T19:30',
      specialRequests: 'Preferred area: lounge',
    },
    {
      restaurantId: 4240,
      reservationSource: 'res-web',
    },
  );

  assert.deepEqual(payload, {
    kind: 'restaurant',
    restaurant_id: 4240,
    guest_name: 'Ada Lovelace',
    guest_email: 'ada@example.com',
    guest_phone: '+49 123 456',
    party_size: 4,
    reservation_date: '2026-08-14',
    start_time: '19:30:00',
    special_requests: 'Preferred area: lounge',
    source: 'res-web',
  });
});

test('buildRestaurantOrderPayload maps live guest order fields', () => {
  const payload = buildRestaurantOrderPayload({
    tableCode: 'TABLE-42',
    guestName: 'Grace Hopper',
    notes: 'No peanuts',
    items: [
      { menu_item_id: 10, quantity: 2, notes: 'Extra spicy' },
      { menu_item_id: 11, quantity: 1 },
    ],
  });

  assert.deepEqual(payload, {
    table_code: 'TABLE-42',
    guest_name: 'Grace Hopper',
    notes: 'No peanuts',
    items: [
      { menu_item_id: 10, quantity: 2, notes: 'Extra spicy' },
      { menu_item_id: 11, quantity: 1, notes: null },
    ],
  });
});

test('buildPublicMenuPath scopes the guest menu to the configured restaurant', () => {
  assert.equal(
    buildPublicMenuPath({ restaurantId: 4240 }),
    '/public/restaurant/menu?restaurant_id=4240',
  );
  assert.equal(
    buildPublicMenuPath({ restaurantId: null }),
    '/public/restaurant/menu',
  );
});

test('normalizeMenuCategories removes invalid dishes and keeps backend fields', () => {
  const categories = normalizeMenuCategories([
    {
      id: 1,
      name: 'Starters',
      items: [
        { id: 10, name: 'Valid Dish', price: 12.5, description: 'Fresh', image_url: '/starter.png' },
        { id: 11, name: 'Zero Dish', price: 0, description: 'Should vanish' },
        { id: 12, name: 'Missing Price' },
      ],
    },
    {
      id: 2,
      name: 'Empty',
      items: [
        { id: 20, name: 'Free Water', price: null },
      ],
    },
  ]);

  assert.equal(categories.length, 1);
  assert.equal(categories[0].name, 'Starters');
  assert.deepEqual(
    categories[0].items.map((item) => ({ id: item.id, price: item.price, desc: item.desc })),
    [{ id: 10, price: 12.5, desc: 'Fresh' }],
  );
});
