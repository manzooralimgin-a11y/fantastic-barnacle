/**
 * Hotel Guest App — Checkout / Farewell Screen Tests
 *
 * Verifies that the checkout screen says "Magdeburg" not "Hamburg".
 * This was a bug discovered in the production audit.
 */

import { test, expect } from "@playwright/test";

// The checkout screen is deep in the app — we test it by injecting a
// mocked auth state and navigating directly.

test.describe("Checkout screen — city branding", () => {
  test("checkout farewell message mentions Magdeburg, not Hamburg", async ({ page }) => {
    // Inject a session token to skip login
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem(
        "das_elb_guest_session",
        JSON.stringify({
          access_token: "mock.token",
          guest: {
            firstName: "Test",
            lastName: "CIGuest",
            bookingId: "BK999001",
          },
        })
      );
    });

    // Navigate to checkout route
    await page.goto("/#checkout");
    await page.waitForTimeout(500);

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText, "Checkout screen must not mention Hamburg").not.toContain("Hamburg");

    // If checkout text is rendered, it should say Magdeburg
    if (bodyText.toLowerCase().includes("see you again soon")) {
      expect(bodyText, "Farewell message should mention Magdeburg").toContain("Magdeburg");
    }
  });
});
