import { createRequire } from "node:module";

const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { chromium } = require("playwright");

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return "";
  }
  return process.argv[index + 1] || "";
}

function expectArg(name) {
  const value = getArg(name);
  if (!value) {
    throw new Error(`Missing --${name}`);
  }
  return value;
}

const config = {
  hotelUrl: expectArg("hotel-url"),
  restaurantUrl: expectArg("restaurant-url"),
  frontendUrl: expectArg("frontend-url"),
  restaurantName: expectArg("restaurant-name"),
  hotelName: expectArg("hotel-name"),
  tagungName: getArg("tagung-name"),
  restaurantDate: expectArg("restaurant-date"),
  restaurantTime: expectArg("restaurant-time"),
  restaurantAppReservationName: expectArg("restaurant-app-reservation-name"),
  restaurantAppOrderGuest: expectArg("restaurant-app-order-guest"),
  restaurantTableCode: expectArg("restaurant-table-code"),
  restaurantAppReservationDate: expectArg("restaurant-app-reservation-date"),
  restaurantAppReservationTime: expectArg("restaurant-app-reservation-time"),
  hotelCheckIn: expectArg("hotel-check-in"),
  hotelCheckOut: expectArg("hotel-check-out"),
  hotelRoomType: expectArg("hotel-room-type"),
  hotelRoomTypeId: expectArg("hotel-room-type-id"),
  adminEmail: expectArg("admin-email"),
  adminPassword: expectArg("admin-password"),
  expectedRestaurantApi: expectArg("expected-restaurant-api"),
};

const consoleErrors = [];
const pageErrors = [];
let currentStep = "boot";

function attachPageLogging(page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });
}

