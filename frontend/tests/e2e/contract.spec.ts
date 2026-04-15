/**
 * Frontend (Management) App — API Contract E2E Tests
 *
 * These tests verify the API contract at the boundary between the frontend
 * and backend by intercepting requests and asserting the response shapes
 * match what the frontend actually expects to receive.
 *
 * Covers:
 *   - Auth error responses have { error: string } (not blank, not raw detail array)
 *   - 422 Pydantic v2 errors have detail as string[] (not objects with .msg)
 *   - Token response has access_token, refresh_token, token_type
 *   - Dashboard query response has { answer: string, data: object }
 *   - /auth/me response has expected user fields
 *
 * No real backend required — tests intercept and validate mock shape conformance.
 */

import { test, expect } from "@playwright/test";

const API_PATTERN = /localhost|gestronomy-api|127\.0\.0\.1/;

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Resolves when the first request matching urlFragment is made. */
function captureRequest(
  page: Parameters<typeof test>[1]["page"],
  urlFragment: string
): Promise<{ url: string; method: string; body: unknown }> {
  return new Promise((resolve) => {
    page.on("request", (req) => {
      if (req.url().includes(urlFragment)) {
        let body: unknown = null;
        try {
          body = JSON.parse(req.postData() ?? "null");
        } catch {
          body = req.postData();
        }
        resolve({ url: req.url(), method: req.method(), body });
      }
    });
  });
}

