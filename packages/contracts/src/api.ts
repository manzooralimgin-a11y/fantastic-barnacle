/**
 * @das-elb/contracts — Common API patterns
 *
 * Shared shapes for public endpoints, reservations, HMS, etc.
 */

import { z } from "zod";

// ── Health check ──────────────────────────────────────────────────────

export const HealthResponseSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  service: z.string(),
  database: z.enum(["connected", "disconnected", "error"]),
  version: z.string().optional(),
});

// ── Public hotel booking request ──────────────────────────────────────

export const PublicBookingRequestSchema = z.object({
  booking_id: z.string().min(1),
  guest_name: z.string().min(2),
  guest_email: z.string().email(),
  check_in: z.string(),
  check_out: z.string(),
  property_id: z.number().int().positive().optional(),
});

// ── Restaurant reservation ─────────────────────────────────────────────

export const ReservationRequestSchema = z.object({
  restaurant_id: z.number().int().positive(),
  guest_name: z.string().min(2),
  party_size: z.number().int().positive(),
  reservation_date: z.string(),
  start_time: z.string(),
  source: z.string().optional(),
});

// ── Pagination wrapper ────────────────────────────────────────────────

export function PaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    size: z.number().int().positive(),
  });
}

// ── Environment validation ────────────────────────────────────────────

/**
 * Required environment variables per app.
 * CI will fail if any of these are missing or set to development fallbacks.
 */
export const REQUIRED_ENV: Record<string, string[]> = {
  backend: [
    "DATABASE_URL",
    "SECRET_KEY",
    "REDIS_URL",
  ],
  frontend: [
    "NEXT_PUBLIC_API_URL",
  ],
  "hotel-guest": [
    "VITE_API_BASE_URL",
  ],
  "hotel-owner": [
    "NEXT_PUBLIC_API_URL",
  ],
  "res-web": [
    "VITE_PUBLIC_API_BASE_URL",
    "VITE_RESTAURANT_ID",
  ],
  landing: [
    "PUBLIC_API_BASE_URL",
  ],
};

/**
 * Values that must NEVER appear in production environment variables.
 * These indicate a mis-configured environment.
 */
export const FORBIDDEN_ENV_VALUES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "http://localhost",
  "http://127.0.0.1",
];

/**
 * Strings that must NEVER appear in rendered UI.
 * CI content-guard checks these against source files and E2E screenshots.
 */
export const FORBIDDEN_UI_STRINGS = [
  // Wrong city — hotel is in Magdeburg
  "Hamburg",
  // Demo/test credentials that must not appear in production UI
  "Demo Credentials",
  "fillDemo",
  // Stub responses that indicate unimplemented backend integrations
  "stub response",
  "LLM integration pending",
  // Hardcoded property names (must come from DB)
  // Note: allow in comments/docs but not in JSX/TSX rendered strings
] as const;

export type ForbiddenUiString = (typeof FORBIDDEN_UI_STRINGS)[number];