async function submitHotelBooking(page) {
  currentStep = "hotel_booking_open";
  await page.goto(config.hotelUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("body");
  await page.waitForSelector("[data-booking-form]");
  currentStep = "hotel_booking_rooms_wait";
  await page.waitForFunction((roomTypeId) => {
    const select = document.querySelector("[data-booking-room-type]");
    if (!select) {
      return false;
    }
    return Array.from(select.options).some((option) => option.value === roomTypeId);
  }, config.hotelRoomTypeId);
  currentStep = "hotel_booking_fill";
  await page.locator("#booking-room-type").selectOption({ value: config.hotelRoomTypeId });
  await page.locator("#guest-name").fill(config.hotelName);
  await page.locator("#guest-email").fill("local-hotel@example.com");
  await page.locator("#guest-phone").fill("+49 40 555 1200");
  await page.locator("#booking-adults").fill("2");
  await page.locator("#booking-check-in").fill(config.hotelCheckIn);
  await page.locator("#booking-check-out").fill(config.hotelCheckOut);
  await page.locator("#booking-children").fill("0");
  await page.locator("#booking-notes").fill("Local full-stack validation");
  await page.locator('[data-booking-form] input[name="accepted_policy"]').check();
  currentStep = "hotel_booking_submit";
  await page.getByRole("button", { name: /buchung/i }).click();
  currentStep = "hotel_booking_wait_success";
  await page.waitForFunction(() => {
    const node = document.querySelector("[data-booking-message]");
    return node && /Buchungsnummer:/i.test(node.textContent || "");
  });
  return page.locator("[data-booking-message]").innerText();
}

async function submitRestaurantReservation(page) {
  currentStep = "restaurant_booking_open";
  await page.goto(config.hotelUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-restaurant-form]");
  currentStep = "restaurant_booking_fill";
  await page.locator("#restaurant-guest-name").fill(config.restaurantName);
  await page.locator("#restaurant-guest-email").fill("local-restaurant@example.com");
  await page.locator("#restaurant-guest-phone").fill("+49 40 555 1300");
  await page.locator("#restaurant-party-size").fill("2");
  await page.locator("#restaurant-date").fill(config.restaurantDate);
  await page.locator("#restaurant-time").fill(config.restaurantTime);
  await page.locator("#restaurant-special-requests").fill("Local full-stack validation");
  await page.locator('[data-restaurant-form] input[name="accepted_policy"]').check();
  currentStep = "restaurant_booking_submit";
  await page.getByRole("button", { name: /tisch reservieren/i }).click();
  currentStep = "restaurant_booking_wait_success";
  await page.waitForFunction(() => {
    const node = document.querySelector("[data-restaurant-message]");
    return node && /erfolgreich/i.test(node.textContent || "");
  });
  return page.locator("[data-restaurant-message]").innerText();
}

async function submitTagung(page) {
  if (!config.tagungName) {
    return "";
  }
  currentStep = "tagung_open";
  await page.goto(`${config.hotelUrl.replace(/\/$/, "")}/tagungen.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-tagung-form]");
  currentStep = "tagung_fill";
  await page.locator("#tagung-name").fill(config.tagungName);
  await page.locator("#tagung-company").fill("Das Elb Local Validation");
  await page.locator("#tagung-email").fill("local-tagung@example.com");
  await page.locator("#tagung-phone").fill("+49 40 555 1400");
  await page.locator("#tagung-participants").fill("12");
  await page.locator("#tagung-date").fill("2027-08-18");
  await page.locator("#tagung-message").fill("Conference validation request");
  await page.locator('[data-tagung-form] input[name="acceptedPolicy"]').check();
  currentStep = "tagung_submit";
  await page.getByRole("button", { name: /tagung anfragen/i }).click();
  currentStep = "tagung_wait_success";
  await page.waitForFunction(() => {
    const node = document.querySelector("[data-tagung-message]");
    return node && /erfolgreich/i.test(node.textContent || "");
  });
  return page.locator("[data-tagung-message]").innerText();
}

async function checkRestaurantApp(page) {
  currentStep = "restaurant_app_open";
  await page.goto(config.restaurantUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("#api-url");
  const apiUrl = (await page.locator("#api-url").innerText()).trim();
  currentStep = "restaurant_app_menu_wait";
  await page.waitForSelector("[data-menu-item]");

  currentStep = "restaurant_app_table_fill";
  await page.locator("#guest-name").fill(config.restaurantAppOrderGuest);
  await page.locator("#table-code").fill(config.restaurantTableCode);
  await page.locator("#load-table").click();
  await page.waitForFunction(() => {
    const node = document.querySelector("#table-message");
    return node && /connected/i.test(node.textContent || "");
  });
  const tableSummary = await page.locator("#table-summary").innerText();

  currentStep = "restaurant_app_add_to_cart";
  await page.locator('button[data-cart-action="add"]:not([disabled])').first().click();
  await page.waitForFunction(() => {
    const button = document.querySelector("#submit-order");
    return button instanceof HTMLButtonElement && button.disabled === false;
  });

  currentStep = "restaurant_app_submit_order";
  await page.locator("#submit-order").click();
  await page.waitForFunction(() => {
    const node = document.querySelector("#order-message");
    return node && /Order #/i.test(node.textContent || "");
  });
  const orderMessage = await page.locator("#order-message").innerText();
  const trackerHeading = await page.locator("#order-tracker h3").innerText();
  const orderIdMatch = trackerHeading.match(/#(\d+)/) || orderMessage.match(/#(\d+)/);

  currentStep = "restaurant_app_reservation_fill";
  await page.locator("#reservation-guest-name").fill(config.restaurantAppReservationName);
  await page.locator("#reservation-email").fill("local-restaurant-app@example.com");
  await page.locator("#reservation-phone").fill("+49 40 555 1700");
  await page.locator("#reservation-party-size").fill("2");
  await page.locator("#reservation-party-size").dispatchEvent("change");
  await page.locator("#reservation-date").fill(config.restaurantAppReservationDate);
  await page.locator("#reservation-date").dispatchEvent("change");
  await page.locator("#reservation-time").fill(config.restaurantAppReservationTime.slice(0, 5));
  await page.locator("#reservation-special-requests").fill("Restaurant guest app validation");
  await page.waitForFunction((slotTime) => {
    return Array.from(document.querySelectorAll("[data-slot-time]")).some(
      (node) => node.getAttribute("data-slot-time") === slotTime,
    );
  }, config.restaurantAppReservationTime);
  await page.locator(`[data-slot-time="${config.restaurantAppReservationTime}"]`).click();

  currentStep = "restaurant_app_submit_reservation";
  await page.locator("#submit-reservation").click();
  await page.waitForFunction(() => {
    const node = document.querySelector("#reservation-message");
    return node && /Reservation #/i.test(node.textContent || "");
  });
  const reservationMessage = await page.locator("#reservation-message").innerText();
  const reservationIdMatch = reservationMessage.match(/#(\d+)/);

  return {
    apiUrl,
    ok: apiUrl === config.expectedRestaurantApi,
    tableSummary,
    orderMessage,
    orderId: orderIdMatch ? Number(orderIdMatch[1]) : null,
    reservationMessage,
    reservationId: reservationIdMatch ? Number(reservationIdMatch[1]) : null,
  };
}

async function checkManagementUi(page) {
  currentStep = "management_login_open";
  await page.goto(`${config.frontendUrl}/login?domain=hotel`, { waitUntil: "networkidle" });
  currentStep = "management_login_fill";
  await page.locator('input[name="email"]').fill(config.adminEmail);
  await page.locator('input[name="password"]').fill(config.adminPassword);
  currentStep = "management_login_submit";
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  currentStep = "management_check_hotel";
  await page.goto(`${config.frontendUrl}/hms/reservations`, { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle");
  const hotelVisible = await page.getByText(config.hotelName, { exact: false }).isVisible();

  currentStep = "management_check_restaurant";
  await page.goto(`${config.frontendUrl}/reservations`, { waitUntil: "networkidle" });
  await page.waitForLoadState("networkidle");
  const restaurantVisible = await page.getByText(config.restaurantName, { exact: false }).isVisible();

  let tagungVisible = null;
  if (config.tagungName) {
    tagungVisible = await page.getByText(config.tagungName, { exact: false }).isVisible();
  }

  return {
    hotelVisible,
    restaurantVisible,
    tagungVisible,
    finalUrl: page.url(),
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const hotelPage = await context.newPage();
const restaurantPage = await context.newPage();
const managementPage = await context.newPage();

attachPageLogging(hotelPage);
attachPageLogging(restaurantPage);
attachPageLogging(managementPage);

try {
  const hotelMessage = await submitHotelBooking(hotelPage);
  const restaurantMessage = await submitRestaurantReservation(hotelPage);
  const tagungMessage = await submitTagung(hotelPage);
  const restaurantApp = await checkRestaurantApp(restaurantPage);
  const management = await checkManagementUi(managementPage);

  console.log(
    JSON.stringify({
      hotelMessage,
      restaurantMessage,
      tagungMessage,
      restaurantApp,
      management,
      consoleErrors,
      pageErrors,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        error: String(error),
        currentStep,
        consoleErrors,
        pageErrors,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
