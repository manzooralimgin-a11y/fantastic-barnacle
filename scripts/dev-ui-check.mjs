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

async function dismissCookieBanner(page) {
  const acceptAll = page.getByRole("button", { name: /Alle akzeptieren/i });
  const necessaryOnly = page.getByRole("button", { name: /Nur notwendige/i });

  if (await acceptAll.count()) {
    await acceptAll.first().click().catch(() => {});
    return;
  }
  if (await necessaryOnly.count()) {
    await necessaryOnly.first().click().catch(() => {});
  }
}

async function submitHotelBooking(page) {
  currentStep = "hotel_booking_open";
  await page.goto(config.hotelUrl, { waitUntil: "networkidle" });
  await page.waitForSelector("body");
  await dismissCookieBanner(page);
  await page.getByRole("button", { name: /^Buchen$/ }).first().click();
  await page.waitForSelector("[data-booking-form]");

  currentStep = "hotel_booking_fill_dates";
  await page.locator("#booking-check-in").fill(config.hotelCheckIn);
  await page.locator('[data-booking-form] input[type="date"]').nth(1).fill(config.hotelCheckOut);
  await page.locator("#booking-adults").selectOption("2");
  await page.locator('[data-booking-form] select').nth(1).selectOption("0");
  await page.getByRole("button", { name: /Verfügbarkeit prüfen/i }).click();

  currentStep = "hotel_booking_pick_room";
  await page.getByRole("heading", { name: /Wählen Sie Ihr Apartment/i }).waitFor();
  const preferredRoomCard = page
    .locator("div")
    .filter({ has: page.getByText(config.hotelRoomType, { exact: false }) })
    .filter({ has: page.getByRole("button", { name: /^Buchen$/ }) })
    .last();
  const fallbackRoomCard = page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: /^Buchen$/ }) })
    .last();
  const roomCard = (await preferredRoomCard.count()) ? preferredRoomCard : fallbackRoomCard;
  await roomCard.getByRole("button", { name: /^Buchen$/ }).click();

  currentStep = "hotel_booking_fill_guest";
  await page.getByRole("heading", { name: /Ihre Daten/i }).waitFor();
  await page.getByLabel(/Vollständiger Name/i).fill(config.hotelName);
  await page.getByLabel(/E-Mail Adresse/i).fill("local-hotel@example.com");
  await page.getByLabel(/Telefonnummer/i).fill("+49 40 555 1200");
  await page.getByLabel(/Straße & Hausnr\./i).fill("Elbufer 12");
  await page.getByPlaceholder("12345").fill("39104");
  await page.getByPlaceholder("Magdeburg").fill("Magdeburg");
  await page.getByRole("button", { name: /Weiter zur Zahlung/i }).click();

  currentStep = "hotel_booking_fill_payment";
  await page.getByRole("heading", { name: /Zahlung/i }).waitFor();
  await page.getByPlaceholder("•••• •••• •••• ••••").fill("4242 4242 4242 4242");
  await page.getByPlaceholder("MM / YY").fill("12 / 30");
  await page.getByPlaceholder("•••").fill("123");
  await page.getByRole("button", { name: /Zahlung bestätigen/i }).click();

  currentStep = "hotel_booking_submit";
  await page.getByRole("heading", { name: /Bestätigung/i }).waitFor();
  await page.getByRole("button", { name: /Jetzt Zahlungspflichtig buchen/i }).click();
  currentStep = "hotel_booking_wait_success";
  await page.getByText(/Vielen Dank!/i).waitFor();
  return page.getByText(/Vielen Dank!/i).innerText();
}

async function submitRestaurantReservation(page) {
  currentStep = "restaurant_booking_open";
  await page.goto(config.hotelUrl, { waitUntil: "networkidle" });
  await dismissCookieBanner(page);
  await page.getByRole("button", { name: /Tisch reservieren/i }).first().click();
  await page.waitForSelector("[data-restaurant-form]");
  const form = page.locator("[data-restaurant-form]").first();
  currentStep = "restaurant_booking_fill";
  await form.locator("#restaurant-guest-name").fill(config.restaurantName);
  await form.locator("#restaurant-email").fill("local-restaurant@example.com");
  await form.locator("#restaurant-phone").fill("+49 40 555 1300");
  await form.locator("#restaurant-persons").fill("2");
  await form.locator("#restaurant-date").fill(config.restaurantDate);
  await form.locator("#restaurant-time").selectOption(config.restaurantTime.slice(0, 5));
  await form.locator("#restaurant-special-requests").fill("Local full-stack validation");
  await form.locator('input[type="checkbox"]').check();
  currentStep = "restaurant_booking_submit";
  await form.getByRole("button", { name: /Tisch reservieren/i }).click();
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
  currentStep = "restaurant_app_menu_open";
  await page.locator('[data-nav="menu"]').click();
  currentStep = "restaurant_app_menu_wait";
  await page.waitForSelector("[data-menu-item]");
  await page.waitForSelector('button[data-cart-action="add"]:not([disabled])');
  await page.locator('button[data-cart-action="add"]:not([disabled])').first().click();

  currentStep = "restaurant_app_order_open";
  await page.locator('[data-nav="order"]').click();
  await page.waitForSelector("#guest-name");

  currentStep = "restaurant_app_table_fill";
  await page.locator("#guest-name").fill(config.restaurantAppOrderGuest);
  await page.locator("#table-code").fill(config.restaurantTableCode);
  await page.locator("#load-table").click();
  await page.waitForFunction(() => {
    const node = document.querySelector("#table-message");
    return node && /connected/i.test(node.textContent || "");
  });
  const tableSummary = await page.locator("#table-summary").innerText();
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

  currentStep = "restaurant_app_booking_open";
  await page.locator('[data-nav="booking"]').click();
  await page.waitForSelector("#reservation-datetime");
  await page.locator("#reservation-datetime").fill(
    `${config.restaurantAppReservationDate}T${config.restaurantAppReservationTime.slice(0, 5)}`,
  );
  await page.locator("#reservation-datetime").dispatchEvent("change");

  currentStep = "restaurant_app_reservation_fill";
  await page.waitForFunction((slotTime) => {
    return Array.from(document.querySelectorAll("[data-slot-time]")).some(
      (node) => node.getAttribute("data-slot-time") === slotTime,
    );
  }, config.restaurantAppReservationTime);
  await page.locator(`[data-slot-time="${config.restaurantAppReservationTime}"]`).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForSelector("#reservation-guest-name");
  await page.locator("#reservation-guest-name").fill(config.restaurantAppReservationName);
  await page.locator("#reservation-email").fill("local-restaurant-app@example.com");
  await page.locator("#reservation-phone").fill("+49 40 555 1700");
  await page.getByRole("button", { name: /^continue$/i }).click();

  currentStep = "restaurant_app_submit_reservation";
  await page.getByRole("button", { name: /confirm booking/i }).click();
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
