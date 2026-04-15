/**
 * @das-elb/contracts — Auth endpoint schemas
 *
 * Mirrors exactly what the backend validates (backend/app/auth/schemas.py).
 * If you change backend validation rules, update this file AND the frontend forms.
 */

import { z } from "zod";

// ── Requests ─────────────────────────────────────────────────────────

export const LoginRequestSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Backend enforces min_length=12 for passwords.
 * Frontend must surface this constraint BEFORE the user hits submit.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const RegisterRequestSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`),
  full_name: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(255, "Full name must be at most 255 characters"),
});

// ── Responses ────────────────────────────────────────────────────────

export const TokenResponseSchema = z.object({
  access_token: z.string().min(1, "access_token must not be empty"),
  refresh_token: z.string().min(1, "refresh_token must not be empty"),
  token_type: z.literal("bearer"),
});

export const UserReadSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.string().min(1),
  is_active: z.boolean(),
  restaurant_id: z.number().int().nullable().optional(),
  active_property_id: z.number().int().nullable().optional(),
  hotel_roles: z.array(z.string()).optional(),
  hotel_permissions: z.array(z.string()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

// ── Types ─────────────────────────────────────────────────────────────

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type UserRead = z.infer<typeof UserReadSchema>;

// ── Validators ────────────────────────────────────────────────────────

/**
 * Validate a login response from the backend.
 * Throws with a descriptive message if the shape is wrong.
 */
export function assertValidTokenResponse(raw: unknown): TokenResponse {
  const result = TokenResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      "[contract/auth] Login response shape invalid:\n" +
        JSON.stringify(result.error.format(), null, 2) +
        "\nReceived: " +
        JSON.stringify(raw, null, 2)
    );
  }
  return result.data;
}

/**
 * Validate a user profile response from the backend.
 */
export function assertValidUserRead(raw: unknown): UserRead {
  const result = UserReadSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      "[contract/auth] User response shape invalid:\n" +
        JSON.stringify(result.error.format(), null, 2)
    );
  }
  return result.data;
}
