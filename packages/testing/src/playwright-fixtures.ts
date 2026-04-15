/**
 * @das-elb/testing — Playwright fixtures and route interceptors
 *
 * Provides reusable Playwright test fixtures and HTTP route mocking helpers.
 * Import these in each app's E2E tests instead of duplicating route setup.
 */

import { test as base, expect, type Page, type Route } from "@playwright/test";
import { MOCK_RESPONSES, FORBIDDEN_UI_STRINGS } from "./seed.js";

// ── Route interceptors ────────────────────────────────────────────────

/**
 * Intercept all backend API calls and return mock responses.
 * Call this at the start of each test to avoid real network calls.
 *
 * @param page Playwright page object
 * @param apiPattern URL pattern to intercept (e.g. /gestronomy-api/ or /localhost:8000/)
 * @param overrides Override specific endpoint responses
 */
export async function mockBackendApi(
  page: Page,
  apiPattern: string | RegExp,
  overrides: Partial<Record<string, object>> = {}
): Promise<void> {
  await page.route(apiPattern, async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Determine response based on URL + method
    let responseBody: object;

    if (url.includes("/auth/login") && method === "POST") {
      // Check if we should return an error
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(route.request().postData() ?? "{}");
      } catch { /* empty */ }

      if (body.password === "wrongpassword" || body.email?.toString().includes("invalid")) {
        responseBody = overrides["auth/login/failure"] ?? MOCK_RESPONSES.loginFailure;
        await route.fulfill({ status: 401, json: responseBody });
        return;
      }
      responseBody = overrides["auth/login/success"] ?? MOCK_RESPONSES.loginSuccess;
      await route.fulfill({ status: 200, json: responseBody });

    } else if (url.includes("/auth/register") && method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(route.request().postData() ?? "{}");
      } catch { /* empty */ }

      const pwd = String(body.password ?? "");
      if (pwd.length < 12) {
        responseBody = overrides["auth/register/invalid-password"] ?? MOCK_RESPONSES.registerInvalidPassword;
        await route.fulfill({ status: 422, json: responseBody });
        return;
      }
      responseBody = overrides["auth/register/success"] ?? MOCK_RESPONSES.registerSuccess;
      await route.fulfill({ status: 201, json: responseBody });

    } else if (url.includes("/auth/me") && method === "GET") {
      const authHeader = route.request().headers()["authorization"];
      if (!authHeader) {
        await route.fulfill({ status: 401, json: MOCK_RESPONSES.loginFailure });
        return;
      }
      await route.fulfill({
        status: 200,
        json: overrides["auth/me"] ?? {
          id: 1,
          email: "ci-admin@das-elb.test",
          full_name: "CI Admin User",
          role: "admin",
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });

    } else if (url.includes("/health") && method === "GET") {
      await route.fulfill({ status: 200, json: MOCK_RESPONSES.healthCheck });

    } else {
      // For unknown endpoints, continue the request or return 404
      await route.fulfill({ status: 404, json: { error: "Not Found", status: 404 } });
    }
  });
}

/**
 * Mock the guest authentication endpoint (different from staff auth).
 */
export async function mockGuestAuth(
  page: Page,
  apiPattern: string | RegExp
): Promise<void> {
  await page.route(apiPattern, async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if ((url.includes("/guest/login") || url.includes("/guest/auth")) && method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(route.request().postData() ?? "{}");
      } catch { /* empty */ }

      const bookingId = String(body.booking_id ?? body.bookingNumber ?? "");
      const lastName = String(body.last_name ?? body.lastName ?? "");

      if (bookingId === "BK999001" && lastName.toLowerCase() === "ciguest") {
        await route.fulfill({ status: 200, json: MOCK_RESPONSES.guestLoginSuccess });
      } else {
        await route.fulfill({ status: 401, json: MOCK_RESPONSES.guestLoginFailure });
      }
    } else {
      await route.continue();
    }
  });
}

// ── Extended test fixture ──────────────────────────────────────────────

export type DasElbFixtures = {
  /** A page with all backend API calls mocked */
  mockedPage: Page;
  /** Check that no forbidden strings appear in visible page text */
  assertNoForbiddenContent: () => Promise<void>;
};

export const test = base.extend<DasElbFixtures>({
  mockedPage: async ({ page }, use) => {
    // Mock all API patterns commonly used across apps
    await mockBackendApi(page, /localhost:8000|gestronomy-api.*\.onrender\.com/);
    await use(page);
  },

  assertNoForbiddenContent: async ({ page }, use) => {
    await use(async () => {
      const content = await page.content();
      for (const forbidden of FORBIDDEN_UI_STRINGS) {
        // Only check visible text nodes, not JS/CSS/source code
        const visibleText = await page.evaluate(() => document.body.innerText);
        if (visibleText.includes(forbidden)) {
          throw new Error(
            `[content-guard] Forbidden string "${forbidden}" found in visible page content.\n` +
              "This indicates stale demo content or wrong branding."
          );
        }
      }
    });
  },
});

export { expect };
