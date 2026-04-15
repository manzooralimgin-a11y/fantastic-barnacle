/**
 * @das-elb/contracts — Error response schemas
 *
 * The backend returns errors in several shapes depending on the code path:
 *
 *   1. HTTPException (4xx/5xx via custom handler):
 *      { "error": "message", "status": 404, "request_id": "...", "trace_id": "..." }
 *
 *   2. Pydantic v2 validation failure (422):
 *      { "error": "Validation error", "status": 422, "detail": ["body.field: message", ...] }
 *
 *   3. Pydantic v1-style validation (legacy, object items):
 *      { "error": "Validation error", "detail": [{ "msg": "...", "type": "...", "loc": [...] }] }
 *
 * All three must be handled in every frontend error handler.
 * CI will fail if a frontend swallows or blanks out any of these.
 */

import { z } from "zod";

// ── Pydantic v2: string items like "body.password: String should have at least 12 characters"
const PydanticV2StringItem = z
  .string()
  .min(1, "Pydantic v2 error detail item must not be empty");

// ── Pydantic v1-style: objects with a 'msg' key
const PydanticV1ObjectItem = z.object({
  msg: z.string().min(1, "Pydantic v1 error msg must not be empty"),
  type: z.string().optional(),
  loc: z.array(z.union([z.string(), z.number()])).optional(),
});

// ── The 'detail' field accepts either format
export const ErrorDetailSchema = z.union([
  z.string().min(1, "String detail must not be empty"),
  z
    .array(z.union([PydanticV2StringItem, PydanticV1ObjectItem]))
    .min(1, "Array detail must have at least one item"),
]);

// ── Every non-2xx response from the backend must match this
export const ApiErrorResponseSchema = z.object({
  error: z.string().min(1, "Error field must be a non-empty string"),
  status: z.number().int().optional(),
  request_id: z.string().optional(),
  trace_id: z.string().optional(),
  detail: ErrorDetailSchema.optional(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

/**
 * Parse any unknown API error response into a human-readable string.
 *
 * Rules:
 *   - Never returns an empty string (falls back to a generic message)
 *   - Strips Pydantic's "body.field_name: " prefix so users see the actual message
 *   - Joins multiple validation errors with " · "
 *
 * This is the CANONICAL error-parsing function. All frontends must use it
 * (or duplicate its exact logic). CI validates that errors are never blank.
 */
export function parseErrorMessage(raw: unknown, fallback = "An unexpected error occurred"): string {
  const result = ApiErrorResponseSchema.safeParse(raw);

  if (!result.success) {
    // The response doesn't even match our error schema — return the fallback
    // but log to help debug unexpected shapes in development.
    if (typeof raw === "object" && raw !== null) {
      const anyError = raw as Record<string, unknown>;
      if (typeof anyError["message"] === "string" && anyError["message"]) {
        return anyError["message"];
      }
    }
    return fallback;
  }

  const { error, detail } = result.data;

  if (detail === undefined) {
    return error;
  }

  if (typeof detail === "string") {
    return detail || error;
  }

  // Array of string or object items
  const messages = detail
    .map((item) => {
      if (typeof item === "string") {
        // Strip Pydantic v2 "body.field_name: " prefix
        const colonIdx = item.indexOf(": ");
        return colonIdx !== -1 ? item.slice(colonIdx + 2) : item;
      }
      return item.msg;
    })
    .filter((m): m is string => Boolean(m) && m.trim().length > 0);

  return messages.length > 0 ? messages.join(" · ") : error;
}

/**
 * Type guard: is this a valid API error response shape?
 */
export function isApiError(raw: unknown): raw is ApiErrorResponse {
  return ApiErrorResponseSchema.safeParse(raw).success;
}

/**
 * Assert that an API error response is well-formed and its message is non-empty.
 * Throws if the contract is violated. Use in CI contract tests.
 */
export function assertValidErrorResponse(raw: unknown, context = ""): ApiErrorResponse {
  const parsed = ApiErrorResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `[contract] Invalid error response shape${context ? ` (${context})` : ""}:\n` +
        JSON.stringify(parsed.error.format(), null, 2) +
        "\nReceived: " +
        JSON.stringify(raw, null, 2)
    );
  }
  const message = parseErrorMessage(parsed.data);
  if (!message || message.trim().length === 0) {
    throw new Error(
      `[contract] Error message resolved to empty string${context ? ` (${context})` : ""}.\n` +
        "Response: " +
        JSON.stringify(parsed.data, null, 2)
    );
  }
  return parsed.data;
}
