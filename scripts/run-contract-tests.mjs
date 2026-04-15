#!/usr/bin/env node
/**
 * API Contract Tests
 * ==================
 * Validates that the live backend still matches our contract schemas.
 * These are NOT unit tests — they hit the real production API.
 *
 * Fails CI if:
 *   - Any expected endpoint returns 404 (endpoint was removed/moved)
 *   - Any error response has an empty or missing error message
 *   - Any success response is missing required fields
 *   - Health check reports unhealthy status
 *
 * Run locally:
 *   API_BASE_URL=https://gestronomy-api-5atv.onrender.com/api node scripts/run-contract-tests.mjs
 */

const API_BASE = process.env.API_BASE_URL || "https://gestronomy-api-5atv.onrender.com/api";
const TIMEOUT = 15_000;

let passed = 0;
let failed = 0;
const failures = [];

// ── Helpers ────────────────────────────────────────────────────────────

async function req(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    return { status: res.status, data, ok: res.ok };
  } finally {
    clearTimeout(timer);
  }
}

function test(name, fn) {
  return { name, fn };
}

async function runTest(t) {
  try {
    await t.fn();
    console.log(`  ✓ ${t.name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${t.name}`);
    console.error(`    ${err.message}`);
    failed++;
    failures.push({ name: t.name, error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNonEmpty(value, label) {
  assert(
    typeof value === "string" && value.trim().length > 0,
    `${label} must be a non-empty string — got ${JSON.stringify(value)}`
  );
}

/**
 * Parse error message from any backend error response.
 * Mirrors the logic in packages/contracts/src/errors.ts.
 */
function parseErrorMessage(data) {
  if (!data) return "";

  const { error, detail } = data;
  if (!detail) return error || "";

  if (typeof detail === "string") return detail || error || "";

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") {
          const colonIdx = item.indexOf(": ");
          return colonIdx !== -1 ? item.slice(colonIdx + 2) : item;
        }
        return item.msg || "";
      })
      .filter((m) => m && m.trim().length > 0);

    return messages.length > 0 ? messages.join(" · ") : error || "";
  }

  return error || "";
}

// ── Test Suite ─────────────────────────────────────────────────────────

