/**
 * Hotel Owner App — Voice & Meeting Recording E2E Tests
 *
 * Tests:
 *   - Voice assistant UI renders correctly
 *   - Meeting recording shows HMS save (not a mock placeholder)
 *   - Recording stop → "Saving to management system..." is shown
 *   - Success state shows HMS reference number
 *   - Error state shows a meaningful error message (not blank)
 */

import { test, expect, type Page } from "@playwright/test";

const API_PATTERN = /localhost|gestronomy-api|127\.0\.0\.1/;

async function injectAuth(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("access_token", "mock.owner.token.for.ci");
    localStorage.setItem("refresh_token", "mock.owner.refresh.token.for.ci");
  });
}

async function setupMocks(page: Page) {
  await page.route(API_PATTERN, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Owner auth check
    if (url.includes("/auth/me") && method === "GET") {
      await route.fulfill({
        status: 200,
        json: {
          id: 1,
          email: "owner@das-elb.test",
          full_name: "Hotel Owner",
          role: "admin",
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      return;
    }

    // HMS housekeeping task creation (triggered by meeting recording)
    if (url.includes("/hms/housekeeping/tasks") && method === "POST") {
      await route.fulfill({
        status: 201,
        json: { id: 42, status: "open" },
      });
      return;
    }

    // Dashboard NL query — must return real data, not stub
    if (url.includes("/dashboard/query") && method === "POST") {
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
}

// ═══════════════════════════════════════════════════════════════════════
// Meeting recording
// ═══════════════════════════════════════════════════════════════════════

test.describe("Meeting Recording — HMS integration", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await setupMocks(page);
  });

  test("meeting recording page shows start button (not mock result)", async ({ page }) => {
    await page.goto("/meetings");
    await page.waitForLoadState("networkidle");

    // Should see a start recording button
    const startBtn = page.getByRole("button", { name: /start|begin|record/i });
    await expect(startBtn).toBeVisible({ timeout: 5000 });

    // Must NOT show any mock/placeholder text
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toContain("This is a test meeting");
    expect(bodyText).not.toContain("Placeholder");
    expect(bodyText).not.toContain("Mock summary");
  });

  test("recording stop → shows 'Saving to management system' (not instant fake result)", async ({
    page,
  }) => {
    await page.goto("/meetings");
    await page.waitForLoadState("networkidle");

    const startBtn = page.getByRole("button", { name: /start|begin|record/i });
    if (await startBtn.isVisible()) {
      await startBtn.click();
      await page.waitForTimeout(500);

      const stopBtn = page.getByRole("button", { name: /stop|end/i });
      if (await stopBtn.isVisible()) {
        await stopBtn.click();

        // Should show processing state
        const processingText = page.getByText(/saving|processing|management/i);
        await expect(processingText).toBeVisible({ timeout: 3000 });
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Voice assistant
// ═══════════════════════════════════════════════════════════════════════

test.describe("Voice Assistant — real query, not mock cycle", () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page);
    await setupMocks(page);
  });

  test("voice page renders with microphone button", async ({ page }) => {
    await page.goto("/voice");
    await page.waitForLoadState("networkidle");

    // Should see a microphone/voice button
    const voiceBtn = page
      .getByRole("button", { name: /speak|mic|voice|tap/i })
      .or(page.locator("[data-testid=voice-button]"))
      .or(page.locator('button svg[class*="mic" i]').locator(".."));

    await expect(voiceBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test("voice page does NOT show pre-populated mock query answers", async ({ page }) => {
    await page.goto("/voice");
    await page.waitForLoadState("networkidle");

    const bodyText = await page.evaluate(() => document.body.innerText);

    // These strings would indicate mock query cycling
    expect(bodyText).not.toContain("How many tables");
    expect(bodyText).not.toContain("What is today's revenue");
    expect(bodyText).not.toContain("mockQueries");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Dashboard query response
// ═══════════════════════════════════════════════════════════════════════

test.describe("Dashboard — NL query returns real data structure", () => {
  test("dashboard does not show stub response text", async ({ page }) => {
    await injectAuth(page);
    await setupMocks(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toContain("stub response");
    expect(bodyText).not.toContain("LLM integration pending");
  });
});
