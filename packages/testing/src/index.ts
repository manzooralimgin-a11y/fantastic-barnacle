/**
 * @das-elb/testing
 *
 * Shared test utilities for the das elb ecosystem.
 *
 * Usage in Playwright tests:
 *   import { test, expect, mockBackendApi } from '../../packages/testing/src/playwright-fixtures';
 *   import { MOCK_RESPONSES, FORBIDDEN_UI_STRINGS } from '../../packages/testing/src/seed';
 *
 * Usage in API contract tests:
 *   import { loginAsCiAdmin, api } from '../../packages/testing/src/auth-helpers';
 *   import { assertAuthErrorResponse } from '../../packages/testing/src/assertions';
 */

export * from "./seed.js";
export * from "./api-helpers.js";
export * from "./auth-helpers.js";
export * from "./assertions.js";
export * from "./playwright-fixtures.js";
