/**
 * @das-elb/contracts
 *
 * Canonical API contract schemas shared across all apps in the das elb ecosystem.
 *
 * Usage in tests:
 *   import { parseErrorMessage, assertValidTokenResponse } from '@das-elb/contracts';
 *
 * Usage in frontend code (runtime validation):
 *   import { ApiErrorResponseSchema } from '@das-elb/contracts/errors';
 */

export * from "./errors.js";
export * from "./auth.js";
export * from "./api.js";
