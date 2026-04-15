/**
 * @das-elb/testing — Authentication helpers
 *
 * High-level helpers for authenticating in tests.
 * These make real HTTP requests (not mocks).
 */

import { api, apiUrl } from "./api-helpers.js";
import { TEST_USERS } from "./seed.js";
import type { TokenResponse, UserRead } from "../../contracts/src/auth.js";

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

/**
 * Log in with the CI admin user and return tokens.
 * Use this to get a valid token for authenticated API calls in tests.
 */
export async function loginAsCiAdmin(apiBase: string): Promise<AuthTokens> {
  return loginAs(apiBase, TEST_USERS.admin.email, TEST_USERS.admin.password);
}

/**
 * Log in with the CI staff user and return tokens.
 */
export async function loginAsCiStaff(apiBase: string): Promise<AuthTokens> {
  return loginAs(apiBase, TEST_USERS.staff.email, TEST_USERS.staff.password);
}

/**
 * Generic login — returns tokens or throws with a descriptive error.
 */
export async function loginAs(
  apiBase: string,
  email: string,
  password: string
): Promise<AuthTokens> {
  const res = await api.post<TokenResponse>(
    apiUrl(apiBase, "/auth/login"),
    { email, password }
  );

  if (!res.ok) {
    throw new Error(
      `Login failed for ${email} — HTTP ${res.status}: ${JSON.stringify(res.data)}`
    );
  }

  const { access_token, refresh_token } = res.data as AuthTokens;
  if (!access_token || !refresh_token) {
    throw new Error(
      `Login for ${email} returned malformed token response: ${JSON.stringify(res.data)}`
    );
  }

  return { access_token, refresh_token };
}

/**
 * Verify that a token is valid by calling /auth/me.
 */
export async function verifyToken(
  apiBase: string,
  token: string
): Promise<UserRead> {
  const res = await api.get<UserRead>(apiUrl(apiBase, "/auth/me"), { token });

  if (!res.ok) {
    throw new Error(
      `Token verification failed — HTTP ${res.status}: ${JSON.stringify(res.data)}`
    );
  }

  return res.data as UserRead;
}

/**
 * Register a new user and return the created user.
 * Throws if registration fails.
 */
export async function registerUser(
  apiBase: string,
  payload: { email: string; password: string; full_name: string }
): Promise<UserRead> {
  const res = await api.post<UserRead>(
    apiUrl(apiBase, "/auth/register"),
    payload
  );

  if (!res.ok) {
    throw new Error(
      `Registration failed — HTTP ${res.status}: ${JSON.stringify(res.data)}`
    );
  }

  return res.data as UserRead;
}
