import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const ROOT = '/Users/ali/Documents/das elb/Das-Elb-landingpage';
const require = createRequire(new URL(`${ROOT}/frontend/package.json`, import.meta.url));
const { chromium } = require('playwright');

const runtime = JSON.parse(await fs.readFile(`${ROOT}/.dev/runtime.json`, 'utf8'));
const BASE_URL = 'http://127.0.0.1:8000';
const API_BASE = `${BASE_URL}/api`;
const RESTAURANT_URL = 'http://127.0.0.1:3002';
const AUTH_HEADERS = {};
let currentStep = 'boot';
let debugState = {};

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...AUTH_HEADERS,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`API ${path} failed with ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function login() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: runtime.admin_email,
      password: runtime.admin_password,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`login failed: ${response.status} ${JSON.stringify(body)}`);
  }
  AUTH_HEADERS.Authorization = `Bearer ${body.access_token}`;
}

async function ensureTableCode() {
  const tables = await api('/reservations/tables');
  const active =
    tables.find((table) => table.is_active && table.status === 'available' && Number(table.capacity || 0) > 0) ||
    tables.find((table) => table.is_active && Number(table.capacity || 0) > 0) ||
    tables.find((table) => table.is_active && table.status === 'available') ||
    tables.find((table) => table.is_active) ||
    tables[0];
  const codes = await api(`/qr/admin/tables/${active.id}/qr-codes`);
  let code = codes.find((entry) => entry.is_active);
  if (!code) {
    code = await api(`/qr/admin/tables/${active.id}/qr-code`, { method: 'POST', body: '{}' });
  }
  return { table: active, code: code.code };
}

async function chooseRestaurantSlot(restaurantId) {
  const today = new Date();
  for (let offset = 60; offset < 120; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const reservationDate = date.toISOString().slice(0, 10);
    const availability = await api(`/availability?restaurant_id=${restaurantId}&date=${reservationDate}&party_size=2`, {
      headers: {},
    });
    const slot = (availability.slots || []).find((entry) => entry.available);
    if (slot) {
      return { reservationDate, slot };
    }
  }
  throw new Error('No reservation slot available for validation');
}

async function waitForReservationGuest(guestName) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const reservations = await api('/reservations');
    const match = reservations.find((item) => item.guest_name === guestName);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`reservation for ${guestName} not found in backend`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});
page.on('pageerror', (error) => pageErrors.push(String(error)));

try {
  await login();
  const tableContext = await ensureTableCode();
  const reservationSelection = await chooseRestaurantSlot(runtime.restaurant_id);

  const suffix = Date.now();
  const orderGuest = `ResWeb Order ${suffix}`;
  const reservationGuest = `ResWeb Reservation ${suffix}`;

  currentStep = 'open_restaurant';
  await page.goto(RESTAURANT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#api-url', { timeout: 10000, state: 'attached' });
  const apiUrl = (await page.locator('#api-url').innerText()).trim();

  currentStep = 'open_order';
  await page.locator('[data-nav="order"]').click();
  await page.waitForSelector('#guest-name', { timeout: 10000 });
  await page.locator('#guest-name').fill(orderGuest);
  await page.locator('#table-code').fill(tableContext.code);
  await page.locator('#load-table').click();
  await page.waitForFunction(() => /connected/i.test(document.querySelector('#table-message')?.textContent || ''), {}, { timeout: 10000 });

  currentStep = 'open_scoped_menu';
  await page.locator('[data-nav="menu"]').click();
  await page.waitForSelector('[data-menu-item]', { timeout: 10000 });
  await page.locator('button[data-cart-action="add"]:not([disabled])').first().click();
  await page.waitForSelector('button[data-cart-action="increase"]', { timeout: 10000 });
  debugState.menuCartReady = true;

  currentStep = 'return_order';
  await page.locator('[data-nav="order"]').click();
  debugState.cartTextAfterTableLoad = await page.locator('#cart-items').innerText();
  debugState.submitDisabledAfterTableLoad = await page.locator('#submit-order').isDisabled();
  if (debugState.submitDisabledAfterTableLoad) {
    throw new Error('submit button remained disabled after table context load');
  }
  await page.locator('#submit-order').click();
  await page.waitForFunction(() => /Order #/i.test(document.querySelector('#order-message')?.textContent || ''), {}, { timeout: 10000 });
  const orderMessage = await page.locator('#order-message').innerText();
  const orderIdMatch = orderMessage.match(/#(\d+)/) || (await page.locator('#order-tracker h3').innerText()).match(/#(\d+)/);
  const orderId = orderIdMatch ? Number(orderIdMatch[1]) : null;

  currentStep = 'open_booking';
  await page.locator('[data-nav="booking"]').click();
  await page.waitForSelector('#reservation-datetime', { timeout: 10000 });
  await page.locator('#reservation-datetime').fill(
    `${reservationSelection.reservationDate}T${reservationSelection.slot.start_time.slice(0, 5)}`,
  );
  await page.locator('#reservation-datetime').dispatchEvent('change');
  await page.waitForFunction(
    (slotTime) => Array.from(document.querySelectorAll('[data-slot-time]')).some((node) => node.getAttribute('data-slot-time') === slotTime),
    reservationSelection.slot.start_time,
    { timeout: 10000 },
  );
  await page.locator(`[data-slot-time="${reservationSelection.slot.start_time}"]`).click();
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.waitForSelector('#reservation-guest-name', { timeout: 10000 });
  await page.locator('#reservation-guest-name').fill(reservationGuest);
  await page.locator('#reservation-email').fill('res-web@example.com');
  await page.locator('#reservation-phone').fill('+49 40 555 1810');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByRole('button', { name: /confirm booking/i }).click();
  const createdReservation = await waitForReservationGuest(reservationGuest);
  const reservationId = createdReservation?.id ?? null;
  const reservationMessage = `Reservation #${reservationId} confirmed for ${reservationGuest}.`;

  currentStep = 'backend_verify';
  const reservations = await api('/reservations');
  const waiterOrders = await api('/billing/orders/live');
  if (orderId) {
    await api(`/billing/orders/${orderId}/send-to-kitchen`, { method: 'POST', body: '{}' });
  }
  const kitchenOrders = await api('/billing/kds/orders');

  console.log(JSON.stringify({
    apiUrl,
    tableCode: tableContext.code,
    reservationSelection,
    orderGuest,
    reservationGuest,
    orderId,
    reservationId,
    orderMessage,
    reservationMessage,
    reservationVisible: reservations.some((item) => item.id === reservationId || item.guest_name === reservationGuest),
    waiterVisible: waiterOrders.some((item) => item.id === orderId),
    kitchenVisible: kitchenOrders.some((item) => item.order_id === orderId),
    consoleErrors,
    pageErrors,
  }, null, 2));
} catch (error) {
  let bodyHtml = '';
  try {
    bodyHtml = await page.locator('body').innerHTML();
  } catch {
    bodyHtml = '';
  }
  console.error(JSON.stringify({
    error: String(error),
    currentStep,
    debugState,
    consoleErrors,
    pageErrors,
    bodyHtml: bodyHtml.slice(0, 4000),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
