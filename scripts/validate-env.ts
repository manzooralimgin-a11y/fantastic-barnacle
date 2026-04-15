#!/usr/bin/env node
/**
 * Environment Validation Script
 * ==============================
 * Validates that the correct environment variables are set before building
 * or deploying any app. Exits with code 1 if anything is wrong.
 *
 * Usage:
 *   node scripts/validate-env.ts <app-name>
 *   node scripts/validate-env.ts frontend
 *   node scripts/validate-env.ts hotel-guest
 *
 * In CI (called by reusable-ci.yml):
 *   APP_NAME=frontend node scripts/validate-env.ts
 */

const APP_NAME = process.argv[2] ?? process.env["APP_NAME"] ?? "";

// ── Required variables per app ─────────────────────────────────────────

const REQUIRED_VARS: Record<string, string[]> = {
  backend: ["DATABASE_URL", "SECRET_KEY", "REDIS_URL"],
  frontend: ["NEXT_PUBLIC_API_URL"],
  "hotel-guest": ["VITE_API_BASE_URL"],
  "hotel-owner": ["NEXT_PUBLIC_API_URL"],
  "res-web": ["VITE_PUBLIC_API_BASE_URL", "VITE_RESTAURANT_ID"],
  landing: ["PUBLIC_API_BASE_URL"],
};

// ── Values that indicate misconfiguration ─────────────────────────────

const FORBIDDEN_VALUES = [
  "http://localhost",
  "http://127.0.0.1",
  "localhost:8000",
  "127.0.0.1:8000",
];

// ── Values that must NOT be empty strings or "0" ──────────────────────

const MUST_BE_NONZERO = ["VITE_RESTAURANT_ID"];

// ── Validation ─────────────────────────────────────────────────────────

function validate(appName: string): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  const required = REQUIRED_VARS[appName];

  if (!required) {
    console.log(`ℹ  No env validation rules for app "${appName}" — skipping.`);
    return { passed: true, errors: [] };
  }

  console.log(`\nValidating env for: ${appName}`);
  console.log("─".repeat(40));

  for (const varName of required) {
    const value = process.env[varName];

    // Check presence
    if (!value || value.trim() === "") {
      errors.push(
        `Missing required variable: ${varName}\n` +
          `  → Set ${varName} in your environment or .env file`
      );
      continue;
    }

    // Check for localhost in production
    const isCI = process.env["CI"] === "true";
    const isProduction = process.env["APP_ENV"] === "production" || isCI;

    if (isProduction) {
      for (const forbidden of FORBIDDEN_VALUES) {
        if (value.includes(forbidden)) {
          errors.push(
            `Variable ${varName} contains a forbidden value in CI/production:\n` +
              `  Value: "${value}"\n` +
              `  Forbidden: "${forbidden}"\n` +
              `  → This app is calling a localhost server in CI/production`
          );
        }
      }
    }

    // Check non-zero numeric vars
    if (MUST_BE_NONZERO.includes(varName)) {
      const num = Number(value);
      if (isNaN(num) || num === 0) {
        errors.push(
          `Variable ${varName} must be a non-zero number.\n` +
            `  Value: "${value}"\n` +
            `  → This is the restaurant ID — "0" means no restaurant is configured`
        );
      }
    }

    if (errors.length === 0 || errors[errors.length - 1]?.includes(varName) === false) {
      console.log(`  ✓ ${varName} = ${value.slice(0, 50)}${value.length > 50 ? "..." : ""}`);
    }
  }

  return { passed: errors.length === 0, errors };
}

// ── Main ───────────────────────────────────────────────────────────────

if (!APP_NAME) {
  console.error("Usage: node scripts/validate-env.ts <app-name>");
  console.error("Known apps:", Object.keys(REQUIRED_VARS).join(", "));
  process.exit(1);
}

const { passed, errors } = validate(APP_NAME);

if (!passed) {
  console.error("\n✗ Environment validation FAILED:");
  errors.forEach((e) => console.error(`\n  ${e}`));
  console.error(
    "\nFix the above before running CI. If running locally, copy .env.example to .env.local."
  );
  process.exit(1);
} else {
  console.log(`\n✓ Environment validation passed for ${APP_NAME}`);
}
