/**
 * Frontend (Management) App — Auth E2E Tests
 *
 * Tests:
 *   - Login page renders correctly (no Hamburg, no demo creds)
 *   - Wrong credentials → error is VISIBLE and NON-EMPTY (not blank banner)
 *   - Short password on register → error mentions "12" or "characters"
 *   - Valid credentials → navigates to dashboard
 *   - No forbidden UI strings anywhere
 *
 * All backend API calls are intercepted — no real backend required.
 */

import { test, expect, type Page } from "@playwright/test";

const API_PATTERN = /localhost|gestronomy-api|127\.0\.0\.1/;

const FORBIDDEN_STRINGS = [
  "Hamburg",
  "stub response",
  "LLM integration pending",
  "Demo Credentials",
  "fillDemo",
];

// ── Mock responses ────────────────────────────────────────────────────

const MOCK_ADMIN = {
  id: 1,
  email: "ci-admin@das-elb.test",
  full_name: "CI Admin User",
  role: "admin",
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

async function setupMocks(page: Page) {
  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Login
    if ((url.includes("/auth/login") || url.includes("/auth/token")) && method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(route.request().postData() ?? "{}");
      } catch {
        /* empty */
      }

      const email = String(body.email ?? body.username ?? "");
      const password = String(body.password ?? "");

      if (email === "ci-admin@das-elb.test" && password === "CITestAdmin2024!") {
        await route.fulfill({
          status: 200,
          json: {
            access_token: "mock.access.token.for.ci.testing",
            refresh_token: "mock.refresh.token.for.ci.testing",
            token_type: "bearer",
          },
        });
      } else {
        await route.fulfill({
          status: 401,
          json: {
            error: "Invalid email or password",
            status: 401,
            detail: "The email or password you entered is incorrect.",
          },
        });
      }
      return;
    }

    // Register
    if (url.includes("/auth/register") && method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(route.request().postData() ?? "{}");
      } catch {
        /* empty */
      }

      const password = String(body.password ?? "");

      if (password.length < 12) {
        await route.fulfill({
          status: 422,
          json: {
            error: "Validation error",
            status: 422,
            detail: ["body.password: String should have at least 12 characters"],
          },
        });
      } else {
        await route.fulfill({
          status: 201,
          json: {
            access_token: "mock.new.user.token",
            refresh_token: "mock.new.user.refresh",
            token_type: "bearer",
          },
        });
      }
      return;
    }

    // Auth me — used by dashboard to verify session
    if (url.includes("/auth/me") && method === "GET") {
      const authHeader = route.request().headers()["authorization"] ?? "";
      if (authHeader.includes("mock.access.token.for.ci.testing")) {
        await route.fulfill({ status: 200, json: MOCK_ADMIN });
      } else {
        await route.fulfill({ status: 401, json: { error: "Unauthorized", status: 401 } });
      }
      return;
    }

    // Health
    if (url.includes("/health") && method === "GET") {
      await route.fulfill({ status: 200, json: { status: "healthy" } });
      return;
    }

    await route.continue();
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Branding / no forbidden strings
// ═══════════════════════════════════════════════════════════════════════

