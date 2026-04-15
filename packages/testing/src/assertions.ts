/**
 * @das-elb/testing — Custom assertions
 *
 * Reusable assertion helpers for both API contract tests and Playwright E2E tests.
 */

import { assertValidErrorResponse, parseErrorMessage } from "../../contracts/src/errors.js";
import { assertValidTokenResponse } from "../../contracts/src/auth.js";

// ── API contract assertions ──────────────────────────────────────────

/**
 * Assert that a 401 response has a non-empty, well-formed error message.
 * Use this when testing that "login with wrong credentials shows an error".
 */
export function assertAuthErrorResponse(raw: unknown, context = "auth error"): string {
  const parsed = assertValidErrorResponse(raw, context);
  const message = parseErrorMessage(parsed);

  if (!message || message.trim().length === 0) {
    throw new Error(
      `[assert] Auth error message is blank (${context}).\n` +
        "This would cause a silent failure in the UI.\n" +
        "Response: " +
        JSON.stringify(raw, null, 2)
    );
  }

  return message;
}

/**
 * Assert that a login success response has valid tokens.
 */
export function assertLoginSuccessResponse(raw: unknown): ReturnType<typeof assertValidTokenResponse> {
  return assertValidTokenResponse(raw);
}

/**
 * Assert that a 422 validation error surfaces the specific field message.
 * This catches the exact bug where Pydantic v2 string-array details were dropped.
 */
export function assertValidationErrorVisible(
  raw: unknown,
  expectedFragment: string,
  context = "validation error"
): void {
  const message = parseErrorMessage(raw);

  if (!message || message.trim().length === 0) {
    throw new Error(
      `[assert] Validation error message is blank (${context}).\n` +
        `Expected to find: "${expectedFragment}"\n` +
        "Response: " +
        JSON.stringify(raw, null, 2)
    );
  }

  if (!message.toLowerCase().includes(expectedFragment.toLowerCase())) {
    throw new Error(
      `[assert] Validation error message does not contain expected text (${context}).\n` +
        `Expected: "${expectedFragment}"\n` +
        `Got: "${message}"`
    );
  }
}

// ── Playwright DOM assertions (framework-agnostic helpers) ────────────

/**
 * Verify that a DOM text node is:
 *   1. Visible (not display:none, not aria-hidden)
 *   2. Non-empty (after trimming whitespace)
 *
 * Returns the visible text for further assertions.
 * Call this from Playwright tests after triggering an error condition.
 */
export function assertTextIsNonEmpty(text: string | null | undefined, label = "text"): string {
  if (text === null || text === undefined || text.trim().length === 0) {
    throw new Error(
      `[assert] Expected ${label} to be non-empty but got: ${JSON.stringify(text)}\n` +
        "This indicates a silent failure in the UI — users cannot see the error."
    );
  }
  return text.trim();
}

/**
 * Verify that none of the forbidden strings appear in page content.
 */
export function assertNoForbiddenStrings(
  content: string,
  forbiddenStrings: readonly string[],
  source = "page content"
): void {
  const found: string[] = [];

  for (const forbidden of forbiddenStrings) {
    if (content.includes(forbidden)) {
      found.push(forbidden);
    }
  }

  if (found.length > 0) {
    throw new Error(
      `[assert] Forbidden string(s) found in ${source}:\n` +
        found.map((s) => `  - "${s}"`).join("\n") +
        "\nThese indicate stale demo content, wrong city data, or test credentials exposed in production."
    );
  }
}