const tests = [
  // ── Health check ───────────────────────────────────────────────────
  test("GET /health — returns healthy status", async () => {
    const { status, data } = await req("GET", "/health");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.status === "healthy", `Expected status "healthy", got "${data.status}"`);
    assert(data.database === "connected", `Expected database "connected", got "${data.database}"`);
  }),

  // ── Auth endpoints ─────────────────────────────────────────────────
  test("POST /auth/login — returns 401 with non-empty error for wrong creds", async () => {
    const { status, data } = await req("POST", "/auth/login", {
      email: "nonexistent@das-elb.test",
      password: "wrongpassword",
    });
    assert(status === 401, `Expected 401, got ${status}`);
    assertNonEmpty(data.error, "error field");
    const msg = parseErrorMessage(data);
    assertNonEmpty(msg, "parsed error message");
    assert(
      !msg.includes(",") || msg.includes("·"),
      `Error message appears to be raw internal format: "${msg}"`
    );
  }),

  test("POST /auth/login — returns 422 with readable message for missing fields", async () => {
    const { status, data } = await req("POST", "/auth/login", {});
    assert(status === 422, `Expected 422, got ${status}`);
    assertNonEmpty(data.error, "error field");
    const msg = parseErrorMessage(data);
    assertNonEmpty(msg, "parsed validation message");
  }),

  test("POST /auth/register — returns 422 with readable password message for short password", async () => {
    const { status, data } = await req("POST", "/auth/register", {
      email: "contract-test@das-elb.test",
      password: "short",          // too short — backend requires 12+
      full_name: "Contract Test",
    });
    assert(status === 422, `Expected 422, got ${status}`);
    assertNonEmpty(data.error, "error field");
    const msg = parseErrorMessage(data);
    assertNonEmpty(msg, "parsed validation message");
    assert(
      msg.toLowerCase().includes("12") || msg.toLowerCase().includes("character"),
      `Expected password length message to mention "12" or "character", got: "${msg}"`
    );
  }),

  test("POST /auth/register — detail array items are strings (Pydantic v2 format)", async () => {
    const { status, data } = await req("POST", "/auth/register", {
      email: "contract-test@das-elb.test",
      password: "tooshort",
    });
    assert(status === 422, `Expected 422, got ${status}`);
    if (Array.isArray(data.detail)) {
      for (const item of data.detail) {
        assert(
          typeof item === "string" || (typeof item === "object" && item.msg),
          `detail item must be string or have .msg: ${JSON.stringify(item)}`
        );
        const text = typeof item === "string" ? item : item.msg;
        assert(text && text.trim().length > 0, `detail item text must not be empty`);
      }
    }
  }),

  test("GET /auth/me — returns 401 with non-empty error when unauthenticated", async () => {
    const { status, data } = await req("GET", "/auth/me");
    assert(status === 401, `Expected 401, got ${status}`);
    assertNonEmpty(data.error, "error field");
  }),

  // ── Public endpoints ───────────────────────────────────────────────
  test("POST /public/hotel/booking-request — returns 422 (not 404) for empty body", async () => {
    const { status, data } = await req("POST", "/public/hotel/booking-request", {});
    assert(
      status === 422,
      `Expected 422, got ${status}.\n` +
        "404 means the endpoint was removed or the router isn't mounted.\n" +
        `Response: ${JSON.stringify(data)}`
    );
    assertNonEmpty(data.error, "error field");
  }),

  test("POST /public/hotel/gift-card — returns 422 (not 404) for empty body", async () => {
    const { status, data } = await req("POST", "/public/hotel/gift-card", {});
    assert(
      status === 422,
      `Expected 422, got ${status}. Endpoint may not be deployed.\n` +
        `Response: ${JSON.stringify(data)}`
    );
  }),

  test("POST /reservations — returns 422 (not 404) for empty body", async () => {
    const { status } = await req("POST", "/reservations", {});
    assert(status === 422, `Expected 422, got ${status}`);
  }),

  // ── Dashboard query (requires auth) ───────────────────────────────
  test("POST /dashboard/query — returns 401 (not 404) when unauthenticated", async () => {
    const { status, data } = await req("POST", "/dashboard/query", {
      query: "contract test",
    });
    assert(
      status === 401,
      `Expected 401, got ${status}. 404 means endpoint is not deployed.\n` +
        `Response: ${JSON.stringify(data)}`
    );
  }),

  // ── Error response shape ───────────────────────────────────────────
  test("All 4xx responses have non-empty 'error' string field", async () => {
    const endpoints = [
      { method: "POST", path: "/auth/login", body: {} },
      { method: "POST", path: "/auth/register", body: {} },
      { method: "GET", path: "/auth/me" },
      { method: "POST", path: "/public/hotel/booking-request", body: {} },
    ];

    for (const ep of endpoints) {
      const { status, data } = await req(ep.method, ep.path, ep.body);
      assert(status >= 400, `Expected error status for ${ep.method} ${ep.path}, got ${status}`);
      assert(
        typeof data.error === "string" && data.error.trim().length > 0,
        `${ep.method} ${ep.path} (${status}): "error" field must be a non-empty string, got: ${JSON.stringify(data.error)}`
      );
    }
  }),
];

// ── Run ────────────────────────────────────────────────────────────────

console.log(`\nAPI Contract Tests`);
console.log(`Target: ${API_BASE}`);
console.log("─".repeat(50));

for (const t of tests) {
  await runTest(t);
}

console.log("");
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error(`\n✗ ${failed} contract test(s) failed:`);
  for (const f of failures) {
    console.error(`\n  ${f.name}\n  → ${f.error}`);
  }
  console.error(
    "\nContract failures mean the backend API no longer matches what frontends expect."
  );
  console.error(
    "Either the backend changed (update the contract) or a regression was introduced (fix the backend)."
  );
  process.exit(1);
} else {
  console.log("\n✓ All contract tests passed.");
}