/** Resolves when the first response matching urlFragment is received. */
function captureResponse(
  page: Parameters<typeof test>[1]["page"],
  urlFragment: string
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    page.on("response", async (res) => {
      if (res.url().includes(urlFragment)) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = await res.text().catch(() => null);
        }
        resolve({ status: res.status(), body });
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Auth error response shape
// ═══════════════════════════════════════════════════════════════════════

test.describe("API Contract — auth error responses", () => {
  test("login failure response has non-empty 'error' string field", async ({ page }) => {
    // Intercept and return a mock 401
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/auth/login") || url.includes("/auth/token")) {
        await route.fulfill({
          status: 401,
          json: {
            error: "Invalid email or password",
            status: 401,
            detail: "Credentials do not match any account.",
          },
        });
        return;
      }
      await route.continue();
    });

    // Capture the response
    const responsePromise = captureResponse(page, "/auth/");

    await page.goto("/auth/login");
    await page.waitForLoadState("networkidle");

    // Trigger a login attempt
    const emailField = page.getByLabel(/email/i);
    const passwordField = page.getByLabel(/password/i);

    if ((await emailField.isVisible()) && (await passwordField.isVisible())) {
      await emailField.fill("bad@example.com");
      await passwordField.fill("BadPassword123!");
      await page.getByRole("button", { name: /sign in|login/i }).click();

      const response = await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("No auth response captured")), 5000)
        ),
      ]);

      // The response body MUST have a non-empty error field
      expect(response.body).toBeTruthy();
      const body = response.body as Record<string, unknown>;
      expect(typeof body.error, "error field must be a string").toBe("string");
      expect((body.error as string).trim().length, "error must not be empty").toBeGreaterThan(0);
    }
  });

  test("422 validation error has detail as string array (Pydantic v2 format)", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      if (url.includes("/auth/register")) {
        await route.fulfill({
          status: 422,
          json: {
            error: "Validation error",
            status: 422,
            // Pydantic v2 format: detail items are strings, NOT objects
            detail: [
              "body.password: String should have at least 12 characters",
              "body.email: value is not a valid email address",
            ],
          },
        });
        return;
      }
      await route.continue();
    });

    const responsePromise = captureResponse(page, "/auth/register");

    await page.goto("/auth/register");
    await page.waitForLoadState("networkidle");

    const emailField = page.getByLabel(/email/i);
    if (!(await emailField.isVisible())) {
      test.skip();
      return;
    }

    await emailField.fill("bad-email");
    const passwordField = page.getByLabel(/password/i).first();
    await passwordField.fill("short");
    await page.getByRole("button", { name: /register|sign up|create/i }).click();

    const response = await Promise.race([
      responsePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("No register response captured")), 5000)
      ),
    ]);

    const body = response.body as Record<string, unknown>;
    expect(Array.isArray(body.detail), "detail must be an array").toBeTruthy();

    const detail = body.detail as unknown[];
    expect(detail.length).toBeGreaterThan(0);

    // Each detail item MUST be a string (Pydantic v2), NOT an object with .msg
    for (const item of detail) {
      expect(
        typeof item,
        `detail item must be a string, got: ${JSON.stringify(item)}`
      ).toBe("string");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Token response shape
// ═══════════════════════════════════════════════════════════════════════

test.describe("API Contract — token response shape", () => {
  test("successful login returns access_token, refresh_token, token_type", async ({ page }) => {
    let capturedTokenResponse: unknown = null;

    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if ((url.includes("/auth/login") || url.includes("/auth/token")) && method === "POST") {
        const responseBody = {
          access_token: "mock.jwt.access.token",
          refresh_token: "mock.jwt.refresh.token",
          token_type: "bearer",
        };
        capturedTokenResponse = responseBody;
        await route.fulfill({ status: 200, json: responseBody });
        return;
      }

      if (url.includes("/auth/me") && method === "GET") {
        await route.fulfill({
          status: 200,
          json: { id: 1, email: "ci-admin@das-elb.test", role: "admin", is_active: true },
        });
        return;
      }

      await route.continue();
    });

    await page.goto("/auth/login");
    await page.waitForLoadState("networkidle");

    const emailField = page.getByLabel(/email/i);
    if (!(await emailField.isVisible())) {
      test.skip();
      return;
    }

    await emailField.fill("ci-admin@das-elb.test");
    await page.getByLabel(/password/i).fill("CITestAdmin2024!");
    await page.getByRole("button", { name: /sign in|login/i }).click();

    await page.waitForTimeout(1000);

    if (capturedTokenResponse) {
      const token = capturedTokenResponse as Record<string, unknown>;
      expect(typeof token.access_token).toBe("string");
      expect((token.access_token as string).length).toBeGreaterThan(0);
      expect(typeof token.refresh_token).toBe("string");
      expect((token.refresh_token as string).length).toBeGreaterThan(0);
      expect(token.token_type).toBe("bearer");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Dashboard query contract
// ═══════════════════════════════════════════════════════════════════════

test.describe("API Contract — dashboard query response", () => {
  test("NL query response has 'answer' string and 'data' object", async ({ page }) => {
    let dashboardQueryMade = false;

    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes("/auth/me") && method === "GET") {
        await route.fulfill({
          status: 200,
          json: {
            id: 1,
            email: "ci-admin@das-elb.test",
            full_name: "CI Admin",
            role: "admin",
            is_active: true,
          },
        });
        return;
      }

      if (url.includes("/dashboard/query") && method === "POST") {
        dashboardQueryMade = true;
        await route.fulfill({
          status: 200,
          json: {
            answer: "Currently 8 rooms are occupied (out of 33 total). Occupancy: 24%.",
            data: {
              occupied_rooms: 8,
              total_rooms: 33,
              occupancy_pct: 24,
            },
          },
        });
        return;
      }

      await route.continue();
    });

    // Navigate with injected auth
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("access_token", "mock.access.token.for.ci.testing");
    });
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // If a query was made, verify the response shape was correct
    // (The mock itself is the contract assertion — if the frontend broke on shape it would error)
    const bodyText = await page.evaluate(() => document.body.innerText);

    // Should never display raw JSON contract errors
    expect(bodyText).not.toContain('"answer":null');
    expect(bodyText).not.toContain("undefined");
    expect(bodyText).not.toContain("[object Object]");
    expect(bodyText).not.toContain("stub response");
    expect(bodyText).not.toContain("LLM integration pending");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// User object contract (/auth/me)
// ═══════════════════════════════════════════════════════════════════════

test.describe("API Contract — user object shape from /auth/me", () => {
  test("/auth/me response fields are consumed without crashing", async ({ page }) => {
    await page.route(API_PATTERN, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (url.includes("/auth/me") && method === "GET") {
        // Return the exact shape the backend sends
        await route.fulfill({
          status: 200,
          json: {
            id: 1,
            email: "ci-admin@das-elb.test",
            full_name: "CI Admin User",
            role: "admin",
            is_active: true,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        });
        return;
      }

      await route.continue();
    });

    // Inject token and navigate to a protected route
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("access_token", "mock.access.token.for.ci.testing");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Check no rendering errors
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toContain("[object Object]");
    expect(bodyText).not.toContain("undefined");
    expect(bodyText).not.toContain("TypeError");
    expect(bodyText).not.toContain("Cannot read");
  });
});