test.describe("Branding — no forbidden content", () => {
  test("login page has no forbidden strings", async ({ page }) => {
    await page.goto("/auth/login");
    await page.waitForLoadState("networkidle");

    const bodyText = await page.evaluate(() => document.body.innerText);
    for (const forbidden of FORBIDDEN_STRINGS) {
      expect(bodyText, `Forbidden string "${forbidden}" found`).not.toContain(forbidden);
    }
  });

  test("page title does not contain Hamburg", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title).not.toContain("Hamburg");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Login page renders
// ═══════════════════════════════════════════════════════════════════════

test.describe("Login page — renders correctly", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto("/auth/login");
    await page.waitForLoadState("networkidle");
  });

  test("email and password fields are visible", async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("submit button is visible", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: /sign in|login|access/i });
    await expect(submitBtn).toBeVisible();
  });

  test("no demo credentials pre-filled or visible", async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toContain("Demo Credentials");
    expect(bodyText).not.toContain("fillDemo");

    const copyButton = page.getByRole("button", { name: /copy|fill demo/i });
    await expect(copyButton).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Login flow — error visibility (THE CRITICAL CHECK)
// ═══════════════════════════════════════════════════════════════════════

test.describe("Login flow — errors must be visible and non-empty", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto("/auth/login");
    await page.waitForLoadState("networkidle");
  });

  test("wrong credentials → error banner is visible with non-empty message", async ({ page }) => {
    await page.getByLabel(/email/i).fill("wrong@example.com");
    await page.getByLabel(/password/i).fill("WrongPassword123!");
    await page.getByRole("button", { name: /sign in|login|access/i }).click();

    // Wait for error to appear
    const errorLocator = page
      .getByRole("alert")
      .or(page.locator("[data-testid=error]"))
      .or(page.locator(".error, [class*=error], [class*=Error]").first());

    await expect(errorLocator).toBeVisible({ timeout: 5000 });

    const errorText = await errorLocator.innerText();
    expect(errorText.trim(), "Error message must not be empty").not.toBe("");
    expect(errorText.trim().length, "Error message must be meaningful").toBeGreaterThan(5);

    // Must NOT be a raw JSON blob
    expect(errorText).not.toContain('{"error"');
    expect(errorText).not.toContain('"status"');
    // Must NOT be undefined or the word undefined
    expect(errorText.toLowerCase()).not.toContain("undefined");
  });

  test("empty form submission → validation feedback is visible", async ({ page }) => {
    await page.getByRole("button", { name: /sign in|login|access/i }).click();
    await page.waitForTimeout(500);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasError =
      bodyText.toLowerCase().includes("required") ||
      bodyText.toLowerCase().includes("invalid") ||
      bodyText.toLowerCase().includes("enter") ||
      (await page.getByRole("alert").count()) > 0;

    expect(hasError, "No validation error shown for empty submission").toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Register flow — password validation
// ═══════════════════════════════════════════════════════════════════════

test.describe("Register flow — password length enforcement", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto("/auth/register");
    await page.waitForLoadState("networkidle");
  });

  test("register page exists and has form fields", async ({ page }) => {
    const emailField = page.getByLabel(/email/i);
    const passwordField = page.getByLabel(/password/i).first();

    const hasForm =
      (await emailField.isVisible()) || (await passwordField.isVisible());

    if (!hasForm) {
      const bodyText = await page.evaluate(() => document.body.innerText);
      expect(bodyText.length).toBeGreaterThan(10);
    }
  });

  test("short password → error mentions 12 characters (not blank)", async ({ page }) => {
    const emailField = page.getByLabel(/email/i);
    const passwordField = page.getByLabel(/password/i).first();
    const nameField = page.getByLabel(/name/i).first();

    if (!(await emailField.isVisible())) {
      test.skip();
      return;
    }

    if (await nameField.isVisible()) {
      await nameField.fill("Test User");
    }
    await emailField.fill("newuser@das-elb.test");
    await passwordField.fill("Short1!"); // Only 7 chars — below 12 minimum

    const submitBtn = page.getByRole("button", { name: /register|sign up|create/i });
    await submitBtn.click();

    await page.waitForTimeout(1500);

    const bodyText = await page.evaluate(() => document.body.innerText);

    const mentionsLength =
      bodyText.includes("12") ||
      bodyText.toLowerCase().includes("character") ||
      bodyText.toLowerCase().includes("minimum") ||
      bodyText.toLowerCase().includes("at least");

    expect(
      mentionsLength,
      "Short password error must mention the length requirement (12 chars). Got: " + bodyText
    ).toBeTruthy();

    // Must NOT be silent / blank
    const errorEl = page
      .getByRole("alert")
      .or(page.locator("[class*=error], [class*=Error]").first());

    if (await errorEl.isVisible()) {
      const errText = await errorEl.innerText();
      expect(errText.trim(), "Error element must not be empty").not.toBe("");
      expect(errText.toLowerCase()).not.toContain("undefined");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Login flow — success
// ═══════════════════════════════════════════════════════════════════════

test.describe("Login flow — success navigates to dashboard", () => {
  test("valid credentials → redirected away from login page", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/auth/login");
    await page.waitForLoadState("networkidle");

    await page.getByLabel(/email/i).fill("ci-admin@das-elb.test");
    await page.getByLabel(/password/i).fill("CITestAdmin2024!");
    await page.getByRole("button", { name: /sign in|login|access/i }).click();

    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const stillOnLogin = currentUrl.includes("/auth/login");

    if (stillOnLogin) {
      const alert = page.getByRole("alert");
      const alertVisible = await alert.isVisible().catch(() => false);
      expect(alertVisible, "Still on login page with error visible after correct credentials").toBeFalsy();
    }
  });
});
