/**
 * @das-elb/testing — Stable test seed data
 *
 * These credentials are used across all E2E and integration tests.
 * The backend CI job seeds the database with these users before tests run.
 *
 * IMPORTANT: These are test-only credentials. Never use in production.
 * The CI seed script (backend/scripts/seed_test_data.py) creates these users.
 */

export const TEST_USERS = {
  /** Full admin user — can access management dashboard */
  admin: {
    email: "ci-admin@das-elb.test",
    password: "CITestAdmin2024!",
    full_name: "CI Admin User",
    role: "admin",
  },

  /** Regular staff user */
  staff: {
    email: "ci-staff@das-elb.test",
    password: "CITestStaff2024!",
    full_name: "CI Staff User",
    role: "staff",
  },
} as const;

/**
 * A booking number that is always seeded in the test database.
 * Used for guest app login tests.
 */
export const TEST_BOOKING = {
  booking_id: "BK999001",
  last_name: "CIGuest",
  first_name: "Test",
  property_id: 1,
} as const;

/**
 * Mock API responses that simulate real backend behavior.
 * Used in Playwright page.route() interceptors.
 *
 * These are NOT real network calls — they simulate what the backend WOULD return.
 * Contract tests (separate from E2E) verify the actual backend still matches.
 */
export const MOCK_RESPONSES = {
  loginSuccess: {
    access_token: "mock.access.token.for.ci.testing",
    refresh_token: "mock.refresh.token.for.ci.testing",
    token_type: "bearer" as const,
  },

  loginFailure: {
    error: "Invalid email or password",
    status: 401,
    request_id: "mock-request-id",
    trace_id: "mock-trace-id",
  },

  registerSuccess: {
    id: 9999,
    email: "newuser@das-elb.test",
    full_name: "New CI User",
    role: "staff",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  registerInvalidPassword: {
    error: "Validation error",
    status: 422,
    request_id: "mock-request-id",
    trace_id: "mock-trace-id",
    // Pydantic v2 format — array of strings with "body.field: message" prefix
    detail: ["body.password: String should have at least 12 characters"],
  },

  registerMissingFullName: {
    error: "Validation error",
    status: 422,
    request_id: "mock-request-id",
    trace_id: "mock-trace-id",
    detail: ["body.full_name: Field required"],
  },

  guestLoginSuccess: {
    access_token: "mock.guest.access.token",
    token_type: "bearer" as const,
    guest: {
      firstName: "Test",
      lastName: "CIGuest",
      bookingId: "BK999001",
    },
  },

  guestLoginFailure: {
    error: "Invalid booking number or last name",
    status: 401,
    request_id: "mock-request-id",
    trace_id: "mock-trace-id",
  },

  healthCheck: {
    status: "healthy" as const,
    service: "Gestronomy",
    database: "connected" as const,
    version: "v1.0.0",
  },
} as const;

/**
 * Forbidden UI strings — if any of these appear in a rendered page, the test fails.
 * These are the canonical list; keep in sync with packages/contracts/src/api.ts.
 */
export const FORBIDDEN_UI_STRINGS = [
  "Hamburg",
  "Demo Credentials",
  "fillDemo",
  "stub response",
  "BK123456",  // demo booking number — must not appear in rendered UI
] as const;

/**
 * The production API URL pattern. Tests verify that no app points to localhost in CI.
 */
export const PRODUCTION_API_PATTERN = /gestronomy-api.*\.onrender\.com/;
